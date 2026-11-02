import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Maximize2,
  RefreshCw,
  Settings2,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { useHls } from "@/hooks/useHls";
import type { JioTvChannel } from "@/lib/jiotv";
import { buildJioTvPlaylistUrl, jioTvRelayUrl, loadJioTvChannelDetail } from "@/lib/jiotv";
import { cn } from "@/lib/cn";

interface JioTvPlayerProps {
  channel: JioTvChannel;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * Full-screen JioTV player.
 *
 * Relay-first when a relay URL is configured (`VITE_JIOTV_RELAY_URL` or
 * `localStorage["nuvio.jiotv.relayUrl"]`). If the relay is missing or does
 * not start, playback falls back to the existing browser CENC pipeline.
 */
export function JioTvPlayer({
  channel,
  onClose,
  onPrevious,
  onNext,
}: JioTvPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sourceModeRef = useRef<"relay" | "direct">("direct");
  const playingRef = useRef(false);
  const relayFallbackStartedRef = useRef(false);
  const relay = jioTvRelayUrl();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [activity, setActivity] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const {
    attach,
    error: playbackError,
    levels,
    currentLevel,
    activeLevel,
    setLevel,
    audioTracks,
    currentAudioTrack,
    setAudioTrack,
  } = useHls({
    skipNetworkRetries: Boolean(relay),
  });

  const loadDirect = useCallback(async () => {
    sourceModeRef.current = "direct";
    setLoading(true);
    try {
      const detail = await loadJioTvChannelDetail(channel);
      const url = buildJioTvPlaylistUrl(detail);
      if (url) setPlaylistUrl(url);
      else {
        setUnavailable(true);
        setLoading(false);
      }
    } catch {
      setUnavailable(true);
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    playingRef.current = false;
    relayFallbackStartedRef.current = false;
    setLoading(true);
    setPlaylistUrl(null);
    setUnavailable(false);
    if (relay) {
      sourceModeRef.current = "relay";
      setPlaylistUrl(`${relay}/live/${encodeURIComponent(channel.id)}.m3u8`);
    } else {
      void loadDirect();
    }
  }, [channel, attempt, relay, loadDirect]);

  // If the relay does not start within 3s, fall back to the browser pipeline.
  useEffect(() => {
    if (!relay || sourceModeRef.current !== "relay") return undefined;
    const timer = setTimeout(() => {
      const hasData = (videoRef.current?.readyState ?? 0) >= 2;
      if (
        !playingRef.current &&
        !hasData &&
        !relayFallbackStartedRef.current &&
        sourceModeRef.current === "relay"
      ) {
        relayFallbackStartedRef.current = true;
        void loadDirect();
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [channel, attempt, relay, loadDirect]);

  useEffect(() => {
    if (playlistUrl) attach(videoRef.current, playlistUrl);
  }, [playlistUrl, attach]);

  useEffect(() => {
    if (!playbackError) return;
    if (sourceModeRef.current === "relay") {
      if (relayFallbackStartedRef.current) return;
      relayFallbackStartedRef.current = true;
      void loadDirect();
      return;
    }
    setUnavailable(true);
    setLoading(false);
  }, [playbackError, loadDirect]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    setActivity((value) => value + 1);
  }, []);

  const closePlayer = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
    onClose();
  }, [onClose]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      containerRef.current?.requestFullscreen?.().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    if (!controlsVisible || loading || settingsOpen) return undefined;
    const timer = setTimeout(() => setControlsVisible(false), 4500);
    return () => clearTimeout(timer);
  }, [controlsVisible, activity, loading, settingsOpen]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        closePlayer();
      } else if (event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault();
        onNext();
      } else if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        onPrevious();
      } else if (
        ["ArrowLeft", "ArrowRight", "Enter"].includes(event.key)
      ) {
        revealControls();
      }
    };
    document.addEventListener("keydown", handle, true);
    return () => document.removeEventListener("keydown", handle, true);
  }, [closePlayer, onNext, onPrevious, revealControls, settingsOpen]);

  const activeLevelLabel = levels.find((l) => l.index === activeLevel)?.label;
  const currentQualityLabel =
    currentLevel === -1
      ? activeLevelLabel
        ? `Auto (${activeLevelLabel})`
        : "Auto"
      : (levels.find((l) => l.index === currentLevel)?.label ?? "Quality");

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Watching ${channel.name}`}
      className="fixed inset-0 z-[100] bg-black text-white"
      onMouseMove={revealControls}
      onFocus={revealControls}
    >
      {unavailable ? (
        <div className="flex h-full w-full items-center justify-center bg-black px-6">
          <div className="max-w-md space-y-4 text-center">
            <AlertTriangle
              size={36}
              className="mx-auto text-[rgb(var(--nuvio-error))]"
            />
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Channel unavailable</h2>
              <p className="text-sm text-white/70">
                {playbackError?.message ??
                  "This channel's stream could not be played in the browser."}
              </p>
              <p className="text-xs text-white/40">
                JioTV's CDN blocks browser playback for some channels. Try
                another channel, or open the provider page in a new tab.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                variant="primary"
                icon={<RefreshCw size={16} />}
                onClick={retry}
              >
                Try again
              </Button>
              {channel.watchUrl && (
                <a
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 text-sm font-semibold text-text-primary transition-colors hover:border-white/30 hover:bg-white/10"
                  href={channel.watchUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} />
                  Open provider page
                </a>
              )}
            </div>
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          className="h-full w-full bg-black"
          autoPlay
          playsInline
          controls
          onPlaying={() => {
            playingRef.current = true;
            setLoading(false);
          }}
          onPause={revealControls}
        />
      )}

      {loading && !unavailable && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80"
        >
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-[rgb(var(--nuvio-accent))]" />
          <p className="text-sm text-white/70">Connecting to {channel.name}…</p>
        </div>
      )}

      <div
        className={cn(
          "pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/90 via-transparent to-black/70 p-4 sm:p-8",
          !controlsVisible && "invisible",
        )}
      >
        <div className="pointer-events-auto flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-[rgb(var(--nuvio-error))]">
              JioTV Live
            </p>
            <h2 className="flex items-center gap-3 text-xl font-bold sm:text-3xl">
              {channel.logo ? (
                <img
                  src={channel.logo}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                  className="h-8 w-8 shrink-0 object-contain sm:h-10 sm:w-10"
                />
              ) : null}
              <span className="truncate">{channel.name}</span>
            </h2>
            <p className="mt-1 text-sm text-white/60">{channel.category}</p>
          </div>
          <IconButton
            ref={closeRef}
            label="Close player"
            variant="solid"
            onClick={closePlayer}
          >
            <X size={20} />
          </IconButton>
        </div>

        <div className="pointer-events-auto space-y-3">
          <p className="text-sm text-white/60">
            {unavailable
              ? "This channel is blocked in the browser — use Previous / Next to try another channel."
              : "Playing directly from the JioTV live stream."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={<ChevronLeft size={16} />}
              onClick={onPrevious}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              iconRight={<ChevronRight size={16} />}
              onClick={onNext}
            >
              Next
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<Maximize2 size={16} />}
              onClick={toggleFullscreen}
            >
              Fullscreen
            </Button>
            {levels.length > 0 && (
              <div className="relative">
                <Button
                  size="sm"
                  variant={settingsOpen ? "primary" : "outline"}
                  icon={<Settings2 size={15} />}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSettingsOpen((prev) => !prev);
                  }}
                >
                  {currentQualityLabel}
                </Button>
                {settingsOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="glass fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-40 max-h-[65vh] animate-scale-in overflow-y-auto rounded-panel p-4 shadow-lift sm:absolute sm:inset-x-auto sm:bottom-12 sm:left-0 sm:z-auto sm:w-64"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                        Quality
                      </p>
                      {activeLevelLabel && currentLevel === -1 && (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                          Live: {activeLevelLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setLevel(-1);
                          setSettingsOpen(false);
                        }}
                        className={cn(
                          "flex items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium transition-colors text-left",
                          currentLevel === -1
                            ? "bg-[rgb(var(--nuvio-accent))] text-white font-semibold"
                            : "bg-white/5 text-white/80 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        <span>
                          Auto {activeLevelLabel ? `(${activeLevelLabel})` : ""}
                        </span>
                        {currentLevel === -1 && <Check size={14} />}
                      </button>
                      {levels.map((level) => (
                        <button
                          key={level.index}
                          type="button"
                          onClick={() => {
                            setLevel(level.index);
                            setSettingsOpen(false);
                          }}
                          className={cn(
                            "flex items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium transition-colors text-left",
                            currentLevel === level.index
                              ? "bg-[rgb(var(--nuvio-accent))] text-white font-semibold"
                              : "bg-white/5 text-white/80 hover:bg-white/10 hover:text-white",
                          )}
                        >
                          <span>{level.label}</span>
                          {currentLevel === level.index && <Check size={14} />}
                        </button>
                      ))}
                    </div>

                    {audioTracks.length > 1 && (
                      <div className="mt-3 border-t border-white/10 pt-3">
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/50">
                          <Volume2 size={13} /> Audio
                        </p>
                        <div className="flex flex-col gap-1">
                          {audioTracks.map((track) => (
                            <button
                              key={track.index}
                              type="button"
                              onClick={() => {
                                setAudioTrack(track.index);
                                setSettingsOpen(false);
                              }}
                              className={cn(
                                "flex items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium transition-colors text-left",
                                currentAudioTrack === track.index
                                  ? "bg-[rgb(var(--nuvio-accent))] text-white font-semibold"
                                  : "bg-white/5 text-white/80 hover:bg-white/10 hover:text-white",
                              )}
                            >
                              <span>{track.label}</span>
                              {currentAudioTrack === track.index && (
                                <Check size={14} />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {channel.watchUrl && (
              <a
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 text-sm font-semibold text-text-primary transition-colors hover:border-white/30 hover:bg-white/10"
                href={channel.watchUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={16} />
                New tab
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
