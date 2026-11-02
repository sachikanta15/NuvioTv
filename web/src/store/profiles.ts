import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Profile } from "@/types";
import { uid } from "@/lib/id";

export const PROFILE_COLORS = [
  "#8E24AA",
  "#1E88E5",
  "#E53935",
  "#43A047",
  "#FB8C00",
  "#D81B60",
  "#00ACC1",
  "#7E57C2",
];

const defaultProfile = (): Profile => ({
  id: uid("profile"),
  name: "You",
  avatar: "🎬",
  color: PROFILE_COLORS[0],
  pin: "",
  isKids: false,
  createdAt: Date.now(),
});

interface ProfilesState {
  profiles: Profile[];
  activeProfileId: string | null;
  createProfile: (input: Partial<Profile> & { name: string }) => Profile;
  updateProfile: (id: string, patch: Partial<Profile>) => void;
  deleteProfile: (id: string) => void;
  setActiveProfile: (id: string | null) => void;
  ensureProfiles: () => void;
}

export const useProfiles = create<ProfilesState>()(
  persist(
    (set, get) => ({
      profiles: [],
      activeProfileId: null,
      createProfile: (input) => {
        const profile: Profile = {
          id: uid("profile"),
          name: input.name,
          avatar: input.avatar ?? "🎬",
          color: input.color ?? PROFILE_COLORS[get().profiles.length % PROFILE_COLORS.length],
          pin: input.pin ?? "",
          isKids: input.isKids ?? false,
          createdAt: Date.now(),
        };
        set((state) => ({ profiles: [...state.profiles, profile] }));
        return profile;
      },
      updateProfile: (id, patch) =>
        set((state) => ({
          profiles: state.profiles.map((profile) =>
            profile.id === id ? { ...profile, ...patch } : profile,
          ),
        })),
      deleteProfile: (id) =>
        set((state) => {
          const profiles = state.profiles.filter((profile) => profile.id !== id);
          const activeProfileId =
            state.activeProfileId === id ? profiles[0]?.id ?? null : state.activeProfileId;
          return { profiles, activeProfileId };
        }),
      setActiveProfile: (id) => set({ activeProfileId: id }),
      ensureProfiles: () => {
        if (get().profiles.length === 0) {
          const profile = defaultProfile();
          set({ profiles: [profile], activeProfileId: profile.id });
        } else if (!get().activeProfileId) {
          set({ activeProfileId: get().profiles[0].id });
        }
      },
    }),
    {
      name: "nuvio.profiles.v1",
      version: 1,
      onRehydrateStorage: () => (state) => {
        state?.ensureProfiles();
      },
    },
  ),
);
