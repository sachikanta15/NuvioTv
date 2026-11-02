import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Clock3, Search as SearchIcon, Sparkles, TrendingUp, X } from "lucide-react";
import type { MetaPreview } from "@/types";
import { PosterCard } from "@/components/media/PosterCard";
import { PosterGrid } from "@/components/media/PosterGrid";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import { useDebounced } from "@/hooks/useDebounced";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { fetchCatalog } from "@/lib/stremio";
import { useAddons, catalogKey } from "@/store/addons";
import { enabledAddons } from "@/store/addons";
import { useLibrary } from "@/store/library";
import { useUi } from "@/store/ui";
import { useSettings } from "@/store/settings";
import { useSearchHistory } from "@/store/search";
import { CONTENT_TYPE_ORDER, contentTypeLabel, isLiveTvType } from "@/lib/content-type";
import { INDIA_TITLES, indiaCollectionItems } from "@/lib/india";

const INDIA_QUICK_SEARCHES = [
  { label: "🔥 Trending", to: "/india/trending" },
  { label: "🎬 Bollywood", to: "/india/bollywood" },
  { label: "📺 Web series", to: "/india/hindi-series" },
  { label: "🌴 South cinema", to: "/india/south" },
  { label: "🏏 Sports", to: "/india/sports" },
  { label: "🎞️ Classics", to: "/india/classics" },
];

interface SearchCatalog {
  transportUrl: string;
  addonName: string;
  type: string;
  catalogId: string;
}

export function SearchScreen() {
  const [params, setParams] = useSearchParams();
  const initial = params.get("q") ?? "";
  const [term, setTerm] = useState(initial);
  const [typeFilter, setTypeFilter] = useState("all");
  const [results, setResults] = useState<MetaPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounced(term, 400);
  const inputRef = useRef<HTMLInputElement>(null);
  // Below `sm` the search field and the filter strip stack, so the strip fills
  // the row instead of shrinking to its pills' width.
  const inlineFilters = useMediaQuery("(min-width: 640px)");

  const addonsState = useAddons();
  const toggleList = useLibrary((state) => state.toggleList);
  const isInList = useLibrary((state) => state.isInList);
  const pushToast = useUi((state) => state.pushToast);
  const cardShape = useSettings((state) => state.cardShape);
  const resultsAreLive = typeFilter !== "all" && isLiveTvType(typeFilter);
  const recent = useSearchHistory((state) => state.recent);
  const addRecent = useSearchHistory((state) => state.addRecent);
  const removeRecent = useSearchHistory((state) => state.removeRecent);
  const clearRecent = useSearchHistory((state) => state.clearRecent);

  const popularIndia = useMemo(() => indiaCollectionItems("trending", { limit: 12 }), []);

  const searchCatalogs = useMemo<SearchCatalog[]>(() => {
    const list: SearchCatalog[] = [];
    for (const addon of enabledAddons(addonsState)) {
      for (const catalog of addon.manifest.catalogs ?? []) {
        const supportsSearch =
          catalog.extraSupported?.includes("search") ||
          catalog.extra?.some((extra) => extra.name === "search");
        if (!supportsSearch) continue;
        const disabled = addonsState.disabledCatalogs.includes(
          catalogKey(addon.transportUrl, catalog.type, catalog.id),
        );
        if (disabled) continue;
        list.push({
          transportUrl: addon.transportUrl,
          addonName: addon.displayName ?? addon.manifest.name,
          type: catalog.type,
          catalogId: catalog.id,
        });
      }
    }
    return list;
  }, [addonsState]);

  const availableFilters = useMemo(() => {
    const types = [...new Set(searchCatalogs.map((catalog) => catalog.type))];
    types.sort((a, b) => {
      const ai = CONTENT_TYPE_ORDER.findIndex((entry) => entry.toLowerCase() === a.toLowerCase());
      const bi = CONTENT_TYPE_ORDER.findIndex((entry) => entry.toLowerCase() === b.toLowerCase());
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    return [
      { id: "all", label: "All" },
      ...types.map((id) => ({ id, label: contentTypeLabel(id) })),
    ];
  }, [searchCatalogs]);

  useEffect(() => {
    setParams(debounced ? { q: debounced } : {}, { replace: true });
  }, [debounced, setParams]);

  useEffect(() => {
    const query = debounced.trim();
    if (query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const targets = searchCatalogs.filter(
      (catalog) => typeFilter === "all" || catalog.type === typeFilter,
    );

    Promise.allSettled(
      targets.map((catalog) =>
        fetchCatalog(catalog.transportUrl, catalog.type, catalog.catalogId, { search: query }),
      ),
    )
      .then((settled) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const merged: MetaPreview[] = [];
        for (const outcome of settled) {
          if (outcome.status !== "fulfilled") continue;
          for (const meta of outcome.value) {
            const dedupeKey = `${meta.type}:${meta.id}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            merged.push(meta);
          }
        }
        setResults(merged);
        if (merged.length > 0) addRecent(query);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debounced, searchCatalogs, typeFilter, addRecent]);

  return (
    <div className="space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <header className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Search</h1>
            <p className="text-sm text-text-secondary">
              Every add-on, plus curated Indian cinema.
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-text-tertiary">
            {INDIA_TITLES.length} Indian titles included
          </span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 focus-within:border-[rgb(var(--nuvio-accent))]">
            <SearchIcon size={18} className="shrink-0 text-text-tertiary" />
            <input
              ref={inputRef}
              autoFocus
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search movies, series, actors…"
              className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-tertiary"
              aria-label="Search query"
            />
            {term && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setTerm("");
                  inputRef.current?.focus();
                }}
                className="-mr-1 shrink-0 rounded-full p-1 text-text-tertiary transition-colors hover:bg-white/10 hover:text-text-primary"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {/* Full-width filter strip on phones, inline pill row from `sm` up. */}
          <Tabs
            tabs={availableFilters}
            active={typeFilter}
            onChange={setTypeFilter}
            fill={!inlineFilters && availableFilters.length <= 3}
          />
        </div>
      </header>

      {debounced.trim().length < 2 ? (
        <div className="space-y-8">
          {recent.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
                  <Clock3 size={14} /> Recent searches
                </h2>
                <button
                  onClick={clearRecent}
                  className="text-xs text-text-tertiary transition-colors hover:text-text-primary"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((entry) => (
                  <span
                    key={entry}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 py-1 pl-3 pr-1.5 text-sm text-text-secondary"
                  >
                    <button
                      onClick={() => {
                        setTerm(entry);
                        inputRef.current?.focus();
                      }}
                      className="max-w-[16rem] truncate"
                    >
                      {entry}
                    </button>
                    <button
                      aria-label={`Remove ${entry}`}
                      onClick={() => removeRecent(entry)}
                      className="rounded-full p-1 text-text-tertiary transition-colors hover:bg-white/10 hover:text-text-primary"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-secondary">
              <Sparkles size={14} className="text-[rgb(var(--nuvio-accent))]" /> Made for India
            </h2>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              {INDIA_QUICK_SEARCHES.map((entry) => (
                <Link
                  key={entry.to}
                  to={entry.to}
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/5 px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
                >
                  {entry.label}
                </Link>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
                <TrendingUp size={14} /> Popular in India
              </h2>
              <Link
                to="/india/trending"
                className="text-xs font-medium text-text-tertiary transition-colors hover:text-[rgb(var(--nuvio-accent))]"
              >
                See all
              </Link>
            </div>
            <PosterGrid>
              {popularIndia.map((meta) => (
                <PosterCard
                  key={meta.id}
                  meta={meta}
                  addonUrl={meta.sourceAddonUrl}
                  shape={isLiveTvType(meta.type) ? "landscape" : cardShape}
                  inWatchlist={isInList(meta.id)}
                  onToggleWatchlist={(entry) => {
                    const added = toggleList(entry);
                    pushToast(
                      added ? `Added ${entry.name}` : `Removed ${entry.name}`,
                      added ? "success" : "info",
                    );
                  }}
                />
              ))}
            </PosterGrid>
          </section>

          <p className="text-center text-xs text-text-tertiary">
            Try a title like “RRR”, “Panchayat” or “3 Idiots”, or type an actor&apos;s name.
          </p>
        </div>
      ) : loading ? (
        <PosterGrid>
          {Array.from({ length: 14 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="aspect-[2/3] w-full rounded-panel" />
              <Skeleton className="mt-2.5 h-3.5 w-3/4" />
            </div>
          ))}
        </PosterGrid>
      ) : results.length === 0 ? (
        <EmptyState
          icon={<SearchIcon size={24} />}
          title={`No results for “${debounced}”`}
          description="Try a different spelling, or browse the curated Indian catalogue."
          action={
            <Link to="/india/all">
              <span className="text-sm font-medium text-[rgb(var(--nuvio-accent))]">
                Browse Indian titles →
              </span>
            </Link>
          }
        />
      ) : (
        <>
          <p className="text-sm text-text-tertiary">
            {results.length} result{results.length === 1 ? "" : "s"}
          </p>
          <PosterGrid variant={resultsAreLive ? "landscape" : "poster"}>
            {results.map((meta) => (
              <PosterCard
                key={`${meta.type}:${meta.id}`}
                meta={meta}
                addonUrl={meta.sourceAddonUrl}
                shape={isLiveTvType(meta.type) ? "landscape" : cardShape}
                inWatchlist={isInList(meta.id)}
                onToggleWatchlist={(entry) => {
                  const added = toggleList(entry);
                  pushToast(
                    added ? `Added ${entry.name}` : `Removed ${entry.name}`,
                    added ? "success" : "info",
                  );
                }}
              />
            ))}
          </PosterGrid>
        </>
      )}
    </div>
  );
}
