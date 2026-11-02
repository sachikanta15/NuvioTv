import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SearchState {
  recent: string[];
  addRecent: (term: string) => void;
  removeRecent: (term: string) => void;
  clearRecent: () => void;
}

const MAX_RECENT = 10;

export const useSearchHistory = create<SearchState>()(
  persist(
    (set) => ({
      recent: [],
      addRecent: (term) =>
        set((state) => {
          const value = term.trim();
          if (value.length < 2) return state;
          return {
            recent: [value, ...state.recent.filter((entry) => entry.toLowerCase() !== value.toLowerCase())].slice(
              0,
              MAX_RECENT,
            ),
          };
        }),
      removeRecent: (term) =>
        set((state) => ({ recent: state.recent.filter((entry) => entry !== term) })),
      clearRecent: () => set({ recent: [] }),
    }),
    { name: "nuvio.search.v1", version: 1 },
  ),
);
