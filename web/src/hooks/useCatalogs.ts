import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HomeCatalogRow, InstalledAddon, MetaPreview } from "@/types";
import { fetchCatalog } from "@/lib/stremio";
import { enabledAddons, catalogKey, useAddons } from "@/store/addons";
import { useSettings } from "@/store/settings";

const HOME_ROW_LIMIT = 24;
const PAGE_SIZE = 40;

interface CatalogDescriptor {
  addon: InstalledAddon;
  type: string;
  catalogId: string;
  catalogName: string;
  key: string;
}

/** Stable default so the hook never receives a fresh array on each render. */
const DEFAULT_CATALOG_TYPES: readonly string[] = ["movie", "series"];

/** Every home-eligible catalog across the enabled add-ons, in user order. */
export function useCatalogDescriptors(
  types: readonly string[] = DEFAULT_CATALOG_TYPES,
): CatalogDescriptor[] {
  const addons = useAddons((state) => state.addons);
  const disabled = useAddons((state) => state.disabledCatalogs);
  const catalogOrder = useAddons((state) => state.catalogOrder);

  // Collapse the type list to a primitive so callers can pass inline arrays
  // (`useCatalogDescriptors(["movie", "series"])`) without the memoised result
  // — and any effect keyed on it — changing identity on every render.
  const typesKey = types.join(",");

  return useMemo(() => {
    const typeList = typesKey.length > 0 ? typesKey.split(",") : [];
    const descriptors: CatalogDescriptor[] = [];
    for (const addon of enabledAddons({ addons })) {
      for (const catalog of addon.manifest.catalogs ?? []) {
        if (!typeList.includes(catalog.type)) continue;
        const isSearchOnly =
          catalog.extra?.some((extra) => extra.name === "search" && extra.isRequired) ??
          catalog.extraRequired?.includes("search") ??
          false;
        if (isSearchOnly) continue;
        const key = catalogKey(addon.transportUrl, catalog.type, catalog.id);
        if (disabled.includes(key)) continue;
        descriptors.push({
          addon,
          type: catalog.type,
          catalogId: catalog.id,
          catalogName: catalog.name,
          key,
        });
      }
    }
    // Apply explicit user ordering.
    const orderIndex = new Map(catalogOrder.map((key, index) => [key, index]));
    return descriptors.sort((a, b) => {
      const ai = orderIndex.get(a.key);
      const bi = orderIndex.get(b.key);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return 0;
    });
  }, [addons, disabled, catalogOrder, typesKey]);
}

/** Loads the home rows: every eligible catalog, lazily and in parallel. */
export function useHomeRows() {
  const descriptors = useCatalogDescriptors();
  const experienceMode = useSettings((state) => state.experienceMode);
  const [rows, setRows] = useState<HomeCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const attempted = useRef(new Set<string>());

  const limited = useMemo(
    () => (experienceMode === "essential" ? descriptors.slice(0, 5) : descriptors),
    [descriptors, experienceMode],
  );

  useEffect(() => {
    let cancelled = false;
    attempted.current = new Set();
    setLoading(true);
    setRows(
      limited.map((descriptor) => ({
        key: descriptor.key,
        addonTransportUrl: descriptor.addon.transportUrl,
        addonName: descriptor.addon.displayName ?? descriptor.addon.manifest.name,
        addonLogo: descriptor.addon.manifest.logo,
        type: descriptor.type,
        catalogId: descriptor.catalogId,
        catalogName: descriptor.catalogName,
        items: [],
        isLoading: true,
        hasMore: true,
      })),
    );

    limited.forEach((descriptor) => {
      fetchCatalog(descriptor.addon.transportUrl, descriptor.type, descriptor.catalogId, { skip: 0 })
        .then((items) => {
          if (cancelled) return;
          attempted.current.add(descriptor.key);
          setRows((previous) =>
            previous.map((row) =>
              row.key === descriptor.key
                ? {
                    ...row,
                    items: items.slice(0, HOME_ROW_LIMIT),
                    isLoading: false,
                    hasMore: items.length >= HOME_ROW_LIMIT,
                  }
                : row,
            ),
          );
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setRows((previous) =>
            previous.map((row) =>
              row.key === descriptor.key
                ? {
                    ...row,
                    isLoading: false,
                    error: error instanceof Error ? error.message : "Failed to load catalog",
                  }
                : row,
            ),
          );
        });
    });

    const timer = setTimeout(() => !cancelled && setLoading(false), 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [limited, reloadToken]);

  const allLoading = loading || rows.some((row) => row.isLoading);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { rows, loading: allLoading, reload, descriptors: limited };
}

/** Loads a full catalog, with paging for "See all" screens. */
export function useCatalogItems(
  transportUrl: string | undefined,
  type: string | undefined,
  catalogId: string | undefined,
  search?: string,
) {
  const [items, setItems] = useState<MetaPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(
    async (skip: number) => {
      if (!transportUrl || !type || !catalogId) return;
      if (skip === 0) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const extra: Record<string, string | number> = { skip };
        if (search) extra.search = search;
        const result = await fetchCatalog(transportUrl, type, catalogId, extra);
        setItems((previous) => (skip === 0 ? result : [...previous, ...result]));
        setHasMore(result.length >= PAGE_SIZE);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Failed to load catalog");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [transportUrl, type, catalogId, search],
  );

  useEffect(() => {
    setItems([]);
    setHasMore(true);
    void load(0);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    void load(items.length);
  }, [hasMore, loading, loadingMore, items.length, load]);

  return { items, loading, loadingMore, error, hasMore, loadMore, reload: () => load(0) };
}
