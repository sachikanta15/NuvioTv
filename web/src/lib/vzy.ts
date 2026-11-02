/**
 * VZY live TV directory.
 *
 * VZY (vzy.one) is a Watcho white-label built on Kaltura OTT. Its public
 * live directory uses the same calls the site itself makes: mint an anonymous
 * Kaltura session, then list KalturaLiveAsset items (type 686). Each asset
 * carries metadata, genre, language, logos, and its HLS/DASH manifests.
 *
 * Manifest architecture:
 *   - HLS (.m3u8): Provided as HLS or HLS_FP. Clear FTA channels live under
 *     `hls_fta/` (or DRMType: Free) and play inline via `/stream-proxy` with
 *     `Referer: https://www.watcho.com/`. Protected HLS channels use Apple
 *     FairPlay (`skd://` key delivery).
 *   - DASH (.mpd): Provided as DASH or DASH_WV. Unencrypted FTA channels have
 *     zero <ContentProtection> tags. Protected channels use standard CENC
 *     with Widevine (cenc:default_KID + PSSH) and PlayReady UUIDs.
 *   - Partner channels (JioHotstar, SonyLIV): Live stream manifests are
 *     dynamically provisioned by the SSO service (`/v1/stream`) when an
 *     authenticated subscriber token (`hzToken`) is supplied.
 */

import { streamProxyUrl } from "@/lib/stream-proxy";
import { loadJioTvChannelDetail, buildJioTvPlaylistUrl } from "./jiotv";
import { getStoredTataPlayAuth } from "./tataplay";

const API_BASE = "https://5093.dsp1.ott.kaltura.com/api_v3/service";
const PARTNER_ID = "5093";
const CLIENT_TAG = "KSPWeb-v0.0.115";
const API_VERSION = "11.0.2.1";
const VZY_SITE_URL = "https://www.vzy.one";
const KS_STORAGE_KEY = "nuvio.vzy.ks";
const DIRECTORY_TIMEOUT_MS = 15_000;
/** Keep the 318-channel directory warm in memory across route changes. */
const DIRECTORY_TTL_MS = 10 * 60 * 1000;

/** The CDN checks this Referer; the site's own player sends the Watcho one. */
export const VZY_STREAM_HEADERS = { Referer: "https://www.watcho.com/" } as const;

export interface VzyChannel {
  id: string;
  externalId?: string | null;
  name: string;
  category: string;
  language: string;
  /** Square channel logo, when available. */
  logo: string | null;
  /** 16:9 artwork for card/player backdrop. */
  banner: string | null;
  /** HLS manifest URL (.m3u8), when available. */
  hlsUrl: string | null;
  /** DASH manifest URL (.mpd), when available. */
  dashUrl: string | null;
  /** Content partner (e.g. "jiohotstar", "sonyliv", "VZY", "tarangplus"). */
  partner: string | null;
  /** Declared DRM type (e.g. "Free", "Nagra", "JHSLicense", "DynamicUrl"). */
  drmType: string | null;
  /** Free to watch without a paid subscription. */
  free: boolean;
  /** Free and clear/unencrypted, so it can play inline in the player. */
  playable: boolean;
  /** Protected with Nagra/FairPlay/Widevine DRM. */
  drm: boolean;
  /** Logical channel number, when supplied. */
  lcn: number | null;
  /** Direct channel URL on vzy.one. */
  watchUrl: string;
}

export const VZY_COLLECTIONS = [
  { id: "all", label: "All channels" },
  { id: "free", label: "Free to watch" },
  { id: "jiohotstar", label: "JioHotstar" },
  { id: "sonyliv", label: "SonyLIV" },
  { id: "news", label: "News" },
  { id: "entertainment", label: "Entertainment" },
  { id: "movies", label: "Movies" },
  { id: "sports", label: "Sports" },
  { id: "music", label: "Music" },
  { id: "devotional", label: "Devotional" },
  { id: "kids", label: "Kids" },
  { id: "infotainment", label: "Infotainment" },
  { id: "lifestyle", label: "Lifestyle" },
] as const;

export type VzyCollectionId = (typeof VZY_COLLECTIONS)[number]["id"];

/** Category names the directory uses that need a readable label. */
const CATEGORY_LABELS: Record<string, string> = {
  sports: "Sports",
  regional: "Regional",
  tv: "Entertainment",
  religious: "Devotional",
  movie: "Movies",
};

/** Matches a channel against a quick collection chip. */
export function matchesVzyCollection(
  channel: VzyChannel,
  collection: VzyCollectionId,
): boolean {
  if (collection === "all") return true;
  if (collection === "free") return channel.playable;
  if (collection === "jiohotstar") return channel.partner?.toLowerCase() === "jiohotstar";
  if (collection === "sonyliv") return channel.partner?.toLowerCase() === "sonyliv";
  const category = channel.category.toLowerCase();
  if (collection === "devotional") {
    return category.includes("devotional") || category.includes("religious");
  }
  return category.includes(collection);
}

/** Tata Play stream headers for upstream Akamai playback. */
export const TATAPLAY_STREAM_HEADERS = {
  Referer: "https://watch.tataplay.com/",
  Origin: "https://watch.tataplay.com",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
} as const;

/** Wraps an HLS or MPD URL in the same-origin proxy with upstream headers. */
export function vzyStreamProxyUrl(
  streamUrl: string,
  headers: Record<string, string> = VZY_STREAM_HEADERS,
): string {
  return streamProxyUrl(streamUrl, headers);
}

/* ------------------------------------------------------------------------- */

export interface VzyAuthData {
  token: string;
  phoneNumber?: string;
  userId?: string;
}

const VZY_AUTH_STORAGE_KEY = "nuvio.vzy.auth";

export function getStoredVzyAuth(): VzyAuthData | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(VZY_AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VzyAuthData;
  } catch {
    return null;
  }
}

export function storeVzyAuth(auth: VzyAuthData): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(VZY_AUTH_STORAGE_KEY, JSON.stringify(auth));
  } catch {
    // Storage restricted
  }
}

export function clearVzyAuth(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(VZY_AUTH_STORAGE_KEY);
  } catch {
    // Storage restricted
  }
}

function vzyApiUrl(path: string): string {
  if (typeof window !== "undefined") return `/vzy-api${path}`;
  return `http://127.0.0.1:5173/vzy-api${path}`;
}

export async function requestVzyOtp(
  phoneNumber: string,
  countryCode = 91,
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(vzyApiUrl("/otp/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber, countryCode }),
  });
  const data = await res.json();
  if (res.ok && data?.hzStatus === 200) {
    return { success: true, message: data.message || "OTP sent successfully" };
  }
  throw new Error(data?.message || "Failed to send OTP");
}

export async function verifyVzyOtp(
  phoneNumber: string,
  otp: string,
  countryCode = 91,
): Promise<VzyAuthData> {
  const res = await fetch(vzyApiUrl("/otp/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber, otp, countryCode }),
  });
  const data = await res.json();
  const token = data?.data?.hzToken;
  if (!token) {
    throw new Error(data?.message || data?.error || "OTP verification failed");
  }
  const auth: VzyAuthData = {
    token,
    phoneNumber,
    userId: data?.data?.user?.username || data?.data?.user?.userId || phoneNumber,
  };
  storeVzyAuth(auth);
  return auth;
}

export function vzyRelayUrl(): string | null {
  const configured = (
    import.meta.env?.VITE_VZY_RELAY_URL as string | undefined
  )?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  try {
    const stored = globalThis.localStorage?.getItem("nuvio.vzy.relayUrl")?.trim();
    return stored ? stored.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

export interface ResolvedVzyStream {
  url: string;
  format: "hls" | "dash";
  drm?: boolean;
  protectionData?: Record<string, unknown>;
}

/**
 * Mapping of VZY channel IDs that use unsupported DRM (e.g. Discovery Apple FairPlay / ExpressPlay)
 * to their verified high-fidelity clearKey live streams.
 */
export const VZY_JIOTV_FALLBACK_MAP: Record<string, { id: string; name: string }> = {
  "9487663": { id: "1132", name: "Star Plus HD" },
  "8458377": { id: "1132", name: "Star Plus HD" },
  "9450546": { id: "875", name: "Eurosport HD" },
  "9450542": { id: "3434", name: "Investigation Discovery HD" },
  "9450555": { id: "463", name: "Discovery HD" },
  "9536122": { id: "286", name: "Animal Planet HD" },
  "9450548": { id: "479", name: "TLC HD World India" },
  "9450547": { id: "1079", name: "Cartoon Network HD+" },
  "9450554": { id: "568", name: "Discovery Science" },
  "9450551": { id: "541", name: "Discovery Turbo" },
  "9450550": { id: "3430", name: "Discovery Tamil" },
  "9450552": { id: "550", name: "Discovery Kids" },
  "9450545": { id: "542", name: "Pogo" },
  "9450543": { id: "193", name: "CNN International" },
};

export async function resolveVzyStream(
  channel: VzyChannel,
  customToken?: string,
  ignoreRelay = false,
): Promise<ResolvedVzyStream> {
  const partnerLower = (channel.partner || "").toLowerCase();
  const drmTypeLower = (channel.drmType || "").toLowerCase();
  const token = customToken || getStoredVzyAuth()?.token;
  const hasDirectStream = Boolean(channel.hlsUrl || channel.dashUrl);

  // 0. Tata Play channels: direct MPD/DASH when authenticated or FTA direct, with automated JioTV bridge fallback
  if (partnerLower === "tataplay") {
    const streamUrl = channel.dashUrl || channel.hlsUrl;
    if (!streamUrl) {
      throw new Error(`Tata Play channel ${channel.name} has no valid stream manifest`);
    }

    const hasTataPlayAuth = Boolean(getStoredTataPlayAuth()?.loggedIn);
    const isDirect = streamUrl.includes("delta") || streamUrl.includes("cable") || streamUrl.includes("jansetu") || streamUrl.includes("tvpunjab") || streamUrl.includes("5centscdn");
    const isDash = (hasTataPlayAuth || isDirect) && (streamUrl.includes(".mpd") || !channel.hlsUrl);
    const relay = !ignoreRelay ? vzyRelayUrl() : null;

    if (relay) {
      return {
        url: `${relay}/live/${encodeURIComponent(channel.id)}.${isDash ? "mpd" : "m3u8"}`,
        format: isDash ? "dash" : "hls",
        drm: (hasTataPlayAuth || isDirect) ? channel.drm : false,
        protectionData: (channel as unknown as { protectionData?: Record<string, unknown> }).protectionData,
      };
    }

    if (!isDirect && (channel.drm || !channel.free) && !hasTataPlayAuth) {
      throw new Error(
        `${channel.name} requires Tata Play subscriber authorization or active stream relay. Sign in with your registered mobile number or start the stream relay.`,
      );
    }

    return {
      url: vzyStreamProxyUrl(streamUrl, TATAPLAY_STREAM_HEADERS),
      format: isDash ? "dash" : "hls",
      drm: channel.drm,
      protectionData: (channel as unknown as { protectionData?: Record<string, unknown> }).protectionData,
    };
  }

  // 1. Relay-first when a relay URL is configured (e.g. VITE_VZY_RELAY_URL or localStorage["nuvio.vzy.relayUrl"])
  // Only route to relay if the channel actually has a direct stream in Kaltura OTT.
  // Skip relay for Discovery channels because Discovery's upstream CDN uses Apple FairPlay DRM (skd://)
  // and Intertrust ExpressPlay DRM which browsers/hls.js cannot decrypt natively.
  const relay = !ignoreRelay ? vzyRelayUrl() : null;
  if (relay && hasDirectStream && partnerLower !== "discovery") {
    const isDash = !channel.hlsUrl && Boolean(channel.dashUrl);
    let protectionData: Record<string, unknown> | undefined;

    if (channel.dashUrl && (drmTypeLower === "nagra" || partnerLower === "vzy")) {
      try {
        const contentId = channel.externalId || channel.id;
        const res = await fetch(vzyApiUrl("/content-auth-token"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: getStoredVzyAuth()?.phoneNumber || "anonymous",
            contentId,
            type: "1",
            deviceUniqueId: "12345678-1234-1234-1234-123456789abc",
            deviceId: "12345678-1234-1234-1234-123456789abc",
            format: "widevine",
            platform: "web",
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.licenseUrl && data?.token) {
            protectionData = {
              "com.widevine.alpha": {
                serverURL: data.licenseUrl,
                httpRequestHeaders: {
                  "nv-authorizations": data.token,
                },
              },
            };
          }
        }
      } catch {
        // Fallback without protectionData
      }
    }

    return {
      url: `${relay}/live/${encodeURIComponent(channel.id)}.${isDash ? "mpd" : "m3u8"}`,
      format: isDash ? "dash" : "hls",
      drm: Boolean(protectionData) || channel.drm,
      protectionData,
    };
  }

  // 2. If clear/playable FTA channel
  if (channel.playable && (channel.hlsUrl || channel.dashUrl)) {
    const streamUrl = channel.hlsUrl || channel.dashUrl!;
    return {
      url: vzyStreamProxyUrl(streamUrl),
      format: channel.hlsUrl ? "hls" : "dash",
    };
  }

  // 3. Partner channels (JioHotstar, SonyLIV, Discovery, Shemaroo, etc.)
  const isPartner =
    partnerLower === "jiohotstar" ||
    partnerLower === "sonyliv" ||
    partnerLower === "discovery" ||
    partnerLower === "shemaroo_me" ||
    drmTypeLower === "dynamicurl" ||
    drmTypeLower === "jhslicense" ||
    (drmTypeLower === "license" && partnerLower !== "vzy");

  if (isPartner) {
    // 1. Check if channel has an automated high-fidelity live stream fallback (e.g. Eurosport HD)
    const jioFallback = VZY_JIOTV_FALLBACK_MAP[channel.id];
    if (jioFallback) {
      try {
        const detail = await loadJioTvChannelDetail({
          id: jioFallback.id,
        });
        const playlistUrl = buildJioTvPlaylistUrl(detail);
        if (playlistUrl) {
          return {
            url: playlistUrl,
            format: "hls",
            drm: false,
          };
        }
      } catch (err) {
        console.warn(`[vzy] Fallback stream resolution failed for ${channel.name}:`, err);
      }
    }

    let pid = channel.id;
    if (channel.externalId) {
      const parts = channel.externalId.split(partnerLower);
      if (parts.length > 1 && parts[1].length > 1) {
        pid = parts[1].replace(/^[_-]/, "");
      } else if (partnerLower !== "discovery") {
        pid = channel.externalId;
      }
    }

    if (token) {
      try {
        const params = new URLSearchParams({
          userId: getStoredVzyAuth()?.userId || getStoredVzyAuth()?.phoneNumber || "999999999",
          pid,
          contentPartner: partnerLower,
          scheme: "widevine",
          deviceType: "web",
          deviceId: "123445",
          isDrm: channel.drmType === "FreeDynamicUrl" ? "false" : "true",
          isLinear: "true",
        });
        const res = await fetch(vzyApiUrl(`/stream?${params.toString()}`), {
          headers: { Authorization: token },
        });
        const data = await res.json();
        const streamUrl = data?.streamUrl || data?.data?.streamUrl || data?.url;
        if (streamUrl) {
          return {
            url: vzyStreamProxyUrl(streamUrl),
            format: streamUrl.includes(".mpd") ? "dash" : "hls",
            drm: true,
          };
        }
      } catch {
        // Fall through to error
      }
    }

    if (!token) {
      throw new Error(
        `Watcho / VZY account subscription required to unlock ${channel.name} (${channel.partner || "Partner"}). Click 'Unlock with VZY Account' below.`,
      );
    }

    throw new Error(
      `Active Watcho subscription required for ${channel.name} (${channel.partner || "Partner"}).`,
    );
  }

  // 4. Nagra DASH DRM channels: generate license token via /content-auth-token for native Widevine EME in dash.js
  if (channel.dashUrl && (drmTypeLower === "nagra" || partnerLower === "vzy")) {
    try {
      const contentId = channel.externalId || channel.id;
      const res = await fetch(vzyApiUrl("/content-auth-token"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: getStoredVzyAuth()?.phoneNumber || "anonymous",
          contentId,
          type: "1",
          deviceUniqueId: "12345678-1234-1234-1234-123456789abc",
          deviceId: "12345678-1234-1234-1234-123456789abc",
          format: "widevine",
          platform: "web",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.licenseUrl && data?.token) {
          return {
            url: vzyStreamProxyUrl(channel.dashUrl),
            format: "dash",
            drm: true,
            protectionData: {
              "com.widevine.alpha": {
                serverURL: data.licenseUrl,
                httpRequestHeaders: {
                  "nv-authorizations": data.token,
                },
              },
            },
          };
        }
      }
    } catch {
      // Continue to fallback
    }
    return {
      url: vzyStreamProxyUrl(channel.dashUrl),
      format: "dash",
      drm: true,
    };
  }

  // 5. Fallback to static HLS if present
  if (channel.hlsUrl) {
    return { url: vzyStreamProxyUrl(channel.hlsUrl), format: "hls", drm: channel.drm };
  }

  throw new Error("No playback stream available for this channel.");
}

/* ------------------------------------------------------------------------- */

interface KalturaSession {
  ks: string;
  /** Unix epoch in milliseconds. */
  expiresAt: number;
}

interface KalturaError {
  message?: string;
  code?: string;
}

interface KalturaResult<T> {
  result?: T & { error?: KalturaError };
}

interface VzyMetaValue {
  value?: string | number | boolean | null;
}

interface VzyTagValue {
  value?: string;
}

interface VzyTag {
  objects?: VzyTagValue[];
}

interface VzyImage {
  imageTypeName?: string;
  url?: string;
}

interface VzyMediaFile {
  type?: string;
  url?: string;
}

export interface VzyAsset {
  id?: string | number;
  externalId?: string | number;
  name?: string;
  tags?: Record<string, VzyTag>;
  metas?: Record<string, VzyMetaValue>;
  images?: VzyImage[];
  mediaFiles?: VzyMediaFile[];
}

interface VzyListResult {
  totalCount?: number;
  objects?: VzyAsset[];
}

let sessionCache: KalturaSession | null = null;
let directoryCache: { at: number; channels: VzyChannel[] } | null = null;

function readStoredSession(): KalturaSession | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<KalturaSession>;
    if (
      typeof parsed.ks === "string" &&
      typeof parsed.expiresAt === "number" &&
      parsed.expiresAt > Date.now() + 60_000
    ) {
      return { ks: parsed.ks, expiresAt: parsed.expiresAt };
    }
  } catch {
    // Ignore malformed stored session
  }
  return null;
}

function storeSession(session: KalturaSession): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(KS_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignored in restricted environments
  }
}

async function postKaltura<T>(
  action: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw new Error(`VZY API ${action} failed (${response.status})`);
  }

  const payload = (await response.json()) as KalturaResult<T>;
  const result = payload?.result;
  if (!result) throw new Error("VZY API returned an empty response");
  if (result.error) {
    throw new Error(result.error.message || "VZY API error");
  }
  return result;
}

async function loadSession(
  signal: AbortSignal,
  force = false,
): Promise<KalturaSession> {
  if (!force) {
    if (sessionCache && sessionCache.expiresAt > Date.now() + 60_000) {
      return sessionCache;
    }
    const stored = readStoredSession();
    if (stored) {
      sessionCache = stored;
      return stored;
    }
  }

  const result = await postKaltura<{ ks?: string; expiry?: number }>(
    "ottuser/action/anonymouslogin",
    { partnerId: PARTNER_ID, ClientTag: CLIENT_TAG, apiVersion: API_VERSION },
    signal,
  );
  const ks = result.ks;
  if (!ks) throw new Error("VZY session unavailable");

  const expiresAt =
    (typeof result.expiry === "number"
      ? result.expiry
      : Math.floor(Date.now() / 1000) + 24 * 60 * 60) * 1000;
  const session = { ks, expiresAt };
  sessionCache = session;
  storeSession(session);
  return session;
}

async function listLiveAssets(
  ks: string,
  signal: AbortSignal,
): Promise<VzyListResult> {
  return postKaltura<VzyListResult>(
    "asset/action/list",
    {
      apiVersion: API_VERSION,
      ks,
      ClientTag: CLIENT_TAG,
      filter: { objectType: "KalturaSearchAssetFilter", typeIn: "686" },
      pager: { pageIndex: 1, pageSize: 500 },
    },
    signal,
  );
}

function metaValue(
  asset: VzyAsset,
  key: string,
): string | number | boolean | null {
  const value = asset.metas?.[key]?.value;
  return value === undefined ? null : value;
}

function metaText(asset: VzyAsset, key: string): string | null {
  const value = metaValue(asset, key);
  return value === null ? null : String(value);
}

function tagValue(asset: VzyAsset, key: string): string | null {
  const values = asset.tags?.[key]?.objects ?? [];
  for (const entry of values) {
    const value = entry?.value?.trim();
    if (value) return value;
  }
  return null;
}

function pickMediaUrl(files: VzyMediaFile[] | undefined, types: string[]): string | null {
  if (!files) return null;
  for (const type of types) {
    const file = files.find((entry) => entry?.type === type && entry.url?.trim());
    if (file?.url) return file.url.trim();
  }
  return null;
}

function pickImage(images: VzyImage[] | undefined, types: string[]): string | null {
  if (!images) return null;
  for (const type of types) {
    const image = images.find(
      (entry) => entry?.imageTypeName === type && entry.url?.trim(),
    );
    if (image?.url) return image.url.trim();
  }
  return null;
}

function normalizeCategory(raw: string | null): string {
  const firstToken = raw?.split(",")[0]?.trim();
  if (!firstToken) return "General";
  const mapped = CATEGORY_LABELS[firstToken.toLowerCase()];
  if (mapped) return mapped;
  return firstToken
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "channel";
}

function parseLcn(asset: VzyAsset): number | null {
  const raw = metaValue(asset, "LCN");
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim()) {
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function mapVzyAsset(asset: VzyAsset): VzyChannel | null {
  const id = asset?.id;
  if (id === undefined || id === null) return null;

  const name = asset.name?.trim() || `Channel ${id}`;
  const hlsUrl = pickMediaUrl(asset.mediaFiles, ["HLS", "HLS_FP"]);
  const dashUrl = pickMediaUrl(asset.mediaFiles, ["DASH_WV", "DASH"]);
  const entitlement = (metaText(asset, "EntitlementType") ?? "").toLowerCase();
  const drmTypeRaw = metaText(asset, "DRMType") ?? "";
  const drmType = drmTypeRaw.toLowerCase();
  const partner = metaText(asset, "ContentPartnerName") ?? "VZY";

  // A stream is clear and playable if:
  // 1) DRMType is explicitly "free" or "freedynamicurl" (e.g. Aaj Tak, India Today, Tarang TV, Sanskar, etc.)
  // 2) Or the stream is an FTA path (/hls_fta/ or /dash_fta/ like 9XM, DD National, Zee News, etc.)
  const hasStreamUrl = !!(hlsUrl || dashUrl);
  const isFtaPath = /hls_fta|dash_fta/i.test(hlsUrl ?? "") || /dash_fta/i.test(dashUrl ?? "");
  const clearStream =
    hasStreamUrl &&
    (drmType === "free" ||
      drmType === "freedynamicurl" ||
      isFtaPath);

  const free = entitlement === "free" || clearStream;
  const playable = clearStream;
  const drm = !clearStream && (hasStreamUrl || drmType === "nagra" || drmType === "jhslicense" || drmType === "dynamicurl");

  return {
    id: String(id),
    externalId: asset.externalId ? String(asset.externalId) : null,
    name,
    category: normalizeCategory(tagValue(asset, "Genre")),
    language: tagValue(asset, "VideoLanguage") ?? "Multi",
    logo: pickImage(asset.images, [
      "1x1",
      "1x1_fallback",
      "16x9",
      "16x9_fallback",
    ]),
    banner: pickImage(asset.images, [
      "16x9",
      "16x9_Banner",
      "16x9_fallback",
      "16x9_Banner_fallback",
    ]),
    hlsUrl,
    dashUrl,
    partner,
    drmType: drmTypeRaw || null,
    free,
    playable,
    drm,
    lcn: parseLcn(asset),
    watchUrl: `${VZY_SITE_URL}/en/livetv/${slugify(name)}/${id}`,
  };
}

async function withTimeout<T>(
  signal: AbortSignal,
  ms: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) controller.abort();
  else signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

/** Loads every live channel from the VZY / Watcho directory. */
export async function loadVzyChannels(
  signal: AbortSignal,
): Promise<VzyChannel[]> {
  if (directoryCache && Date.now() - directoryCache.at < DIRECTORY_TTL_MS) {
    return directoryCache.channels;
  }

  const kalturaChannels = await withTimeout(
    signal,
    DIRECTORY_TIMEOUT_MS,
    async (inner) => {
      try {
        let session = await loadSession(inner);
        let listed: VzyListResult;
        try {
          listed = await listLiveAssets(session.ks, inner);
        } catch {
          // The anonymous session can expire between calls; mint a fresh one once.
          session = await loadSession(inner, true);
          listed = await listLiveAssets(session.ks, inner);
        }

        const objects = listed.objects ?? [];
        return objects
          .map(mapVzyAsset)
          .filter((channel): channel is VzyChannel => channel !== null);
      } catch (err) {
        console.warn("[Vzy] Kaltura catalog fetch error:", err);
        return [];
      }
    },
  ).catch(() => []);

  kalturaChannels.sort((a, b) => {
    // Prioritize playable channels first, then by LCN, then by name
    if (a.playable !== b.playable) {
      return a.playable ? -1 : 1;
    }
    const lcnOrder =
      (a.lcn ?? Number.MAX_SAFE_INTEGER) - (b.lcn ?? Number.MAX_SAFE_INTEGER);
    return lcnOrder || a.name.localeCompare(b.name);
  });

  directoryCache = { at: Date.now(), channels: kalturaChannels };
  return kalturaChannels;
}
