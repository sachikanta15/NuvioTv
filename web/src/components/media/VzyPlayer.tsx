import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Maximize2,
  RefreshCw,
  Settings2,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { useHls } from "@/hooks/useHls";
import { cn } from "@/lib/cn";
import type { VzyChannel } from "@/lib/vzy";
import { getStoredVzyAuth, resolveVzyStream, vzyRelayUrl } from "@/lib/vzy";
import { getStoredTataPlayAuth } from "@/lib/tataplay";
import { VzyAuthModal } from "./VzyAuthModal";
import { TataPlayAuthModal } from "./TataPlayAuthModal";

interface VzyPlayerProps {
  channel: VzyChannel;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * Full-screen VZY live player with native in-app playback for all channels.
 * Matches the in-app player architecture used for JioTV.
 */
export function VzyPlayer({
  channel,
  onClose,
  onPrevious,
  onNext,
}: VzyPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const playingRef = useRef(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [activity, setActivity] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [protectionData, setProtectionData] = useState<
    Record<string, unknown> | undefined
  >(undefined);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const relay = vzyRelayUrl();
  const sourceModeRef = useRef<"relay" | "direct">("direct");
  const fallbackInProgressRef = useRef(false);

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

  const hasAuth = Boolean(getStoredVzyAuth()?.token);
  const hasTataPlayAuth = Boolean(getStoredTataPlayAuth()?.loggedIn);

  // Resolve stream dynamically (clear stream, Widevine DASH token, partner stream, or relay)
  useEffect(() => {
    let cancelled = false;
    playingRef.current = false;
    fallbackInProgressRef.current = false;
    sourceModeRef.current = relay ? "relay" : "direct";
    setLoading(true);
    setUnavailable(false);
    setResolutionError(null);
    setStreamUrl(null);
    setProtectionData(undefined);

    resolveVzyStream(channel)
      .then((resolved) => {
        if (cancelled) return;
        setStreamUrl(resolved.url);
        setProtectionData(resolved.protectionData);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // If relay failed to resolve, try direct resolution as fallback
        if (sourceModeRef.current === "relay") {
          console.warn(
            "[VzyPlayer] Relay resolution failed, falling back to direct stream...",
          );
          sourceModeRef.current = "direct";
          fallbackInProgressRef.current = true;
          resolveVzyStream(channel, undefined, true)
            .then((fallbackResolved) => {
              if (cancelled) return;
              setStreamUrl(fallbackResolved.url);
              setProtectionData(fallbackResolved.protectionData);
            })
            .catch((fallbackErr: unknown) => {
              if (cancelled) return;
              const msg =
                fallbackErr instanceof Error
                  ? fallbackErr.message
                  : "Stream currently unavailable in browser";
              setResolutionError(msg);
              setUnavailable(true);
              setLoading(false);
            });
          return;
        }

        const msg =
          err instanceof Error
            ? err.message
            : "Stream currently unavailable in browser";
        setResolutionError(msg);
        setUnavailable(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [channel, attempt, relay]);

  // Attach resolved stream to video element
  useEffect(() => {
    if (!streamUrl || unavailable) return;
    const video = videoRef.current;
    if (!video) return;
    attach(video, streamUrl, protectionData);
  }, [streamUrl, protectionData, attach, attempt, unavailable]);

  // Handle playback / CDN failures with relay-to-direct fallback
  useEffect(() => {
    if (playbackError) {
      if (channel.partner === "tataplay") {
        const msg = `${channel.name} requires an active Tata Play subscriber login to stream. Sign in with your registered mobile number.`;
        setResolutionError(msg);
        setUnavailable(true);
        setLoading(false);
        return;
      }

      if (sourceModeRef.current === "relay" && !fallbackInProgressRef.current) {
        console.warn(
          "[VzyPlayer] Playback error on relay, falling back to direct stream...",
          playbackError,
        );
        sourceModeRef.current = "direct";
        fallbackInProgressRef.current = true;
        setLoading(true);
        resolveVzyStream(channel, undefined, true)
          .then((resolved) => {
            setStreamUrl(resolved.url);
            setProtectionData(resolved.protectionData);
          })
          .catch((err: unknown) => {
            const msg =
              err instanceof Error
                ? err.message
                : "Stream currently unavailable in browser";
            setResolutionError(msg);
            setUnavailable(true);
            setLoading(false);
          });
        return;
      }
      setUnavailable(true);
      setLoading(false);
    }
  }, [playbackError, channel]);

  // Stalled relay timer: if relay takes >8.5s without readyState >= 2, fallback to direct
  useEffect(() => {
    if (
      !relay ||
      sourceModeRef.current !== "relay" ||
      unavailable ||
      !streamUrl
    ) {
      return undefined;
    }
    const timer = setTimeout(() => {
      if (
        sourceModeRef.current === "relay" &&
        !fallbackInProgressRef.current &&
        !playingRef.current &&
        (!videoRef.current || videoRef.current.readyState < 2)
      ) {
        console.warn(
          "[VzyPlayer] Relay stream stalled (readyState < 2), falling back to direct stream...",
        );
        sourceModeRef.current = "direct";
        fallbackInProgressRef.current = true;
        setLoading(true);
        resolveVzyStream(channel, undefined, true)
          .then((resolved) => {
            setStreamUrl(resolved.url);
            setProtectionData(resolved.protectionData);
          })
          .catch((err: unknown) => {
            const msg =
              err instanceof Error
                ? err.message
                : "Stream currently unavailable in browser";
            setResolutionError(msg);
            setUnavailable(true);
            setLoading(false);
          });
      }
    }, 3500);
    return () => clearTimeout(timer);
  }, [streamUrl, relay, channel, unavailable]);

  const retry = useCallback(() => {
    setUnavailable(false);
    setLoading(true);
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
      } else if (["ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) {
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
                {resolutionError ||
                  playbackError?.message ||
                  "This channel's stream could not be loaded in the browser player."}
              </p>
              <p className="text-xs text-white/40">
                {channel.partner === "tataplay"
                  ? `${channel.name} requires Tata Play subscriber authorization on Akamai CDN. Sign in with your registered mobile number to unlock.`
                  : channel.partner
                    ? `${channel.name} is powered by ${channel.partner}. Connect a Watcho/VZY account or try another channel.`
                    : "Try again, use Previous / Next to switch channels, or open the channel on VZY."}
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
              <Button
                size="sm"
                variant="outline"
                icon={<KeyRound size={15} />}
                onClick={() => setAuthModalOpen(true)}
              >
                {channel.partner === "tataplay"
                  ? hasTataPlayAuth
                    ? "Switch Tata Play Account"
                    : "Sign in with Tata Play"
                  : hasAuth
                    ? "Switch Account"
                    : "Unlock with VZY Account"}
              </Button>
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
              {channel.watchUrl && (
                <a
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 text-sm font-semibold text-text-primary transition-colors hover:border-white/30 hover:bg-white/10"
                  href={channel.watchUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} />
                  Open on VZY
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
          onLoadedData={() => setLoading(false)}
          onCanPlay={() => setLoading(false)}
          onPlay={() => setLoading(false)}
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
              VZY Live
            </p>
            <h2 className="flex items-center gap-3 text-xl font-bold sm:text-3xl">
              {channel.logo ? (
                <img
                  src={channel.logo}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                  className="h-8 w-8 shrink-0 rounded object-contain sm:h-10 sm:w-10 bg-white/5"
                />
              ) : null}
              <span className="truncate">{channel.name}</span>
            </h2>
            <p className="mt-1 text-sm text-white/60">
              {channel.category}
              {channel.language ? ` · ${channel.language}` : ""}
              {channel.lcn !== null ? ` · LCN ${channel.lcn}` : ""}
              {channel.partner ? ` · ${channel.partner}` : ""}
              {channel.drmType ? ` · DRM: ${channel.drmType}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <IconButton
              label="Account Settings"
              variant="ghost"
              onClick={() => setAuthModalOpen(true)}
            >
              <KeyRound size={18} />
            </IconButton>
            <IconButton
              ref={closeRef}
              label="Close player"
              variant="solid"
              onClick={closePlayer}
            >
              <X size={20} />
            </IconButton>
          </div>
        </div>

        <div className="pointer-events-auto space-y-3">
          <p className="text-sm text-white/60">
            {unavailable
              ? "This channel is currently unavailable — use Previous / Next to try another channel."
              : channel.playable
                ? "Playing clear live stream directly in NuvioTV."
                : streamUrl
                  ? "Playing live stream directly in NuvioTV."
                  : "Connecting to live stream…"}
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
            <Button
              size="sm"
              variant="outline"
              icon={<KeyRound size={15} />}
              onClick={() => setAuthModalOpen(true)}
            >
              {channel.partner === "tataplay"
                ? hasTataPlayAuth
                  ? "Tata Play ID"
                  : "Sign In"
                : hasAuth
                  ? "Account"
                  : "Sign In"}
            </Button>
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

      {channel.partner === "tataplay" ? (
        <TataPlayAuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={() => {
            setAttempt((a) => a + 1);
          }}
        />
      ) : (
        <VzyAuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={() => {
            setAttempt((a) => a + 1);
          }}
        />
      )}
    </div>
  );
}
