/**
 * Backend configuration.
 *
 * The web build talks to the **same Supabase project as the Android app**, so
 * one Nuvio account works on both. The values mirror the Android
 * `BuildConfig` fields, which come from `local.properties`:
 *
 *   NUVIO_SUPABASE_URL       -> VITE_SUPABASE_URL
 *   NUVIO_SUPABASE_ANON_KEY  -> VITE_SUPABASE_ANON_KEY
 *   NUVIO_SUPABASE_FALLBACK_URL -> VITE_SUPABASE_FALLBACK_URL
 *
 * The publishable ("anon") key is designed to be public — it ships inside the
 * Android APK — so baking it into the web bundle is the same trade-off the
 * native app already makes. The *secret* key must never be used here.
 *
 * When these are missing the app stays fully usable: accounts, the paywall
 * and cloud add-on restore are simply unavailable.
 */

const trimSlash = (value: string) => value.trim().replace(/\/+$/, "");

export const SUPABASE_URL = trimSlash(import.meta.env.VITE_SUPABASE_URL ?? "");
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
export const SUPABASE_FALLBACK_URL = trimSlash(
  import.meta.env.VITE_SUPABASE_FALLBACK_URL ?? "",
);

/** Where the membership is purchased. Mirrors `BuildConfig.SUPPORT_URL`. */
export const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL?.trim() || "https://nuvio.tv/support";

/** True when the backend is configured well enough to sign in. */
export const isAuthConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
