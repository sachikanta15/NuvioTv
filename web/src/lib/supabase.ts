/**
 * Minimal Supabase REST client.
 *
 * The Android app talks to Supabase with raw HTTP rather than the SDK
 * (`AuthManager.kt` + `MemberAccessRemoteDataSource.kt`), so this mirrors
 * those calls one-for-one:
 *
 *   POST {url}/auth/v1/token?grant_type=password
 *   POST {url}/auth/v1/token?grant_type=refresh_token
 *   POST {url}/auth/v1/signup
 *   POST {url}/rest/v1/rpc/{fn}
 *   GET  {url}/rest/v1/{table}?...
 *
 * Only the publishable key is used; no secret ever reaches the browser.
 */
import {
  SUPABASE_ANON_KEY,
  SUPABASE_FALLBACK_URL,
  SUPABASE_URL,
  isAuthConfigured,
} from "@/lib/config";
import type { CosmeticEntitlement, MemberAccess } from "@/lib/member-access";
import { ALL_ENTITLEMENTS } from "@/lib/member-access";

export interface SupabaseUser {
  id: string;
  email: string | null;
}

export interface SupabaseSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds when the access token expires. */
  expiresAt: number;
  user: SupabaseUser;
}

export interface SupabaseAddonRow {
  id?: string | null;
  user_id: string;
  url: string;
  name?: string | null;
  enabled?: boolean;
  sort_order?: number;
  profile_id?: number;
}

export class SupabaseError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "SupabaseError";
    this.status = status;
    this.code = code;
  }

  /** True when the request failed because the access token is no longer valid. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

function baseUrl(): string {
  if (!isAuthConfigured) {
    throw new SupabaseError("Nuvio account services are not configured for this build.", 0);
  }
  return SUPABASE_URL;
}

function headers(accessToken?: string | null): Record<string, string> {
  const result: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (accessToken) result.Authorization = `Bearer ${accessToken}`;
  return result;
}

/** Pulls a human-readable message out of a Supabase error body. */
function errorMessage(status: number, body: string): { message: string; code?: string } {
  try {
    const parsed = JSON.parse(body) as {
      error?: string;
      error_description?: string;
      msg?: string;
      message?: string;
      code?: string;
    };
    const message =
      parsed.error_description ||
      parsed.msg ||
      parsed.message ||
      parsed.error ||
      `Request failed (${status})`;
    return { message, code: parsed.code };
  } catch {
    return { message: body?.trim() ? body.trim() : `Request failed (${status})` };
  }
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; accessToken?: string | null },
): Promise<T> {
  const url = `${baseUrl()}${path}`;
  const response = await fetch(url, {
    method: init.method ?? "POST",
    headers: headers(init.accessToken),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  if (!response.ok) {
    const { message, code } = errorMessage(response.status, text);
    throw new SupabaseError(message, response.status, code);
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/** Retries once against the fallback origin when the primary host is down. */
async function requestWithFallback<T>(
  path: string,
  init: { method?: string; body?: unknown; accessToken?: string | null },
): Promise<T> {
  try {
    return await request<T>(path, init);
  } catch (error) {
    const fallback = SUPABASE_FALLBACK_URL;
    if (!fallback || (error instanceof SupabaseError && error.status > 0)) throw error;
    return request<T>(`${fallback}${path}`, init);
  }
}

/* ------------------------------------------------------------------ session */

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
  user?: { id: string; email?: string | null } | null;
}

function toSession(payload: TokenResponse): SupabaseSession {
  const expiresIn = payload.expires_in ?? 3600;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000,
    user: {
      id: payload.user?.id ?? "",
      email: payload.user?.email ?? null,
    },
  };
}

export function signInWithEmail(email: string, password: string): Promise<SupabaseSession> {
  return requestWithFallback<TokenResponse>("/auth/v1/token?grant_type=password", {
    body: { email: email.trim(), password },
  }).then(toSession);
}

export function signUpWithEmail(email: string, password: string): Promise<SupabaseSession> {
  return requestWithFallback<TokenResponse>("/auth/v1/signup", {
    body: { email: email.trim(), password },
  }).then(toSession);
}

export function refreshSession(refreshToken: string): Promise<SupabaseSession> {
  return requestWithFallback<TokenResponse>("/auth/v1/token?grant_type=refresh_token", {
    body: { refresh_token: refreshToken },
  }).then(toSession);
}

/* ---------------------------------------------------------------------- rpc */

async function rpc<T>(name: string, params: unknown, accessToken: string): Promise<T> {
  return requestWithFallback<T>(`/rest/v1/rpc/${name}`, {
    body: params ?? {},
    accessToken,
  });
}

/** `get_my_member_access` — the paywall source of truth. */
export async function getMemberAccess(accessToken: string): Promise<MemberAccess> {
  const rows = await rpc<{ tier: string; entitlements: string[] }[]>(
    "get_my_member_access",
    {},
    accessToken,
  );
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) return { tier: null, entitlements: [] };
  // Unknown entitlement names are dropped, exactly like the Android client.
  const known = new Set<string>(ALL_ENTITLEMENTS);
  return {
    tier: row.tier === "SUPPORTER" || row.tier === "SUPPORTER_PLUS" ? row.tier : null,
    entitlements: (Array.isArray(row.entitlements) ? row.entitlements : []).filter(
      (value): value is CosmeticEntitlement => known.has(value),
    ),
  };
}

export interface MembershipOverview {
  status: string;
  tier: string | null;
  supporter_since: string | null;
  provider_connected: boolean;
  has_subscription: boolean;
  subscription_access_active: boolean;
  subscription_status: string | null;
  provider: string | null;
  has_active_grant: boolean;
  grant_is_lifetime: boolean;
  grant_expires_at: string | null;
  grant_kind: string | null;
  grant_tier: string | null;
  has_lifetime_grant: boolean;
  lifetime_grant_tier: string | null;
  current_period_end: string | null;
  cancels_at_period_end: boolean;
  monthly_amount_cents: number | null;
  currency_code: string | null;
}

export async function getMembershipOverview(
  accessToken: string,
): Promise<MembershipOverview | null> {
  const rows = await rpc<MembershipOverview[]>("get_my_membership_overview", {}, accessToken);
  return Array.isArray(rows) ? (rows[0] ?? null) : null;
}

/** `get_sync_owner` — the account that owns the synced data. */
export async function getSyncOwner(accessToken: string): Promise<string | null> {
  const owner = await rpc<string | null>("get_sync_owner", {}, accessToken);
  return typeof owner === "string" && owner.length > 0 ? owner : null;
}

/* -------------------------------------------------------------------- table */

/** Reads the account's add-on list — the rows the Android app pushes. */
export async function getRemoteAddons(
  userId: string,
  profileId: number,
  accessToken: string,
): Promise<SupabaseAddonRow[]> {
  const query = new URLSearchParams({
    user_id: `eq.${userId}`,
    profile_id: `eq.${profileId}`,
    select: "id,user_id,url,name,enabled,sort_order,profile_id",
    order: "sort_order.asc",
  });
  const rows = await requestWithFallback<SupabaseAddonRow[]>(`/rest/v1/addons?${query}`, {
    method: "GET",
    accessToken,
  });
  return Array.isArray(rows) ? rows : [];
}

/** `sync_push_addons` — mirrors the Android `AddonSyncService.pushToRemote`. */
export async function pushRemoteAddons(
  addons: { url: string; sort_order: number; enabled: boolean; name?: string }[],
  profileId: number,
  accessToken: string,
): Promise<void> {
  await rpc("sync_push_addons", { p_addons: addons, p_profile_id: profileId }, accessToken);
}
