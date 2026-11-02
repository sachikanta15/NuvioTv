#!/usr/bin/env node
/**
 * NuvioTV Stream Relay & JioTV Stremio Addon Server
 *
 * Standalone, zero-dependency streaming relay for NuvioTV Live TV channels
 * and JioTV Stremio Add-on.
 * Proxies, rewrites, and serves HLS (.m3u8) and DASH (.mpd) streams with full
 * CORS support, proper upstream headers, and on-the-fly CENC AES-CTR decryption.
 *
 * Usage:
 *   node server.mjs
 *   PORT=8090 node server.mjs
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8090);
const HOST = process.env.HOST || "0.0.0.0";

const KALTURA_API_BASE = "https://5093.dsp1.ott.kaltura.com/api_v3/service";
const PARTNER_ID = "5093";
const CLIENT_TAG = "KSPWeb-v0.0.115";
const API_VERSION = "11.0.2.1";
const DEFAULT_REFERER = "https://www.watcho.com/";
const JIOTV_RESOLVER_BASE = "https://livetgtv.lovable.app";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
};

// Import JioTV direct pipeline and Stremio addon modules
let handleJioTvDirect = null;
let handleJioTvAddon = null;

try {
  const directMod = await import("../web/worker/jiotv-direct.js");
  handleJioTvDirect = directMod.handleJioTvDirect;
} catch (e) {
  console.warn("[Relay] Note: web/worker/jiotv-direct.js not found in parent path, checking local:", e.message);
  try {
    const directMod = await import("./worker/jiotv-direct.js");
    handleJioTvDirect = directMod.handleJioTvDirect;
  } catch {}
}

try {
  const addonMod = await import("../web/worker/jiotv-addon.js");
  handleJioTvAddon = addonMod.handleJioTvAddon;
} catch (e) {
  try {
    const addonMod = await import("./worker/jiotv-addon.js");
    handleJioTvAddon = addonMod.handleJioTvAddon;
  } catch {}
}

/** In-memory channel catalog cache: channelId -> { id, name, hlsUrl, dashUrl, partner } */
let channelCatalog = new Map();
let catalogLastFetched = 0;
const CATALOG_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** Tata Play channel catalog cache */
let tataPlayCatalog = new Map();

function loadTataPlayCatalog() {
  const possiblePaths = [
    path.join(__dirname, "../web/src/data/tataplay-channels.json"),
    path.join(__dirname, "data/tataplay-channels.json"),
    path.join(__dirname, "tataplay-channels.json"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, "utf-8");
        const list = JSON.parse(raw);
        const map = new Map();
        for (const item of list) {
          if (item && item.id) {
            const entry = {
              id: item.id,
              name: item.name,
              category: item.category,
              dashUrl: item.dashUrl,
              hlsUrl: item.hlsUrl,
              partner: "tataplay",
            };
            map.set(item.id, entry);
          }
        }
        tataPlayCatalog = map;
        console.log(`[Relay] Loaded ${list.length} Tata Play channels from ${path.basename(p)}.`);
        return map;
      } catch (err) {
        console.warn("[Relay] Failed reading Tata Play channels:", err.message);
      }
    }
  }
  return new Map();
}

/** Tata Play Session Management and Akamai Token Resolver */
const TATA_PLAY_SESSION_FILE = path.join(__dirname, "data/tataplay-session.json");
const TATA_PLAY_SESSION_FILE_FALLBACK = path.join(__dirname, "tataplay-session.json");

function getTataPlaySessionPath() {
  const dir = path.join(__dirname, "data");
  if (fs.existsSync(dir)) return TATA_PLAY_SESSION_FILE;
  return TATA_PLAY_SESSION_FILE_FALLBACK;
}

function loadTataPlaySession() {
  const p = getTataPlaySessionPath();
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch {}
  }
  return null;
}

function saveTataPlaySession(session) {
  const p = getTataPlaySessionPath();
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(session, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Relay] Failed saving Tata Play session:", err.message);
  }
}

async function ensureTataPlayGuestDevice(session = null) {
  let s = session || loadTataPlaySession() || {};
  if (s.deviceId && s.anonymousId) return s;

  const deviceId = "" + Math.floor(100 + Math.random() * 900) + Math.floor(Date.now() / 1000) + Math.floor(10 + Math.random() * 90);
  try {
    const res = await fetch("https://tb.tapi.videoready.tv/binge-mobile-services/pub/api/v1/user/guest/register", {
      method: "POST",
      headers: {
        "accept": "application/json, text/plain, */*",
        "authorization": "bearer undefined",
        "referer": "https://www.tataplaybinge.com/",
        "deviceid": deviceId,
        "origin": "https://www.tataplaybinge.com",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
      }
    });
    const data = await res.json();
    if (data?.data?.anonymousId) {
      s = { ...s, deviceId, anonymousId: data.data.anonymousId };
      saveTataPlaySession(s);
      return s;
    }
  } catch (err) {
    console.warn("[Relay] Failed to register guest device on Tata Play:", err.message);
  }
  return s;
}

function decryptTataPlayUrl(cipherTextB64, keyStr = "aesEncryptionKey") {
  const key = Buffer.from(keyStr, "utf8");
  const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
  decipher.setAutoPadding(true);
  let decrypted = decipher.update(cipherTextB64, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

const tataPlayTokenCache = new Map();

async function resolveTataPlayLiveStream(channelId) {
  const tp = tataPlayCatalog.get(channelId);
  if (!tp) return null;

  const rawId = tp.id.replace(/^tp-/, "");
  const defaultUrl = tp.dashUrl || tp.hlsUrl;

  // Direct channels on delta or cable CDN do not require tokenization:
  const isDirect = defaultUrl && (
    defaultUrl.includes("delta") ||
    defaultUrl.includes("cable") ||
    defaultUrl.includes("jansetu") ||
    defaultUrl.includes("tvpunjab") ||
    defaultUrl.includes("5centscdn")
  );
  if (isDirect) {
    return defaultUrl;
  }

  // Token cache check
  const cached = tataPlayTokenCache.get(channelId);
  if (cached && Date.now() < cached.exp - 60000) {
    return cached.url;
  }

  const session = loadTataPlaySession();
  if (!session?.loggedIn || !session?.userAuthenticateToken) {
    return null;
  }

  const contentUrl = `https://tb.tapi.videoready.tv/content-detail/api/partner/cdn/player/details/chotiluli/${rawId}`;
  try {
    const res = await fetch(contentUrl, {
      headers: {
        "Authorization": `Bearer ${session.userAuthenticateToken}`,
        "subscriberId": session.subscriberId || session.mobileNumber || "",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      }
    });

    if (!res.ok) {
      console.warn(`[Relay] Tata Play content-detail error for ${channelId}: status ${res.status}`);
      return null;
    }

    const json = await res.json();
    const encryptedUrl = json?.data?.dashPlayreadyPlayUrl || json?.data?.dashWidewinePlayUrl;
    if (!encryptedUrl) {
      return null;
    }

    let decryptedUrl = decryptTataPlayUrl(encryptedUrl, "aesEncryptionKey");
    decryptedUrl = decryptedUrl.replace("bpaita", "bpaicatchupta").replace("manifest", "Manifest");

    const headRes = await fetch(decryptedUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        "Referer": "https://watch.tataplay.com/",
        "Origin": "https://watch.tataplay.com",
      }
    });

    let hdntl = null;
    const cookie = headRes.headers.get("set-cookie");
    if (cookie && cookie.includes("hdntl=")) {
      const match = cookie.match(/hdntl=([^;]+)/);
      if (match && match[1]) hdntl = match[1].trim();
    }
    if (!hdntl) {
      const loc = headRes.headers.get("location");
      if (loc && loc.includes("hdntl=")) {
        const match = loc.match(/hdntl=([^&]+)/);
        if (match && match[1]) hdntl = match[1].trim();
      }
    }

    let finalUrl = decryptedUrl;
    let expTime = Date.now() + 6 * 3600 * 1000;
    if (hdntl) {
      const clean = decryptedUrl.split("?")[0];
      finalUrl = hdntl.startsWith("hdntl=") ? `${clean}?${hdntl}` : `${clean}?hdntl=${hdntl}`;
      const expMatch = hdntl.match(/exp=(\d+)/);
      if (expMatch && expMatch[1]) {
        expTime = Number(expMatch[1]) * 1000;
      }
    }

    tataPlayTokenCache.set(channelId, { url: finalUrl, exp: expTime });
    return finalUrl;
  } catch (err) {
    console.warn(`[Relay] Failed resolving token for Tata Play ${channelId}:`, err.message);
    return defaultUrl;
  }
}

async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/** Optional local channels.json override */
function loadCustomOverrides() {
  const overridePath = path.join(__dirname, "channels.json");
  if (!fs.existsSync(overridePath)) return new Map();
  try {
    const raw = fs.readFileSync(overridePath, "utf-8");
    const parsed = JSON.parse(raw);
    const map = new Map();
    for (const [id, item] of Object.entries(parsed.channels || {})) {
      if (item && item.url) {
        map.set(String(id), {
          id: String(id),
          name: item.name || `Channel ${id}`,
          url: item.url,
          format: item.url.includes(".mpd") ? "dash" : "hls",
        });
      }
    }
    return map;
  } catch (err) {
    console.warn("[Relay] Warning: Could not parse channels.json:", err.message);
    return new Map();
  }
}

/** Fetches upstream directory from Kaltura OTT */
async function fetchKalturaCatalog() {
  try {
    const loginRes = await fetch(`${KALTURA_API_BASE}/ottuser/action/anonymouslogin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ partnerId: PARTNER_ID, ClientTag: CLIENT_TAG, apiVersion: API_VERSION }),
    });
    const loginData = await loginRes.json();
    const ks = loginData.result?.ks;
    if (!ks) throw new Error("Could not acquire Kaltura session");

    const listRes = await fetch(`${KALTURA_API_BASE}/asset/action/list`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        apiVersion: API_VERSION,
        ks,
        ClientTag: CLIENT_TAG,
        filter: { objectType: "KalturaSearchAssetFilter", typeIn: "686" },
        pager: { pageIndex: 1, pageSize: 500 },
      }),
    });
    const listData = await listRes.json();
    const assets = listData.result?.objects ?? [];

    const map = new Map();
    for (const a of assets) {
      if (!a.id) continue;
      const id = String(a.id);
      const files = a.mediaFiles || [];
      const hls = files.find((f) => f.type === "HLS" || f.type === "HLS_FP")?.url || null;
      const dash = files.find((f) => f.type === "DASH" || f.type === "DASH_WV")?.url || null;
      const partner = a.metas?.ContentPartnerName?.value || a.metas?.ContentPartnerId?.value || null;

      map.set(id, {
        id,
        name: a.name || `Channel ${id}`,
        category: a.metas?.Genre?.value || "Live",
        hlsUrl: hls,
        dashUrl: dash,
        partner,
      });
    }

    channelCatalog = map;
    catalogLastFetched = Date.now();
    console.log(`[Relay] Loaded ${map.size} channels from Kaltura OTT directory.`);
  } catch (err) {
    console.error("[Relay] Failed to fetch Kaltura catalog:", err.message);
  }
}

/** Cache for JioTV channel resolutions */
const jioDetailCache = new Map();
const JIO_CACHE_TTL_MS = 5 * 60 * 1000;

async function resolveJioTvStream(channelId) {
  const cached = jioDetailCache.get(String(channelId));
  if (cached && Date.now() - cached.at < JIO_CACHE_TTL_MS) {
    return cached.data;
  }
  try {
    const res = await fetch(`${JIOTV_RESOLVER_BASE}/api/public/channels/${encodeURIComponent(channelId)}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const source = (data.sources?.[0] || "").trim().replace("bpk-tv//", "bpk-tv/");
    if (!source) return null;
    const clearKeys = data.drm?.clearKeys || {};
    const entries = Object.entries(clearKeys);
    let keyParam = "";
    if (entries.length === 1) {
      keyParam = `&k=${encodeURIComponent(entries[0][1])}`;
    } else if (entries.length > 1) {
      keyParam = `&keys=${encodeURIComponent(JSON.stringify(clearKeys))}`;
    }
    const resolved = {
      source,
      keyParam,
      name: data.name || `JioTV ${channelId}`,
    };
    jioDetailCache.set(String(channelId), { at: Date.now(), data: resolved });
    return resolved;
  } catch (err) {
    console.warn(`[Relay] JioTV resolve error for ${channelId}:`, err.message);
    return null;
  }
}

/** In-memory JioTV channel mapping cache */
let jioChannelMap = new Map();
let jioChannelMapFetched = 0;
const JIO_MAP_TTL_MS = 60 * 60 * 1000;

async function fetchJioChannelMap() {
  if (jioChannelMap.size > 0 && Date.now() - jioChannelMapFetched < JIO_MAP_TTL_MS) {
    return jioChannelMap;
  }
  try {
    const res = await fetch("https://jjtvxweb.pages.dev/jstr4web.json", {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return jioChannelMap;
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.result || []);
    const map = new Map();
    for (const item of list) {
      if (item && item.id && item.name) {
        const cleanName = item.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        map.set(cleanName, String(item.id));
        map.set(item.name.toLowerCase(), String(item.id));
      }
    }
    jioChannelMap = map;
    jioChannelMapFetched = Date.now();
    console.log(`[Relay] Loaded ${map.size} JioTV channel mappings.`);
  } catch (err) {
    console.warn("[Relay] Failed to fetch JioTV channel map:", err.message);
  }
  return jioChannelMap;
}

const TATA_TO_JIO_ALIASES = {
  "colors hd": "144",
  "colors": "145",
  "star plus hd": "1132",
  "star plus": "148",
  "zee tv hd": "167",
  "zee tv": "168",
  "sony sab hd": "471",
  "sony sab": "154",
  "sony max hd": "476",
  "sony max": "3418",
  "sony pix hd": "762",
  "sony sports ten 1 hd": "162",
  "sony sports ten 1": "162",
  "sony sports ten 2 hd": "891",
  "sony sports ten 3 hd": "892",
  "aaj tak": "173",
  "aaj tak hd": "481",
  "india today": "203",
  "ndtv 24x7": "255",
  "ndtv india": "256",
  "times now": "278",
  "cnn news18": "194",
  "star bharat hd": "870",
  "star bharat": "871",
  "star gold hd": "156",
  "star gold": "157",
  "star movies hd": "158",
  "star sports 1 hd": "180",
  "star sports 1 hindi hd": "487",
  "star sports select 1 hd": "812",
  "star sports select 2 hd": "813",
  "star pravah hd": "824",
  "zee cinema hd": "170",
  "zee marathi hd": "826",
  "zee bangla hd": "827",
  "zee kannada hd": "830",
  "zee telugu hd": "832",
  "zee tamil hd": "831",
  "zee cafe hd": "169",
  "cartoon network": "539",
  "pogo": "542",
  "nickelodeon": "544",
  "nick jr": "545",
  "sonic": "546",
  "discovery hd": "463",
  "animal planet hd": "286",
  "national geographic hd": "160",
  "nat geo wild hd": "466",
  "history tv18 hd": "146",
  "tlc hd": "479",
  "mtv hd": "477",
};

async function getJioIdForTataPlay(channelName) {
  if (!channelName) return null;
  const raw = channelName.toLowerCase().trim();
  if (TATA_TO_JIO_ALIASES[raw]) return TATA_TO_JIO_ALIASES[raw];
  const cl = raw.replace(/[^a-z0-9]/g, "");
  if (TATA_TO_JIO_ALIASES[cl]) return TATA_TO_JIO_ALIASES[cl];

  const map = await fetchJioChannelMap();
  if (map.has(raw)) return map.get(raw);
  if (map.has(cl)) return map.get(cl);

  const simplified = raw.replace(/\b(hd|sd|channel|tv|india|in)\b/g, "").replace(/[^a-z0-9]/g, "");
  if (simplified) {
    for (const [key, id] of map.entries()) {
      const kSimp = key.replace(/\b(hd|sd|channel|tv|india|in)\b/g, "").replace(/[^a-z0-9]/g, "");
      if (kSimp === simplified) return id;
    }
  }
  return null;
}

/** Rewrites an HLS playlist to route sub-playlists and media segments through the relay */
function rewriteHlsPlaylist(text, manifestUrl, relayOrigin) {
  const baseDir = manifestUrl.substring(0, manifestUrl.lastIndexOf("/") + 1);

  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      // Comment / tag line
      if (trimmed.startsWith("#")) {
        // Rewrite URI="..." attributes (e.g. #EXT-X-KEY, #EXT-X-MEDIA)
        return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
          try {
            const absolute = new URL(uri, baseDir).toString();
            return `URI="${relayOrigin}/segment?url=${encodeURIComponent(absolute)}"`;
          } catch {
            return match;
          }
        });
      }

      // Stream / Segment URL line
      try {
        const absolute = new URL(trimmed, baseDir).toString();
        if (trimmed.endsWith(".m3u8") || trimmed.includes(".m3u8?")) {
          // Sub-playlist variant
          return `${relayOrigin}/proxy/m3u8?url=${encodeURIComponent(absolute)}`;
        }
        // Media segment
        return `${relayOrigin}/segment?url=${encodeURIComponent(absolute)}`;
      } catch {
        return line;
      }
    })
    .join("\n");
}

/** Rewrite DASH manifest relative BaseURL tags */
function rewriteDashManifest(text, manifestUrl) {
  const baseDir = manifestUrl.substring(0, manifestUrl.lastIndexOf("/") + 1);

  let rewritten = text.replace(
    /<BaseURL([\s\S]*?)>([\s\S]*?)<\/BaseURL>/gi,
    (match, attrs, content) => {
      const trimmed = content.trim();
      if (!trimmed || /^https?:\/\//i.test(trimmed) || /^\/\//.test(trimmed)) {
        return match;
      }
      try {
        const absolute = new URL(trimmed, baseDir).toString();
        return `<BaseURL${attrs}>${absolute}</BaseURL>`;
      } catch {
        return match;
      }
    },
  );

  if (!/<BaseURL[\s>]/i.test(rewritten)) {
    rewritten = rewritten.replace(/(<MPD[\s\S]*?>)/i, `$1\n  <BaseURL>${baseDir}</BaseURL>`);
  }

  return rewritten;
}

/** Helper to construct upstream headers without leaking Watcho origin to Jio/Tata CDNs */
function getUpstreamHeaders(targetUrl, clientHeaders = {}) {
  const isJio = targetUrl.toLowerCase().includes("jio.com");
  const isTata =
    targetUrl.toLowerCase().includes("tatasky") ||
    targetUrl.toLowerCase().includes("tataplay") ||
    targetUrl.toLowerCase().includes("bpaita") ||
    targetUrl.toLowerCase().includes("bpaicatchupta") ||
    targetUrl.toLowerCase().includes("irdeto");
  return {
    "User-Agent":
      clientHeaders["user-agent"] ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ...(isJio
      ? {}
      : isTata
      ? { Referer: "https://watch.tataplay.com/", Origin: "https://watch.tataplay.com" }
      : { Referer: DEFAULT_REFERER, Origin: "https://www.watcho.com" }),
  };
}

/** Converts incoming Node.js request to Web Fetch API Request */
function toWebRequest(req, reqUrl) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
  }
  return new Request(reqUrl.toString(), {
    method: req.method || "GET",
    headers,
  });
}

/** Pipes a Web API Response object directly into Node.js ServerResponse */
async function forwardWebResponse(webRes, nodeRes) {
  nodeRes.statusCode = webRes.status;
  webRes.headers.forEach((val, key) => nodeRes.setHeader(key, val));
  for (const [key, val] of Object.entries(CORS_HEADERS)) {
    nodeRes.setHeader(key, val);
  }
  if (!webRes.body) {
    nodeRes.end();
    return;
  }
  const reader = webRes.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    nodeRes.write(value);
  }
  nodeRes.end();
}

/** HTTP Request Router */
const server = http.createServer(async (req, res) => {
  const relayOrigin = `http://${req.headers.host || "127.0.0.1:" + PORT}`;
  const reqUrl = new URL(req.url, relayOrigin);

  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // 1. Health check
  if (reqUrl.pathname === "/" || reqUrl.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
    res.end(
      JSON.stringify({
        ok: true,
        name: "nuvio-stream-relay",
        version: "1.1.0",
        channelsCached: channelCatalog.size,
        port: PORT,
        features: ["vzy", "jiotv", "tataplay", "stremio-addon"],
      }),
    );
    return;
  }

  // Tata Play Auth endpoints
  if (reqUrl.pathname.startsWith("/tataplay/auth/")) {
    if (reqUrl.pathname === "/tataplay/auth/status" && req.method === "GET") {
      const s = loadTataPlaySession();
      res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(
        JSON.stringify({
          loggedIn: Boolean(s?.loggedIn && s?.userAuthenticateToken),
          mobileNumber: s?.mobileNumber || null,
          subscriberId: s?.subscriberId || null,
        }),
      );
      return;
    }

    if (reqUrl.pathname === "/tataplay/auth/logout" && req.method === "POST") {
      saveTataPlaySession({});
      tataPlayTokenCache.clear();
      res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ success: true, message: "Logged out successfully" }));
      return;
    }

    if (reqUrl.pathname === "/tataplay/auth/otp/send" && req.method === "POST") {
      try {
        const body = await parseJsonBody(req);
        const mobile = String(body.mobile || "").replace(/\D/g, "");
        if (mobile.length < 10) {
          res.writeHead(400, { "Content-Type": "application/json", ...CORS_HEADERS });
          res.end(JSON.stringify({ error: "Invalid mobile number" }));
          return;
        }

        const session = await ensureTataPlayGuestDevice();
        const otpRes = await fetch("https://tb.tapi.videoready.tv/binge-mobile-services/pub/api/v1/user/authentication/generateOTP", {
          method: "POST",
          headers: {
            "accept": "application/json, text/plain, */*",
            "anonymousid": session.anonymousId,
            "deviceid": session.deviceId,
            "mobilenumber": mobile,
            "newotpflow": "4DOTP",
            "origin": "https://www.tataplaybinge.com",
            "platform": "BINGE_ANYWHERE",
            "referer": "https://www.tataplaybinge.com/",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          },
        });
        const data = await otpRes.json();
        if (data.code === 0 || otpRes.ok) {
          saveTataPlaySession({ ...session, mobileNumber: mobile });
          res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
          res.end(JSON.stringify({ success: true, message: data.message || "OTP generated successfully." }));
        } else {
          res.writeHead(400, { "Content-Type": "application/json", ...CORS_HEADERS });
          res.end(JSON.stringify({ error: data.message || "Failed to generate OTP" }));
        }
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json", ...CORS_HEADERS });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (reqUrl.pathname === "/tataplay/auth/otp/verify" && req.method === "POST") {
      try {
        const body = await parseJsonBody(req);
        const mobile = String(body.mobile || "").replace(/\D/g, "");
        const otp = String(body.otp || "").trim();
        let session = await ensureTataPlayGuestDevice();

        const validateRes = await fetch("https://tb.tapi.videoready.tv/binge-mobile-services/pub/api/v1/user/authentication/validateOTP", {
          method: "POST",
          headers: {
            "accept": "application/json, text/plain, */*",
            "anonymousid": session.anonymousId,
            "content-type": "application/json",
            "deviceid": session.deviceId,
            "origin": "https://www.tataplaybinge.com",
            "platform": "BINGE_ANYWHERE",
            "referer": "https://www.tataplaybinge.com/",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          },
          body: JSON.stringify({ mobileNumber: mobile, otp }),
        });
        const valData = await validateRes.json();
        const userToken = valData?.data?.userAuthenticateToken;
        const deviceToken = valData?.data?.deviceAuthenticateToken;

        if (!userToken) {
          res.writeHead(400, { "Content-Type": "application/json", ...CORS_HEADERS });
          res.end(JSON.stringify({ error: valData.message || "Invalid OTP entered. Please try again." }));
          return;
        }

        let subscriberId = mobile;
        let dthStatus = "";
        let bingeSubscriberId = "";
        let baId = null;

        try {
          const subRes = await fetch("https://tb.tapi.videoready.tv/binge-mobile-services/api/v4/subscriber/details", {
            headers: {
              "accept": "application/json, text/plain, */*",
              "anonymousid": session.anonymousId,
              "authorization": `bearer ${userToken}`,
              "devicetype": "WEB",
              "mobilenumber": mobile,
              "origin": "https://www.tataplaybinge.com",
              "platform": "BINGE_ANYWHERE",
              "referer": "https://www.tataplaybinge.com/",
              "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
            },
          });
          if (subRes.ok) {
            const subData = await subRes.json();
            const acc = subData?.data?.accountDetails?.[0];
            if (acc) {
              if (acc.subscriberId) subscriberId = String(acc.subscriberId);
              if (acc.dthStatus) dthStatus = String(acc.dthStatus);
              if (acc.bingeSubscriberId) bingeSubscriberId = String(acc.bingeSubscriberId);
              if (acc.baId) baId = acc.baId;
            }
          }
        } catch {}

        // Complete user session on Tata Play Binge
        let finalUserToken = userToken;
        let finalSubscriberId = subscriberId;

        try {
          let loginUrl = "https://tb.tapi.videoready.tv/binge-mobile-services/api/v3/create/new/user";
          let loginBody = {
            dthStatus: "Non DTH User",
            subscriberId: mobile,
            login: "OTP",
            mobileNumber: mobile,
            isPastBingeUser: false,
            eulaChecked: true,
            packageId: ""
          };

          if (dthStatus === "DTH Without Binge") {
            loginUrl = "https://tb.tapi.videoready.tv/binge-mobile-services/api/v3/create/new/user";
            loginBody = {
              dthStatus: "DTH Without Binge",
              subscriberId,
              login: "OTP",
              mobileNumber: mobile,
              baId: null,
              isPastBingeUser: false,
              eulaChecked: true,
              packageId: "",
              referenceId: null
            };
          } else if (dthStatus) {
            loginUrl = "https://tb.tapi.videoready.tv/binge-mobile-services/api/v3/update/exist/user";
            loginBody = {
              dthStatus,
              subscriberId,
              bingeSubscriberId,
              baId,
              login: "OTP",
              mobileNumber: mobile,
              payment_return_url: "https://www.tataplaybinge.com/subscription-transaction/status",
              eulaChecked: true,
              packageId: ""
            };
          }

          const loginHeaders = {
            "accept": "application/json, text/plain, */*",
            "anonymousid": session.anonymousId,
            "authorization": `bearer ${userToken}`,
            "content-type": "application/json",
            "device": "WEB",
            "deviceid": session.deviceId,
            "devicename": "Web",
            "devicetoken": deviceToken,
            "origin": "https://www.tataplaybinge.com",
            "platform": "WEB",
            "referer": "https://www.tataplaybinge.com/",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
          };

          const loginRes = await fetch(loginUrl, {
            method: "POST",
            headers: loginHeaders,
            body: JSON.stringify(loginBody),
          });

          if (loginRes.ok) {
            const loginData = await loginRes.json();
            if (loginData?.data?.userAuthenticateToken) {
              finalUserToken = loginData.data.userAuthenticateToken;
            }
            if (loginData?.data?.subscriberId) {
              finalSubscriberId = String(loginData.data.subscriberId);
            }
          }
        } catch (err) {
          console.warn("[Relay] Tata Play create/update user warning:", err.message);
        }

        session = {
          ...session,
          mobileNumber: mobile,
          subscriberId: finalSubscriberId,
          userAuthenticateToken: finalUserToken,
          deviceAuthenticateToken: deviceToken,
          loggedIn: true,
        };
        saveTataPlaySession(session);
        tataPlayTokenCache.clear();

        res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
        res.end(
          JSON.stringify({
            success: true,
            subscriberId,
            userAuthenticateToken: userToken,
            message: "Logged in successfully",
          }),
        );
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json", ...CORS_HEADERS });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
  }

  // 2. JioTV Stremio Addon routes (/manifest.json, /catalog/..., /meta/..., /stream/...)
  const isAddonRoute =
    handleJioTvAddon &&
    (reqUrl.pathname === "/manifest.json" ||
      reqUrl.pathname.startsWith("/catalog/") ||
      reqUrl.pathname.startsWith("/meta/") ||
      reqUrl.pathname.startsWith("/stream/") ||
      reqUrl.pathname.startsWith("/jiotv-addon"));

  if (isAddonRoute) {
    try {
      const addonUrl = reqUrl.pathname.startsWith("/jiotv-addon")
        ? reqUrl
        : new URL(`/jiotv-addon${reqUrl.pathname}${reqUrl.search}`, relayOrigin);
      const webReq = toWebRequest(req, addonUrl);
      const webRes = await handleJioTvAddon(
        webReq,
        { JIOTV_ADDON_RELAY_URL: relayOrigin },
        addonUrl,
      );
      await forwardWebResponse(webRes, res);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 3. JioTV Direct pipeline routes (/jiotv-api/*)
  if (handleJioTvDirect && (reqUrl.pathname === "/jiotv-api" || reqUrl.pathname.startsWith("/jiotv-api/"))) {
    try {
      const webReq = toWebRequest(req, reqUrl);
      const webRes = await handleJioTvDirect(webReq, {}, reqUrl);
      await forwardWebResponse(webRes, res);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 4. Channel List
  if (reqUrl.pathname === "/channels") {
    if (channelCatalog.size === 0 || Date.now() - catalogLastFetched > CATALOG_TTL_MS) {
      await fetchKalturaCatalog();
    }
    if (tataPlayCatalog.size === 0) {
      loadTataPlayCatalog();
    }
    const overrides = loadCustomOverrides();
    const channels = [
      ...Array.from(channelCatalog.values()).map((c) => ({
        ...c,
        override: overrides.has(c.id),
        relayHls: `${relayOrigin}/live/${c.id}.m3u8`,
        relayDash: c.dashUrl ? `${relayOrigin}/live/${c.id}.mpd` : null,
      })),
      ...Array.from(tataPlayCatalog.values())
        .filter((c, idx, arr) => arr.findIndex((x) => x.id === c.id) === idx)
        .map((c) => ({
          ...c,
          override: overrides.has(c.id),
          relayHls: c.hlsUrl ? `${relayOrigin}/live/${c.id}.m3u8` : null,
          relayDash: c.dashUrl ? `${relayOrigin}/live/${c.id}.mpd` : null,
        })),
    ];

    res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
    res.end(JSON.stringify({ count: channels.length, channels }));
    return;
  }

  // 5. Live Channel HLS/DASH Endpoint: /live/:channelId.m3u8 or /live/:channelId.mpd
  const liveMatch = reqUrl.pathname.match(/^\/live\/([^.]+)\.(m3u8|mpd)$/);
  if (liveMatch) {
    const channelId = decodeURIComponent(liveMatch[1]);
    const format = liveMatch[2];

    const overrides = loadCustomOverrides();
    let upstreamUrl = overrides.get(channelId)?.url;

    // Check Tata Play Catalog
    if (!upstreamUrl) {
      if (tataPlayCatalog.size === 0) {
        loadTataPlayCatalog();
      }
      const tp = tataPlayCatalog.get(channelId);
      if (tp) {
        // Tata Play CDN only provides Widevine DASH (.mpd).
        // For HLS (.m3u8) requests, bridge to JioTV clearKey live stream:
        if (format === "m3u8") {
          const jioId = await getJioIdForTataPlay(tp.name);
          if (jioId && handleJioTvDirect) {
            console.log(`[Relay] Tata Play ${tp.name} (${channelId}) HLS bridging via JioTV channel ${jioId}`);
            const jio = await resolveJioTvStream(jioId);
            if (jio) {
              const targetPath = `/jiotv-api/playlist.m3u8?u=${encodeURIComponent(jio.source)}${jio.keyParam}`;
              const jioUrl = new URL(targetPath, relayOrigin);
              const webReq = toWebRequest(req, jioUrl);
              const webRes = await handleJioTvDirect(webReq, {}, jioUrl);
              await forwardWebResponse(webRes, res);
              return;
            }
          }
        }

        // For DASH (.mpd), try Tata Play subscriber CDN stream:
        upstreamUrl = await resolveTataPlayLiveStream(channelId);
        if (!upstreamUrl) {
          // If unauthenticated or token-restricted, redirect to HLS JioTV bridge
          const jioId = await getJioIdForTataPlay(tp.name);
          if (jioId) {
            res.writeHead(302, {
              Location: `${relayOrigin}/live/${encodeURIComponent(channelId)}.m3u8`,
              ...CORS_HEADERS,
            });
            res.end();
            return;
          }

          res.writeHead(401, { "Content-Type": "application/json", ...CORS_HEADERS });
          res.end(
            JSON.stringify({
              error: "tataplay_auth_required",
              message: `${tp.name} requires Tata Play subscriber authorization on Akamai CDN. Sign in with your registered mobile number in TataPlay+.`,
            }),
          );
          return;
        }
      }
    }

    // Check Kaltura Catalog
    if (!upstreamUrl) {
      if (channelCatalog.size === 0 || Date.now() - catalogLastFetched > CATALOG_TTL_MS) {
        await fetchKalturaCatalog();
      }
      const ch = channelCatalog.get(channelId);
      if (ch) {
        upstreamUrl = format === "mpd" ? ch.dashUrl : ch.hlsUrl || ch.dashUrl;
      }
    }

    // If still not found, check JioTV resolver
    if (!upstreamUrl && handleJioTvDirect) {
      const jio = await resolveJioTvStream(channelId);
      if (jio) {
        const targetPath = `/jiotv-api/playlist.m3u8?u=${encodeURIComponent(jio.source)}${jio.keyParam}`;
        const jioUrl = new URL(targetPath, relayOrigin);
        const webReq = toWebRequest(req, jioUrl);
        const webRes = await handleJioTvDirect(webReq, {}, jioUrl);
        await forwardWebResponse(webRes, res);
        return;
      }
    }

    if (!upstreamUrl) {
      res.writeHead(404, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ error: `No stream available for channel ${channelId}` }));
      return;
    }

    try {
      const upstreamRes = await fetch(upstreamUrl, {
        headers: getUpstreamHeaders(upstreamUrl, req.headers),
      });

      if (!upstreamRes.ok) {
        res.writeHead(upstreamRes.status, { "Content-Type": "application/json", ...CORS_HEADERS });
        res.end(JSON.stringify({ error: `Upstream error ${upstreamRes.status}` }));
        return;
      }

      const text = await upstreamRes.text();
      if (format === "mpd" || upstreamUrl.includes(".mpd")) {
        const rewrittenMpd = rewriteDashManifest(text, upstreamUrl);
        res.writeHead(200, {
          "Content-Type": "application/dash+xml",
          "Cache-Control": "no-cache",
          ...CORS_HEADERS,
        });
        res.end(rewrittenMpd);
      } else {
        const rewrittenHls = rewriteHlsPlaylist(text, upstreamUrl, relayOrigin);
        res.writeHead(200, {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-cache",
          ...CORS_HEADERS,
        });
        res.end(rewrittenHls);
      }
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 6. Sub-playlist proxy: /proxy/m3u8?url=...
  if (reqUrl.pathname === "/proxy/m3u8") {
    const targetUrl = reqUrl.searchParams.get("url");
    if (!targetUrl) {
      res.writeHead(400, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ error: "Missing url parameter" }));
      return;
    }

    try {
      const upstreamRes = await fetch(targetUrl, {
        headers: getUpstreamHeaders(targetUrl, req.headers),
      });
      const text = await upstreamRes.text();
      const rewritten = rewriteHlsPlaylist(text, targetUrl, relayOrigin);
      res.writeHead(200, {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-cache",
        ...CORS_HEADERS,
      });
      res.end(rewritten);
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 7. Media Chunk Segment Proxy: /segment?url=...
  if (reqUrl.pathname === "/segment") {
    const targetUrl = reqUrl.searchParams.get("url");
    if (!targetUrl) {
      res.writeHead(400, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ error: "Missing url parameter" }));
      return;
    }

    const headers = getUpstreamHeaders(targetUrl, req.headers);
    if (req.headers.range) {
      headers["Range"] = req.headers.range;
    }

    try {
      const upstreamRes = await fetch(targetUrl, { headers });
      const passHeaders = {
        ...CORS_HEADERS,
        "Content-Type": upstreamRes.headers.get("content-type") || "video/mp2t",
        "Cache-Control": "public, max-age=86400",
      };
      if (upstreamRes.headers.get("content-length")) {
        passHeaders["Content-Length"] = upstreamRes.headers.get("content-length");
      }
      if (upstreamRes.headers.get("content-range")) {
        passHeaders["Content-Range"] = upstreamRes.headers.get("content-range");
      }

      res.writeHead(upstreamRes.status, passHeaders);

      if (upstreamRes.body) {
        const reader = upstreamRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify({ error: "Route not found" }));
});

// Boot server and populate catalog
server.listen(PORT, HOST, async () => {
  console.log("=======================================================");
  console.log(`🚀 NuvioTV Stream Relay & JioTV Addon running on http://${HOST}:${PORT}`);
  console.log(`📡 Live Channel URL: http://${HOST}:${PORT}/live/{channelId}.m3u8`);
  console.log(`🧩 Stremio Addon URL: http://${HOST}:${PORT}/manifest.json`);
  console.log("=======================================================");
  await fetchKalturaCatalog();
});
