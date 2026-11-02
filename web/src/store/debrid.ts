import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DebridProvider = "none" | "realdebrid" | "premiumize";

interface DebridState {
  provider: DebridProvider;
  apiKey: string;
  /** Resolve torrents automatically when a source is picked. */
  autoResolve: boolean;
  setProvider: (provider: DebridProvider) => void;
  setApiKey: (apiKey: string) => void;
  setAutoResolve: (value: boolean) => void;
  disconnect: () => void;
}

export const useDebrid = create<DebridState>()(
  persist(
    (set) => ({
      provider: "none",
      apiKey: "",
      autoResolve: true,
      setProvider: (provider) => set({ provider }),
      setApiKey: (apiKey) => set({ apiKey: apiKey.trim() }),
      setAutoResolve: (autoResolve) => set({ autoResolve }),
      disconnect: () => set({ provider: "none", apiKey: "" }),
    }),
    { name: "nuvio.debrid.v1", version: 1 },
  ),
);

export function debridConfigured(state: DebridState): boolean {
  return state.provider !== "none" && state.apiKey.trim().length > 0;
}

export const DEBRID_PROVIDER_LABELS: Record<DebridProvider, string> = {
  none: "None",
  realdebrid: "Real-Debrid",
  premiumize: "Premiumize",
};

export const DEBRID_SIGNUP_URLS: Record<Exclude<DebridProvider, "none">, string> = {
  realdebrid: "https://real-debrid.com/apitoken",
  premiumize: "https://www.premiumize.me/account",
};
