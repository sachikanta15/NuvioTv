import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  SupabaseError,
  getMemberAccess,
  getRemoteAddons,
  getSyncOwner,
  pushRemoteAddons,
  refreshSession,
  signInWithEmail,
  signUpWithEmail,
  type SupabaseSession,
} from "@/lib/supabase";
import {
  NO_MEMBER_ACCESS,
  type CosmeticEntitlement,
  type MemberAccess,
  type MemberTier,
} from "@/lib/member-access";
import { isAuthConfigured } from "@/lib/config";
import { useAddons } from "@/store/addons";
import { useUi } from "@/store/ui";

/**
 * The account's *primary* profile slot in the backend. The Android app keeps
 * the default add-on list under this id, so the web build reads and writes
 * the same rows.
 */
export const SYNC_PROFILE_ID = 1;

/** Refresh a token this long before it actually expires. */
const REFRESH_MARGIN_MS = 60_000;

export type AuthStatus = "loading" | "signed_out" | "signed_in";

interface AuthState {
  status: AuthStatus;
  session: SupabaseSession | null;
  memberAccess: MemberAccess;
  memberAccessLoading: boolean;
  memberAccessError: string | null;
  /** True once the account's add-ons have been restored from the cloud. */
  addonsRestored: boolean;
  restoringAddons: boolean;

  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Returns a valid access token, refreshing the session when needed. */
  ensureToken: () => Promise<string | null>;
  refreshMemberAccess: () => Promise<void>;
  /** Pulls the account's add-on list and reconciles it into the local store. */
  restoreAddons: () => Promise<{ restored: number; preserved: boolean }>;
  /** Writes the local add-on list back to the account. */
  syncAddons: (options?: { silent?: boolean }) => Promise<{ pushed: number }>;
}

/** Persisted snapshot of the membership, so a reload keeps the unlocked themes. */
interface PersistedMemberAccess {
  /** The account the snapshot belongs to — mirrors `MemberAccessDataStore`. */
  userId: string;
  tier: MemberTier | null;
  entitlements: CosmeticEntitlement[];
  at: number;
}

const MEMBER_ACCESS_STALE_AFTER_MS = 15 * 60 * 1000;

function readCachedMemberAccess(userId: string): PersistedMemberAccess | null {
  try {
    const raw = localStorage.getItem("nuvio.memberAccess.v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedMemberAccess;
    // A snapshot for a different account must never unlock anything.
    return parsed.userId === userId ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedMemberAccess(userId: string, access: MemberAccess): void {
  try {
    localStorage.setItem(
      "nuvio.memberAccess.v1",
      JSON.stringify({ ...access, userId, at: Date.now() } satisfies PersistedMemberAccess),
    );
  } catch {
    /* storage unavailable — the cache is only an optimisation */
  }
}

function clearCachedMemberAccess(): void {
  try {
    localStorage.removeItem("nuvio.memberAccess.v1");
  } catch {
    /* ignore */
  }
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      status: "loading",
      session: null,
      memberAccess: NO_MEMBER_ACCESS,
      memberAccessLoading: false,
      memberAccessError: null,
      addonsRestored: false,
      restoringAddons: false,

      signIn: async (email, password) => {
        const session = await signInWithEmail(email, password);
        set({ session, status: "signed_in", addonsRestored: false });
        await get().refreshMemberAccess();
        await get().restoreAddons();
      },

      signUp: async (email, password) => {
        const session = await signUpWithEmail(email, password);
        set({ session, status: "signed_in", addonsRestored: false });
        await get().refreshMemberAccess();
        await get().restoreAddons();
      },

      signOut: async () => {
        set({
          session: null,
          status: "signed_out",
          memberAccess: NO_MEMBER_ACCESS,
          memberAccessError: null,
          addonsRestored: false,
        });
        clearCachedMemberAccess();
      },

      ensureToken: async () => {
        const session = get().session;
        if (!session) return null;
        if (session.expiresAt - REFRESH_MARGIN_MS > Date.now()) return session.accessToken;

        try {
          const next = await refreshSession(session.refreshToken);
          set({ session: next });
          return next.accessToken;
        } catch (error) {
          // A rejected refresh token means the session is gone for good.
          if (error instanceof SupabaseError && (error.status === 400 || error.status === 401)) {
            set({ session: null, status: "signed_out" });
            clearCachedMemberAccess();
          }
          throw error;
        }
      },

      refreshMemberAccess: async () => {
        const userId = get().session?.user.id;
        if (!userId) {
          set({ memberAccess: NO_MEMBER_ACCESS, memberAccessLoading: false });
          return;
        }
        set({ memberAccessLoading: true, memberAccessError: null });
        try {
          const token = await get().ensureToken();
          if (!token) {
            set({ memberAccess: NO_MEMBER_ACCESS, memberAccessLoading: false });
            return;
          }
          const access = await getMemberAccess(token);
          set({ memberAccess: access, memberAccessLoading: false });
          writeCachedMemberAccess(userId, access);
        } catch (error) {
          // Keep the last known access on failure — never downgrade offline.
          const cached = readCachedMemberAccess(userId);
          set({
            memberAccess: cached
              ? { tier: cached.tier, entitlements: cached.entitlements }
              : NO_MEMBER_ACCESS,
            memberAccessLoading: false,
            memberAccessError: error instanceof Error ? error.message : "Could not load membership",
          });
        }
      },

      restoreAddons: async () => {
        if (!get().session || get().restoringAddons) {
          return { restored: 0, preserved: false };
        }
        set({ restoringAddons: true });
        try {
          const token = await get().ensureToken();
          if (!token) {
            set({ restoringAddons: false });
            return { restored: 0, preserved: false };
          }

          // Linked devices share the sync owner's add-on list.
          const owner = await getSyncOwner(token).catch(() => null);
          const userId = owner ?? get().session?.user.id ?? "";
          if (!userId) {
            set({ restoringAddons: false });
            return { restored: 0, preserved: false };
          }

          const rows = await getRemoteAddons(userId, SYNC_PROFILE_ID, token);
          const result = await useAddons.getState().restoreFromRemote(
            rows.map((row) => ({
              url: row.url,
              name: row.name ?? undefined,
              enabled: row.enabled !== false,
            })),
          );
          set({ restoringAddons: false, addonsRestored: true });
          if (result.restored > 0) {
            useUi
              .getState()
              .pushToast(
                `Restored ${result.restored} add-on${result.restored === 1 ? "" : "s"} from your account`,
                "success",
              );
          }
          return result;
        } catch (error) {
          set({ restoringAddons: false });
          useUi
            .getState()
            .pushToast(
              error instanceof Error ? error.message : "Could not restore add-ons",
              "error",
            );
          return { restored: 0, preserved: false };
        }
      },

      syncAddons: async (options) => {
        const silent = options?.silent ?? false;
        if (!get().session) return { pushed: 0 };
        if (!silent) set({ restoringAddons: true });
        try {
          const token = await get().ensureToken();
          if (!token) {
            if (!silent) set({ restoringAddons: false });
            return { pushed: 0 };
          }
          const owner = await getSyncOwner(token).catch(() => null);
          const userId = owner ?? get().session?.user.id ?? "";
          if (!userId) {
            if (!silent) set({ restoringAddons: false });
            return { pushed: 0 };
          }

          // Mirror the Android `sync_push_addons` payload.
          const local = [...useAddons.getState().addons].sort((a, b) => a.order - b.order);
          await pushRemoteAddons(
            local.map((addon, index) => ({
              url: addon.transportUrl,
              sort_order: index,
              enabled: addon.enabled,
              ...(addon.displayName ? { name: addon.displayName } : {}),
            })),
            SYNC_PROFILE_ID,
            token,
          );
          if (!silent) {
            set({ restoringAddons: false });
            useUi
              .getState()
              .pushToast(
                `Synced ${local.length} add-on${local.length === 1 ? "" : "s"} to your account`,
                "success",
              );
          }
          return { pushed: local.length };
        } catch (error) {
          if (!silent) {
            set({ restoringAddons: false });
            useUi
              .getState()
              .pushToast(
                error instanceof Error ? error.message : "Could not sync add-ons",
                "error",
              );
          } else {
            console.warn("[addons] background sync failed:", error);
          }
          return { pushed: 0 };
        }
      },
    }),
    {
      name: "nuvio.auth.v1",
      version: 1,
      partialize: (state) => ({
        session: state.session,
        status: state.session ? ("signed_in" as const) : ("signed_out" as const),
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!isAuthConfigured) {
          state.status = "signed_out";
          state.session = null;
          return;
        }
        if (!state.session) {
          state.status = "signed_out";
          // No account means no membership — never apply a cached snapshot.
          state.memberAccess = NO_MEMBER_ACCESS;
          return;
        }
        // A cached membership keeps the unlocked themes visible until the
        // remote check completes.
        const cached = readCachedMemberAccess(state.session.user.id);
        if (cached && Date.now() - cached.at < MEMBER_ACCESS_STALE_AFTER_MS) {
          state.memberAccess = { tier: cached.tier, entitlements: cached.entitlements };
        }
        state.status = "signed_in";
        void state.refreshMemberAccess();
      },
    },
  ),
);

/** Convenience selector: true when the signed-in account is a member. */
export function isMember(access: MemberAccess): boolean {
  return access.tier !== null;
}
