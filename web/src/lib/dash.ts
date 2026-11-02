/**
 * Lazy DASH.js bridge.
 *
 * The Android TV client uses Media3, which plays DASH (`.mpd`) natively. The
 * browser's `<video>` element does not, so the web player loads dash.js only
 * when a stream is actually DASH. Keeping it behind a dynamic import keeps the
 * initial bundle small, the same way hls.js is loaded on demand.
 */

export interface DashBitrateInfo {
  qualityIndex?: number;
  width?: number;
  height?: number;
  bitrate?: number;
}

export interface DashTrack {
  index?: number;
  lang?: string;
  labels?: { text?: string }[];
  [key: string]: unknown;
}

export interface DashErrorPayload {
  error?: { message?: string; code?: number } | string;
}

export interface DashQualityChange {
  mediaType?: string;
  newQuality?: number;
  oldQuality?: number;
}

export interface DashPlayer {
  initialize: (video: HTMLVideoElement, src: string, autoPlay?: boolean) => void;
  reset: () => void;
  on: (event: string, handler: (payload: unknown) => void) => void;
  off?: (event: string, handler: (payload: unknown) => void) => void;
  getBitrateInfoListFor: (type: string) => DashBitrateInfo[];
  setQualityFor: (type: string, index: number) => void;
  setAutoSwitchQualityFor?: (type: string, value: boolean) => void;
  isAutoSwitchQualityFor?: (type: string) => boolean;
  getTracksFor: (type: string) => DashTrack[];
  getCurrentTrackFor: (type: string) => DashTrack | null;
  setCurrentTrack: (track: DashTrack) => void;
  updateSettings: (settings: unknown) => void;
}

interface DashModule {
  MediaPlayer: () => { create: () => DashPlayer };
}

let modulePromise: Promise<DashModule> | null = null;

export function loadDashModule(): Promise<DashModule> {
  if (!modulePromise) {
    modulePromise = import("dashjs").then((mod) => {
      const resolved = (mod as unknown as { default?: DashModule }).default ?? (mod as unknown as DashModule);
      if (!resolved?.MediaPlayer) throw new Error("dash.js did not expose MediaPlayer");
      return resolved;
    });
  }
  return modulePromise;
}

/** Dash.js event names (stable string values). */
export const DASH_EVENTS = {
  streamInitialized: "streamInitialized",
  playbackMetaDataLoaded: "playbackMetaDataLoaded",
  qualityChangeRendered: "qualityChangeRendered",
  error: "error",
} as const;
