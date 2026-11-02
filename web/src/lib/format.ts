/** Formatting helpers shared across screens. */

export function formatRuntime(runtime?: string | number | null): string | null {
  if (runtime == null) return null;
  if (typeof runtime === "number") {
    const hours = Math.floor(runtime / 60);
    const minutes = runtime % 60;
    if (hours <= 0) return `${minutes}m`;
    if (minutes <= 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  }
  return runtime;
}

/** `1234567890` -> `1.15 GB` */
export function formatBytes(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 2)} ${units[index]}`;
}

export function formatClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

export function formatRating(rating?: string | number | null): string | null {
  if (rating == null || rating === "") return null;
  const value = typeof rating === "string" ? Number.parseFloat(rating) : rating;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value.toFixed(1);
}

export function yearOf(releaseInfo?: string | number | null): string | null {
  if (releaseInfo == null) return null;
  const match = String(releaseInfo).match(/\d{4}/);
  return match ? match[0] : null;
}

export function seasonLabel(season?: number | null): string {
  if (season == null) return "Specials";
  if (season === 0) return "Specials";
  return `Season ${season}`;
}

export function episodeLabel(season?: number | null, episode?: number | null): string {
  const parts: string[] = [];
  if (season != null) parts.push(season === 0 ? "S0" : `S${season}`);
  if (episode != null) parts.push(`E${episode}`);
  return parts.join("");
}

export function relativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  if (delta < minute) return "just now";
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`;
  if (delta < day) return `${Math.floor(delta / hour)}h ago`;
  if (delta < week) return `${Math.floor(delta / day)}d ago`;
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function progressPercent(position: number, duration: number): number {
  if (!duration || duration <= 0) return 0;
  return Math.min(100, Math.max(0, (position / duration) * 100));
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : plural ?? `${singular}s`}`;
}
