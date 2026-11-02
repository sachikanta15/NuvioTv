/**
 * Minimal Trakt client for the browser.
 *
 * Nuvio's Android client uses Trakt for scrobbling and library sync. The web
 * app uses the same public API, with the user's own Trakt application
 * credentials (create one at https://trakt.tv/oauth/applications). Device-code
 * auth means no redirect URI or client secret ever leaves the browser.
 */

const API = "https://api.trakt.tv";

export class TraktError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TraktError";
  }
}

export interface TraktDeviceCode {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

export interface TraktToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
}

export interface TraktProfile {
  username: string;
  private: boolean;
  name?: string;
  vip?: boolean;
  ids?: { slug?: string };
  images?: { avatar?: { full?: string } };
}

function headers(clientId: string, accessToken?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": clientId,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function request<T>(path: string, init: RequestInit, clientId: string, accessToken?: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...headers(clientId, accessToken),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    let message = `Trakt request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string; error_description?: string };
      if (payload?.error_description) message = payload.error_description;
      else if (payload?.error) message = payload.error;
    } catch {
      // Keep the status message.
    }
    throw new TraktError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function requestTraktDeviceCode(clientId: string): Promise<TraktDeviceCode> {
  return request<TraktDeviceCode>(
    "/oauth/device/code",
    { method: "POST", body: JSON.stringify({ client_id: clientId }) },
    clientId,
  );
}

/**
 * Polls the device-token endpoint. Trakt returns 400 while the user has not
 * approved the code yet; callers should keep polling until success, expiry or
 * denial.
 */
export async function pollTraktDeviceToken(input: {
  clientId: string;
  clientSecret: string;
  deviceCode: string;
}): Promise<TraktToken> {
  const response = await fetch(`${API}/oauth/device/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: input.deviceCode,
      client_id: input.clientId,
      client_secret: input.clientSecret,
    }),
  });
  if (response.ok) {
    const token = (await response.json()) as TraktToken;
    return { ...token, created_at: Date.now() };
  }
  const status = response.status;
  const messages: Record<number, string> = {
    400: "Waiting for approval…",
    404: "That device code is not valid.",
    409: "This code has already been used.",
    410: "The code expired. Start again.",
    418: "The request was denied.",
    429: "Slow down — polling too quickly.",
  };
  throw new TraktError(messages[status] ?? `Trakt request failed (${status})`, status);
}

export function fetchTraktProfile(clientId: string, accessToken: string): Promise<TraktProfile> {
  return request<TraktProfile>("/users/me", { method: "GET" }, clientId, accessToken);
}

export type TraktScrobbleAction = "start" | "pause" | "stop";

export interface TraktScrobbleInput {
  /** IMDb id, e.g. `tt8178634`. */
  imdbId: string;
  type: "movie" | "series";
  season?: number | null;
  episode?: number | null;
  /** 0–100. */
  progress: number;
}

export async function scrobbleTrakt(
  action: TraktScrobbleAction,
  clientId: string,
  accessToken: string,
  input: TraktScrobbleInput,
): Promise<void> {
  const body: Record<string, unknown> = {
    progress: Math.min(100, Math.max(0, input.progress)),
    app_version: "1.0",
  };
  if (input.type === "series" && input.season != null && input.episode != null) {
    body.show = { ids: { imdb: input.imdbId } };
    body.episode = { season: input.season, number: input.episode };
  } else {
    body.movie = { ids: { imdb: input.imdbId } };
  }
  await request(
    `/scrobble/${action}`,
    { method: "POST", body: JSON.stringify(body) },
    clientId,
    accessToken,
  );
}

export interface TraktHistoryItem {
  watched_at?: string;
  movie?: { ids: { imdb: string; tmdb?: number } };
  show?: { ids: { imdb: string; tmdb?: number } };
  episode?: { season: number; number: number };
}

/** Pushes the local watch history to Trakt in one batch. */
export function pushTraktHistory(
  clientId: string,
  accessToken: string,
  items: TraktHistoryItem[],
): Promise<{ added: { movies: number; episodes: number }; not_found: unknown }> {
  return request(
    "/sync/history",
    { method: "POST", body: JSON.stringify(items) },
    clientId,
    accessToken,
  );
}
