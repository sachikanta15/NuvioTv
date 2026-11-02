/** A curated set of well-known public Stremio add-ons offered for one-click install. */
export interface RegistryAddon {
  id: string;
  name: string;
  description: string;
  transportUrl: string;
  logo?: string;
  category: "metadata" | "streams" | "subtitles" | "utility";
  /** Marked as installed by default on a fresh profile. */
  recommended?: boolean;
}

export const ADDON_REGISTRY: RegistryAddon[] = [
  {
    id: "com.linvo.cinemeta",
    name: "Cinemeta",
    description: "Official catalogs and metadata for movies and series.",
    transportUrl: "https://v3-cinemeta.strem.io",
    category: "metadata",
    recommended: true,
  },
  {
    id: "org.stremio.opensubtitlesv3",
    name: "OpenSubtitles v3",
    description: "Subtitles in 40+ languages for movies and series.",
    transportUrl: "https://opensubtitles-v3.strem.io",
    category: "subtitles",
    recommended: true,
  },
  {
    id: "community.tmdb",
    name: "TMDB Addon",
    description: "Alternative catalogs and rich artwork from The Movie Database.",
    transportUrl: "https://tmdb-addon.strem.io",
    category: "metadata",
  },
  {
    id: "org.stremio.animekitsu",
    name: "Anime Kitsu",
    description: "Anime catalogs and metadata from Kitsu.",
    transportUrl: "https://anime-kitsu.strem.fun",
    category: "metadata",
  },
  {
    id: "community.torrentio",
    name: "Torrentio",
    description: "Torrent streams from public trackers (requires a debrid service).",
    transportUrl: "https://torrentio.strem.fun",
    category: "streams",
  },
  {
    id: "community.mediaserver",
    name: "Media Server",
    description: "Play from your own Jellyfin / Emby / Plex server.",
    transportUrl: "https://mediaserver.strem.io",
    category: "utility",
  },
];

export const REGISTRY_CATEGORY_LABELS: Record<RegistryAddon["category"], string> = {
  metadata: "Metadata & catalogs",
  streams: "Streams",
  subtitles: "Subtitles",
  utility: "Utilities",
};

export const DEFAULT_ADDON_URLS = ADDON_REGISTRY.filter((addon) => addon.recommended).map(
  (addon) => addon.transportUrl,
);
