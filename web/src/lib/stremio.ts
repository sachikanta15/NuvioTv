import type {
  AddonManifest,
  CatalogResponse,
  InstalledAddon,
  MetaDetail,
  MetaPreview,
  StremioStream,
} from "@/types";

/** Default network timeout for add-on requests. */
const REQUEST_TIMEOUT_MS = 20_000;

export class AddonError extends Error {
  constructor(
    message: string,
    readonly transportUrl: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AddonError";
  }
}

/** Normalises any user-supplied add-on URL to a transport base URL. */
export function normalizeTransportUrl(raw: string): string {
  let value = raw.trim();
  if (!value) return value;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  value = value.replace(/\/+$/, "");
  value = value.replace(/\/manifest\.json$/i, "");
  return value;
}

export function manifestUrl(transportUrl: string): string {
  return `${normalizeTransportUrl(transportUrl)}/manifest.json`;
}

function withTimeout(ms = REQUEST_TIMEOUT_MS): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

async function fetchJson<T>(
  url: string,
  transportUrl: string,
  init?: RequestInit,
): Promise<T> {
  const timeout = withTimeout();
  try {
    const response = await fetch(url, {
      ...init,
      signal: timeout.signal,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new AddonError(`Request failed (${response.status})`, transportUrl);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AddonError) throw error;
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? "Request timed out"
        : "Network request failed";
    throw new AddonError(message, transportUrl, error);
  } finally {
    timeout.cancel();
  }
}

/** Fetches and validates an add-on manifest. */
export async function fetchManifest(rawUrl: string): Promise<{ manifest: AddonManifest; transportUrl: string }> {
  const transportUrl = normalizeTransportUrl(rawUrl);
  const manifest = await fetchJson<AddonManifest>(manifestUrl(transportUrl), transportUrl);
  if (!manifest || typeof manifest !== "object" || !manifest.id || !manifest.name) {
    throw new AddonError("Invalid add-on manifest", transportUrl);
  }
  return {
    transportUrl,
    manifest: {
      ...manifest,
      catalogs: Array.isArray(manifest.catalogs) ? manifest.catalogs : [],
      types: Array.isArray(manifest.types) ? manifest.types : [],
    },
  };
}

export function createInstalledAddon(manifest: AddonManifest, transportUrl: string): InstalledAddon {
  return {
    transportUrl: normalizeTransportUrl(transportUrl),
    manifest,
    enabled: true,
    order: Date.now(),
  };
}

/** Builds the `extra` path segment used by the Stremio catalog protocol. */
export function buildExtraSegment(extra?: Record<string, string | number | undefined>): string {
  if (!extra) return "";
  const pairs = Object.entries(extra)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  if (pairs.length === 0) return "";
  return pairs.join("&");
}

export function buildCatalogUrl(
  transportUrl: string,
  type: string,
  catalogId: string,
  extra?: Record<string, string | number | undefined>,
): string {
  const base = normalizeTransportUrl(transportUrl);
  const segment = buildExtraSegment(extra);
  const encodedId = encodeURIComponent(catalogId);
  if (!segment) return `${base}/catalog/${encodeURIComponent(type)}/${encodedId}.json`;
  return `${base}/catalog/${encodeURIComponent(type)}/${encodedId}/${segment}.json`;
}

export function buildMetaUrl(transportUrl: string, type: string, id: string): string {
  const base = normalizeTransportUrl(transportUrl);
  return `${base}/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`;
}

export function buildStreamUrl(transportUrl: string, type: string, videoId: string): string {
  const base = normalizeTransportUrl(transportUrl);
  return `${base}/stream/${encodeURIComponent(type)}/${encodeURIComponent(videoId)}.json`;
}

export async function fetchCatalog(
  transportUrl: string,
  type: string,
  catalogId: string,
  extra?: Record<string, string | number | undefined>,
): Promise<MetaPreview[]> {
  const url = buildCatalogUrl(transportUrl, type, catalogId, extra);
  const payload = await fetchJson<CatalogResponse>(url, transportUrl);
  const metas = Array.isArray(payload?.metas) ? payload.metas : [];
  return metas
    .filter((meta) => meta && typeof meta.id === "string")
    .map((meta) => ({
      ...meta,
      genres: Array.isArray(meta.genres) ? meta.genres : [],
      sourceAddonUrl: normalizeTransportUrl(transportUrl),
      sourceCatalogId: catalogId,
    }));
}

export async function fetchMeta(
  transportUrl: string,
  type: string,
  id: string,
): Promise<MetaDetail | null> {
  const url = buildMetaUrl(transportUrl, type, id);
  const payload = await fetchJson<{ meta?: MetaDetail }>(url, transportUrl);
  const meta = payload?.meta;
  if (!meta) return null;
  return {
    ...meta,
    type: meta.type ?? type,
    genres: Array.isArray(meta.genres) ? meta.genres : [],
    videos: Array.isArray(meta.videos) ? meta.videos : [],
    sourceAddonUrl: normalizeTransportUrl(transportUrl),
  };
}

export async function fetchStreams(
  transportUrl: string,
  type: string,
  videoId: string,
): Promise<StremioStream[]> {
  const url = buildStreamUrl(transportUrl, type, videoId);
  const payload = await fetchJson<{ streams?: StremioStream[] }>(url, transportUrl);
  return Array.isArray(payload?.streams) ? payload.streams : [];
}

export interface AddonStreamResult {
  addon: InstalledAddon;
  streams: StremioStream[];
  error?: string;
}

/** Queries every installed stream add-on in parallel; failures never reject. */
export async function fetchStreamsFromAddons(
  addons: InstalledAddon[],
  type: string,
  videoId: string,
): Promise<AddonStreamResult[]> {
  const results = await Promise.all(
    addons.map(async (addon): Promise<AddonStreamResult> => {
      try {
        const streams = await fetchStreams(addon.transportUrl, type, videoId);
        return { addon, streams };
      } catch (error) {
        return {
          addon,
          streams: [],
          error: error instanceof Error ? error.message : "Failed to load streams",
        };
      }
    }),
  );
  return results;
}

/** True when the add-on manifest advertises the given resource + type. */
export function addonSupports(
  addon: InstalledAddon,
  resource: string,
  type?: string,
): boolean {
  const { resources } = addon.manifest;
  return resources.some((entry) => {
    if (typeof entry === "string") {
      return entry === resource || (resource === "addon_catalog" && entry === "catalog");
    }
    const matchesName =
      entry.name === resource || (resource === "addon_catalog" && entry.name === "catalog");
    if (!matchesName) return false;
    if (!type) return true;
    return entry.types.includes(type);
  });
}

export function addonSupportsType(addon: InstalledAddon, type: string): boolean {
  const types = addon.manifest.types ?? [];
  if (types.includes(type)) return true;
  return (addon.manifest.catalogs ?? []).some((catalog) => catalog.type === type);
}

/** Fetches a catalog declared by an add-on's manifest. */
export function catalogsFor(addon: InstalledAddon, type?: string) {
  return (addon.manifest.catalogs ?? []).filter(
    (catalog) => catalog.id !== "search" && (!type || catalog.type === type),
  );
}
