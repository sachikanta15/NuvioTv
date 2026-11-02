/**
 * Stremio add-on protocol types.
 *
 * Nuvio TV is a Stremio-protocol client: add-ons expose a manifest that
 * declares catalogs, metadata and stream resources. These types mirror
 * the wire format consumed by `app/.../core/addon` on Android.
 */

export type ContentType = "movie" | "series" | "channel" | "tv";
export type PosterShape = "poster" | "landscape" | "square";

export interface ManifestCatalogExtra {
  name: string;
  isRequired?: boolean;
  options?: string[] | null;
  optionsLimit?: number | null;
}

export interface ManifestCatalog {
  type: string;
  id: string;
  name: string;
  extra?: ManifestCatalogExtra[];
  extraSupported?: string[];
  extraRequired?: string[];
  pageSize?: number;
}

export interface ManifestResourceObject {
  name: string;
  types: string[];
  idPrefixes?: string[] | null;
}

export type ManifestResource = string | ManifestResourceObject;

export interface ManifestBehaviorHints {
  configurable?: boolean;
  configurationRequired?: boolean;
  newEpisodeNotifications?: boolean;
  adult?: boolean;
  p2p?: boolean;
}

export interface StremioAddonsConfig {
  issuer?: string;
  signature?: string;
}

export interface AddonManifest {
  id: string;
  version: string;
  name: string;
  description?: string;
  logo?: string;
  background?: string;
  contactEmail?: string;
  types: string[];
  resources: ManifestResource[];
  idPrefixes?: string[];
  catalogs: ManifestCatalog[];
  addonCatalogs?: ManifestCatalog[];
  behaviorHints?: ManifestBehaviorHints;
  stremioAddonsConfig?: StremioAddonsConfig;
  /** Some manifests advertise a language. */
  language?: string;
  /** Non-standard: add-ons may describe their own UI/theme config. */
  config?: unknown;
}

/** An add-on installed in the app, with its resolved manifest and base URL. */
export interface InstalledAddon {
  /** Stable transport URL (manifest URL, without trailing `/manifest.json`). */
  transportUrl: string;
  manifest: AddonManifest;
  /** Whether the user has enabled this add-on. */
  enabled: boolean;
  /** Optional per-addon ordering weight. */
  order: number;
  /** Custom display name override. */
  displayName?: string;
}

export interface AddonCatalogExtension {
  transportUrl: string;
  addonName: string;
  addonLogo?: string;
  manifest: ManifestCatalog;
}

export interface MetaLink {
  name: string;
  category: string;
  url: string;
}

export interface MetaTrailer {
  source?: string;
  type?: string;
  name?: string;
  ytId?: string;
  lang?: string;
}

export interface MDBListRating {
  source: string;
  value: number | null;
  score?: number | null;
  votes?: number | null;
}

export interface MetaPreview {
  id: string;
  type: string;
  name: string;
  poster?: string | null;
  posterShape?: PosterShape;
  background?: string | null;
  logo?: string | null;
  description?: string | null;
  releaseInfo?: string | null;
  imdbRating?: string | number | null;
  genres?: string[] | null;
  runtime?: string | null;
  status?: string | null;
  ageRating?: string | null;
  language?: string | null;
  released?: string | null;
  country?: string | null;
  imdb_id?: string | null;
  slug?: string | null;
  landscapePoster?: string | null;
  year?: string | number | null;
  /** Source add-on transport attached client-side. */
  sourceAddonUrl?: string;
  sourceCatalogId?: string;
  sourceCatalogName?: string;
}

export interface MetaCastMember {
  name: string;
  character?: string | null;
  photo?: string | null;
  tmdbId?: number | null;
}

export interface MetaCompany {
  name: string;
  logo?: string | null;
  tmdbId?: number | null;
}

export interface MetaVideo {
  id: string;
  title?: string | null;
  name?: string | null;
  released?: string | null;
  thumbnail?: string | null;
  season?: number | null;
  episode?: number | null;
  number?: number | null;
  overview?: string | null;
  description?: string | null;
  runtime?: number | null;
  rating?: number | null;
  available?: boolean | null;
}

export interface MetaDetail extends MetaPreview {
  cast?: string[] | null;
  castMembers?: MetaCastMember[];
  director?: string[] | string | null;
  writer?: string[] | string | null;
  writerMembers?: { name: string; tmdbId?: number }[] | null;
  productionCompanies?: MetaCompany[];
  networks?: MetaCompany[];
  awards?: string | null;
  videos?: MetaVideo[] | null;
  links?: MetaLink[] | null;
  trailers?: MetaTrailer[] | null;
  trailerYtIds?: string[] | null;
  releaseDates?: unknown[];
  runtime?: string | null;
  /** Cinemeta returns `seasonCount` via `seasons` sometimes. */
  seasonCount?: number | null;
}

export interface StreamBehaviorHints {
  notWebReady?: boolean;
  bingeGroup?: string;
  countryWhitelist?: string[];
  proxyHeaders?: { request?: Record<string, string>; response?: Record<string, string> };
  videoHash?: string;
  videoSize?: number;
  filename?: string;
  audioDelayMs?: number;
}

export interface StreamSubtitles {
  id: string;
  url: string;
  lang: string;
}

export interface StremioStream {
  name?: string | null;
  title?: string | null;
  description?: string | null;
  url?: string | null;
  ytId?: string | null;
  infoHash?: string | null;
  fileIdx?: number | null;
  externalUrl?: string | null;
  behaviorHints?: StreamBehaviorHints | null;
  subtitles?: StreamSubtitles[] | null;
  sources?: string[] | null;
}

export interface CatalogRequest {
  transportUrl: string;
  type: string;
  catalogId: string;
  extra?: Record<string, string | number | undefined>;
}

export interface CatalogResponse {
  metas: MetaPreview[];
}
