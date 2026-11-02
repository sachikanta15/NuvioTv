import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { InstalledAddon } from "@/types";
import { DEFAULT_ADDON_URLS } from "@/lib/addon-registry";
import { parseAddonInput } from "@/lib/addon-input";
import { createInstalledAddon, fetchManifest, normalizeTransportUrl } from "@/lib/stremio";

export interface CatalogToggle {
  /** `${transportUrl}|${type}|${catalogId}` */
  key: string;
  enabled: boolean;
}

interface AddonsState {
  addons: InstalledAddon[];
  disabledCatalogs: string[];
  catalogOrder: string[];
  seeded: boolean;
  installing: string[];
  errors: Record<string, string>;

  initDefaults: () => Promise<void>;
  install: (urls: string[]) => Promise<{ installed: string[]; failed: { url: string; error: string }[] }>;
  importText: (text: string) => Promise<{ installed: string[]; failed: { url: string; error: string }[]; messages: string[] }>;
  remove: (transportUrl: string) => void;
  toggle: (transportUrl: string) => void;
  move: (transportUrl: string, direction: -1 | 1) => void;
  setDisplayName: (transportUrl: string, name: string) => void;
  setCatalogEnabled: (key: string, enabled: boolean) => void;
  isCatalogEnabled: (key: string) => boolean;
  setCatalogOrder: (order: string[]) => void;
  refresh: (transportUrl: string) => Promise<void>;
  has: (transportUrl: string) => boolean;
  /**
   * Reconciles the local list with the account's list, mirroring
   * `AddonRepositoryImpl.reconcileWithRemoteAddonUrls` on Android.
   */
  restoreFromRemote: (
    remote: { url: string; name?: string; enabled: boolean }[],
  ) => Promise<{ restored: number; preserved: boolean }>;
}

export function catalogKey(transportUrl: string, type: string, catalogId: string): string {
  return `${normalizeTransportUrl(transportUrl)}|${type}|${catalogId}`;
}

export const useAddons = create<AddonsState>()(
  persist(
    (set, get) => ({
      addons: [],
      disabledCatalogs: [],
      catalogOrder: [],
      seeded: false,
      installing: [],
      errors: {},

      initDefaults: async () => {
        if (get().seeded) return;
        set({ seeded: true });
        const missing = DEFAULT_ADDON_URLS.filter((url) => !get().has(url));
        if (missing.length > 0) await get().install(missing);
      },

      install: async (urls) => {
        const targets = [...new Set(urls.map(normalizeTransportUrl).filter(Boolean))];
        const installed: string[] = [];
        const failed: { url: string; error: string }[] = [];
        set({ installing: [...get().installing, ...targets] });
        await Promise.all(
          targets.map(async (url) => {
            try {
              const { manifest, transportUrl } = await fetchManifest(url);
              set((state) => {
                const existing = state.addons.find((addon) => addon.transportUrl === transportUrl);
                const next = existing
                  ? state.addons.map((addon) =>
                      addon.transportUrl === transportUrl
                        ? { ...addon, manifest, enabled: true }
                        : addon,
                    )
                  : [
                      ...state.addons,
                      { ...createInstalledAddon(manifest, transportUrl), order: state.addons.length },
                    ];
                const errors = { ...state.errors };
                delete errors[transportUrl];
                return { addons: next, errors };
              });
              installed.push(transportUrl);
            } catch (error) {
              const message = error instanceof Error ? error.message : "Install failed";
              failed.push({ url, error: message });
              set((state) => ({ errors: { ...state.errors, [url]: message } }));
            }
          }),
        );
        set((state) => ({
          installing: state.installing.filter((url) => !targets.includes(url)),
        }));
        return { installed, failed };
      },

      importText: async (text) => {
        const parsed = parseAddonInput(text);
        const messages = [...parsed.errors];
        if (parsed.inline.length > 0) {
          set((state) => {
            const addons = [...state.addons];
            for (const addon of parsed.inline) {
              if (!addons.some((entry) => entry.transportUrl === addon.transportUrl)) {
                addons.push(addon);
              }
            }
            return { addons };
          });
        }
        const result = parsed.transports.length
          ? await get().install(parsed.transports)
          : { installed: [], failed: [] };
        messages.push(...result.failed.map((failure) => `${failure.url}: ${failure.error}`));
        return { ...result, messages };
      },

      remove: (transportUrl) =>
        set((state) => ({
          addons: state.addons.filter((addon) => addon.transportUrl !== transportUrl),
        })),

      toggle: (transportUrl) =>
        set((state) => ({
          addons: state.addons.map((addon) =>
            addon.transportUrl === transportUrl ? { ...addon, enabled: !addon.enabled } : addon,
          ),
        })),

      move: (transportUrl, direction) =>
        set((state) => {
          const addons = [...state.addons];
          const index = addons.findIndex((addon) => addon.transportUrl === transportUrl);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= addons.length) return state;
          [addons[index], addons[target]] = [addons[target], addons[index]];
          return { addons: addons.map((addon, i) => ({ ...addon, order: i })) };
        }),

      setDisplayName: (transportUrl, name) =>
        set((state) => ({
          addons: state.addons.map((addon) =>
            addon.transportUrl === transportUrl
              ? { ...addon, displayName: name.trim() || undefined }
              : addon,
          ),
        })),

      setCatalogEnabled: (key, enabled) =>
        set((state) => {
          const disabled = new Set(state.disabledCatalogs);
          if (enabled) disabled.delete(key);
          else disabled.add(key);
          return { disabledCatalogs: [...disabled] };
        }),

      isCatalogEnabled: (key) => !get().disabledCatalogs.includes(key),

      setCatalogOrder: (order) => set({ catalogOrder: order }),

      refresh: async (transportUrl) => {
        try {
          const { manifest } = await fetchManifest(transportUrl);
          set((state) => ({
            addons: state.addons.map((addon) =>
              addon.transportUrl === transportUrl ? { ...addon, manifest } : addon,
            ),
            errors: Object.fromEntries(
              Object.entries(state.errors).filter(([key]) => key !== transportUrl),
            ),
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Refresh failed";
          set((state) => ({ errors: { ...state.errors, [transportUrl]: message } }));
        }
      },

      has: (transportUrl) =>
        get().addons.some(
          (addon) => addon.transportUrl === normalizeTransportUrl(transportUrl),
        ),

      restoreFromRemote: async (remote) => {
        // Mirror the Android implementation: canonicalise, drop blanks and
        // de-duplicate by URL, keeping the first occurrence.
        const seen = new Set<string>();
        const remoteList = remote
          .map((entry) => ({ ...entry, url: normalizeTransportUrl(entry.url) }))
          .filter((entry) => {
            if (entry.url.length === 0) return false;
            if (seen.has(entry.url)) return false;
            seen.add(entry.url);
            return true;
          });

        // Safety valve, identical to the Android implementation: an empty
        // remote list must never wipe a populated local list.
        if (remoteList.length === 0) {
          return { restored: 0, preserved: get().addons.length > 0 };
        }

        // Install anything the account has that we do not have yet.
        const missing = remoteList.filter((entry) => !get().has(entry.url));
        if (missing.length > 0) {
          await get().install(missing.map((entry) => entry.url));
        }

        set((state) => {
          const byUrl = new Map(state.addons.map((addon) => [addon.transportUrl, addon]));
          const next: InstalledAddon[] = [];

          remoteList.forEach((entry, index) => {
            const existing = byUrl.get(entry.url);
            // A manifest that could not be fetched is skipped rather than
            // silently dropping the add-on from the account.
            if (!existing) return;
            next.push({
              ...existing,
              enabled: entry.enabled,
              order: index,
              displayName: entry.name?.trim() || existing.displayName,
            });
          });

          // If nothing could be applied, keep the local list untouched.
          if (next.length === 0) return state;
          return { addons: next };
        });

        return { restored: remoteList.length, preserved: false };
      },
    }),
    {
      name: "nuvio.addons.v1",
      version: 1,
      partialize: (state) => ({
        addons: state.addons,
        disabledCatalogs: state.disabledCatalogs,
        catalogOrder: state.catalogOrder,
        seeded: state.seeded,
      }),
    },
  ),
);

/** Enabled add-ons in the user's chosen order. */
export function enabledAddons(state: { addons: InstalledAddon[] }): InstalledAddon[] {
  return [...state.addons].sort((a, b) => a.order - b.order).filter((addon) => addon.enabled);
}
