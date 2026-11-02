/**
 * Tata Play+ (tataplaysmart.com) live TV directory and stream resolver.
 *
 * Provides direct MPEG-DASH (.mpd) manifests and metadata for 695+ Tata Play
 * channels, with zero JioTV fallback dependency.
 */

import type { VzyChannel } from "./vzy";
import { resolveVzyStream, vzyStreamProxyUrl, TATAPLAY_STREAM_HEADERS } from "./vzy";
import rawTataPlayChannels from "@/data/tataplay-channels.json";

export type TataPlayChannel = VzyChannel;

export const TATAPLAY_COLLECTIONS = [
  { id: "all", label: "All channels (695)" },
  { id: "verified", label: "Direct Playable (44)" },
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
  if (collection === "verified") return channel.free || !channel.drm;

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
