import { useCallback, useEffect, useRef, useState } from "react";
import type HlsJs from "hls.js";
import { isDashUrl, isHlsUrl } from "@/lib/media-type";
import {
  DASH_EVENTS,
  loadDashModule,
  type DashErrorPayload,
  type DashPlayer,
  type DashQualityChange,
  type DashTrack,
} from "@/lib/dash";
import {
  isJioTvDirectSource,
  JioTvDirectLoader,
} from "@/lib/jiotv-direct";
import {
  type PlaybackError,
  SOURCE_INVALID_CONTENT,
  TORRENT_SOURCE_ERROR,
  describeHlsError,
  isTorrentSource,
  playbackError,
} from "@/lib/playback-errors";
import { isAlreadyProxied, streamProxyUrl } from "@/lib/stream-proxy";

export interface QualityLevel {
  index: number;
  label: string;
  height: number;
}

export interface AudioTrack {
  index: number;
  label: string;
  lang: string;
}

interface UseHlsResult {
  levels: QualityLevel[];
  currentLevel: number;
  setLevel: (index: number) => void;
  audioTracks: AudioTrack[];
  currentAudioTrack: number;
  setAudioTrack: (index: number) => void;
  attach: (video: HTMLVideoElement | null, src: string) => void;
  error: PlaybackError | null;
  isHls: boolean;
  /** True while the player is recovering from a failed startup. */
  recovering: boolean;
  /** Re-attaches the current source after a failure. */
  retry: () => void;
}

/** The TV client retries a failed startup twice before surfacing the error. */
const MAX_STARTUP_AUTO_RETRIES = 2;
const RETRY_DELAY_MS = 1500;
/** A single media recovery attempt before the error is surfaced. */
const MAX_MEDIA_RECOVERIES = 1;

const isNativeHls = () =>
  typeof document !== "undefined" &&
  !!document.createElement("video").canPlayType("application/vnd.apple.mpegurl");

/** hls.js is heavy, so it is only fetched the first time an HLS stream plays. */
let hlsModule: Promise<typeof import("hls.js")> | null = null;
function loadHls(): Promise<typeof import("hls.js")> {
  if (!hlsModule) hlsModule = import("hls.js");
  return hlsModule;
}

/**
 * Reads the head of a stream to tell an HLS playlist apart from an error page
 * or a plain media file, mirroring the TV client's network mime probe.
 */
async function probeSource(url: string): Promise<"hls" | "html" | "media" | "unknown"> {
  try {
    const response = await fetch(url, { headers: { Range: "bytes=0-1023" } });
    if (!response.ok) return "unknown";
    const reader = response.body?.getReader();
    if (!reader) return "unknown";
    const { value } = await reader.read();
    // Stop pulling the body — only the first chunk is needed.
    await reader.cancel().catch(() => undefined);
    const head = new TextDecoder()
      .decode(value ?? new Uint8Array())
      .trimStart()
      .slice(0, 256)
      .toLowerCase();
    if (head.startsWith("#extm3u")) return "hls";
    if (head.startsWith("<!doctype html") || head.startsWith("<html")) return "html";
    return "media";
  } catch {
    return "unknown";
  }
}

/**
 * Attaches a media source to a video element, using hls.js for HLS manifests
 * (falls back to native HLS on Safari).
 */
export function useHls(): UseHlsResult {
  const instanceRef = useRef<HlsJs | null>(null);
  const dashRef = useRef<DashPlayer | null>(null);
  const dashTracksRef = useRef<DashTrack[]>([]);
  const generation = useRef(0);
  const retryTimer = useRef<number | null>(null);
  const attempts = useRef(0);
  const mediaRecoveries = useRef(0);
  const probed = useRef(false);
  const proxyRetried = useRef(false);
  const sourceRef = useRef<{ video: HTMLVideoElement | null; src: string } | null>(null);

  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(-1);
  const [error, setError] = useState<PlaybackError | null>(null);
  const [isHls, setIsHls] = useState(false);
  const [recovering, setRecovering] = useState(false);

  const detach = useCallback(() => {
    instanceRef.current?.destroy();
    instanceRef.current = null;
    dashRef.current?.reset();
    dashRef.current = null;
    dashTracksRef.current = [];
    if (retryTimer.current !== null) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, []);

  const start = useCallback(
    (video: HTMLVideoElement | null, src: string, token: number) => {
      if (token !== generation.current) return;
      detach();

      if (!video || !src) return;

      // Torrent links need the P2P/debrid stack that only the TV app has.
      if (isTorrentSource(src)) {
        setError(playbackError(TORRENT_SOURCE_ERROR));
        return;
      }

      // DASH (.mpd) — dash.js, because <video> only handles HLS and MP4.
      if (isDashUrl(src)) {
        void loadDashModule()
          .then((module) => {
            if (token !== generation.current || !video) return;
            const player = module.MediaPlayer().create();
            dashRef.current = player;
            player.updateSettings({
              streaming: {
                abr: { autoSwitchBitrate: { video: true, audio: true } },
              },
            });

            player.on(DASH_EVENTS.streamInitialized, () => {
              if (token !== generation.current) return;
              const bitrates = player.getBitrateInfoListFor("video") ?? [];
              const parsed: QualityLevel[] = bitrates
                .map((info, index) => ({
                  index: info.qualityIndex ?? index,
                  height: info.height ?? 0,
                  label: info.height
                    ? `${info.height}p`
                    : `${Math.round((info.bitrate ?? 0) / 1000)}k`,
                }))
                .sort((a, b) => b.height - a.height);
              setLevels(parsed);

              const tracks = player.getTracksFor("audio") ?? [];
              dashTracksRef.current = tracks;
              setAudioTracks(
                tracks.map((track, index) => ({
                  index: track.index ?? index,
                  label:
                    track.labels?.[0]?.text ??
                    track.lang ??
                    `Audio ${index + 1}`,
                  lang: track.lang ?? "",
                })),
              );
              setCurrentAudioTrack(player.getCurrentTrackFor("audio")?.index ?? -1);
              setCurrentLevel(-1);
              setRecovering(false);
              video.play().catch(() => undefined);
            });

            player.on(DASH_EVENTS.qualityChangeRendered, (payload) => {
              const data = payload as DashQualityChange;
              if (data?.mediaType && data.mediaType !== "video") return;
              setCurrentLevel(
                player.isAutoSwitchQualityFor?.("video") ? -1 : data?.newQuality ?? -1,
              );
            });

            player.on(DASH_EVENTS.error, (payload) => {
              if (token !== generation.current) return;
              const data = payload as DashErrorPayload;
              const message =
                typeof data?.error === "string" ? data.error : data?.error?.message;
              setError(
                playbackError(
                  message ?? "DASH playback failed. Try a different source.",
                  true,
                ),
              );
            });

            player.initialize(video, src, false);
          })
          .catch(() => {
            if (token !== generation.current) return;
            setError(playbackError("DASH playback is not supported in this browser."));
          });
        return;
      }

      // Progressive MP4 / WebM — the browser handles it directly.
      if (!isHlsUrl(src)) {
        video.src = src;
        video.load();
        return;
      }

      void loadHls().then((module) => {
        const Hls = module.default;
        if (token !== generation.current || !video) return;

        // Safari (and iOS) can play HLS natively without hls.js.
        if (!Hls.isSupported()) {
          if (isNativeHls()) {
            video.src = src;
            video.load();
          } else {
            setError(playbackError("HLS playback is not supported in this browser."));
          }
          return;
        }

        // When the source is the JioTV direct pipeline, the request layers
        // run through the custom loader that decrypts CENC segments in the
        // browser; any other source keeps the stock loader stack.
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          ...(isJioTvDirectSource(src) ? { loader: JioTvDirectLoader } : {}),
        });
        instanceRef.current = hls;
        hls.attachMedia(video);
        hls.loadSource(src);

        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          if (token !== generation.current) return;
          setRecovering(false);
          const parsed: QualityLevel[] = data.levels
            .map((level, index) => ({
              index,
              height: level.height || 0,
              label: level.height
                ? `${level.height}p`
                : `${Math.round((level.bitrate ?? 0) / 1000)}k`,
            }))
            .sort((a, b) => b.height - a.height);
          setLevels(parsed);
          const tracks: AudioTrack[] = (hls.audioTracks ?? []).map((track, index) => ({
            index,
            label: track.name || track.lang || `Audio ${index + 1}`,
            lang: track.lang || "",
          }));
          setAudioTracks(tracks);
          setCurrentAudioTrack(hls.audioTrack ?? -1);
        });

        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
          setCurrentAudioTrack(data.id);
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
          setCurrentLevel(hls.autoLevelEnabled ? -1 : data.level);
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (token !== generation.current) return;
          if (!data.fatal) return;

          const jioDirect = isJioTvDirectSource(src);

          // CORS-blocked manifests/segments work on the TV but fail in hls.js.
          // Retry once through the same-origin media proxy. JioTV's direct
          // pipeline is already same-origin, so it never needs this retry.
          if (
            data.type === Hls.ErrorTypes.NETWORK_ERROR &&
            !jioDirect &&
            !proxyRetried.current &&
            !isAlreadyProxied(src)
          ) {
            proxyRetried.current = true;
            setRecovering(true);
            setError(null);
            start(video, streamProxyUrl(src), token);
            return;
          }

          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            // One media recovery attempt, then the error is surfaced.
            if (mediaRecoveries.current < MAX_MEDIA_RECOVERIES) {
              mediaRecoveries.current += 1;
              hls.recoverMediaError();
              return;
            }
          }

          // Automatic startup recovery, like the TV client's retry ladder.
          if (attempts.current < MAX_STARTUP_AUTO_RETRIES) {
            attempts.current += 1;
            setRecovering(true);
            retryTimer.current = window.setTimeout(() => {
              retryTimer.current = null;
              if (token !== generation.current) return;
              setRecovering(false);
              start(video, src, token);
            }, RETRY_DELAY_MS);
            return;
          }

          void (async () => {
            if (jioDirect || probed.current) {
              setError(describeHlsError(data));
              detach();
              return;
            }
            probed.current = true;
            // Probe the source so an error page is reported as such, and a
            // URL misdetected as HLS is played as a plain media file.
            const probe = await probeSource(src);
            if (token !== generation.current) return;
            if (probe === "html") {
              setError(playbackError(SOURCE_INVALID_CONTENT));
              detach();
              return;
            }
            if (probe === "media") {
              detach();
              video.src = src;
              video.load();
              return;
            }
            setError(describeHlsError(data));
            detach();
          })();
        });
      });
    },
    [detach],
  );

  const attach = useCallback(
    (video: HTMLVideoElement | null, src: string) => {
      generation.current += 1;
      const token = generation.current;
      detach();
      setLevels([]);
      setCurrentLevel(-1);
      setAudioTracks([]);
      setCurrentAudioTrack(-1);
      setError(null);
      setRecovering(false);
      attempts.current = 0;
      mediaRecoveries.current = 0;
      probed.current = false;
      proxyRetried.current = false;
      sourceRef.current = { video, src };
      setIsHls(isHlsUrl(src));
      start(video, src, token);
    },
    [detach, start],
  );

  const retry = useCallback(() => {
    const current = sourceRef.current;
    if (!current) return;
    attach(current.video, current.src);
  }, [attach]);

  const setLevel = useCallback((index: number) => {
    setCurrentLevel(index);
    if (instanceRef.current) instanceRef.current.currentLevel = index;
    if (dashRef.current) {
      const player = dashRef.current;
      if (index === -1) {
        player.setAutoSwitchQualityFor?.("video", true);
      } else {
        player.setAutoSwitchQualityFor?.("video", false);
        player.setQualityFor("video", index);
      }
    }
  }, []);

  const setAudioTrack = useCallback((index: number) => {
    setCurrentAudioTrack(index);
    if (instanceRef.current) instanceRef.current.audioTrack = index;
    if (dashRef.current) {
      const track = dashTracksRef.current.find((entry) => entry.index === index);
      if (track) dashRef.current.setCurrentTrack(track);
    }
  }, []);

  useEffect(() => detach, [detach]);

  return {
    levels,
    currentLevel,
    setLevel,
    audioTracks,
    currentAudioTrack,
    setAudioTrack,
    attach,
    error,
    isHls,
    recovering,
    retry,
  };
}
