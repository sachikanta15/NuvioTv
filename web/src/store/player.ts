import { create } from "zustand";
import type { MetaDetail, MetaVideo, PlaybackSource } from "@/types";

export interface PlaybackRequest {
  content: MetaDetail;
  video?: MetaVideo | null;
  source: PlaybackSource;
  /** Wall-clock start time (ms) for the session. */
  startedAt: number;
  startFromBeginning?: boolean;
}

interface PlayerState {
  request: PlaybackRequest | null;
  /** Fullscreen player visibility. */
  active: boolean;
  start: (request: PlaybackRequest) => void;
  stop: () => void;
}

export const usePlayer = create<PlayerState>((set) => ({
  request: null,
  active: false,
  start: (request) => set({ request, active: true }),
  stop: () => set({ active: false }),
}));

/** The next episode in a season/season-order sequence, if any. */
export function nextEpisode(
  content: MetaDetail,
  current: MetaVideo | null | undefined,
): MetaVideo | null {
  if (!current) return null;
  const episodes = (content.videos ?? [])
    .filter((video) => video.season != null && video.episode != null && (video.season ?? 0) > 0)
    .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
  const index = episodes.findIndex((video) => video.id === current.id);
  if (index < 0 || index >= episodes.length - 1) return null;
  return episodes[index + 1];
}
