/**
 * Tata Play+ (tataplaysmart.com) live TV directory and stream resolver.
 *
 * Provides direct MPEG-DASH (.mpd) manifests and metadata for 695+ Tata Play
 * channels, with zero JioTV fallback dependency.
 */

import type { VzyChannel } from "./vzy";
import { resolveVzyStream, vzyStreamProxyUrl, vzyRelayUrl, TATAPLAY_STREAM_HEADERS } from "./vzy";
import rawTataPlayChannels from "@/data/tataplay-channels.json";

export interface TataPlayChannel extends VzyChannel {
  directPlayable?: boolean;
  requiresAuth?: boolean;
}

export interface TataPlayAuthData {
  mobileNumber?: string;
  subscriberId?: string;
  token?: string;
  loggedIn: boolean;
}

export const TATAPLAY_STORAGE_KEY = "nuvio.tataplay.auth";

export function getStoredTataPlayAuth(): TataPlayAuthData | null {
  try {
    const raw = localStorage.getItem(TATAPLAY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeTataPlayAuth(auth: TataPlayAuthData): void {
  try {
    localStorage.setItem(TATAPLAY_STORAGE_KEY, JSON.stringify(auth));
  } catch {}
}

export function clearTataPlayAuth(): void {
  try {
    localStorage.removeItem(TATAPLAY_STORAGE_KEY);
  } catch {}
}

export async function requestTataPlayOtp(phone: string): Promise<{ success: boolean; message: string }> {
  const relay = vzyRelayUrl();
  const endpoint = relay ? `${relay}/tataplay/auth/otp/send` : "/tataplay/auth/otp/send";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile: phone }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || data.message || "Failed to generate OTP");
  }
  return { success: true, message: data.message || "OTP generated successfully." };
}

export async function verifyTataPlayOtp(phone: string, otp: string): Promise<TataPlayAuthData> {
  const relay = vzyRelayUrl();
  const endpoint = relay ? `${relay}/tataplay/auth/otp/verify` : "/tataplay/auth/otp/verify";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile: phone, otp }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || data.message || "Failed to verify OTP");
  }
  const auth: TataPlayAuthData = {
    mobileNumber: phone,
    subscriberId: data.subscriberId || phone,
    token: data.userAuthenticateToken || "authenticated",
    loggedIn: true,
  };
  storeTataPlayAuth(auth);
  return auth;
}

export async function getTataPlayAuthStatus(): Promise<TataPlayAuthData | null> {
  const relay = vzyRelayUrl();
  if (!relay) return getStoredTataPlayAuth();
  try {
    const res = await fetch(`${relay}/tataplay/auth/status`);
    if (res.ok) {
      const data = await res.json();
      if (data.loggedIn) {
        const auth: TataPlayAuthData = {
          mobileNumber: data.mobileNumber,
          subscriberId: data.subscriberId,
          token: "authenticated",
          loggedIn: true,
        };
        storeTataPlayAuth(auth);
        return auth;
      }
    }
  } catch {}
  return getStoredTataPlayAuth();
}

export async function logoutTataPlay(): Promise<void> {
  clearTataPlayAuth();
  const relay = vzyRelayUrl();
  if (relay) {
    try {
      await fetch(`${relay}/tataplay/auth/logout`, { method: "POST" });
    } catch {}
  }
}

export const TATAPLAY_COLLECTIONS = [
  { id: "all", label: "All channels (695)" },
  { id: "verified", label: "Direct Playable (106)" },
  { id: "entertainment", label: "Entertainment" },
  { id: "movies", label: "Movies" },
  { id: "sports", label: "Sports" },
  { id: "news", label: "News" },
  { id: "kids", label: "Kids & Toons" },
  { id: "devotional", label: "Devotional" },
  { id: "regional", label: "Regional" },
  { id: "music", label: "Music" },
  { id: "knowledge", label: "Infotainment" },
  { id: "lifestyle", label: "Lifestyle" },
] as const;

export type TataPlayCollectionId = (typeof TATAPLAY_COLLECTIONS)[number]["id"];

export function matchesTataPlayCollection(
  channel: TataPlayChannel,
  collection: TataPlayCollectionId,
): boolean {
  if (collection === "all") return true;
  if (collection === "verified") return Boolean(channel.directPlayable || channel.free || !channel.drm);

  const category = (channel.category || "").toLowerCase();
  if (collection === "kids") {
    return category.includes("kid") || category.includes("cartoon") || category.includes("toon");
  }
  if (collection === "devotional") {
    return category.includes("devotional") || category.includes("spiritual");
  }
  if (collection === "knowledge") {
    return category.includes("knowledge") || category.includes("infotainment");
  }
  return category.includes(collection);
}

/** Loads every Tata Play channel from the curated dataset. */
export async function loadTataPlayChannels(): Promise<TataPlayChannel[]> {
  const list = (rawTataPlayChannels as unknown as TataPlayChannel[]) || [];
  return list.map((c) => ({ ...c }));
}

export { resolveVzyStream as resolveTataPlayStream, vzyStreamProxyUrl, TATAPLAY_STREAM_HEADERS };

