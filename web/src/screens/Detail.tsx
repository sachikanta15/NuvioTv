import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Bookmark,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Layers,
  PartyPopper,
  Play,
  Plus,
  Share2,
  Star,
} from "lucide-react";
import type { MetaCastMember, MetaDetail, MetaPreview, MetaVideo } from "@/types";
import { AsyncImage } from "@/components/ui/AsyncImage";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { MediaRow } from "@/components/media/MediaRow";
import { cn } from "@/lib/cn";
import { episodeLabel, formatRating, formatRuntime, initials, seasonLabel, truncate } from "@/lib/format";
import { resolveMeta } from "@/lib/meta";
import { INDIA_TITLES, languageFor } from "@/lib/india";
import { fetchCatalog } from "@/lib/stremio";
import { enabledAddons, useAddons } from "@/store/addons";
import { useLibrary } from "@/store/library";
import { useCollections } from "@/store/collections";
import { useUi } from "@/store/ui";
import { useSettings } from "@/store/settings";
import { useParty } from "@/store/party";
import { useProfiles } from "@/store/profiles";

export function DetailScreen() {
  const { type = "movie", id = "" } = useParams();
  const [params] = useSearchParams();
  const preferredAddon = params.get("addon");
  const navigate = useNavigate();

  const addonsState = useAddons();
  const imdbVisibility = useSettings((state) => state.imdbRatingsVisibility);
  const toggleList = useLibrary((state) => state.toggleList);
  const isInList = useLibrary((state) => state.isInList);
  const isWatched = useLibrary((state) => state.isWatched);
  const markWatched = useLibrary((state) => state.markWatched);
  const isVideoWatched = useLibrary((state) => state.isVideoWatched);
  const markVideoWatched = useLibrary((state) => state.markVideoWatched);
  const getProgress = useLibrary((state) => state.getProgress);
  const collections = useCollections((state) => state.collections);
  const addItem = useCollections((state) => state.addItem);
  const pushToast = useUi((state) => state.pushToast);
  const createParty = useParty((state) => state.createSession);
  const partySession = useParty((state) => state.session);
  const detailLayout = useSettings((state) => state.detailLayout);
  const blurUnwatched = useSettings((state) => state.playback.blurUnwatchedEpisodes);
  const hideUnreleased = useSettings((state) => state.playback.hideUnreleasedContent);

  const [meta, setMeta] = useState<MetaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [tab, setTab] = useState("episodes");
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [similar, setSimilar] = useState<MetaPreview[]>([]);
  const [collectionsOpen, setCollectionsOpen] = useState(false);

  /* --------------------------- load metadata --------------------------- */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMeta(null);
    resolveMeta(enabledAddons(addonsState), type, id, preferredAddon)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setError("Metadata for this title could not be loaded.");
          return;
        }
        setMeta(result);
      })
      .catch(() => {
        if (!cancelled) setError("Metadata for this title could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id, preferredAddon]);

  /* ----------------------------- episodes ------------------------------ */
  const seasons = useMemo(() => {
    const now = Date.now();
    const videos = (meta?.videos ?? []).filter((video) => {
      if (!hideUnreleased) return true;
      if (!video.released) return true;
      const released = new Date(video.released).getTime();
      return !Number.isFinite(released) || released <= now;
    });
    const map = new Map<number, MetaVideo[]>();
    for (const video of videos) {
      const seasonNumber = video.season ?? 0;
      if (!map.has(seasonNumber)) map.set(seasonNumber, []);
      map.get(seasonNumber)!.push(video);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [meta, hideUnreleased]);

  // Default to the season holding the current resume point, else the first.
  useEffect(() => {
    if (seasons.length === 0) return;
    const progress = getProgress(id);
    if (progress?.season != null && seasons.some(([value]) => value === progress.season)) {
      setSeason(progress.season);
      return;
    }
    if (season === null) setSeason(seasons[0][0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasons]);

  /* Movies have no episode list, so fall back to the details tab. */
  useEffect(() => {
    if (seasons.length === 0 && tab === "episodes") setTab("details");
  }, [seasons.length, tab]);

  /* --------------------------- similar titles -------------------------- */
  useEffect(() => {
    if (!meta) return;
    const genre = meta.genres?.[0];
    if (!genre) {
      setSimilar([]);
      return;
    }
    const addon = enabledAddons(addonsState).find((entry) =>
      entry.manifest.catalogs?.some(
        (catalog) =>
          catalog.type === type &&
          (catalog.extra?.some((extra) => extra.name === "genre") ||
            (catalog as { genres?: string[] }).genres?.includes(genre)),
      ),
    );
    if (!addon) return;
    const catalog =
      addon.manifest.catalogs.find(
        (entry) => entry.type === type && entry.extra?.some((extra) => extra.name === "genre"),
      ) ?? addon.manifest.catalogs.find((entry) => entry.type === type);
    if (!catalog) return;

    let cancelled = false;
    fetchCatalog(addon.transportUrl, type, catalog.id, { genre })
      .then((items) => {
        if (!cancelled) {
          setSimilar(items.filter((item) => item.id !== id).slice(0, 20));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, type, id]);

  const progress = getProgress(id);
  const watched = isWatched(id);
  const inList = isInList(id);

  const resumeVideo = useMemo(() => {
    if (!meta) return null;
    if (meta.type !== "series") return null;
    if (progress?.season != null && progress?.episode != null) {
      return (meta.videos ?? []).find(
        (video) => video.season === progress.season && video.episode === progress.episode,
      );
    }
    return null;
  }, [meta, progress]);

  const playVideoId = resumeVideo?.id ?? meta?.id ?? id;
  const playSeason = resumeVideo?.season ?? null;
  const playEpisode = resumeVideo?.episode ?? null;

  const openStreams = useCallback(
    (videoId: string, seasonNumber?: number | null, episodeNumber?: number | null, fromBeginning = false) => {
      const search = new URLSearchParams({ videoId });
      if (seasonNumber != null) search.set("season", String(seasonNumber));
      if (episodeNumber != null) search.set("episode", String(episodeNumber));
      if (fromBeginning) search.set("start", "1");
      navigate(`/stream/${encodeURIComponent(meta?.type ?? type)}/${encodeURIComponent(id)}?${search.toString()}`);
    },
    [navigate, meta, type, id],
  );

  const toggleEpisodeWatched = useCallback(
    (video: MetaVideo) => {
      const next = !isVideoWatched(video.id);
      markVideoWatched(video.id, next);
      pushToast(next ? `Marked ${episodeLabel(video.season, video.episode)} as watched` : `Unmarked ${episodeLabel(video.season, video.episode)}`, "success");
    },
    [isVideoWatched, markVideoWatched, pushToast],
  );

  if (loading) {
    return (
      <div className="space-y-6 pb-16">
        <div className="h-[38vh] w-full shimmer sm:h-[45vh]" />
        <div className="flex items-center justify-center py-20">
          <Spinner size={36} />
        </div>
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="px-4 py-16 sm:px-6 lg:px-8">
        <EmptyState
          title="Title unavailable"
          description={error ?? "This title could not be loaded from any installed add-on."}
          action={
            <Button variant="primary" onClick={() => navigate(-1)}>
              Go back
            </Button>
          }
        />
      </div>
    );
  }

  const backdrop = meta.background ?? meta.landscapePoster ?? meta.poster;
  const year = (meta.releaseInfo ?? meta.released ?? "").match(/\d{4}/)?.[0];
  const rating = formatRating(meta.imdbRating);
  const runtime = formatRuntime(meta.runtime);
  const cast: MetaCastMember[] = meta.castMembers?.length
    ? meta.castMembers
    : (meta.cast ?? []).map((name) => ({ name }));
  const directors = toArray(meta.director);
  const writers = toArray(meta.writer);
  const trailerKeys = [
    ...(meta.trailerYtIds ?? []),
    ...((meta.trailers ?? []).map((trailer) => trailer.ytId).filter(Boolean) as string[]),
  ];
  const currentSeasonEpisodes =
    season != null ? seasons.find(([value]) => value === season)?.[1] ?? [] : [];
  const progressPercent =
    progress && progress.duration > 0 ? (progress.position / progress.duration) * 100 : 0;
  const showRating = imdbVisibility === "all" || (imdbVisibility === "first" && !!rating);
  const indiaTitle = INDIA_TITLES.find((entry) => entry.id === meta?.id);
  const compactHeader = detailLayout === "compact";
  const heroHeight = compactHeader
    ? "min-h-[32vh] sm:min-h-[36vh] lg:min-h-[40vh]"
    : "min-h-[42vh] sm:min-h-[50vh] lg:min-h-[56vh]";
  const heroPadding = compactHeader
    ? "pt-[15vh] sm:pt-[15vh] lg:pt-[13vh]"
    : "pt-[20vh] sm:pt-[20vh] lg:pt-[17vh]";

  const startWatchParty = () => {
    if (partySession) {
      navigate("/party");
      return;
    }
    const profile = useProfiles
      .getState()
      .profiles.find((entry) => entry.id === useProfiles.getState().activeProfileId);
    createParty({
      name: profile?.name ?? "Host",
      content: {
        id: meta?.id ?? id,
        type: meta?.type ?? type,
        name: meta?.name ?? "Untitled",
        poster: meta?.poster ?? null,
        background: meta?.background ?? null,
      },
    });
    pushToast("Watch party created — share the code with friends", "success");
    navigate("/party");
  };

  return (
    <div className="pb-28 lg:pb-16">
      {/* Hero — pulled up so the artwork runs under the top bar. */}
      <section className="relative -mt-14 sm:-mt-16">
        <div className={cn("absolute inset-0", heroHeight)}>
          <AsyncImage src={backdrop} alt="" className="h-full w-full" loading="eager" />
        </div>
        <div aria-hidden className="ambient-glow pointer-events-none absolute inset-0 opacity-60" />
        <div className="absolute inset-0 scrim-hero-mobile lg:hidden" />
        <div className="absolute inset-0 hidden scrim-hero lg:block" />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgb(var(--nuvio-bg))] via-[rgb(var(--nuvio-bg))]/30 to-transparent lg:via-transparent" />

        <div
          className={cn(
            "relative flex flex-col items-start justify-end px-4 pb-8 sm:px-6 sm:pb-10 lg:px-8 lg:pb-12",
            heroHeight,
            heroPadding,
          )}
        >
          <button
            onClick={() => navigate(-1)}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-sm text-white/80 backdrop-blur transition-colors hover:bg-black/70 hover:text-white"
          >
            <ChevronDown size={16} className="rotate-90" />
            Back
          </button>

          <div className="flex flex-col gap-8 md:flex-row">
            <div className="hidden w-[220px] shrink-0 md:block">
              <div className="overflow-hidden rounded-panel shadow-lift">
                <AsyncImage
                  src={meta.poster}
                  alt={meta.name}
                  className="aspect-[2/3] w-full"
                  loading="eager"
                />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-4 md:block">
                {/* Compact poster for phones. */}
                <div className="w-[84px] shrink-0 overflow-hidden rounded-lg shadow-lift md:hidden">
                  <AsyncImage
                    src={meta.poster}
                    alt={meta.name}
                    className="aspect-[2/3] w-full"
                    loading="eager"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  {meta.logo ? (
                    <img
                      src={meta.logo}
                      alt={meta.name}
                      className="mb-3 max-h-16 w-auto max-w-[min(320px,80%)] object-contain drop-shadow-2xl sm:mb-4 sm:max-h-28 sm:max-w-[min(420px,80%)]"
                    />
                  ) : (
                    <h1 className="mb-3 text-2xl font-extrabold leading-tight tracking-tight drop-shadow-2xl sm:text-4xl lg:text-5xl">
                      {meta.name}
                    </h1>
                  )}

                  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-text-secondary">
                    {showRating && rating && (
                      <span className="flex items-center gap-1 font-semibold text-rating">
                        <Star size={15} className="fill-rating" />
                        {rating}
                      </span>
                    )}
                    {year && <span>{year}</span>}
                    {meta.country?.toLowerCase().includes("india") && (
                      <span className="rounded-full bg-[#FF8F1F]/15 px-2 py-0.5 text-xs text-[#FFB347]">
                        🇮🇳 India
                      </span>
                    )}
                    {indiaTitle && (
                      <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs text-text-secondary">
                        {languageFor(indiaTitle.language)?.native ?? indiaTitle.language} ·{" "}
                        {indiaTitle.language}
                      </span>
                    )}
                    {runtime && (
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {runtime}
                      </span>
                    )}
                    {meta.status && <span className="capitalize">{meta.status}</span>}
                    {meta.ageRating && (
                      <span className="rounded border border-white/25 px-1.5 text-xs">
                        {meta.ageRating}
                      </span>
                    )}
                  </div>

                  {meta.genres?.length ? (
                    <div className="mb-4 flex flex-wrap gap-1.5">
                      {meta.genres.map((genre) => (
                        <span
                          key={genre}
                          className="rounded-full bg-white/8 px-2.5 py-0.5 text-xs text-text-secondary"
                        >
                          {genre}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {meta.description && (
                <p className="mb-5 line-clamp-2 max-w-3xl text-sm leading-relaxed text-text-secondary sm:mb-6 sm:line-clamp-4 sm:text-base">
                  {meta.description}
                </p>
              )}

              <div className="hidden flex-wrap items-center gap-3 lg:flex">
                <Button
                  size="lg"
                  variant="primary"
                  icon={<Play size={18} className="fill-white" />}
                  onClick={() => openStreams(playVideoId, playSeason, playEpisode)}
                >
                  {progressPercent > 1 && meta.type === "series"
                    ? `Resume ${episodeLabel(playSeason, playEpisode)}`
                    : progressPercent > 1
                      ? "Resume"
                      : "Play"}
                </Button>
                {progressPercent > 1 && (
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => openStreams(playVideoId, playSeason, playEpisode, true)}
                  >
                    Start over
                  </Button>
                )}
                <Button
                  size="lg"
                  variant="outline"
                  icon={<PartyPopper size={18} />}
                  onClick={startWatchParty}
                >
                  {partySession ? "Watch party" : "Start party"}
                </Button>
                <IconButton
                  label={inList ? "In watchlist" : "Add to watchlist"}
                  size="lg"
                  variant="solid"
                  active={inList}
                  onClick={() => {
                    const added = toggleList(meta);
                    pushToast(
                      added ? `Added ${meta.name} to watchlist` : `Removed ${meta.name}`,
                      added ? "success" : "info",
                    );
                  }}
                >
                  <Bookmark size={20} className={inList ? "fill-current" : ""} />
                </IconButton>
                <IconButton
                  label={watched ? "Marked as watched" : "Mark as watched"}
                  size="lg"
                  variant="solid"
                  active={watched}
                  onClick={() => {
                    markWatched(meta, !watched);
                    pushToast(watched ? "Removed from watched" : "Marked as watched", "success");
                  }}
                >
                  <Check size={20} />
                </IconButton>
                {collections.length > 0 && (
                  <IconButton
                    label="Add to collection"
                    size="lg"
                    variant="solid"
                    onClick={() => setCollectionsOpen(true)}
                  >
                    <Layers size={20} />
                  </IconButton>
                )}
                {trailerKeys.length > 0 && (
                  <Button
                    size="lg"
                    variant="outline"
                    icon={<Play size={16} />}
                    onClick={() => setTrailerKey(trailerKeys[0])}
                  >
                    Trailer
                  </Button>
                )}
                <IconButton
                  label="Share"
                  size="lg"
                  variant="solid"
                  onClick={() => {
                    const url = window.location.href;
                    if (navigator.share) navigator.share({ title: meta.name, url }).catch(() => undefined);
                    else {
                      navigator.clipboard?.writeText(url);
                      pushToast("Link copied to clipboard", "success");
                    }
                  }}
                >
                  <Share2 size={18} />
                </IconButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sticky action bar for phones — portalled so it pins to the viewport. */}
      {createPortal(
        <div className="fixed inset-x-0 bottom-0 z-[80] flex items-center gap-3 border-t border-white/8 bg-[rgb(var(--nuvio-bg))]/92 px-4 py-3 pb-safe backdrop-blur-lg lg:hidden">
          <Button
            variant="primary"
            icon={<Play size={17} className="fill-white" />}
            className="flex-1"
            onClick={() => openStreams(playVideoId, playSeason, playEpisode)}
          >
            {progressPercent > 1 && meta.type === "series"
              ? `Resume ${episodeLabel(playSeason, playEpisode)}`
              : progressPercent > 1
                ? "Resume"
                : "Play"}
          </Button>
          <IconButton
            label={inList ? "In watchlist" : "Add to watchlist"}
            variant="solid"
            active={inList}
            onClick={() => {
              const added = toggleList(meta);
              pushToast(
                added ? `Added ${meta.name} to watchlist` : `Removed ${meta.name}`,
                added ? "success" : "info",
              );
            }}
          >
            <Bookmark size={19} className={inList ? "fill-current" : ""} />
          </IconButton>
          <IconButton
            label={watched ? "Marked as watched" : "Mark as watched"}
            variant="solid"
            active={watched}
            onClick={() => {
              markWatched(meta, !watched);
              pushToast(watched ? "Removed from watched" : "Marked as watched", "success");
            }}
          >
            <Check size={19} />
          </IconButton>
          <IconButton
            label={partySession ? "Watch party" : "Start a watch party"}
            variant="solid"
            active={!!partySession}
            onClick={startWatchParty}
          >
            <PartyPopper size={18} />
          </IconButton>
          <IconButton
            label="Share"
            variant="solid"
            onClick={() => {
              const url = window.location.href;
              if (navigator.share) navigator.share({ title: meta.name, url }).catch(() => undefined);
              else {
                navigator.clipboard?.writeText(url);
                pushToast("Link copied to clipboard", "success");
              }
            }}
          >
            <Share2 size={17} />
          </IconButton>
        </div>,
        document.body,
      )}

      {/* Tabs */}
      <div className="mt-6 px-4 sm:mt-10 sm:px-6 lg:px-8">
        <Tabs
          tabs={[
            ...(seasons.length > 0 ? [{ id: "episodes", label: "Episodes" }] : []),
            { id: "details", label: "Details" },
            { id: "cast", label: "Cast" },
            ...(similar.length > 0 ? [{ id: "similar", label: "More like this" }] : []),
          ]}
          active={tab}
          onChange={setTab}
          className="w-full sm:w-fit"
        />

        <div className="mt-6 sm:mt-8">
          {tab === "episodes" && seasons.length > 0 && (
            <div className="space-y-5">
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:-mx-0 lg:px-0">
                {seasons.map(([seasonNumber, episodes]) => (
                  <button
                    key={seasonNumber}
                    onClick={() => setSeason(seasonNumber)}
                    className={cn(
                      "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                      season === seasonNumber
                        ? "accent-gradient text-on-accent shadow-glow"
                        : "bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary",
                    )}
                  >
                    {seasonLabel(seasonNumber)}
                    <span className="ml-2 text-xs opacity-70">{episodes.length}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {currentSeasonEpisodes.map((video) => {
                  const watchedEpisode = isVideoWatched(video.id);
                  const isCurrent = progress?.season === video.season && progress?.episode === video.episode;
                  return (
                    <article
                      key={video.id}
                      className="group flex gap-3 rounded-panel border border-white/8 bg-[rgb(var(--nuvio-card))] p-2.5 transition-colors hover:border-white/20 sm:gap-4 sm:p-4"
                    >
                      <button
                        onClick={() => openStreams(video.id, video.season, video.episode)}
                        className="relative w-28 shrink-0 overflow-hidden rounded-lg sm:w-40 lg:w-52"
                        aria-label={`Play ${video.title ?? `episode ${video.episode}`}`}
                      >
                        <AsyncImage
                          src={video.thumbnail}
                          alt={video.title ?? "Episode"}
                          className={cn(
                            "aspect-video w-full transition-all duration-300",
                            blurUnwatched && !watchedEpisode && "scale-105 blur-md",
                          )}
                        />
                        {blurUnwatched && !watchedEpisode && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-[10px] font-bold uppercase tracking-wide text-white/80">
                            Spoiler
                          </span>
                        )}
                        <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-black">
                            <Play size={16} className="translate-x-0.5 fill-black" />
                          </span>
                        </span>
                        {isCurrent && progressPercent > 1 && (
                          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                            <span
                              className="block h-full accent-gradient"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </span>
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                              {episodeLabel(video.season, video.episode)}
                            </p>
                            <h3 className="mt-0.5 line-clamp-1 font-medium">
                              {video.title ?? video.name ?? `Episode ${video.episode}`}
                            </h3>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {video.rating != null && video.rating > 0 && (
                              <span className="flex items-center gap-1 text-xs font-semibold text-rating">
                                <Star size={11} className="fill-rating" />
                                {video.rating.toFixed(1)}
                              </span>
                            )}
                            <IconButton
                              label={watchedEpisode ? "Mark unwatched" : "Mark watched"}
                              size="sm"
                              active={watchedEpisode}
                              onClick={() => toggleEpisodeWatched(video)}
                            >
                              <Check size={16} />
                            </IconButton>
                          </div>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
                          {video.overview ?? video.description ?? "No description available."}
                        </p>
                        <div className="mt-3 flex items-center gap-3 text-xs text-text-tertiary">
                          {video.released && <span>{video.released}</span>}
                          {video.runtime ? <span>{formatRuntime(video.runtime)}</span> : null}
                          {isCurrent && <span className="text-[rgb(var(--nuvio-accent))]">In progress</span>}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "details" && (
            <div className="grid gap-8 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <DetailRow label="Release" value={meta.releaseInfo ?? meta.released ?? "—"} />
                {meta.country && <DetailRow label="Country" value={String(meta.country)} />}
                {meta.language && <DetailRow label="Language" value={String(meta.language)} />}
                {meta.status && <DetailRow label="Status" value={String(meta.status)} />}
                {directors.length > 0 && <DetailRow label="Director" value={directors.join(", ")} />}
                {writers.length > 0 && <DetailRow label="Writer" value={writers.join(", ")} />}
                {meta.genres?.length ? (
                  <DetailRow label="Genres" value={meta.genres.join(", ")} />
                ) : null}
                {meta.awards && <DetailRow label="Awards" value={meta.awards} />}
                {meta.networks?.length ? (
                  <DetailRow
                    label="Networks"
                    value={meta.networks.map((network) => network.name).join(", ")}
                  />
                ) : null}
                {meta.links?.length ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                      Links
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {meta.links.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
                        >
                          {link.name}
                          <ExternalLink size={13} />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {meta.productionCompanies?.length ? (
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                    Production
                  </p>
                  <div className="space-y-2">
                    {meta.productionCompanies.slice(0, 8).map((company) => (
                      <div key={company.name} className="flex items-center gap-3 text-sm">
                        {company.logo ? (
                          <AsyncImage
                            src={company.logo}
                            alt={company.name}
                            className="h-8 w-12 rounded bg-white/5"
                            fit="contain"
                            fallbackIcon={false}
                          />
                        ) : null}
                        <span className="text-text-secondary">{company.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {tab === "cast" && (
            <div className="space-y-6">
              {directors.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-tertiary">
                    Directed by
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {directors.map((name) => (
                      <span key={name} className="rounded-full bg-white/5 px-3 py-1.5 text-sm">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-tertiary">
                  Cast
                </h3>
                {cast.length === 0 ? (
                  <p className="text-sm text-text-tertiary">No cast information available.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-6">
                    {cast.slice(0, 18).map((member) => (
                      <div key={`${member.name}-${member.character}`} className="text-center">
                        {member.photo ? (
                          <AsyncImage
                            src={member.photo}
                            alt={member.name}
                            className="mx-auto mb-2 aspect-[2/3] w-full rounded-panel"
                          />
                        ) : (
                          <div className="mx-auto mb-2 flex aspect-[2/3] w-full items-center justify-center rounded-panel bg-[rgb(var(--nuvio-surface-variant))] text-xl font-bold text-white/40">
                            {initials(member.name)}
                          </div>
                        )}
                        <p className="line-clamp-1 text-sm font-medium">{member.name}</p>
                        {member.character && (
                          <p className="line-clamp-1 text-xs text-text-tertiary">{member.character}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "similar" && (
            <div className="-mx-4 sm:-mx-6 lg:-mx-8">
              <MediaRow
                items={similar}
                addonUrl={meta.sourceAddonUrl ?? undefined}
                shape="poster"
              />
            </div>
          )}
        </div>
      </div>

      {/* Trailer modal */}
      <Modal
        open={!!trailerKey}
        onClose={() => setTrailerKey(null)}
        title="Trailer"
        wide
      >
        {trailerKey && (
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
            <iframe
              title="Trailer"
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
      </Modal>

      {/* Add to collection modal */}
      <Modal
        open={collectionsOpen}
        onClose={() => setCollectionsOpen(false)}
        title="Add to collection"
        description="Choose a folder to save this title."
      >
        <div className="space-y-3">
          {collections.length === 0 && (
            <p className="text-sm text-text-secondary">You have no collections yet.</p>
          )}
          {collections.map((collection) => (
            <div key={collection.id} className="rounded-xl border border-white/10 p-3">
              <p className="mb-2 font-medium">{collection.title}</p>
              <div className="flex flex-wrap gap-2">
                {collection.folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => {
                      addItem(collection.id, folder.id, meta);
                      pushToast(`Added to ${collection.title} · ${folder.name}`, "success");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
                  >
                    <Plus size={13} />
                    {folder.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 border-b border-white/5 pb-3">
      <span className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {label}
      </span>
      <span className="text-sm text-text-secondary">{truncate(value, 400)}</span>
    </div>
  );
}

function toArray(value: string[] | string | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((entry) => entry.split(",")).map((entry) => entry.trim()).filter(Boolean);
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}
