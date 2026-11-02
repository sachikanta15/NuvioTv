import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LibraryItem, LibraryList, MetaPreview, WatchProgress, WatchedItem } from "@/types";
import { useProfiles } from "./profiles";

export const WATCHLIST_ID = "watchlist";
export const FAVORITES_ID = "favorites";

export const BUILT_IN_LISTS: LibraryList[] = [
  { id: WATCHLIST_ID, name: "Watchlist", icon: "bookmark", builtIn: true },
  { id: FAVORITES_ID, name: "Favorites", icon: "heart", builtIn: true },
];

const COMPLETED_THRESHOLD = 0.92;
const STARTED_THRESHOLD = 0.01;

interface LibraryState {
  lists: LibraryList[];
  items: Record<string, LibraryItem[]>;
  progress: Record<string, Record<string, WatchProgress>>;
  watched: Record<string, Record<string, WatchedItem>>;
  watchedVideos: Record<string, Record<string, boolean>>;
  lastPlayedVideoByContent: Record<string, Record<string, string>>;

  addToList: (meta: MetaPreview, listId?: string) => void;
  removeFromList: (contentId: string, listId?: string) => void;
  toggleList: (meta: MetaPreview, listId?: string) => boolean;
  isInList: (contentId: string, listId?: string) => boolean;
  listsFor: (contentId: string) => string[];
  createList: (name: string, icon?: string) => LibraryList;
  deleteList: (id: string) => void;
  renameList: (id: string, name: string) => void;

  setProgress: (progress: WatchProgress) => void;
  clearProgress: (contentId: string) => void;
  getProgress: (contentId: string) => WatchProgress | undefined;
  markWatched: (meta: MetaPreview, watched?: boolean) => void;
  isWatched: (contentId: string) => boolean;
  markVideoWatched: (videoId: string, watched?: boolean) => void;
  isVideoWatched: (videoId: string) => boolean;
  clearHistory: () => void;

  rememberLastVideo: (contentId: string, videoId: string) => void;
  lastVideoFor: (contentId: string) => string | undefined;
}

const activeProfileId = (): string => useProfiles.getState().activeProfileId ?? "default";

function emptyProfileMap<T>(): Record<string, T> {
  return {};
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      lists: BUILT_IN_LISTS,
      items: {},
      progress: {},
      watched: {},
      watchedVideos: {},
      lastPlayedVideoByContent: {},

      addToList: (meta, listId = WATCHLIST_ID) =>
        set((state) => {
          const profile = activeProfileId();
          const existing = state.items[profile] ?? [];
          if (existing.some((item) => item.id === meta.id && item.listId === listId)) return state;
          const next: LibraryItem = { id: meta.id, meta, addedAt: Date.now(), listId };
          return { items: { ...state.items, [profile]: [next, ...existing] } };
        }),

      removeFromList: (contentId, listId = WATCHLIST_ID) =>
        set((state) => {
          const profile = activeProfileId();
          const existing = state.items[profile] ?? [];
          return {
            items: {
              ...state.items,
              [profile]: existing.filter(
                (item) => !(item.id === contentId && item.listId === listId),
              ),
            },
          };
        }),

      toggleList: (meta, listId = WATCHLIST_ID) => {
        const present = get().isInList(meta.id, listId);
        if (present) get().removeFromList(meta.id, listId);
        else get().addToList(meta, listId);
        return !present;
      },

      isInList: (contentId, listId = WATCHLIST_ID) =>
        (get().items[activeProfileId()] ?? []).some(
          (item) => item.id === contentId && item.listId === listId,
        ),

      listsFor: (contentId) =>
        (get().items[activeProfileId()] ?? [])
          .filter((item) => item.id === contentId)
          .map((item) => item.listId),

      createList: (name, icon = "list") => {
        const list: LibraryList = {
          id: `list_${Date.now().toString(36)}`,
          name,
          icon,
          builtIn: false,
        };
        set((state) => ({ lists: [...state.lists, list] }));
        return list;
      },

      deleteList: (id) =>
        set((state) => ({
          lists: state.lists.filter((list) => list.id !== id || list.builtIn),
          items: Object.fromEntries(
            Object.entries(state.items).map(([profile, items]) => [
              profile,
              items.filter((item) => item.listId !== id),
            ]),
          ),
        })),

      renameList: (id, name) =>
        set((state) => ({
          lists: state.lists.map((list) => (list.id === id ? { ...list, name } : list)),
        })),

      setProgress: (progress) =>
        set((state) => {
          const profile = activeProfileId();
          const forProfile = { ...(state.progress[profile] ?? {}) };
          const ratio = progress.duration > 0 ? progress.position / progress.duration : 0;
          if (ratio >= COMPLETED_THRESHOLD) {
            delete forProfile[progress.contentId];
            const watchedForProfile = { ...(state.watched[profile] ?? {}) };
            watchedForProfile[progress.contentId] = {
              contentId: progress.contentId,
              contentType: progress.contentType,
              name: progress.name,
              poster: progress.poster,
              watchedAt: Date.now(),
            };
            return {
              progress: { ...state.progress, [profile]: forProfile },
              watched: { ...state.watched, [profile]: watchedForProfile },
              lastPlayedVideoByContent: {
                ...state.lastPlayedVideoByContent,
                [profile]: {
                  ...(state.lastPlayedVideoByContent[profile] ?? {}),
                  [progress.contentId]: progress.videoId,
                },
              },
            };
          }
          if (ratio <= STARTED_THRESHOLD) {
            delete forProfile[progress.contentId];
          } else {
            forProfile[progress.contentId] = { ...progress, lastWatched: Date.now() };
          }
          return {
            progress: { ...state.progress, [profile]: forProfile },
            lastPlayedVideoByContent: {
              ...state.lastPlayedVideoByContent,
              [profile]: {
                ...(state.lastPlayedVideoByContent[profile] ?? {}),
                [progress.contentId]: progress.videoId,
              },
            },
          };
        }),

      clearProgress: (contentId) =>
        set((state) => {
          const profile = activeProfileId();
          const forProfile = { ...(state.progress[profile] ?? {}) };
          delete forProfile[contentId];
          return { progress: { ...state.progress, [profile]: forProfile } };
        }),

      getProgress: (contentId) => (get().progress[activeProfileId()] ?? {})[contentId],

      markWatched: (meta, watched = true) =>
        set((state) => {
          const profile = activeProfileId();
          const watchedForProfile = { ...(state.watched[profile] ?? {}) };
          if (watched) {
            watchedForProfile[meta.id] = {
              contentId: meta.id,
              contentType: meta.type,
              name: meta.name,
              poster: meta.poster ?? null,
              watchedAt: Date.now(),
            };
          } else {
            delete watchedForProfile[meta.id];
          }
          const progressForProfile = { ...(state.progress[profile] ?? {}) };
          if (watched) delete progressForProfile[meta.id];
          return {
            watched: { ...state.watched, [profile]: watchedForProfile },
            progress: { ...state.progress, [profile]: progressForProfile },
          };
        }),

      isWatched: (contentId) => !!((get().watched[activeProfileId()] ?? {})[contentId]),

      markVideoWatched: (videoId, watched = true) =>
        set((state) => {
          const profile = activeProfileId();
          const forProfile = { ...(state.watchedVideos[profile] ?? {}) };
          if (watched) forProfile[videoId] = true;
          else delete forProfile[videoId];
          return { watchedVideos: { ...state.watchedVideos, [profile]: forProfile } };
        }),

      isVideoWatched: (videoId) => !!((get().watchedVideos[activeProfileId()] ?? {})[videoId]),

      clearHistory: () =>
        set((state) => ({
          progress: { ...state.progress, [activeProfileId()]: emptyProfileMap<WatchProgress>() },
        })),

      rememberLastVideo: (contentId, videoId) =>
        set((state) => {
          const profile = activeProfileId();
          return {
            lastPlayedVideoByContent: {
              ...state.lastPlayedVideoByContent,
              [profile]: { ...(state.lastPlayedVideoByContent[profile] ?? {}), [contentId]: videoId },
            },
          };
        }),

      lastVideoFor: (contentId) => (get().lastPlayedVideoByContent[activeProfileId()] ?? {})[contentId],
    }),
    { name: "nuvio.library.v1", version: 1 },
  ),
);

/** Current profile's library items, newest first. */
export function selectLibraryItems(state: LibraryState): LibraryItem[] {
  return state.items[activeProfileId()] ?? [];
}

export function selectContinueWatching(state: LibraryState): WatchProgress[] {
  return Object.values(state.progress[activeProfileId()] ?? {}).sort(
    (a, b) => b.lastWatched - a.lastWatched,
  );
}

export function selectWatched(state: LibraryState): WatchedItem[] {
  return Object.values(state.watched[activeProfileId()] ?? {}).sort(
    (a, b) => b.watchedAt - a.watchedAt,
  );
}
