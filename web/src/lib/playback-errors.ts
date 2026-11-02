/**
 * Playback error reporting, ported from the Android client's
 * `PlayerRuntimeControllerErrorRecovery` so the web player explains failures
 * the same way the TV app does instead of showing one generic message.
 */

export interface PlaybackError {
  /** Short headline, e.g. "Playback Error". */
  title: string;
  /** Full sentence explaining what went wrong. */
  message: string;
  /** Whether retrying the same source could plausibly succeed. */
  retryable: boolean;
}

export const PLAYBACK_ERROR_TITLE = "Playback Error";

/** Mirrors the TV client's `httpStatusExplanation`. */
export function httpStatusExplanation(code: number): string {
  if (code === 401 || code === 410) {
    return "The stream link has expired. Try a different source.";
  }
  if (code === 404) {
    return "The stream link has expired or been removed. Try a different source.";
  }
  if (code === 429) {
    return "Too many requests to the stream source. Wait a moment and try again.";
  }
  if (code >= 500 && code <= 599) {
    return "The stream server is currently unavailable. Try a different source.";
  }
  if (code >= 400 && code <= 499) {
    return "The stream source is blocked or restricted. Try a different source.";
  }
  return "";
}

export const SOURCE_INVALID_CONTENT =
  "Source error: The stream source returned invalid or unplayable content. " +
  "The link may have expired or the server returned an error page instead of video.";

export const NETWORK_BLOCKED =
  "The stream source could not be reached. It may block browser requests (CORS). " +
  "Try a different source.";

export const UNSUPPORTED_FORMAT =
  "This stream uses a format your browser may not support. Try a different source.";

export const DECODER_ERROR = "Decoder error: the stream could not be decoded.";

export const PLAYBACK_FALLBACK = "Playback error. Try a different source.";

export const TORRENT_SOURCE_ERROR =
  "This is a torrent-only source. Torrent and debrid-only sources play in the Nuvio " +
  "mobile app, or through a resolver add-on that provides direct links.";

export const NO_PLAYABLE_SOURCE_ERROR =
  "No direct or HLS stream is available for this source. Try a different source.";

export function playbackError(message: string, retryable = false): PlaybackError {
  return { title: PLAYBACK_ERROR_TITLE, message, retryable };
}

/** Torrent links the browser cannot resolve on its own. */
export function isTorrentSource(url: string): boolean {
  return /^(torrent|magnet):/i.test(url.trim());
}

/** `MediaError` codes, which the DOM typings do not declare. */
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

/** Describes a native `<video>` load failure by its media error code. */
export function describeMediaElementError(video: HTMLVideoElement): PlaybackError {
  const error = video.error;
  if (!error) return playbackError(PLAYBACK_FALLBACK);

  if (error.code === MEDIA_ERR_NETWORK) {
    return playbackError(
      "Network error while loading the stream. The stream server is currently unavailable. " +
        "Try a different source.",
      true,
    );
  }
  if (error.code === MEDIA_ERR_DECODE) {
    return playbackError(DECODER_ERROR, true);
  }
  if (error.code === MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return playbackError(UNSUPPORTED_FORMAT);
  }
  return playbackError(PLAYBACK_FALLBACK);
}

interface HlsErrorData {
  type?: string;
  details?: string;
  response?: { code?: number; text?: string };
  error?: { message?: string } | Error | string;
}

/**
 * Classifies a fatal hls.js error into a user-facing message, using the HTTP
 * status when the manifest or segment request produced one.
 */
export function describeHlsError(data: HlsErrorData): PlaybackError {
  const status = data.response?.code ?? 0;
  if (status) {
    const explanation = httpStatusExplanation(status);
    const statusText = data.response?.text?.trim();
    const label = `HTTP ${status}${statusText ? ` ${statusText}` : ""}`;
    return playbackError(explanation ? `${label} — ${explanation}` : label, status >= 500);
  }

  if (data.type === "networkError") {
    return playbackError(NETWORK_BLOCKED, true);
  }
  if (data.details && /manifest/i.test(data.details)) {
    return playbackError(SOURCE_INVALID_CONTENT);
  }
  if (data.type === "mediaError") {
    return playbackError(UNSUPPORTED_FORMAT);
  }
  return playbackError(PLAYBACK_FALLBACK);
}
