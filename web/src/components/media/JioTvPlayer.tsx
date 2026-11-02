import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Maximize2,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { useHls } from "@/hooks/useHls";
import type { JioTvChannel } from "@/lib/jiotv";
import { buildJioTvPlaylistUrl, loadJioTvChannelDetail } from "@/lib/jiotv";
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
 * Playback runs through the shared CENC pipeline in
 * `src/lib/jiotv-direct.ts`: the browser fetches the channel's DASH manifest
 * and segments directly from the CDN and decrypts them with WebCrypto (the
 * Worker route is used when server-side egress is allowed). There is no
 * embed-iframe fallback; blocked or unsupported channels show an unavailable
 * state with a provider link instead.
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
  const [controlsVisible, setControlsVisible] = useState(true);
  const [activity, setActivity] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { attach, error: playbackError } = useHls();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPlaylistUrl(null);
    setUnavailable(false);
    loadJioTvChannelDetail(channel)
      .then((detail) => {
        if (cancelled) return;
        const url = buildJioTvPlaylistUrl(detail);
        if (url) setPlaylistUrl(url);
        else {
          setUnavailable(true);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUnavailable(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [channel, attempt]);

  useEffect(() => {
    if (playlistUrl) attach(videoRef.current, playlistUrl);
  }, [playlistUrl, attach]);

  // Direct playback failed (CDN blocked / key missing) — show the error state.
  useEffect(() => {
    if (playbackError) {
      setUnavailable(true);
      setLoading(false);
    }
  }, [playbackError]);

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
    if (!controlsVisible || loading) return undefined;
    const timer = setTimeout(() => setControlsVisible(false), 4500);
    return () => clearTimeout(timer);
  }, [controlsVisible, activity, loading]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
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
  }, [closePlayer, onNext, onPrevious, revealControls]);

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
          onPlaying={() => setLoading(false)}
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
