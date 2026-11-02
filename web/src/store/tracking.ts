import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface TraktConnection {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  username: string;
  avatar?: string | null;
  connectedAt: number;
}

export interface MdblistConnection {
  apiKey: string;
  username: string;
  connectedAt: number;
}

export interface SimklConnection {
  clientId: string;
  accessToken: string;
  username: string;
  connectedAt: number;
}

interface TrackingState {
  trakt: TraktConnection | null;
  mdblist: MdblistConnection | null;
  simkl: SimklConnection | null;
  /** Show Trakt scrobbling while playback runs. */
  scrobbleEnabled: boolean;
  lastSyncAt: number | null;
  setTrakt: (connection: TraktConnection | null) => void;
  setMdblist: (connection: MdblistConnection | null) => void;
  setSimkl: (connection: SimklConnection | null) => void;
  setScrobbleEnabled: (value: boolean) => void;
  markSynced: () => void;
  disconnectAll: () => void;
}

export const useTracking = create<TrackingState>()(
  persist(
    (set) => ({
      trakt: null,
      mdblist: null,
      simkl: null,
      scrobbleEnabled: true,
      lastSyncAt: null,
      setTrakt: (trakt) => set({ trakt }),
      setMdblist: (mdblist) => set({ mdblist }),
      setSimkl: (simkl) => set({ simkl }),
      setScrobbleEnabled: (scrobbleEnabled) => set({ scrobbleEnabled }),
      markSynced: () => set({ lastSyncAt: Date.now() }),
      disconnectAll: () => set({ trakt: null, mdblist: null, simkl: null, lastSyncAt: null }),
    }),
    { name: "nuvio.tracking.v1", version: 1 },
  ),
);

/** A connected Trakt account whose token has not expired. */
export function activeTrakt(state: TrackingState): TraktConnection | null {
  const trakt = state.trakt;
  if (!trakt?.accessToken || !trakt.clientId) return null;
  if (trakt.expiresAt > 0 && trakt.expiresAt < Date.now()) return null;
  return trakt;
}
