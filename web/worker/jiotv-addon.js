/**
 * JioTV Stremio/Nuvio add-on.
 *
 * Serves the add-on manifest, a live-channel catalog, channel metadata and
 * stream URLs. The stream URL points at the existing `/jiotv-api` HLS
 * pipeline, so the web player and the TV add-on share the same key/token
 * handling.
 *
 * Routes (all under `/jiotv-addon`):
 *   GET /manifest.json
 *   GET /catalog/channel/jiotv.json
 *   GET /meta/channel/jiotv:<id>.json
 *   GET /stream/channel/jiotv:<id>.json
 *
 * If `JIOTV_ADDON_RELAY_URL` is set (a home jiotv_go relay), streams use
 * `<relay>/live/<id>.m3u8` instead of the Worker proxy. That keeps the add-on
 * ready for the residential-IP relay phase without changing the catalog.
 */

const PREFIX = "/jiotv-addon";
const RESOLVER_BASE = "https://livetgtv.lovable.app";
const PIND_LIST_URL = "https://jjtvxweb.pages.dev/jstr4web.json";
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;

const channelCache = new Map();
const detailCache = new Map();
let pindCache = null;

function json(status, payload, cacheSeconds = 0) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheSeconds
        ? `public, max-age=${cacheSeconds}`
        : "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

async function fetchJson(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeKid(value) {
  return String(value).replace(/-/g, "").toLowerCase();
}

function normalizeKey(value) {
  return String(value).trim().replace(/^0x/i, "").toLowerCase();
}

async function loadPindList() {
  if (pindCache && Date.now() - pindCache.at < CACHE_TTL_MS) {
    return pindCache.map;
  }
  const list = await fetchJson(PIND_LIST_URL);
  if (!Array.isArray(list)) return pindCache?.map ?? new Map();
  const map = new Map();
  for (const item of list) {
    if (item?.id === undefined || item?.id === null) continue;
    map.set(String(item.id), item);
  }
  pindCache = { at: Date.now(), map };
  return map;
}

async function loadChannels() {
  const cached = channelCache.get("all");
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.channels;
  }

  let records = [];
  const directory = await fetchJson(`${RESOLVER_BASE}/api/public/channels`);
  if (Array.isArray(directory)) {
    records = directory;
  } else if (Array.isArray(directory?.channels)) {
    records = directory.channels;
  }

  if (records.length === 0) {
    const pind = await loadPindList();
    records = [...pind.values()];
  }

  const channels = records
    .filter((item) => item?.id !== undefined && item?.id !== null)
    .map((item) => ({
      id: String(item.id),
      name: String(item.name || item.channel_name || `Channel ${item.id}`).trim(),
      category: String(item.category || "General").trim(),
      logo: item.logo || item.logoUrl || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  channelCache.set("all", { at: Date.now(), channels });
  return channels;
}

function findChannel(channels, id) {
  return channels.find((channel) => channel.id === id) ?? null;
}

function metaFor(channel) {
  return {
    id: `jiotv:${channel.id}`,
    type: "channel",
    name: channel.name,
    poster: channel.logo || undefined,
    posterShape: "square",
    logo: channel.logo || undefined,
    description: `Live TV · ${channel.category}`,
    genres: [channel.category],
    releaseInfo: "Live",
  };
}

function parseChannelId(raw) {
  const clean = decodeURIComponent(raw).replace(/\.json$/i, "");
  return clean.startsWith("jiotv:") ? clean.slice("jiotv:".length) : clean;
}

function detailKeys(drm, fallback) {
  const keys = {};
  const add = (kid, key) => {
    if (!kid || !key) return;
    keys[normalizeKid(kid)] = normalizeKey(key);
  };
  if (drm?.clearKeys) {
    for (const [kid, key] of Object.entries(drm.clearKeys)) add(kid, key);
  }
  add(drm?.keyId, drm?.key);
  add(fallback?.keyId, fallback?.key);
  return keys;
}

async function loadDetail(id) {
  const cached = detailCache.get(id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.detail;
  }

  const fallback = (await loadPindList()).get(String(id)) ?? null;
  const resolver = await fetchJson(
    `${RESOLVER_BASE}/api/public/channels/${encodeURIComponent(id)}`,
  );

  let source = resolver?.sources?.[0] || fallback?.url || null;
  if (!source?.trim()) return null;
  source = source.trim().replace("bpk-tv//", "bpk-tv/");

  const detail = {
    source,
    keys: detailKeys(resolver?.drm, fallback),
    host: "",
  };
  try {
    detail.host = new URL(source).hostname.toLowerCase();
  } catch {
    /* keep empty */
  }
  detailCache.set(id, { at: Date.now(), detail });
  return detail;
}

function buildWorkerStreamUrl(origin, detail) {
  const params = new URLSearchParams({ u: detail.source });
  const entries = Object.entries(detail.keys);
  if (entries.length === 1) {
    params.set("k", entries[0][1]);
  } else if (entries.length > 1) {
    params.set("keys", JSON.stringify(Object.fromEntries(entries)));
  }
  return `${origin}/jiotv-api/playlist.m3u8?${params.toString()}`;
}

function catalogExtra(url) {
  let path = url.pathname.replace(/\.json$/i, "");
  try {
    path = decodeURIComponent(path);
  } catch {
    /* keep the raw path */
  }

  const marker = "/catalog/channel/jiotv";
  const markerIndex = path.indexOf(marker);
  const extra =
    markerIndex >= 0
      ? path.slice(markerIndex + marker.length).replace(/^\//, "")
      : "";
  const params = new URLSearchParams(extra);
  for (const [key, value] of url.searchParams) {
    if (!params.has(key)) params.set(key, value);
  }

  return {
    search: (params.get("search") || "").trim().toLowerCase(),
    skip: Number(params.get("skip") || 0) || 0,
  };
}

export async function handleJioTvAddon(request, env, url) {
  const suffix = url.pathname.slice(PREFIX.length) || "/";

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,HEAD,OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    });
  }

  if (suffix === "/manifest.json") {
    return json(200, {
      id: "com.nuvio.jiotv",
      version: "1.0.0",
      name: "JioTV",
      description: "Live JioTV channels",
      logo: `${url.origin}/favicon.svg`,
      types: ["channel"],
      resources: [
        { name: "catalog", types: ["channel"], idPrefixes: ["jiotv:"] },
        { name: "meta", types: ["channel"], idPrefixes: ["jiotv:"] },
        { name: "stream", types: ["channel"], idPrefixes: ["jiotv:"] },
      ],
      catalogs: [
        {
          type: "channel",
          id: "jiotv",
          name: "JioTV Live",
          showInHome: true,
          extra: [
            { name: "search", isRequired: false },
            { name: "skip", isRequired: false },
          ],
        },
      ],
      behaviorHints: { configurable: false },
    });
  }

  if (suffix.startsWith("/catalog/channel/jiotv")) {
    const channels = await loadChannels();
    const { search, skip } = catalogExtra(url);
    const filtered = search
      ? channels.filter(
          (channel) =>
            channel.name.toLowerCase().includes(search) ||
            channel.category.toLowerCase().includes(search),
        )
      : channels;
    const page = skip > 0 ? filtered.slice(skip) : filtered;
    return json(
      200,
      { metas: page.map(metaFor) },
      search ? 0 : 300,
    );
  }

  if (suffix.startsWith("/meta/channel/")) {
    const id = parseChannelId(suffix.slice("/meta/channel/".length));
    const channels = await loadChannels();
    const channel = findChannel(channels, id);
    if (!channel) return json(404, { error: "channel-not-found" });
    return json(200, { meta: metaFor(channel) }, 300);
  }

  if (suffix.startsWith("/stream/channel/")) {
    const id = parseChannelId(suffix.slice("/stream/channel/".length));
    const channels = await loadChannels();
    const channel = findChannel(channels, id);

    const relay = String(env?.JIOTV_ADDON_RELAY_URL ?? "")
      .trim()
      .replace(/\/+$/, "");
    const title = channel
      ? `${channel.name} · ${channel.category}`
      : `JioTV channel ${id}`;

    if (relay) {
      return json(200, {
        streams: [
          {
            name: "JioTV",
            title,
            url: `${relay}/live/${encodeURIComponent(id)}.m3u8`,
            behaviorHints: { notWebReady: false },
          },
        ],
      });
    }

    const detail = await loadDetail(id);
    if (!detail) return json(200, { streams: [] });

    const blockedHost =
      detail.host === "jiotvmblive.cdn.jio.com" ||
      detail.host === "jiotvpllive.cdn.jio.com";

    return json(200, {
      streams: [
        {
          name: blockedHost ? "JioTV (needs relay)" : "JioTV",
          title,
          description: blockedHost
            ? "This channel's CDN host blocks the Worker egress. Configure a home relay to play it."
            : "Live channel via the Nuvio server proxy.",
          url: buildWorkerStreamUrl(url.origin, detail),
          behaviorHints: { notWebReady: false },
        },
      ],
    });
  }

  return json(404, { error: "not-found" });
}

export { PREFIX };
