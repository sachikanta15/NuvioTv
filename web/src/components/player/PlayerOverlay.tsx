import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Captions,
  Clock3,
  Gauge,
  Keyboard,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Settings2,
  SkipForward,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { usePlayer, nextEpisode } from "@/store/player";
import { useLibrary } from "@/store/library";
import { useAddons } from "@/store/addons";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import { useParty } from "@/store/party";
import { useTracking } from "@/store/tracking";
import { useHls } from "@/hooks/useHls";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { formatClock, episodeLabel } from "@/lib/format";
import { resolveStreams, pickBestSource } from "@/lib/resolve";
import { type PlaybackError, describeMediaElementError } from "@/lib/playback-errors";
import { browserPlaybackSupport, isDashUrl, isHlsUrl } from "@/lib/media-type";
import {
  isAlreadyProxied,
  proxySourceUrl,
  sourceNeedsProxy,
  streamProxyUrl,
} from "@/lib/stream-proxy";
import { enabledAddons } from "@/store/addons";
import { scrobbleTrakt } from "@/lib/trakt";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const SHORTCUTS = [
  ["Space / K", "Play or pause"],
  ["← / →", "Seek 10 seconds"],
  ["J / L", "Seek 10 seconds"],
  ["↑ / ↓", "Volume"],
  ["M", "Mute"],
  ["F", "Fullscreen"],
  ["I", "Playback stats"],
  ["S", "Skip intro"],
  ["0–9", "Jump to 0–90%"],
  ["?", "This help"],
  ["Esc", "Close player"],
];

export function PlayerOverlay() {
  const request = usePlayer((state) => state.request);
  const active = usePlayer((state) => state.active);
  const stop = usePlayer((state) => state.stop);
  const start = usePlayer((state) => state.start);
  const navigate = useNavigate();

  const setProgress = useLibrary((state) => state.setProgress);
  const getProgress = useLibrary((state) => state.getProgress);
  const addonsState = useAddons();
  const playback = useSettings((state) => state.playback);
  const playerAspect = useSettings((state) => state.playerAspect);
  const subtitleStyle = useSettings((state) => state.subtitleStyle);
  const showStats = useSettings((state) => state.showPlayerStats);
  const setShowStats = useSettings((state) => state.setShowPlayerStats);
  const pushToast = useUi((state) => state.pushToast);

  const partySession = useParty((state) => state.session);
  const partyRole = useParty((state) => state.role);
  const partyUpdate = useParty((state) => state.updatePlayback);

  const trakt = useTracking((state) => state.trakt);
  const scrobbleEnabled = useTracking((state) => state.scrobbleEnabled);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<number | null>(null);
  const lastSaved = useRef(0);
  const autoAudioApplied = useRef(false);
  const autoSubtitleApplied = useRef(false);
  const proxiedAttempt = useRef<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [menu, setMenu] = useState<"none" | "settings">("none");
  const [fullscreen, setFullscreen] = useState(false);
  const [subtitleTrack, setSubtitleTrack] = useState<number>(-1);
  const [resolvingNext, setResolvingNext] = useState(false);
  const [mediaError, setMediaError] = useState<PlaybackError | null>(null);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [stats, setStats] = useState({ dropped: 0, total: 0, width: 0, height: 0 });

  const {
    levels,
    currentLevel,
    setLevel,
    audioTracks,
    currentAudioTrack,
    setAudioTrack,
    attach,
    error: sourceError,
    recovering,
    retry,
  } = useHls();

  const source = request?.source;
  const content = request?.content;
  const video = request?.video;
  const upcoming = useMemo(() => (content ? nextEpisode(content, video) : null), [content, video]);

  const subtitleTracks = source?.subtitleUrls ?? [];
  const error = sourceError ?? mediaError;

  /* ----------------------------- attach source ----------------------------- */
  useEffect(() => {
    if (!active || !source) return;
    const element = videoRef.current;
    if (!element) return;

    const saved = request?.startFromBeginning ? undefined : getProgress(content?.id ?? "");
    const resumeAt = saved?.position ? saved.position / 1000 : 0;
    let resumed = false;

    const onLoaded = () => {
      setDuration(element.duration || 0);
      // Only seek once, so a startup retry resumes from the current position.
      if (!resumed) {
        resumed = true;
        if (resumeAt > 3 && resumeAt < (element.duration || Infinity) - 10) {
          element.currentTime = resumeAt;
        }
      }
      element.play().catch(() => setPlaying(false));
    };
    element.addEventListener("loadedmetadata", onLoaded);

    setMediaError(null);
    attach(element, source.url);

    return () => {
      element.removeEventListener("loadedmetadata", onLoaded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, source?.url, content?.id]);

  /* ------------------------------- progress -------------------------------- */
  const persistProgress = useCallback(
    (force = false) => {
      const element = videoRef.current;
      if (!element || !content || !source) return;
      const position = element.currentTime * 1000;
      const total = (element.duration || 0) * 1000;
      if (!total) return;
      if (!force && Math.abs(position - lastSaved.current) < 5000) return;
      lastSaved.current = position;
      setProgress({
        contentId: content.id,
        contentType: content.type,
        name: content.name,
        poster: content.poster ?? null,
        backdrop: content.background ?? null,
        logo: content.logo ?? null,
        videoId: video?.id ?? content.id,
        season: video?.season ?? null,
        episode: video?.episode ?? null,
        episodeTitle: video?.title ?? video?.name ?? null,
        position,
        duration: total,
        lastWatched: Date.now(),
      });
    },
    [content, source, video, setProgress],
  );

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => persistProgress(false), 10_000);
    return () => window.clearInterval(timer);
  }, [active, persistProgress]);

  useEffect(() => () => persistProgress(true), [persistProgress]);

  /* ------------------------------- scrobbling ------------------------------ */
  const scrobble = useCallback(
    (action: "start" | "pause" | "stop") => {
      if (!scrobbleEnabled || !trakt?.accessToken || !trakt.clientId) return;
      if (!content || !content.id.startsWith("tt")) return;
      const element = videoRef.current;
      if (!element) return;
      const progress = element.duration ? (element.currentTime / element.duration) * 100 : 0;
      if (action === "start" && progress < 1) return;
      void scrobbleTrakt(action, trakt.clientId, trakt.accessToken, {
        imdbId: content.id,
        type: content.type === "series" ? "series" : "movie",
        season: video?.season ?? null,
        episode: video?.episode ?? null,
        progress: action === "stop" && progress > 90 ? 100 : progress,
      }).catch(() => undefined);
    },
    [scrobbleEnabled, trakt, content, video],
  );

  /* ------------------------------ party sync ------------------------------- */
  const broadcastPartyState = useCallback(
    (playingOverride?: boolean) => {
      if (!partySession || partyRole !== "host" || !active) return;
      const element = videoRef.current;
      if (!element) return;
      partyUpdate({
        playing: playingOverride ?? !element.paused,
        time: element.currentTime,
        duration: element.duration || 0,
        videoId: video?.id ?? content?.id ?? null,
      });
    },
    [partySession, partyRole, active, partyUpdate, video, content],
  );

  // The host publishes a heartbeat so late joiners and drifting guests catch up.
  useEffect(() => {
    if (!active || partyRole !== "host" || !partySession) return;
    const timer = window.setInterval(() => broadcastPartyState(), 5_000);
    return () => window.clearInterval(timer);
  }, [active, partyRole, partySession, broadcastPartyState]);

  // Guests follow the host's play/pause/seek state.
  const partyPlayback = partySession?.playback;
  const partyUpdatedAt = partyPlayback?.updatedAt;
  useEffect(() => {
    if (!active || partyRole !== "guest" || !partyPlayback) return;
    const element = videoRef.current;
    if (!element) return;
    if (partyPlayback.videoId && video?.id && partyPlayback.videoId !== video.id) return;
    if (Number.isFinite(partyPlayback.time) && Math.abs(element.currentTime - partyPlayback.time) > 2) {
      element.currentTime = partyPlayback.time;
    }
    if (partyPlayback.playing && element.paused) {
      element.play().catch(() => undefined);
    } else if (!partyPlayback.playing && !element.paused) {
      element.pause();
    }
    // Only react to a new host update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, partyRole, partyUpdatedAt]);

  /* ------------------------------ autoplay next ---------------------------- */
  const playNext = useCallback(async () => {
    if (!content || !upcoming) return false;
    setNextCountdown(null);
    setResolvingNext(true);
    try {
      const resolved = await resolveStreams(
        enabledAddons(addonsState),
        content.type,
        upcoming.id,
      );
      const best = pickBestSource(resolved.flat);
      if (!best) {
        pushToast("No playable source found for the next episode.", "error");
        return false;
      }
      const support = browserPlaybackSupport(best.url);
      if (!support.supported) {
        pushToast(
          support.reason ?? "The next episode's source can't play in this browser.",
          "error",
        );
        return false;
      }
      const prepared = sourceNeedsProxy(best)
        ? {
            ...best,
            url: proxySourceUrl(best.url, best.headers),
            subtitleUrls: best.subtitleUrls?.map((subtitle) => ({
              ...subtitle,
              url: proxySourceUrl(subtitle.url, best.headers),
            })),
          }
        : best;
      start({ content, video: upcoming, source: prepared, startedAt: Date.now() });
      if (partyRole === "host") {
        partyUpdate({ playing: true, time: 0, duration: 0, videoId: upcoming.id });
      }
      return true;
    } catch {
      pushToast("Failed to load the next episode.", "error");
      return false;
    } finally {
      setResolvingNext(false);
    }
  }, [content, upcoming, addonsState, pushToast, start, partyRole, partyUpdate]);

  const onEnded = useCallback(() => {
    persistProgress(true);
    scrobble("stop");
    broadcastPartyState(false);
    if (playback.autoPlayNextEpisode && upcoming) {
      if (playback.autoPlayNextCountdown > 0) setNextCountdown(playback.autoPlayNextCountdown);
      else void playNext();
    } else {
      stop();
    }
  }, [
    persistProgress,
    scrobble,
    broadcastPartyState,
    playback.autoPlayNextEpisode,
    playback.autoPlayNextCountdown,
    upcoming,
    playNext,
    stop,
  ]);

  useEffect(() => {
    if (nextCountdown == null) return;
    if (nextCountdown <= 0) {
      void playNext();
      return;
    }
    const timer = window.setTimeout(() => setNextCountdown((value) => (value == null ? null : value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [nextCountdown, playNext]);

  /* ------------------------------- controls -------------------------------- */
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, 3200);
  }, []);

  const togglePlay = useCallback(() => {
    const element = videoRef.current;
    if (!element) return;
    if (element.paused) element.play().catch(() => undefined);
    else element.pause();
  }, []);

  const seek = useCallback(
    (deltaSeconds: number) => {
      const element = videoRef.current;
      if (!element) return;
      element.currentTime = Math.max(0, Math.min(element.duration || 0, element.currentTime + deltaSeconds));
      revealControls();
      broadcastPartyState();
    },
    [revealControls, broadcastPartyState],
  );

  const toggleFullscreen = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else node.requestFullscreen?.().catch(() => undefined);
  }, []);

  const togglePip = useCallback(() => {
    const element = videoRef.current;
    if (!element) return;
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => undefined);
    else element.requestPictureInPicture?.().catch(() => pushToast("Picture-in-Picture unavailable", "error"));
  }, [pushToast]);

  const close = useCallback(() => {
    persistProgress(true);
    scrobble("stop");
    broadcastPartyState(false);
    videoRef.current?.pause();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    stop();
  }, [persistProgress, scrobble, broadcastPartyState, stop]);

  /** Backs out to the source list so the user can pick another stream. */
  const chooseAnotherSource = useCallback(() => {
    if (!content) return;
    const search = new URLSearchParams();
    if (video?.id) search.set("videoId", video.id);
    if (video?.season != null) search.set("season", String(video.season));
    if (video?.episode != null) search.set("episode", String(video.episode));
    videoRef.current?.pause();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    stop();
    const query = search.toString();
    navigate(
      `/stream/${encodeURIComponent(content.type)}/${encodeURIComponent(content.id)}${
        query ? `?${query}` : ""
      }`,
    );
  }, [content, video, navigate, stop]);

  /* ------------------------------- shortcuts ------------------------------- */
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
        event.preventDefault();
        setShowHelp((value) => !value);
        return;
      }
      if (event.key === "i" || event.key === "I") {
        event.preventDefault();
        setShowStats(!showStats);
        return;
      }
      if (event.key === "s" || event.key === "S") {
        const element = videoRef.current;
        if (element && currentTime < playback.skipIntroSeconds) {
          element.currentTime = playback.skipIntroSeconds;
          broadcastPartyState();
        }
        return;
      }
      switch (event.key) {
        case " ":
        case "k":
          event.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          event.preventDefault();
          seek(10);
          break;
        case "ArrowLeft":
          event.preventDefault();
          seek(-10);
          break;
        case "l":
          seek(10);
          break;
        case "j":
          seek(-10);
          break;
        case "ArrowUp":
          event.preventDefault();
          setVolume((value) => {
            const next = Math.min(1, value + 0.1);
            if (videoRef.current) videoRef.current.volume = next;
            return next;
          });
          break;
        case "ArrowDown":
          event.preventDefault();
          setVolume((value) => {
            const next = Math.max(0, value - 0.1);
            if (videoRef.current) videoRef.current.volume = next;
            return next;
          });
          break;
        case "m":
          setMuted((value) => {
            if (videoRef.current) videoRef.current.muted = !value;
            return !value;
          });
          break;
        case "f":
          toggleFullscreen();
          break;
        case "Escape":
          if (showHelp) {
            setShowHelp(false);
          } else if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => undefined);
          } else {
            close();
          }
          break;
        default:
          if (event.key >= "0" && event.key <= "9") {
            const element = videoRef.current;
            if (element?.duration) element.currentTime = (element.duration * Number(event.key)) / 10;
            broadcastPartyState();
          }
      }
      revealControls();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    active,
    close,
    revealControls,
    seek,
    toggleFullscreen,
    togglePlay,
    showHelp,
    showStats,
    setShowStats,
    currentTime,
    playback.skipIntroSeconds,
    broadcastPartyState,
  ]);

  /* ------------------------------ fullscreen ------------------------------- */
  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  /* ------------------------------- subtitles ------------------------------- */
  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    const tracks = element.textTracks;
    for (let i = 0; i < tracks.length; i += 1) {
      tracks[i].mode = i === subtitleTrack ? "showing" : "disabled";
    }
  }, [subtitleTrack, source?.url]);

  useEffect(() => {
    setSubtitleTrack(-1);
    setMenu("none");
    setNextCountdown(null);
    autoAudioApplied.current = false;
    autoSubtitleApplied.current = false;
    proxiedAttempt.current = null;
  }, [source?.url]);

  /* Auto-pick the preferred audio / subtitle language once per source. */
  useEffect(() => {
    if (autoAudioApplied.current || audioTracks.length === 0) return;
    const code = playback.audioLanguage;
    if (!code || code === "auto") return;
    const index = audioTracks.findIndex((track) =>
      track.lang.toLowerCase().startsWith(code.toLowerCase()),
    );
    if (index >= 0) setAudioTrack(index);
    autoAudioApplied.current = true;
  }, [audioTracks, playback.audioLanguage, setAudioTrack]);

  useEffect(() => {
    if (autoSubtitleApplied.current || subtitleTracks.length === 0) return;
    const code = playback.subtitleLanguage;
    if (!code || code === "off") return;
    const index = subtitleTracks.findIndex((track) =>
      track.lang.toLowerCase().startsWith(code.toLowerCase()),
    );
    if (index >= 0) setSubtitleTrack(index);
    autoSubtitleApplied.current = true;
    // `subtitleTracks` is derived from the source URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.url, playback.subtitleLanguage, subtitleTracks.length]);

  if (!active || !request || !source) return null;

  const total = duration || 0;
  const percent = total > 0 ? (currentTime / total) * 100 : 0;
  const bufferedPercent = total > 0 ? (buffered / total) * 100 : 0;
  const title = content?.name ?? source.title;
  const subtitleLine = video
    ? `${episodeLabel(video.season, video.episode)}${video.title ? ` · ${video.title}` : ""}`
    : source.addonName;
  const showSkipIntro =
    playback.skipIntroEnabled &&
    currentTime > 5 &&
    currentTime < playback.skipIntroSeconds &&
    total > playback.skipIntroSeconds + 30;
  const qualityLabel =
    currentLevel >= 0
      ? levels.find((level) => level.index === currentLevel)?.label ?? "Auto"
      : "Auto";

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[120] flex flex-col bg-black"
      onMouseMove={revealControls}
      onClick={() => setMenu("none")}
    >
      <style>{`video::cue {
        font-size: ${subtitleStyle.size}%;
        color: ${subtitleStyle.color};
        background-color: rgba(0, 0, 0, ${subtitleStyle.background / 100});
        text-shadow: 0 1px 2px rgba(0,0,0,0.9);
      }`}</style>

      <video
        ref={videoRef}
        className={cn(
          "h-full w-full bg-black",
          playerAspect === "cover"
            ? "object-cover"
            : playerAspect === "fill"
              ? "object-fill"
              : "object-contain",
        )}
        onPlay={() => {
          setPlaying(true);
          revealControls();
          scrobble("start");
          broadcastPartyState(true);
        }}
        onPause={() => {
          setPlaying(false);
          setControlsVisible(true);
          scrobble("pause");
          broadcastPartyState(false);
        }}
        onSeeked={() => broadcastPartyState()}
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          setCurrentTime(element.currentTime);
          if (element.buffered.length) {
            setBuffered(element.buffered.end(element.buffered.length - 1));
          }
          if (showStats) {
            const quality = element.getVideoPlaybackQuality?.();
            setStats({
              dropped: quality?.droppedVideoFrames ?? 0,
              total: quality?.totalVideoFrames ?? 0,
              width: element.videoWidth,
              height: element.videoHeight,
            });
          }
        }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onEnded={onEnded}
        onError={(event) => {
          setWaiting(false);
          const element = event.currentTarget;
          const code = element.error?.code;
          // Progressive MP4/WebM can fail on CORS or a host that needs
          // headers. Retry once through the same-origin media proxy.
          if (
            source &&
            (code === 2 || code === 4) &&
            !isHlsUrl(source.url) &&
            !isDashUrl(source.url) &&
            !isAlreadyProxied(source.url) &&
            proxiedAttempt.current !== source.url
          ) {
            proxiedAttempt.current = source.url;
            setWaiting(true);
            attach(element, streamProxyUrl(source.url, source.headers));
            return;
          }
          setMediaError(describeMediaElementError(element));
        }}
        playsInline
      >
        {subtitleTracks.map((track) => (
          <track
            key={track.id}
            kind="subtitles"
            src={track.url}
            srcLang={track.lang}
            label={track.lang}
          />
        ))}
      </video>

      {waiting && !error && !recovering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Spinner size={44} />
        </div>
      )}

      {recovering && !error && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Spinner size={44} />
          <p className="text-sm text-white/70">Reconnecting…</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/90 px-6 text-center">
          <div className="max-w-md">
            <p className="text-lg font-semibold">{error.title}</p>
            <p className="mt-2 text-sm text-text-secondary">{error.message}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {error.retryable && (
                <Button variant="primary" icon={<RefreshCw size={16} />} onClick={retry}>
                  Try again
                </Button>
              )}
              <Button variant="outline" onClick={chooseAnotherSource}>
                Choose another source
              </Button>
              <Button variant="ghost" onClick={close}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Stats overlay */}
      {showStats && (
        <div className="pointer-events-none absolute left-3 top-20 z-20 rounded-xl border border-white/10 bg-black/70 p-3 font-mono text-[11px] leading-relaxed text-white/80 backdrop-blur sm:left-6">
          <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wide text-white/50">
            Playback stats
          </p>
          <p>Resolution · {stats.width || "–"}×{stats.height || "–"}</p>
          <p>Quality · {qualityLabel}</p>
          <p>Buffer · {formatClock(Math.max(0, buffered - currentTime) * 1000)}</p>
          <p>Dropped · {stats.dropped}{stats.total ? ` / ${stats.total}` : ""}</p>
          <p>Speed · {rate}×</p>
          <p>Volume · {muted ? "Muted" : `${Math.round(volume * 100)}%`}</p>
          <p>Party · {partySession ? `${partySession.code} (${partyRole})` : "Off"}</p>
        </div>
      )}

      {/* Top bar */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/85 to-transparent px-4 py-4 transition-opacity duration-300 sm:px-6",
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <IconButton label="Back" onClick={close}>
          <ArrowLeft size={20} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{title}</p>
          <p className="truncate text-xs text-white/60">{subtitleLine}</p>
        </div>
        {partySession && (
          <span className="flex max-w-[42vw] shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur sm:max-w-none">
            <Users size={12} className="shrink-0" />
            <span className="truncate">Party {partySession.code}</span>
            <span className="hidden text-white/40 sm:inline">· {partyRole}</span>
          </span>
        )}
        {source.addonLogo && (
          <img src={source.addonLogo} alt="" className="h-6 w-6 rounded object-contain" />
        )}
      </div>

      {/* Skip intro */}
      {showSkipIntro && controlsVisible && (
        <button
          type="button"
          onClick={() => {
            const element = videoRef.current;
            if (element) element.currentTime = playback.skipIntroSeconds;
            broadcastPartyState();
          }}
          className="absolute bottom-32 right-4 z-20 flex items-center gap-2 rounded-lg border border-white/25 bg-black/70 px-4 py-2.5 text-sm font-semibold text-white shadow-lift backdrop-blur transition-colors hover:bg-white hover:text-black sm:bottom-36 sm:right-6"
        >
          <SkipForward size={16} /> Skip intro
        </button>
      )}

      {/* Next episode countdown */}
      {nextCountdown != null && upcoming && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-panel-lg border border-white/10 bg-[rgb(var(--nuvio-card))] p-6 text-center shadow-lift">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Up next
            </p>
            <p className="mt-2 text-lg font-bold">
              {episodeLabel(upcoming.season, upcoming.episode)}
              {upcoming.title ? ` · ${upcoming.title}` : ""}
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              Playing in {nextCountdown} second{nextCountdown === 1 ? "" : "s"}…
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <Button variant="primary" onClick={() => void playNext()} disabled={resolvingNext}>
                {resolvingNext ? <Spinner size={16} /> : "Play now"}
              </Button>
              <Button variant="ghost" icon={<X size={15} />} onClick={() => setNextCountdown(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Help overlay */}
      {showHelp && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 px-6 backdrop-blur-sm"
          onClick={(event) => {
            event.stopPropagation();
            setShowHelp(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-panel-lg border border-white/10 bg-[rgb(var(--nuvio-card))] p-6 shadow-lift"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Keyboard size={18} /> Keyboard shortcuts
              </h2>
              <IconButton label="Close help" onClick={() => setShowHelp(false)}>
                <X size={18} />
              </IconButton>
            </div>
            <dl className="mt-4 grid gap-2 sm:grid-cols-2">
              {SHORTCUTS.map(([keys, label]) => (
                <div key={keys} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
                  <dt className="font-mono text-xs text-text-secondary">{keys}</dt>
                  <dd className="text-xs text-text-tertiary">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-4 pt-16 transition-opacity duration-300 sm:px-6",
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Seek bar */}
        <div className="group/seek relative mb-3 h-1.5 w-full cursor-pointer rounded-full bg-white/20">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/30"
            style={{ width: `${bufferedPercent}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full accent-gradient"
            style={{ width: `${percent}%` }}
          />
          <input
            type="range"
            min={0}
            max={total || 0}
            step={0.1}
            value={currentTime}
            onChange={(event) => {
              const element = videoRef.current;
              if (element) element.currentTime = Number(event.target.value);
            }}
            onPointerUp={() => broadcastPartyState()}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Seek"
          />
          <div
            className="pointer-events-none absolute -top-7 hidden -translate-x-1/2 rounded bg-black/80 px-2 py-1 text-xs group-hover/seek:block"
            style={{ left: `${percent}%` }}
          >
            {formatClock(currentTime * 1000)}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <IconButton label={playing ? "Pause" : "Play"} onClick={togglePlay} size="lg">
            {playing ? (
              <Pause size={24} className="fill-current" />
            ) : (
              <Play size={24} className="fill-current" />
            )}
          </IconButton>
          <IconButton
            label="Back 10 seconds"
            onClick={() => seek(-10)}
            className="hidden sm:inline-flex"
          >
            <RotateCcw size={20} />
          </IconButton>
          <IconButton
            label="Forward 10 seconds"
            onClick={() => seek(10)}
            className="hidden sm:inline-flex"
          >
            <RotateCw size={20} />
          </IconButton>

          <div className="group/vol flex items-center">
            <IconButton
              label={muted ? "Unmute" : "Mute"}
              onClick={() => {
                setMuted((value) => {
                  if (videoRef.current) videoRef.current.muted = !value;
                  return !value;
                });
              }}
            >
              {muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </IconButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(event) => {
                const next = Number(event.target.value);
                setVolume(next);
                setMuted(next === 0);
                if (videoRef.current) {
                  videoRef.current.volume = next;
                  videoRef.current.muted = next === 0;
                }
              }}
              className="nuvio-range w-0 opacity-0 transition-all duration-200 group-hover/vol:w-24 group-hover/vol:opacity-100"
              aria-label="Volume"
            />
          </div>

          <span className="ml-2 select-none font-mono text-xs text-white/80">
            {formatClock(currentTime * 1000)}{" "}
            <span className="text-white/40">/ {formatClock(total * 1000)}</span>
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            {upcoming && (
              <IconButton
                label="Next episode"
                onClick={() => void playNext()}
                disabled={resolvingNext}
              >
                {resolvingNext ? <Spinner size={18} /> : <SkipForward size={20} />}
              </IconButton>
            )}

            <div className="relative">
              <IconButton
                label="Settings"
                active={menu === "settings"}
                onClick={(event) => {
                  event.stopPropagation();
                  setMenu((value) => (value === "settings" ? "none" : "settings"));
                }}
              >
                <Settings2 size={20} />
              </IconButton>
              {menu === "settings" && (
                <div className="glass fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-40 max-h-[65vh] animate-scale-in overflow-y-auto rounded-panel p-4 shadow-lift sm:absolute sm:inset-x-auto sm:bottom-14 sm:right-0 sm:z-auto sm:w-[min(20rem,calc(100vw-2rem))]">
                  <div className="mb-3">
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                      <Gauge size={13} /> Speed
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {SPEEDS.map((speed) => (
                        <button
                          key={speed}
                          onClick={() => {
                            setRate(speed);
                            if (videoRef.current) videoRef.current.playbackRate = speed;
                          }}
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                            rate === speed
                              ? "bg-[rgb(var(--nuvio-accent))] text-white"
                              : "bg-white/10 hover:bg-white/20",
                          )}
                        >
                          {speed}×
                        </button>
                      ))}
                    </div>
                  </div>

                  {levels.length > 0 && (
                    <div className="mb-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                        Quality
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setLevel(-1)}
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                            currentLevel === -1
                              ? "bg-[rgb(var(--nuvio-accent))] text-white"
                              : "bg-white/10 hover:bg-white/20",
                          )}
                        >
                          Auto
                        </button>
                        {levels.map((level) => (
                          <button
                            key={level.index}
                            onClick={() => setLevel(level.index)}
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                              currentLevel === level.index
                                ? "bg-[rgb(var(--nuvio-accent))] text-white"
                                : "bg-white/10 hover:bg-white/20",
                            )}
                          >
                            {level.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {audioTracks.length > 1 && (
                    <div className="mb-3">
                      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                        <Volume2 size={13} /> Audio
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {audioTracks.map((track) => (
                          <button
                            key={track.index}
                            onClick={() => setAudioTrack(track.index)}
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                              currentAudioTrack === track.index
                                ? "bg-[rgb(var(--nuvio-accent))] text-white"
                                : "bg-white/10 hover:bg-white/20",
                            )}
                          >
                            {track.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {subtitleTracks.length > 0 && (
                    <div className="mb-3">
                      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                        <Captions size={13} /> Subtitles
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setSubtitleTrack(-1)}
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                            subtitleTrack === -1
                              ? "bg-[rgb(var(--nuvio-accent))] text-white"
                              : "bg-white/10 hover:bg-white/20",
                          )}
                        >
                          Off
                        </button>
                        {subtitleTracks.map((track, index) => (
                          <button
                            key={track.id}
                            onClick={() => setSubtitleTrack(index)}
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-medium uppercase transition-colors",
                              subtitleTrack === index
                                ? "bg-[rgb(var(--nuvio-accent))] text-white"
                                : "bg-white/10 hover:bg-white/20",
                            )}
                          >
                            {track.lang}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mb-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                      Aspect
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(["contain", "cover", "fill"] as const).map((value) => (
                        <button
                          key={value}
                          onClick={() => useSettings.getState().setPlayerAspect(value)}
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                            playerAspect === value
                              ? "bg-[rgb(var(--nuvio-accent))] text-white"
                              : "bg-white/10 hover:bg-white/20",
                          )}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
                    <button
                      onClick={() => setShowStats(!showStats)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                        showStats ? "bg-[rgb(var(--nuvio-accent))] text-white" : "bg-white/10 hover:bg-white/20",
                      )}
                    >
                      <BarChart3 size={13} /> Stats
                    </button>
                    <button
                      onClick={() => setShowHelp(true)}
                      className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/20"
                    >
                      <Keyboard size={13} /> Shortcuts
                    </button>
                    <button
                      onClick={() => {
                        close();
                        navigate("/ambient");
                      }}
                      className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/20"
                    >
                      <Clock3 size={13} /> Ambient
                    </button>
                  </div>
                </div>
              )}
            </div>

            <IconButton label="Picture in picture" onClick={togglePip}>
              <PictureInPicture2 size={20} />
            </IconButton>
            <IconButton label={fullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}
