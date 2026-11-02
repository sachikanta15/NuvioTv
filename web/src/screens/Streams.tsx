import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Cloud,
  CloudLightning,
  Download,
  Gauge,
  Layers,
  Play,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import type { MetaDetail, MetaVideo, StremioStream } from "@/types";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { Toggle } from "@/components/ui/Toggle";
import { Chip } from "@/components/ui/Chip";
import { cn } from "@/lib/cn";
import { episodeLabel, formatBytes } from "@/lib/format";
import { analyzeStream, streamKey, streamLines, toPlaybackSource } from "@/lib/streams";
import { browserPlaybackSupport } from "@/lib/media-type";
import { proxySourceUrl, sourceNeedsProxy } from "@/lib/stream-proxy";
import { resolveDebridStream } from "@/lib/debrid";
import { resolveStreams, type ResolvedStreams } from "@/lib/resolve";
import { resolveMeta } from "@/lib/meta";
import { enabledAddons, useAddons } from "@/store/addons";
import { usePlayer } from "@/store/player";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import { useDebrid } from "@/store/debrid";

interface FilterState {
  quality: string | null;
  cachedOnly: boolean;
  directOnly: boolean;
  search: string;
}

export function StreamsScreen() {
  const { type = "movie", id = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const videoId = params.get("videoId") ?? id;
  const seasonParam = params.get("season");
  const episodeParam = params.get("episode");
  const startFromBeginning = params.get("start") === "1";

  const addonsState = useAddons();
  const playback = useSettings((state) => state.playback);
  const streamLayout = useSettings((state) => state.streamLayout);
  const start = usePlayer((state) => state.start);
  const pushToast = useUi((state) => state.pushToast);
  const debrid = useDebrid();
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);

  const [meta, setMeta] = useState<MetaDetail | null>(null);
  const [resolved, setResolved] = useState<ResolvedStreams | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [autoStarted, setAutoStarted] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    quality: null,
    cachedOnly: false,
    directOnly: true,
    search: "",
  });

  /* ---------------------------- metadata ---------------------------- */
  useEffect(() => {
    let cancelled = false;
    resolveMeta(enabledAddons(addonsState), type, id, null)
      .then((result) => !cancelled && setMeta(result))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id]);

  /* ----------------------------- streams ---------------------------- */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAutoStarted(false);
    resolveStreams(enabledAddons(addonsState), type, videoId)
      .then((result) => !cancelled && setResolved(result))
      .catch(() => !cancelled && setResolved({ groups: [], flat: [], errors: [] }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, videoId, reloadToken]);

  const targetVideo: MetaVideo | null = useMemo(() => {
    if (!meta?.videos?.length) return null;
    const season = seasonParam ? Number(seasonParam) : null;
    const episode = episodeParam ? Number(episodeParam) : null;
    if (season != null && episode != null) {
      return meta.videos.find((video) => video.season === season && video.episode === episode) ?? null;
    }
    return meta.videos.find((video) => video.id === videoId) ?? null;
  }, [meta, videoId, seasonParam, episodeParam]);

  const availableQualities = useMemo(() => {
    if (!resolved) return [];
    const set = new Set<string>();
    for (const entry of resolved.flat) {
      const analysis = analyzeStream(entry.stream);
      if (analysis.quality) set.add(analysis.quality);
    }
    const order = ["4K", "1440p", "1080p", "720p", "576p", "480p", "360p"];
    return [...set].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [resolved]);

  const launch = useCallback(
    async (stream: StremioStream, addonName: string, addonLogo?: string | null) => {
      if (!meta) return;

      // Some add-ons only provide a web page (externalUrl) or a YouTube id.
      // Those aren't media files, so open them in a new tab instead of
      // feeding them to <video>.
      if (!stream.url && stream.externalUrl) {
        window.open(stream.externalUrl, "_blank", "noopener,noreferrer");
        pushToast("Opened the external source in a new tab", "info");
        return;
      }
      if (!stream.url && !stream.infoHash && stream.ytId) {
        window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(stream.ytId)}`, "_blank", "noopener,noreferrer");
        pushToast("Opened the YouTube source in a new tab", "info");
        return;
      }

      const source = toPlaybackSource(stream, addonName, addonLogo);
      if (!source) {
        pushToast("This source cannot be played in the browser.", "error");
        return;
      }

      // MKV/AVI/MPEG/TS work in Media3 on the TV but not in a browser.
      if (!source.isTorrent) {
        const support = browserPlaybackSupport(
          stream.url ?? stream.externalUrl ?? "",
          stream.behaviorHints?.filename,
        );
        if (!support.supported) {
          pushToast(
            support.reason ?? "This source can't play in a browser. Pick a different source.",
            "error",
          );
          return;
        }
      }

      let playable = source;
      if (source.isTorrent) {
        if (debrid.provider === "none" || !debrid.apiKey.trim()) {
          pushToast(
            "Add a Real-Debrid or Premiumize key in Settings → Debrid to play torrents.",
            "error",
          );
          return;
        }
        const key = streamKey(stream, addonName);
        setResolvingKey(key);
        try {
          const url = await resolveDebridStream(debrid.provider, debrid.apiKey, stream);
          const resolvedSupport = browserPlaybackSupport(url);
          if (!resolvedSupport.supported) {
            pushToast(
              resolvedSupport.reason ??
                "Debrid returned a container the browser can't play. Try another source.",
              "error",
            );
            return;
          }
          playable = { ...source, url, isTorrent: false };
        } catch (error) {
          pushToast(
            error instanceof Error ? error.message : "Debrid could not resolve this source.",
            "error",
          );
          return;
        } finally {
          setResolvingKey(null);
        }
      }

      // Sources that advertise proxy headers (or say they aren't web-ready)
      // go through the same-origin proxy so the browser can attach them.
      if (sourceNeedsProxy(playable)) {
        playable = {
          ...playable,
          url: proxySourceUrl(playable.url, playable.headers),
          subtitleUrls: playable.subtitleUrls?.map((subtitle) => ({
            ...subtitle,
            url: proxySourceUrl(subtitle.url, playable.headers),
          })),
        };
      }

      start({
        content: meta,
        video: targetVideo,
        source: playable,
        startedAt: Date.now(),
        startFromBeginning,
      });
    },
    [
      meta,
      targetVideo,
      start,
      startFromBeginning,
      pushToast,
      debrid.provider,
      debrid.apiKey,
    ],
  );

  /* --------------------------- auto select -------------------------- */
  useEffect(() => {
    if (!playback.autoSelectBestStream || autoStarted || loading || !resolved || !meta) return;
    const playable = resolved.flat.filter((entry) => {
      const source = toPlaybackSource(entry.stream, entry.addonName, entry.addonLogo);
      if (!source) return false;
      if (source.isTorrent) {
        return (
          debrid.autoResolve &&
          debrid.provider !== "none" &&
          debrid.apiKey.trim().length > 0
        );
      }
      return true;
    });
    if (playable.length === 0) return;
    const ranked = [...playable].sort(
      (a, b) => analyzeStream(b.stream).qualityRank - analyzeStream(a.stream).qualityRank,
    );
    const best = ranked[0];
    setAutoStarted(true);
    pushToast("Auto-selected the best available source", "info");
    void launch(best.stream, best.addonName, best.addonLogo);
  }, [
    playback.autoSelectBestStream,
    autoStarted,
    loading,
    resolved,
    meta,
    launch,
    pushToast,
    debrid.autoResolve,
    debrid.provider,
    debrid.apiKey,
  ]);

  const filtered = useMemo(() => {
    if (!resolved) return [];
    const debridReady = debrid.provider !== "none" && debrid.apiKey.trim().length > 0;
    return resolved.groups
      .map((group) => ({
        ...group,
        streams: group.streams
          .filter(({ stream, analysis }) => {
            if (filters.quality && analysis.quality !== filters.quality) return false;
            if (filters.cachedOnly && !analysis.isCached) return false;
            const support = browserPlaybackSupport(
              stream.url ?? stream.externalUrl ?? "",
              stream.behaviorHints?.filename,
            );
            if (filters.directOnly) {
              const source = toPlaybackSource(stream, group.addonName, group.addonLogo);
              if (!source) return false;
              if (source.isTorrent && !debridReady) return false;
              if (!support.supported) return false;
            }
            if (filters.search) {
              const haystack = `${stream.name ?? ""} ${stream.title ?? ""} ${stream.description ?? ""}`.toLowerCase();
              if (!haystack.includes(filters.search.toLowerCase())) return false;
            }
            return true;
          })
          .sort((a, b) => {
            if (playback.preferDirectPlay) {
              const aTorrent = !!toPlaybackSource(a.stream, group.addonName, group.addonLogo)?.isTorrent;
              const bTorrent = !!toPlaybackSource(b.stream, group.addonName, group.addonLogo)?.isTorrent;
              if (aTorrent !== bTorrent) return aTorrent ? 1 : -1;
            }
            return b.analysis.qualityRank - a.analysis.qualityRank;
          }),
      }))
      .filter((group) => group.streams.length > 0);
  }, [resolved, filters, debrid.provider, debrid.apiKey, playback.preferDirectPlay]);

  const total = filtered.reduce((sum, group) => sum + group.streams.length, 0);
  const title = meta?.name ?? "Streams";
  const subtitle = targetVideo
    ? `${title} · ${episodeLabel(targetVideo.season, targetVideo.episode)}${
        targetVideo.title ? ` — ${targetVideo.title}` : ""
      }`
    : title;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <header className="mb-6 flex items-center gap-3">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">{subtitle}</h1>
          <p className="text-sm text-text-secondary">
            Select a source · {loading ? "searching…" : `${total} available`}
          </p>
        </div>
        <IconButton
          label="Refresh sources"
          onClick={() => {
            setReloadToken((token) => token + 1);
            pushToast("Searching all add-ons…", "info");
          }}
        >
          <RefreshCw size={18} />
        </IconButton>
      </header>

      {/* Filters */}
      <div className="mb-6 space-y-4 rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            <Gauge size={13} /> Quality
          </span>
          <Chip
            size="sm"
            active={filters.quality === null}
            onClick={() => setFilters((state) => ({ ...state, quality: null }))}
          >
            Any
          </Chip>
          {availableQualities.map((quality) => (
            <Chip
              key={quality}
              size="sm"
              active={filters.quality === quality}
              onClick={() => setFilters((state) => ({ ...state, quality }))}
            >
              {quality}
            </Chip>
          ))}
        </div>

        <div className="grid gap-1 sm:grid-cols-2 sm:gap-6">
          <Toggle
            checked={filters.directOnly}
            onChange={(value) => setFilters((state) => ({ ...state, directOnly: value }))}
            label="Playable in browser"
            description="Hide torrents and TV-only containers (MKV, AVI, TS)"
          />
          <Toggle
            checked={filters.cachedOnly}
            onChange={(value) => setFilters((state) => ({ ...state, cachedOnly: value }))}
            label="Cached only"
            description="Instant streams from a debrid cache"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="shimmer h-20 rounded-panel" />
          ))}
          <p className="pt-2 text-center text-sm text-text-tertiary">
            Querying {enabledAddons(addonsState).length} add-on
            {enabledAddons(addonsState).length === 1 ? "" : "s"} for sources…
          </p>
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={<Layers size={24} />}
          title="No sources found"
          description={
            resolved && resolved.errors.length > 0
              ? `Some add-ons failed: ${resolved.errors.map((entry) => entry.addonName).join(", ")}.`
              : resolved && resolved.flat.length > 0
                ? "Sources were found, but none are playable in this browser. Turn off “Playable in browser” to see MKV/TV-only sources, or pick another add-on."
                : debrid.provider === "none"
                  ? "Install a stream add-on, or add a debrid key in Settings → Debrid to play torrent sources."
                  : "Install a stream add-on or relax the filters to see all results."
          }
          action={
            <div className="flex gap-3">
              <Button variant="primary" onClick={() => navigate("/addons")}>
                Manage add-ons
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  setFilters({ quality: null, cachedOnly: false, directOnly: false, search: "" })
                }
              >
                Clear filters
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          {filtered.map((group) => (
            <section key={group.addonName}>
              <header className="mb-3 flex items-center gap-2">
                {group.addonLogo && (
                  <img src={group.addonLogo} alt="" className="h-5 w-5 rounded object-contain" />
                )}
                <h2 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">
                  {group.addonName}
                </h2>
                <span className="text-xs text-text-tertiary">({group.streams.length})</span>
              </header>
              <div className={streamLayout === "grid" ? "grid gap-2 sm:grid-cols-2" : "space-y-2"}>
                {group.streams.map(({ stream, analysis }, index) => {
                  const playable = toPlaybackSource(stream, group.addonName, group.addonLogo);
                  const lines = streamLines(stream, analysis);
                  const isTorrent = !playable || playable.isTorrent;
                  const key = streamKey(stream, group.addonName);
                  const isResolving = resolvingKey === key;
                  const debridReady =
                    isTorrent && debrid.provider !== "none" && debrid.apiKey.trim().length > 0;
                  const support = browserPlaybackSupport(
                    stream.url ?? stream.externalUrl ?? "",
                    stream.behaviorHints?.filename,
                  );
                  const browserBlocked = !isTorrent && !support.supported;
                  const proxyReady = !!playable && sourceNeedsProxy(playable);
                  return (
                    <button
                      key={`${group.addonName}-${index}`}
                      onClick={() => void launch(stream, group.addonName, group.addonLogo)}
                      disabled={isResolving}
                      title={browserBlocked ? support.reason : undefined}
                      className={cn(
                        "group flex w-full items-center gap-4 rounded-panel border border-white/8 bg-[rgb(var(--nuvio-card))] px-4 py-3 text-left transition-all duration-200 hover:border-[rgb(var(--nuvio-accent))] hover:bg-[rgb(var(--nuvio-card))]/80 disabled:pointer-events-none",
                        (isTorrent && !debridReady) || browserBlocked ? "opacity-70" : "",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
                          isResolving
                            ? "bg-[rgb(var(--nuvio-accent)/0.16)] text-[rgb(var(--nuvio-accent))]"
                            : browserBlocked
                              ? "bg-[rgb(var(--nuvio-warning)/0.16)] text-[rgb(var(--nuvio-warning))]"
                              : isTorrent
                                ? debridReady
                                  ? "bg-[rgb(var(--nuvio-info)/0.16)] text-[rgb(var(--nuvio-info))]"
                                  : "bg-white/5 text-text-tertiary"
                                : "bg-[rgb(var(--nuvio-accent)/0.16)] text-[rgb(var(--nuvio-accent))] group-hover:accent-gradient group-hover:text-on-accent",
                        )}
                      >
                        {isResolving ? (
                          <Spinner size={18} />
                        ) : browserBlocked ? (
                          <Download size={18} />
                        ) : isTorrent ? (
                          debridReady ? (
                            <Cloud size={18} />
                          ) : (
                            <Download size={18} />
                          )
                        ) : (
                          <Play size={18} className="translate-x-0.5 fill-current" />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{lines.name}</span>
                          {analysis.quality && (
                            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                              {analysis.quality}
                            </span>
                          )}
                          {analysis.hdr.map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-[rgb(var(--nuvio-accent)/0.2)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[rgb(var(--nuvio-accent))]"
                            >
                              {tag}
                            </span>
                          ))}
                          {(analysis.audio ?? []).some((tag) => /ac3|eac3|dts|truehd/i.test(tag)) && (
                            <span className="rounded bg-[rgb(var(--nuvio-warning)/0.16)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[rgb(var(--nuvio-warning))]">
                              TV audio
                            </span>
                          )}
                          {analysis.codec && /hevc|x265|h\.?265/i.test(analysis.codec) && (
                            <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] font-bold uppercase text-text-tertiary">
                              HEVC
                            </span>
                          )}
                          {analysis.isCached && (
                            <span className="flex items-center gap-1 rounded bg-[rgb(var(--nuvio-success)/0.18)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[rgb(var(--nuvio-success))]">
                              <Zap size={9} className="fill-current" /> Cached
                            </span>
                          )}
                          {support.container && support.supported && (
                            <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] font-bold uppercase text-text-tertiary">
                              {support.container}
                            </span>
                          )}
                          {proxyReady && (
                            <span className="rounded bg-[rgb(var(--nuvio-info)/0.18)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[rgb(var(--nuvio-info))]">
                              Proxy
                            </span>
                          )}
                          {browserBlocked && (
                            <span className="rounded bg-[rgb(var(--nuvio-warning)/0.18)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[rgb(var(--nuvio-warning))]">
                              {support.container ?? "TV only"} · TV only
                            </span>
                          )}
                          {isResolving ? (
                            <span className="rounded bg-[rgb(var(--nuvio-info)/0.18)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[rgb(var(--nuvio-info))]">
                              Resolving…
                            </span>
                          ) : isTorrent ? (
                            <span
                              className={cn(
                                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                                debridReady
                                  ? "bg-[rgb(var(--nuvio-info)/0.18)] text-[rgb(var(--nuvio-info))]"
                                  : "bg-white/10 text-text-tertiary",
                              )}
                            >
                              {debridReady && <Cloud size={9} />}
                              {debridReady ? "Debrid" : "Torrent"}
                            </span>
                          ) : null}
                        </span>
                        {lines.description && (
                          <span className="mt-1 line-clamp-2 block text-sm text-text-secondary">
                            {lines.description}
                          </span>
                        )}
                        {lines.meta && (
                          <span className="mt-1 block text-xs text-text-tertiary">{lines.meta}</span>
                        )}
                      </span>

                      {analysis.sizeBytes && (
                        <span className="hidden shrink-0 text-right text-xs text-text-tertiary sm:block">
                          <CloudLightning size={14} className="mb-0.5 inline" />
                          <br />
                          {formatBytes(analysis.sizeBytes)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          {resolved && resolved.errors.length > 0 && (
            <p className="flex items-center gap-2 text-xs text-text-tertiary">
              <Sparkles size={13} />
              {resolved.errors.length} add-on{resolved.errors.length === 1 ? "" : "s"} did not respond:{" "}
              {resolved.errors.map((entry) => entry.addonName).join(", ")}
            </p>
          )}
        </div>
      )}

      {!loading && total > 0 && !playback.autoSelectBestStream && (
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-text-tertiary">
          <Check size={13} /> Tip: enable “Auto-select best stream” in Settings to skip this screen.
        </div>
      )}
    </div>
  );
}
