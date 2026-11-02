import type { InstalledAddon, MetaDetail } from "@/types";
import { fetchMeta, normalizeTransportUrl } from "./stremio";

/** The public Cinemeta endpoint the default add-on points at. */
export const CINEMETA_URL = "https://v3-cinemeta.strem.io";

/** Memoised detail lookups so navigation between screens stays instant. */
const cache = new Map<string, MetaDetail>();
const inflight = new Map<string, Promise<MetaDetail | null>>();

function key(transportUrl: string, type: string, id: string) {
  return `${normalizeTransportUrl(transportUrl)}|${type}|${id}`;
}

/** Fetches metadata from a specific add-on, using an in-memory cache. */
export async function fetchMetaCached(
  transportUrl: string,
  type: string,
  id: string,
): Promise<MetaDetail | null> {
  const cacheKey = key(transportUrl, type, id);
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const promise = fetchMeta(transportUrl, type, id)
    .then((meta) => {
      if (meta) cache.set(cacheKey, meta);
      return meta;
    })
    .finally(() => inflight.delete(cacheKey));

  inflight.set(cacheKey, promise);
  return promise;
}

/**
 * Resolves metadata by trying the preferred add-on first, then every add-on
 * that advertises a `meta` resource for the given type.
 */
export async function resolveMeta(
  addons: InstalledAddon[],
  type: string,
  id: string,
  preferred?: string | null,
): Promise<MetaDetail | null> {
  const metaAddons = addons.filter((addon) =>
    addon.manifest.resources.some((resource) => {
      const name = typeof resource === "string" ? resource : resource.name;
      if (name !== "meta") return false;
      if (typeof resource === "string") return true;
      return resource.types.includes(type);
    }),
  );

  const ordered = preferred
    ? [
        ...metaAddons.filter((addon) => addon.transportUrl === normalizeTransportUrl(preferred)),
        ...metaAddons.filter((addon) => addon.transportUrl !== normalizeTransportUrl(preferred)),
      ]
    : metaAddons;

  for (const addon of ordered) {
    try {
      const meta = await fetchMetaCached(addon.transportUrl, type, id);
      if (meta) return meta;
    } catch {
      // Try the next add-on.
    }
  }

  // Curated India rails (and any other IMDb-id surface) should resolve even
  // when the user has removed the default metadata add-on. Cinemeta is the
  // public catalogue those rails are built from.
  if (id.startsWith("tt")) {
    try {
      return await fetchMetaCached(CINEMETA_URL, type, id);
    } catch {
      // Fall through to null.
    }
  }

  return null;
}

/** Clears the metadata cache (used by "force refresh" actions). */
export function clearMetaCache(): void {
  cache.clear();
  inflight.clear();
}
