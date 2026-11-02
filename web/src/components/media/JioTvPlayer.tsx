import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Maximize2, X } from "lucide-react";
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
 * Preferred path: the Worker at `/jiotv-api` decrypts the channel's
 * CENC-protected DASH stream into plain HLS, which hls.js plays directly.
 * When the channel exposes no decryptable source, or playback fails, the
 * JioTV embed player inside an iframe is used as a fallback.
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
  const [embedOnly, setEmbedOnly] = useState(false);
  const { attach, error: playbackError } = useHls();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPlaylistUrl(null);
    setEmbedOnly(false);
    loadJioTvChannelDetail(channel)
      .then((detail) => {
        if (cancelled) return;
        const url = buildJioTvPlaylistUrl(detail);
        if (url) setPlaylistUrl(url);
        else setEmbedOnly(true);
      })
      .catch(() => {
        if (!cancelled) setEmbedOnly(true);
      });
    return () => {
      cancelled = true;
    };
  }, [channel]);

  useEffect(() => {
    if (playlistUrl) attach(videoRef.current, playlistUrl);
  }, [playlistUrl, attach]);

  // Direct playback failed after retries — fall back to the embed player.
  useEffect(() => {
    if (playbackError) setEmbedOnly(true);
  }, [playbackError]);

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
      {embedOnly ? (
        <iframe
          key={channel.embedUrl}
          src={channel.embedUrl}
          title={`${channel.name} live stream`}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="origin"
          className="h-full w-full border-0 bg-black"
          onLoad={() => setLoading(false)}
        />
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

      {loading && (
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
            {embedOnly
              ? "Playing via the JioTV live embed player — use the controls inside the player for quality and audio language."
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
