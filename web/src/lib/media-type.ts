/**
 * Media-type inference ported from the Android client's
 * `PlayerMediaSourceFactory`, so the web player classifies a stream URL the
 * same way the TV app does instead of relying on a bare `.m3u8` suffix check.
 */

export const MIME_HLS = "application/vnd.apple.mpegurl";
export const MIME_MPD = "application/dash+xml";
export const MIME_SS = "application/vnd.ms-sstr+xml";
export const MIME_MP4 = "video/mp4";
export const MIME_WEBM = "video/webm";
export const MIME_MATROSKA = "video/x-matroska";
export const MIME_MP2T = "video/mp2t";
export const MIME_QUICKTIME = "video/quicktime";
export const MIME_AVI = "video/x-msvideo";
export const MIME_MPEG = "video/mpeg";

const ADAPTIVE_MIME_BY_EXTENSION: Record<string, string> = {
  m3u8: MIME_HLS,
  m3u: MIME_HLS,
  mpd: MIME_MPD,
  ism: MIME_SS,
  isml: MIME_SS,
};

const MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
  ...ADAPTIVE_MIME_BY_EXTENSION,
  mkv: MIME_MATROSKA,
  webm: MIME_WEBM,
  mp4: MIME_MP4,
  m4v: MIME_MP4,
  ts: MIME_MP2T,
  mts: MIME_MP2T,
  m2ts: MIME_MP2T,
  mov: MIME_QUICKTIME,
  avi: MIME_AVI,
  mpeg: MIME_MPEG,
  mpg: MIME_MPEG,
};

/** Query keys that commonly carry the real media type. */
const MIME_QUERY_KEYS = new Set([
  "format",
  "mime",
  "mime_type",
  "contenttype",
  "content_type",
  "type",
  "ext",
  "extension",
  "output",
  "protocol",
  "mode",
  "stream",
  "service",
]);

/** Query keys used by same-origin proxies to carry the real media URL. */
const NESTED_URL_KEYS = new Set(["url", "src", "target", "u", "link"]);

/** Query values that identify an HLS manifest. */
const HLS_QUERY_VALUES = new Set([
  "application/vnd.apple.mpegurl",
  "application/mpegurl",
  "application/x-mpegurl",
  "audio/mpegurl",
  "audio/x-mpegurl",
  "application/m3u8",
  "m3u8",
  "m3u",
  "hls",
]);

/** `m3u8`/`m3u` surrounded by URL delimiters, e.g. `?type=m3u8`. */
const DELIMITED_M3U8_PATTERN = /(^|[=/_.?&-])(m3u8|m3u)($|[=/_.?&-])/i;
const DELIMITED_MPD_PATTERN = /(^|[=/_.?&-])mpd($|[=/_.?&-])/i;
const DELIMITED_SS_PATTERN = /(^|[=/_.?&-])(ism|isml)($|[=/_.?&-])/i;

interface SplitUrl {
  path: string;
  query: string;
}

function splitUrl(raw: string): SplitUrl {
  const withoutFragment = raw.split("#")[0] ?? "";
  const index = withoutFragment.indexOf("?");
  if (index === -1) return { path: withoutFragment, query: "" };
  return {
    path: withoutFragment.slice(0, index),
    query: withoutFragment.slice(index + 1),
  };
}

function extensionOf(path: string): string {
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** Adaptive (playlist) mime types are decided by the file extension alone. */
function adaptiveMimeFromPath(path?: string | null): string | null {
  const normalized = path?.trim().toLowerCase();
  if (!normalized) return null;
  const { path: pathPart } = splitUrl(normalized);
  return ADAPTIVE_MIME_BY_EXTENSION[extensionOf(pathPart)] ?? null;
}

function mimeFromQuery(query: string): string | null {
  if (!query) return null;
  for (const parameter of query.split("&")) {
    const separator = parameter.indexOf("=");
    const key = (separator === -1 ? parameter : parameter.slice(0, separator)).trim().toLowerCase();
    const value = (separator === -1 ? "" : parameter.slice(separator + 1)).trim().toLowerCase();
    if (!key || !value) continue;

    if (NESTED_URL_KEYS.has(key)) {
      try {
        const decoded = decodeURIComponent(value);
        const { path: nestedPath } = splitUrl(decoded);
        const byExtension = MEDIA_MIME_BY_EXTENSION[extensionOf(nestedPath)];
        if (byExtension) return byExtension;
        const byToken = mimeFromDelimitedToken(decoded);
        if (byToken) return byToken;
      } catch {
        // Ignore malformed nested URLs.
      }
    }

    if (MIME_QUERY_KEYS.has(key)) {
      const tail = value.slice(value.lastIndexOf("/") + 1);
      const dot = tail.lastIndexOf(".");
      const extension = dot === -1 ? tail : tail.slice(dot + 1);
      const byExtension = MEDIA_MIME_BY_EXTENSION[extension];
      if (byExtension) return byExtension;
    }

    if (HLS_QUERY_VALUES.has(value)) return MIME_HLS;
  }
  return null;
}

/**
 * `playlist/hls/manifest/master` as a directory near the end of a path, e.g.
 * `https://host/hls/12345`. The trailing segment must not be one of the
 * non-playlist names the TV client excludes.
 */
function matchesPlaylistPath(value: string): boolean {
  return /\/(?:playlist|hls|manifest|master)\/(?!stream$|list$|info$|details$)[a-zA-Z0-9_/-]+$/i.test(
    value,
  );
}

function mimeFromDelimitedToken(value: string): string | null {
  if (!value) return null;
  if (DELIMITED_M3U8_PATTERN.test(value)) return MIME_HLS;
  if (matchesPlaylistPath(value)) return MIME_HLS;
  if (DELIMITED_MPD_PATTERN.test(value)) return MIME_MPD;
  if (DELIMITED_SS_PATTERN.test(value)) return MIME_SS;
  return null;
}

function mimeFromPath(path?: string | null): string | null {
  const normalized = path?.trim().toLowerCase();
  if (!normalized) return null;
  const { path: pathPart, query } = splitUrl(normalized);
  const byExtension = MEDIA_MIME_BY_EXTENSION[extensionOf(pathPart)];
  if (byExtension) return byExtension;
  return mimeFromQuery(query) ?? mimeFromDelimitedToken(pathPart) ?? mimeFromDelimitedToken(query);
}

/**
 * Infers the mime type of a media URL. `filename` (when known) wins over the
 * URL, mirroring the TV client which prefers the resolved file name.
 */
export function inferMimeType(url: string, filename?: string | null): string | null {
  const adaptive =
    adaptiveMimeFromPath(filename) ??
    adaptiveMimeFromPath(url);
  if (adaptive) return adaptive;
  return mimeFromPath(filename) ?? mimeFromPath(url);
}

/** True when the URL points at an HLS playlist. */
export function isHlsUrl(url: string, filename?: string | null): boolean {
  return inferMimeType(url, filename) === MIME_HLS;
}

/** True when the URL points at a DASH manifest. */
export function isDashUrl(url: string, filename?: string | null): boolean {
  return inferMimeType(url, filename) === MIME_MPD;
}

/** True when the URL points at a DASH manifest, which browsers cannot play. */
export function isUnsupportedAdaptiveUrl(url: string, filename?: string | null): boolean {
  const mime = inferMimeType(url, filename);
  return mime === MIME_MPD || mime === MIME_SS;
}

export interface BrowserSupport {
  supported: boolean;
  /** Human label, e.g. "MKV" or "HLS". */
  container: string | null;
  reason?: string;
}

const UNSUPPORTED_BROWSER_MIME: Record<string, { label: string; reason: string }> = {
  [MIME_MATROSKA]: {
    label: "MKV",
    reason: "MKV containers don't play in browsers. Pick an MP4/HLS source or use the TV app.",
  },
  [MIME_AVI]: {
    label: "AVI",
    reason: "AVI containers don't play in browsers. Pick an MP4/HLS source or use the TV app.",
  },
  [MIME_MPEG]: {
    label: "MPEG",
    reason: "MPEG containers don't play reliably in browsers. Pick an MP4/HLS source.",
  },
  [MIME_MP2T]: {
    label: "TS",
    reason: "Raw MPEG-TS streams don't play in browsers. Pick an HLS or MP4 source.",
  },
  [MIME_SS]: {
    label: "SmoothStreaming",
    reason: "SmoothStreaming isn't supported in the browser player. Pick an HLS or DASH source.",
  },
};

/**
 * Classifies whether a direct URL is likely to play in this browser.
 *
 * DASH is supported now (dash.js), HLS via hls.js/native, and MP4/WebM
 * natively. MKV/AVI/MPEG/TS and SmoothStreaming are not — the TV app plays
 * them through Media3, which is why a source can work there and fail here.
 */
export function browserPlaybackSupport(
  url: string,
  filename?: string | null,
): BrowserSupport {
  const mime = inferMimeType(url, filename);
  if (!mime) return { supported: true, container: null };
  const blocked = UNSUPPORTED_BROWSER_MIME[mime];
  if (blocked) return { supported: false, container: blocked.label, reason: blocked.reason };
  const labels: Record<string, string> = {
    [MIME_HLS]: "HLS",
    [MIME_MPD]: "DASH",
    [MIME_MP4]: "MP4",
    [MIME_WEBM]: "WebM",
    [MIME_QUICKTIME]: "MOV",
  };
  return { supported: true, container: labels[mime] ?? null };
}
