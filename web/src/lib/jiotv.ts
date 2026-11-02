/**
 * JioTV live channel directory.
 *
 * The directory API is the same one the movie-web app uses:
 * `GET {base}/api/public/channels` returns every channel together with an
 * embed player URL. The host can be overridden with the
 * `VITE_JIOTV_API_URL` environment variable.
 */

export interface JioTvRecord {
  id?: string | number;
  name?: string;
  category?: string | null;
  logo?: string | null;
  embed?: string | null;
  watch?: string | null;
}

export interface JioTvChannel {
  id: string;
  name: string;
  category: string;
  logo: string | null;
  /** Standalone page for the channel (opens in a new tab). */
  watchUrl: string | null;
}

export const DEFAULT_JIOTV_API_URL = "https://livetgtv.lovable.app";

/** Quick collections shown as pills above the channel grid. */
export const JIO_TV_COLLECTIONS = [
  { id: "all", label: "All channels" },
  { id: "cricket", label: "Cricket" },
  { id: "sports", label: "Sports" },
  { id: "movies", label: "Movies" },
  { id: "entertainment", label: "Entertainment" },
  { id: "news", label: "News" },
  { id: "music", label: "Music" },
  { id: "kids", label: "Kids" },
] as const;

export type JioTvCollectionId = (typeof JIO_TV_COLLECTIONS)[number]["id"];

export function jioTvBaseUrl(): string {
  const configured = (import.meta.env.VITE_JIOTV_API_URL as string | undefined)?.trim();
  return (configured || DEFAULT_JIOTV_API_URL).replace(/\/+$/, "");
}

/**
 * Optional JioTV relay URL. When set (build-time `VITE_JIOTV_RELAY_URL` or
 * `localStorage["nuvio.jiotv.relayUrl"]`), the player tries the relay first
 * and falls back to the existing browser pipeline.
 */
export function jioTvRelayUrl(): string | null {
  const configured = (import.meta.env.VITE_JIOTV_RELAY_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  try {
    const stored = globalThis.localStorage?.getItem("nuvio.jiotv.relayUrl")?.trim();
    return stored ? stored.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

export function mapJioTvChannels(
  records: JioTvRecord[],
  baseUrl: string,
): JioTvChannel[] {
  const base = baseUrl.replace(/\/+$/, "");
  return records
    .filter((record) => record?.id !== undefined && record?.id !== null)
    .map((record) => {
      const id = String(record.id);
      return {
        id,
        name: record.name?.trim() || `Channel ${id}`,
        category: record.category?.trim() || "General",
        logo: record.logo?.trim() || null,
        watchUrl: record.watch?.trim() || `${base}/watch/${id}`,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function isJioCricketChannel(
  channel: Pick<JioTvChannel, "name">,
): boolean {
  return /cricket|willow|star sports|sony sports|ten sports|dd sports|ptv sports|a sports|supersport|sky sports|tnt sports|sports18|astro supersport/i.test(
    channel.name,
  );
}

export function isJioSportsChannel(
  channel: Pick<JioTvChannel, "name" | "category">,
): boolean {
  return (
    channel.category.toLowerCase() === "sports" ||
    isJioCricketChannel(channel) ||
    /\bsport|espn|sports18|euro sport|fight|wwe|football|racing|motorsport/i.test(
      channel.name,
    )
  );
}

/** Matches a channel against a quick collection. */
export function matchesJioTvCollection(
  channel: JioTvChannel,
  collection: JioTvCollectionId,
): boolean {
  if (collection === "all") return true;
  if (collection === "cricket") return isJioCricketChannel(channel);
  if (collection === "sports") return isJioSportsChannel(channel);
  if (collection === "entertainment") {
    return (
      channel.category.toLowerCase().includes("entertainment") ||
      /star plus|colors|sony|zee tv|sab|dangal/i.test(channel.name)
    );
  }
  if (collection === "movies") {
    return (
      channel.category.toLowerCase().includes("movies") ||
      /cinema|movie|gold|max|filam/i.test(channel.name)
    );
  }
  if (collection === "news") {
    return (
      channel.category.toLowerCase().includes("news") ||
      /news|aaj tak|abp|ndtv|bharat/i.test(channel.name)
    );
  }
  if (collection === "music") {
    return (
      channel.category.toLowerCase().includes("music") ||
      /music|mtv|9xm|zing|b4u/i.test(channel.name)
    );
  }
  if (collection === "kids") {
    return (
      channel.category.toLowerCase().includes("kids") ||
      /cartoon|nick|pogo|sonic|yay/i.test(channel.name)
    );
  }
  return true;
}

/** Loads the channel directory. */
export async function loadJioTvChannels(
  signal: AbortSignal,
  baseUrl = jioTvBaseUrl(),
): Promise<JioTvChannel[]> {
  const base = baseUrl.replace(/\/+$/, "");
  if (!base) throw new Error("JioTV API URL is not configured");

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(abort, 8000);

  try {
    const response = await fetch(`${base}/api/public/channels`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error("JioTV directory unavailable");
    const data = (await response.json()) as
      | JioTvRecord[]
      | { channels?: JioTvRecord[] };
    const records = Array.isArray(data) ? data : (data.channels ?? []);
    if (records.length > 0) return mapJioTvChannels(records, base);
  } catch {
    // The resolver is a single point of failure; fall through to the
    // Pind channel list, which also carries stream URLs and clearkeys.
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }

  return loadJioTvFallbackChannels(base, signal);
}

/** Directory fallback built from the Pind channel list. */
async function loadJioTvFallbackChannels(
  baseUrl: string,
  signal: AbortSignal,
): Promise<JioTvChannel[]> {
  const response = await fetch(JIO_TV_CHANNEL_DATA_URL, {
    signal,
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("JioTV fallback directory unavailable");
  const list = (await response.json()) as JioTvChannelData[];
  const records: JioTvRecord[] = list
    .filter((item) => item?.id !== undefined && item?.id !== null)
    .map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      logo: item.logo,
    }));
  return mapJioTvChannels(records, baseUrl);
}

/* --------------------------------------------------------------------------- */

/** `/api/public/channels/{id}` — stream sources plus the clearkey. */
export interface JioTvChannelDetail {
  /** MPD manifest URLs, most-preferred first. */
  sources: string[];
  /** KID (lowercase hex, no dashes) -> content key (hex/base64). */
  keys: Record<string, string>;
  /** First key, kept for callers that only handle one key. */
  drm: { keyId: string; key: string } | null;
}

/** Normalize a `default_KID` to lowercase bare hex. */
function normalizeKid(value: string): string {
  return value.replace(/-/g, "").toLowerCase();
}

/** Normalize a content key to lowercase bare hex when possible. */
function normalizeKeyValue(value: string): string {
  return value.trim().replace(/^0x/i, "").toLowerCase();
}

interface JioTvResolverDrm {
  type?: string;
  keyId?: string;
  key?: string;
  clearKeys?: Record<string, string>;
}

/* ---------------------------------------------------------------------------
 * CDN tokens & fallback channel data
 *
 * The resolver hands out raw MPD URLs, but the JioTV CDNs only honor them
 * when a fresh `__hdnea__` CDN token rides along on the query string
 * (otherwise every request is 403 — that is CDN authorization, not CORS,
 * and it fails for ip-address-based tokens baked into static lists too).
 * The official web player (jjtvxweb "pind") solves this with two services:
 *
 *  - a cookie service returning an `acl=/*` token valid for every channel MPD,
 *  - a channel list carrying per-channel clearkeys for encrypted channels
 *    (the resolver's `/api/public/channels/{id}` omits `drm` for many of them).
 * ------------------------------------------------------------------------- */

const JIO_TV_COOKIE_URL = "https://allinonereborn2.online/jstrweb2/cookies.json";
const JIO_TV_STAR_COOKIE_URL =
  "https://allinonereborn2.online/jtv-fetch/jstarcookie/cookie.json";
const JIO_TV_CHANNEL_DATA_URL = "https://jjtvxweb.pages.dev/jstr4web.json";

/** Refetch the token this long before its real expiry to stay safe. */
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;
/** How long the 600 KB channel list stays cached in memory. */
const CHANNEL_DATA_TTL_MS = 10 * 60 * 1000;

let cookieTokenCache: { token: string; exp: number } | null = null;
let channelDataCache: { at: number; map: Map<string, JioTvChannelData> } | null = null;

/** One entry of the channel data list (format rolled out by the pind player). */
interface JioTvChannelData {
  id: string;
  name?: string;
  category?: string;
  logo?: string;
  url?: string;
  keyId?: string;
  key?: string;
}

/** Extract the `__hdnea__` token from a URL (without its param name). */
function extractHdnea(url: string): string | null {
  return /(?:\?|&)__hdnea__=([^&"|]+)/.exec(url)?.[1] ?? null;
}

/** True when a URL already carries a `__hdnea__` token that outlives the margin. */
function hasFreshToken(url: string): boolean {
  const token = extractHdnea(url);
  if (!token) return false;
  const exp = /(?:^|[~&])exp=(\d+)/.exec(token)?.[1];
  return !!exp && Number(exp) * 1000 > Date.now() + TOKEN_SAFETY_MARGIN_MS;
}

/**
 * Loads the shared `acl=/*` CDN token. `null` when the service is down or
 * answers without a usable `__hdnea__` cookie.
 */
async function loadJioTvCdnToken(): Promise<{ token: string; exp: number } | null> {
  if (cookieTokenCache && cookieTokenCache.exp > Date.now() + TOKEN_SAFETY_MARGIN_MS) {
    return cookieTokenCache;
  }
  try {
    const response = await fetch(JIO_TV_COOKIE_URL, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Array<{ cookie?: string }>;
    const cookie = data.find?.((item) => item?.cookie)?.cookie;
    if (!cookie) return null;
    const token = cookie.trim().startsWith("__hdnea__=")
      ? cookie.trim().slice("__hdnea__=".length)
      : cookie.trim();
    const exp = Number(/(?:^|~)exp=(\d+)/.exec(token)?.[1] ?? 0);
    if (!exp || exp * 1000 <= Date.now() + TOKEN_SAFETY_MARGIN_MS) return null;
    cookieTokenCache = { token, exp: exp * 1000 };
    return cookieTokenCache;
  } catch {
    return null;
  }
}

/**
 * Some `jiotvpllive.cdn.jio.com` MPDs are keyed per channel; their tokens
 * come from a separate service indexed by channel id.
 */
async function loadJioTvStarToken(channelId: string): Promise<string | null> {
  try {
    const response = await fetch(JIO_TV_STAR_COOKIE_URL, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      successful_results?: Array<{ channel_id?: string; final_url?: string }>;
      failed_results?: Array<{ channel_id?: string; final_url?: string }>;
    };
    const results = [
      ...(data.successful_results ?? []),
      ...(data.failed_results ?? []),
    ];
    const item = results.find(
      (result) => String(result?.channel_id) === String(channelId) && result?.final_url,
    );
    if (!item?.final_url) return null;
    const token = /__hdnea__=([^&]+)/.exec(item.final_url)?.[1];
    return token || null;
  } catch {
    return null;
  }
}

/** Loads (and memoizes) the channel list carrying per-channel clearkeys. */
async function loadJioTvChannelData(): Promise<Map<string, JioTvChannelData>> {
  if (channelDataCache && Date.now() - channelDataCache.at < CHANNEL_DATA_TTL_MS) {
    return channelDataCache.map;
  }
  const response = await fetch(JIO_TV_CHANNEL_DATA_URL, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("JioTV channel data unavailable");
  const list = (await response.json()) as JioTvChannelData[];
  channelDataCache = { at: Date.now(), map: new Map(list.map((item) => [String(item.id), item])) };
  return channelDataCache.map;
}

/** Appends the fresh CDN token to an MPD URL when it does not have one. */
async function withJioTvCdnToken(mpdUrl: string, channelId: string): Promise<string> {
  if (hasFreshToken(mpdUrl)) return mpdUrl;
  let host: string | null = null;
  try {
    host = new URL(mpdUrl).hostname.toLowerCase();
  } catch {
    return mpdUrl;
  }
  if (host === "jiotvpllive.cdn.jio.com") {
    const token = await loadJioTvStarToken(channelId);
    if (token) {
      return `${mpdUrl.split("?")[0]}?__hdnea__=${token}`;
    }
    return mpdUrl;
  }
  const entry = await loadJioTvCdnToken();
  return entry ? `${mpdUrl.split("?")[0]}?__hdnea__=${entry.token}` : mpdUrl;
}


/**
 * Fetch one channel's resolver detail. The browser resolves directly by
 * default because the CDN token is issued to the requesting IP; a token
 * obtained by the Worker can be bound to Cloudflare's egress and 403 in the
 * browser. The Worker route is only a fallback for hosts without direct CORS.
 */
async function fetchResolverDetail(
  base: string,
  channelId: string,
  signal: AbortSignal,
  preferWorker = false,
): Promise<{ sources?: string[]; drm?: JioTvResolverDrm } | null> {
  const parse = async (response: Response) => {
    if (!response.ok) return null;
    try {
      return (await response.json()) as {
        sources?: string[];
        drm?: JioTvResolverDrm;
      };
    } catch {
      return null;
    }
  };

  const fetchDirect = async () => {
    try {
      const direct = await fetch(`${base}/api/public/channels/${channelId}`, {
        signal,
        headers: { accept: "application/json" },
      });
      return await parse(direct);
    } catch {
      return null;
    }
  };

  const fetchViaWorker = async () => {
    try {
      const viaWorker = await fetch(
        `/jiotv-api/resolve?id=${encodeURIComponent(channelId)}`,
        { signal, headers: { accept: "application/json" } },
      );
      return await parse(viaWorker);
    } catch {
      return null;
    }
  };

  if (!preferWorker) {
    const direct = await fetchDirect();
    if (direct) return direct;
  }

  const viaWorker = await fetchViaWorker();
  if (viaWorker) return viaWorker;

  return preferWorker ? fetchDirect() : null;
}

/**
 * Loads a single channel's stream metadata (MPD URL and clearkey). This is
 * what feeds the `/jiotv-api` direct-playback pipeline. The resolver's data
 * is merged with the channel-data list (per-channel clearkeys) and tagged
 * with a fresh `__hdnea__` CDN token — without the token most MPDs 403.
 */
export async function loadJioTvChannelDetail(
  channel: Pick<JioTvChannel, "id">,
  baseUrl = jioTvBaseUrl(),
  options: { preferWorker?: boolean } = {},
): Promise<JioTvChannelDetail> {
  const base = baseUrl.replace(/\/+$/, "");

  const detailController = new AbortController();
  const detailTimer = setTimeout(() => detailController.abort(), 8000);
  const [detailResponse, channelMap] = await Promise.all([
    fetchResolverDetail(
      base,
      channel.id,
      detailController.signal,
      options.preferWorker,
    ),
    // The fallback list is best-effort only — its absence must not break
    // channels the resolver already serves with token + key.
    loadJioTvChannelData().catch(() => null),
  ]).finally(() => clearTimeout(detailTimer));
  const fallback = channelMap?.get(String(channel.id)) ?? null;

  let source = detailResponse?.sources?.[0] || fallback?.url || null;
  if (!source?.trim()) throw new Error("JioTV channel unavailable");
  // Same `bpk-tv//` double-slash repair the official web player applies.
  source = source.trim().replace("bpk-tv//", "bpk-tv/");
  source = await withJioTvCdnToken(source, channel.id);

  const keys: Record<string, string> = {};
  const addKey = (keyId?: string | null, key?: string | null) => {
    if (!keyId || !key) return;
    const kid = normalizeKid(keyId);
    if (kid) keys[kid] = normalizeKeyValue(key);
  };

  const resolverDrm = detailResponse?.drm;
  // Most channels answer with `clearKeys` (a KID -> key map, one entry per
  // AdaptationSet), not the legacy `keyId`/`key` pair.
  if (resolverDrm?.clearKeys) {
    for (const [kid, key] of Object.entries(resolverDrm.clearKeys)) {
      addKey(kid, key);
    }
  }
  addKey(resolverDrm?.keyId, resolverDrm?.key);
  addKey(fallback?.keyId, fallback?.key);

  const firstKid = Object.keys(keys)[0];
  const drm = firstKid ? { keyId: firstKid, key: keys[firstKid] } : null;

  // Prefer the fallback list's own alternate MPDs when the primary is gone.
  const sources = [source].filter((item): item is string => !!item);
  return { sources, keys, drm };
}

/**
 * Builds the Worker URL that converts a channel's CENC-encrypted DASH stream
 * into a plain HLS playlist for hls.js.
 */
export function buildJioTvPlaylistUrl(
  detail: JioTvChannelDetail,
): string | null {
  const mpd = detail.sources[0];
  if (!mpd) return null;
  const params = new URLSearchParams({ u: mpd });
  const keyEntries = Object.entries(detail.keys);
  if (keyEntries.length === 1) {
    params.set("k", keyEntries[0][1]);
  } else if (keyEntries.length > 1) {
    params.set("keys", JSON.stringify(Object.fromEntries(keyEntries)));
  } else if (detail.drm?.key) {
    params.set("k", detail.drm.key);
  }
  return `/jiotv-api/playlist.m3u8?${params.toString()}`;
}
