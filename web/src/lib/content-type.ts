/** Human labels and helpers for Stremio content/catalog types. */

const TYPE_LABELS: Record<string, string> = {
  movie: "Movies",
  series: "Series",
  tv: "Live TV",
  channel: "Channels",
  live: "Live TV",
  sports: "Sports",
  anime: "Anime",
  music: "Music",
  podcast: "Podcasts",
  podcasts: "Podcasts",
  radio: "Radio",
  other: "Other",
};

/** Preferred tab order in Discover and Search. */
export const CONTENT_TYPE_ORDER = [
  "movie",
  "series",
  "tv",
  "channel",
  "live",
  "sports",
  "anime",
  "music",
  "podcast",
  "Podcasts",
  "radio",
  "other",
];

export function contentTypeLabel(type: string): string {
  return TYPE_LABELS[type.toLowerCase()] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

/** True for catalog types that should use landscape channel artwork. */
export function isLiveTvType(type: string): boolean {
  return ["tv", "channel", "live"].includes(type.toLowerCase());
}
