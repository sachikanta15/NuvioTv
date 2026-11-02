import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Globe2, MapPin, Puzzle, RefreshCw, Sparkles } from "lucide-react";
import type { MetaPreview, WatchProgress } from "@/types";
import { HeroBanner } from "@/components/media/HeroBanner";
import { MediaRow } from "@/components/media/MediaRow";
import { TopTenRow } from "@/components/media/TopTenRow";
import { ContinueWatchingRow } from "@/components/media/ContinueWatchingRow";
import { PosterCard } from "@/components/media/PosterCard";
import { IndiaLanguageBar } from "@/components/india/IndiaLanguageBar";
import { IndiaQuickLinks } from "@/components/india/IndiaQuickLinks";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useHomeRows } from "@/hooks/useCatalogs";
import { useAddons } from "@/store/addons";
import { useLibrary, selectContinueWatching } from "@/store/library";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import { resolveMeta } from "@/lib/meta";
import {
  INDIA_COLLECTIONS,
  INDIA_TITLES,
  fetchIndiaDetail,
  indiaCollectionItems,
  indiaHeroItems,
} from "@/lib/india";
import { enabledAddons } from "@/store/addons";
import { AsyncImage } from "@/components/ui/AsyncImage";
import { progressPercent } from "@/lib/format";
import { cn } from "@/lib/cn";

const HERO_CATALOG_HINTS = ["top", "popular", "trending", "featured", "imdb"];

/** Rails shown on the home screen; the rest live behind "Browse all". */
const HOME_COLLECTIONS = INDIA_COLLECTIONS.filter((collection) => collection.id !== "trending").slice(
  0,
  9,
);

export function HomeScreen() {
  const navigate = useNavigate();
  const { rows, loading, reload } = useHomeRows();
  const settings = useSettings();
  const layout = settings.homeLayout;
  const continueWatchingEnabled = settings.continueWatchingEnabled;
  const heroEnabled = settings.heroEnabled;
  const addonsState = useAddons();
  const continueWatching = useLibrary(selectContinueWatching);
  const toggleList = useLibrary((state) => state.toggleList);
  const isInList = useLibrary((state) => state.isInList);
  const clearProgress = useLibrary((state) => state.clearProgress);
  const pushToast = useUi((state) => state.pushToast);

  const isIndia = settings.contentRegion === "IN" && settings.indiaLanding;
  const language = settings.indiaLanguage;

  /* ----------------------------- India data ----------------------------- */
  const trending = useMemo(
    () => indiaCollectionItems("trending", { language, limit: 10 }),
    [language],
  );

  const indiaRows = useMemo(
    () =>
      HOME_COLLECTIONS.map((collection) => ({
        collection,
        items: indiaCollectionItems(collection.id, { language, limit: 24 }),
      })).filter((row) => row.items.length > 0),
    [language],
  );

  const indiaHero = useMemo(() => indiaHeroItems(7, language), [language]);

  /* ----------------------------- Add-on data ---------------------------- */
  const addonHeroItems = useMemo(() => {
    const ranked = [...rows].sort((a, b) => {
      const aHint = HERO_CATALOG_HINTS.some((hint) => a.catalogId.toLowerCase().includes(hint));
      const bHint = HERO_CATALOG_HINTS.some((hint) => b.catalogId.toLowerCase().includes(hint));
      return Number(bHint) - Number(aHint);
    });
    const source = ranked.find((row) => row.items.length > 0);
    return (source?.items ?? []).slice(0, 6);
  }, [rows]);

  const useIndiaHero = isIndia && settings.heroSource === "india";
  const heroItems = useIndiaHero ? indiaHero : addonHeroItems;

  const detailForAddons = useCallback(
    (meta: MetaPreview) =>
      resolveMeta(enabledAddons(addonsState), meta.type, meta.id, meta.sourceAddonUrl ?? null),
    [addonsState],
  );

  const detailForIndia = useCallback(
    (meta: MetaPreview) => fetchIndiaDetail({ id: meta.id, type: meta.type }),
    [],
  );

  const onToggleWatchlist = useCallback(
    (meta: MetaPreview) => {
      const added = toggleList(meta);
      pushToast(
        added ? `Added ${meta.name} to watchlist` : `Removed ${meta.name} from watchlist`,
        added ? "success" : "info",
      );
    },
    [toggleList, pushToast],
  );

  const openContinueWatching = useCallback(
    (item: WatchProgress, fromBeginning: boolean) => {
      const params = new URLSearchParams({ videoId: item.videoId });
      if (fromBeginning) params.set("start", "1");
      navigate(
        `/stream/${encodeURIComponent(item.contentType)}/${encodeURIComponent(item.contentId)}?${params.toString()}`,
      );
    },
    [navigate],
  );

  const progressFor = useCallback(
    (meta: MetaPreview) => {
      const found = continueWatching.find((item) => item.contentId === meta.id);
      return found ? (found.position / found.duration) * 100 : undefined;
    },
    [continueWatching],
  );

  const hasCatalogRows = rows.some((row) => row.items.length > 0);
  const installedEnabled = enabledAddons(addonsState).length;

  const continueWatchingBlock =
    continueWatchingEnabled &&
    (settings.continueWatchingStyle === "grid" ? (
      <ContinueWatchingGrid
        items={continueWatching}
        onSelect={openContinueWatching}
        onRemove={(item) => {
          clearProgress(item.contentId);
          pushToast("Removed from continue watching", "info");
        }}
      />
    ) : (
      <ContinueWatchingRow
        items={continueWatching}
        loading={loading && continueWatching.length === 0}
        onRemove={(item) => {
          clearProgress(item.contentId);
          pushToast("Removed from continue watching", "info");
        }}
        onSelect={openContinueWatching}
      />
    ));

  return (
    <div className="pb-24 lg:pb-16">
      {heroEnabled && heroItems.length > 0 ? (
        // Pull the hero up so the artwork runs full-bleed under the top bar.
        <div className="-mt-14 sm:-mt-16">
          <HeroBanner
            items={heroItems}
            detailFor={useIndiaHero ? detailForIndia : detailForAddons}
            eyebrow={
              useIndiaHero ? (
                <>
                  <span aria-hidden>🇮🇳</span>
                  <span>Made for India</span>
                  <span className="text-white/35">·</span>
                  <span className="normal-case tracking-normal text-white/55">Namaste</span>
                </>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="h-4" />
      )}

      <div
        className={cn(
          "relative z-10 space-y-8 sm:space-y-10",
          heroEnabled && heroItems.length > 0
            ? "-mt-16 sm:-mt-20 lg:-mt-24"
            : "pt-4",
        )}
      >
        {isIndia ? (
          <>
            <IndiaIntro
              language={language}
              onLanguage={settings.setIndiaLanguage}
              onRegion={settings.setContentRegion}
            />

            {indiaRows.length === 0 && trending.length === 0 && (
              <div className="px-4 sm:px-6 lg:px-8">
                <EmptyState
                  icon={<MapPin size={24} />}
                  title={`No ${language} titles yet`}
                  description="We're still curating this language. Switch to all Indian languages to keep browsing."
                  action={
                    <Button variant="primary" onClick={() => settings.setIndiaLanguage("all")}>
                      Show all languages
                    </Button>
                  }
                />
              </div>
            )}

            <IndiaQuickLinks language={language} />

            {continueWatchingBlock}

            <TopTenRow
              title="Top 10 in India today"
              subtitle="The Indian titles everyone is talking about"
              items={trending}
              onSeeAll={() =>
                navigate(`/india/trending${language !== "all" ? `?lang=${language}` : ""}`)
              }
            />

            {indiaRows.map(({ collection, items }) => (
              <MediaRow
                key={collection.id}
                title={`${collection.icon} ${collection.title}`}
                subtitle={collection.subtitle}
                items={items}
                shape={settings.cardShape}
                progressFor={progressFor}
                inList={isInList}
                onToggleWatchlist={onToggleWatchlist}
                onSeeAll={() =>
                  navigate(
                    `/india/${collection.id}${language !== "all" ? `?lang=${language}` : ""}`,
                  )
                }
              />
            ))}

            <ExploreIndiaBanner
              onBrowse={() => navigate(`/india/all${language !== "all" ? `?lang=${language}` : ""}`)}
              total={INDIA_TITLES.length}
            />

            {hasCatalogRows && (
              <section className="space-y-8 pt-2">
                <header className="px-4 sm:px-6 lg:px-8">
                  <div className="flex items-center gap-2">
                    <span className="h-px flex-1 bg-white/8" />
                    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-text-tertiary">
                      <Puzzle size={14} /> More from your add-ons
                    </h2>
                    <span className="h-px flex-1 bg-white/8" />
                  </div>
                </header>
                <AddonRows
                  rows={rows}
                  progressFor={progressFor}
                  onToggleWatchlist={onToggleWatchlist}
                  inList={isInList}
                  navigate={navigate}
                />
              </section>
            )}
          </>
        ) : (
          <>
            <GlobalIntro
              onSwitchIndia={() => {
                settings.setContentRegion("IN");
                settings.setIndiaLanding(true);
              }}
            />

            {continueWatchingBlock}

            {loading && rows.length === 0 && <HomeSkeleton />}

            {!loading && !hasCatalogRows && (
              <div className="px-4 sm:px-6 lg:px-8">
                <EmptyState
                  icon={<Puzzle size={24} />}
                  title={
                    installedEnabled === 0 ? "No add-ons installed" : "No catalogs available"
                  }
                  description={
                    installedEnabled === 0
                      ? "Nuvio is powered by add-ons. Install Cinemeta or paste your own add-on URL to populate your home screen."
                      : "The installed add-ons returned no catalogs. Try refreshing or adding another add-on."
                  }
                  action={
                    <div className="flex gap-3">
                      <Button variant="primary" onClick={() => navigate("/addons")}>
                        Manage add-ons
                      </Button>
                      <Button
                        variant="outline"
                        icon={<RefreshCw size={16} />}
                        onClick={() => {
                          reload();
                          pushToast("Reloading catalogs…", "info");
                        }}
                      >
                        Retry
                      </Button>
                    </div>
                  }
                />
              </div>
            )}

            {layout === "grid" ? (
              <GridHome
                rows={rows}
                progressFor={progressFor}
                onToggleWatchlist={onToggleWatchlist}
                inList={isInList}
              />
            ) : (
              <AddonRows
                rows={rows}
                progressFor={progressFor}
                onToggleWatchlist={onToggleWatchlist}
                inList={isInList}
                navigate={navigate}
              />
            )}

            {hasCatalogRows && (
              <div className="flex items-center justify-center gap-3 pt-4 text-sm text-text-tertiary">
                <Sparkles size={15} />
                <span>
                  Powered by {installedEnabled} add-on{installedEnabled === 1 ? "" : "s"}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function IndiaIntro({
  language,
  onLanguage,
  onRegion,
}: {
  language: string;
  onLanguage: (language: string) => void;
  onRegion: (region: "IN" | "GLOBAL") => void;
}) {
  return (
    <section className="space-y-4 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgb(var(--nuvio-accent))]">
            <MapPin size={12} /> Namaste, India
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
            India&apos;s stories, all in one place
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Bollywood blockbusters, regional cinema, Hindi web series and live TV — curated for
            India, with your own add-ons on top.
          </p>
        </div>
        <Tabs
          tabs={[
            { id: "IN", label: "🇮🇳 India" },
            { id: "GLOBAL", label: "🌍 Global" },
          ]}
          active="IN"
          onChange={(value) => onRegion(value as "IN" | "GLOBAL")}
          className="shrink-0"
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-text-tertiary">
          Pick your language — the whole page follows your choice.
        </p>
        <IndiaLanguageBar value={language} onChange={onLanguage} />
      </div>
    </section>
  );
}

function GlobalIntro({ onSwitchIndia }: { onSwitchIndia: () => void }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/6 text-text-secondary">
          <Globe2 size={20} />
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Global catalogue</h1>
          <p className="text-sm text-text-secondary">
            You&apos;re browsing every catalog from your add-ons.
          </p>
        </div>
      </div>
      <Button variant="outline" icon={<span aria-hidden>🇮🇳</span>} onClick={onSwitchIndia}>
        Switch to India
      </Button>
    </section>
  );
}

function ExploreIndiaBanner({ onBrowse, total }: { onBrowse: () => void; total: number }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#FF8F1F]/20 via-[#FFFFFF]/5 to-[#0E7A3C]/20"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <span aria-hidden>🇮🇳</span> Explore Indian cinema
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {total} hand-picked films and series across Hindi, Tamil, Telugu, Malayalam,
              Kannada, Bengali and Marathi — with more added over time.
            </p>
          </div>
          <Button variant="primary" iconRight={<ArrowRight size={16} />} onClick={onBrowse}>
            Browse all Indian titles
          </Button>
        </div>
      </div>
    </section>
  );
}

function AddonRows({
  rows,
  progressFor,
  onToggleWatchlist,
  inList,
  navigate,
}: {
  rows: ReturnType<typeof useHomeRows>["rows"];
  progressFor: (meta: MetaPreview) => number | undefined;
  onToggleWatchlist: (meta: MetaPreview) => void;
  inList: (id: string) => boolean;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <>
      {rows.map((row) => {
        if (row.items.length === 0 && !row.isLoading) return null;
        return (
          <MediaRow
            key={row.key}
            title={
              row.catalogName.toLowerCase().includes(row.addonName.toLowerCase())
                ? row.catalogName
                : `${row.addonName} · ${row.catalogName}`
            }
            items={row.items}
            addonUrl={row.addonTransportUrl}
            loading={row.isLoading}
            progressFor={progressFor}
            inList={inList}
            onToggleWatchlist={onToggleWatchlist}
            onSeeAll={() =>
              navigate(
                `/browse/${encodeURIComponent(row.addonTransportUrl)}/${encodeURIComponent(
                  row.type,
                )}/${encodeURIComponent(row.catalogId)}?name=${encodeURIComponent(row.catalogName)}`,
              )
            }
          />
        );
      })}
    </>
  );
}

function ContinueWatchingGrid({
  items,
  onSelect,
  onRemove,
}: {
  items: WatchProgress[];
  onSelect: (item: WatchProgress, fromBeginning: boolean) => void;
  onRemove: (item: WatchProgress) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="px-4 sm:px-6 lg:px-8">
      <h2 className="mb-3 text-base font-semibold tracking-tight sm:text-lg">
        Continue watching
      </h2>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
        {items.map((item) => {
          const percent = progressPercent(item.position, item.duration);
          return (
            <div key={item.contentId} className="group/cw relative">
              <button
                type="button"
                onClick={() => onSelect(item, false)}
                className="block w-full text-left"
                aria-label={`Resume ${item.name}`}
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-panel bg-[rgb(var(--nuvio-surface))] transition-transform duration-300 group-hover/cw:-translate-y-1">
                  <AsyncImage src={item.poster} alt={item.name} className="h-full w-full" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-2">
                    <p className="line-clamp-2 text-xs font-semibold text-white">{item.name}</p>
                    <p className="mt-0.5 text-[10px] text-white/60">
                      {item.season != null ? `S${item.season}E${item.episode}` : "Movie"}
                    </p>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                    <div className="h-full accent-gradient" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              </button>
              <button
                type="button"
                aria-label={`Remove ${item.name} from continue watching`}
                onClick={() => onRemove(item)}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/90 group-hover/cw:opacity-100"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="px-4 sm:px-6 lg:px-8">
          <Skeleton className="mb-3 h-5 w-40" />
          <div className="no-scrollbar flex gap-3 overflow-hidden">
            {Array.from({ length: 7 }).map((__, cardIndex) => (
              <div key={cardIndex} className="w-[104px] shrink-0 sm:w-[130px] lg:w-[150px]">
                <Skeleton className="aspect-[2/3] w-full rounded-panel" />
                <Skeleton className="mt-2.5 h-3.5 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GridHome({
  rows,
  progressFor,
  onToggleWatchlist,
  inList,
}: {
  rows: ReturnType<typeof useHomeRows>["rows"];
  progressFor: (meta: MetaPreview) => number | undefined;
  onToggleWatchlist: (meta: MetaPreview) => void;
  inList: (id: string) => boolean;
}) {
  return (
    <div className="space-y-10 px-4 sm:px-6 lg:px-8">
      {rows.map((row) => {
        if (row.items.length === 0) return null;
        return (
          <section key={row.key}>
            <h2 className="mb-4 text-base font-semibold tracking-tight sm:text-lg">
              {row.addonName} · {row.catalogName}
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
              {row.items.map((meta) => (
                <PosterCard
                  key={meta.id}
                  meta={meta}
                  addonUrl={row.addonTransportUrl}
                  progress={progressFor(meta)}
                  inWatchlist={inList(meta.id)}
                  onToggleWatchlist={onToggleWatchlist}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
