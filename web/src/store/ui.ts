import { create } from "zustand";
import type { Toast } from "@/types";
import { uid } from "@/lib/id";

interface UiState {
  toasts: Toast[];
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  searchOpen: boolean;
  pushToast: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: string) => void;
  setSidebarCollapsed: (value: boolean) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (value: boolean) => void;
  setSearchOpen: (value: boolean) => void;
}

const SIDEBAR_STORAGE_KEY = "nuvio.sidebarCollapsed";

function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistSidebarCollapsed(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Storage can be blocked in private mode; the in-memory state still works.
  }
}

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  sidebarCollapsed: readSidebarCollapsed(),
  mobileNavOpen: false,
  searchOpen: false,
  pushToast: (message, tone = "info") => {
    const toast: Toast = { id: uid("toast"), message, tone };
    set((state) => ({ toasts: [...state.toasts, toast] }));
    setTimeout(() => get().dismissToast(toast.id), 4000);
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  setSidebarCollapsed: (value) => {
    persistSidebarCollapsed(value);
    set({ sidebarCollapsed: value });
  },
  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      persistSidebarCollapsed(next);
      return { sidebarCollapsed: next };
    }),
  setMobileNavOpen: (value) => set({ mobileNavOpen: value }),
  setSearchOpen: (value) => set({ searchOpen: value }),
}));
