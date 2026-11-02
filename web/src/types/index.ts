import type { MetaPreview } from "./stremio";

export * from "./stremio";

/** Experience modes, mirrored from `ExperienceMode.kt`. */
export type ExperienceMode = "essential" | "full";

/** Home layouts, mirrored from `HomeLayout.kt`. */
export type HomeLayout = "classic" | "grid" | "modern";

/** Theme keys, mirrored from `AppTheme.kt` + `ThemeColors.kt`. */
export type AppTheme =
  | "violet"
  | "ocean"
  | "crimson"
  | "emerald"
  | "amber"
  | "rose"
  | "saffron"
  | "gold"
  | "jade"
  | "rose-gold"
  | "arctic-blue"
  | "graphite"
  | "white"
  | "custom";

/** Everything except the user-defined `custom` theme. */
export type StaticTheme = Exclude<AppTheme, "custom">;

/**
 * Three-stop palette for the `custom` theme, mirrored from
 * `CustomThemeColors.kt`. Colours are `#RRGGBB` hex strings.
 */
export interface CustomThemeColors {
  first: string;
  second: string;
  third: string;
}

export type AppFont = "inter" | "dm-sans" | "open-sans";

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  color: string;
  /** PIN-protected profiles, empty string means no PIN. */
  pin: string;
  isKids: boolean;
  createdAt: number;
}

/** A resumable playback position, mirroring `WatchProgress.kt`. */
export interface WatchProgress {
  contentId: string;
  contentType: string;
  name: string;
  poster?: string | null;
  backdrop?: string | null;
  logo?: string | null;
  videoId: string;
  season?: number | null;
  episode?: number | null;
  episodeTitle?: string | null;
  position: number;
  duration: number;
  lastWatched: number;
}

export interface WatchedItem {
  contentId: string;
  contentType: string;
  name: string;
  poster?: string | null;
  watchedAt: number;
}

export interface LibraryItem {
  id: string;
  meta: MetaPreview;
  addedAt: number;
  listId: string;
}

export interface LibraryList {
  id: string;
  name: string;
  icon: string;
  builtIn: boolean;
}

export interface CollectionItem {
  id: string;
  meta: MetaPreview;
}

export interface CollectionFolder {
  id: string;
  name: string;
  items: CollectionItem[];
}

export interface Collection {
  id: string;
  title: string;
  folders: CollectionFolder[];
  createdAt: number;
  updatedAt: number;
}

/** A single row on the home screen. */
export interface HomeCatalogRow {
  key: string;
  addonTransportUrl: string;
  addonName: string;
  addonLogo?: string;
  type: string;
  catalogId: string;
  catalogName: string;
  items: MetaPreview[];
  isLoading: boolean;
  error?: string | null;
  /** `skip` cursor for paging. */
  hasMore: boolean;
}

export interface PlaybackSource {
  url: string;
  title: string;
  name?: string | null;
  addonName: string;
  addonLogo?: string | null;
  description?: string | null;
  isTorrent: boolean;
  infoHash?: string | null;
  fileIdx?: number | null;
  bingeGroup?: string | null;
  subtitleUrls?: { id: string; url: string; lang: string }[];
  quality?: string | null;
  /** Request headers required by the source (proxied in the browser). */
  headers?: Record<string, string> | null;
  /** True when the source advertises proxy headers or isn't web-ready. */
  proxyRequired?: boolean;
}

export interface Toast {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
}
