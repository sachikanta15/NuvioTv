import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "@/lib/id";

export type PartyRole = "host" | "guest";
export type PartyStatus = "lobby" | "playing" | "ended";

export interface PartyContent {
  id: string;
  type: string;
  name: string;
  poster?: string | null;
  background?: string | null;
  videoId?: string | null;
  season?: number | null;
  episode?: number | null;
  episodeTitle?: string | null;
}

export interface PartyMember {
  id: string;
  name: string;
  role: PartyRole;
  joinedAt: number;
  lastSeen: number;
}

export interface PartyPlayback {
  playing: boolean;
  /** Seconds into the current video. */
  time: number;
  duration: number;
  updatedAt: number;
  videoId?: string | null;
}

export interface PartySession {
  code: string;
  hostId: string;
  hostName: string;
  createdAt: number;
  updatedAt: number;
  status: PartyStatus;
  content: PartyContent | null;
  members: PartyMember[];
  playback: PartyPlayback;
}

interface PartyState {
  /** Stable id for this browser tab's user. */
  clientId: string;
  displayName: string;
  session: PartySession | null;
  role: PartyRole | null;
  error: string | null;
  setDisplayName: (name: string) => void;
  createSession: (input: { name: string; content?: PartyContent | null }) => PartySession;
  joinSession: (code: string, name: string) => PartySession | null;
  leaveSession: () => void;
  setContent: (content: PartyContent | null) => void;
  updatePlayback: (playback: Partial<PartyPlayback>) => void;
  setStatus: (status: PartyStatus) => void;
  /** Applies a session received from another tab (guest side). */
  applyRemoteSession: (session: PartySession) => void;
  /** Records a guest in the host's member list. */
  touchMember: (member: Omit<PartyMember, "joinedAt" | "lastSeen"> & Partial<Pick<PartyMember, "joinedAt" | "lastSeen">>) => void;
  removeMember: (id: string) => void;
  setError: (message: string | null) => void;
}

export const PARTY_CODE_LENGTH = 6;

export function partyStorageKey(code: string): string {
  return `nuvio.party.session.${code.toUpperCase()}`;
}

export function generatePartyCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < PARTY_CODE_LENGTH; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function readPartySession(code: string): PartySession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(partyStorageKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PartySession;
    if (!parsed?.code) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePartySession(session: PartySession | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!session) return;
    window.localStorage.setItem(partyStorageKey(session.code), JSON.stringify(session));
    // Notify listeners in this tab as well as other tabs.
    window.dispatchEvent(
      new CustomEvent("nuvio:party-session", { detail: session }),
    );
  } catch {
    // Storage can be full or blocked in private mode; the in-memory session
    // still works for the current tab.
  }
}

export function clearPartySession(code: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(partyStorageKey(code));
    window.dispatchEvent(new CustomEvent("nuvio:party-session", { detail: null }));
  } catch {
    // Ignore storage failures.
  }
}

function defaultPlayback(): PartyPlayback {
  return { playing: false, time: 0, duration: 0, updatedAt: Date.now(), videoId: null };
}

export const useParty = create<PartyState>()(
  persist(
    (set, get) => ({
      clientId: uid("client"),
      displayName: "",
      session: null,
      role: null,
      error: null,

      setDisplayName: (displayName) => set({ displayName }),

      createSession: ({ name, content = null }) => {
        const code = generatePartyCode();
        const now = Date.now();
        const session: PartySession = {
          code,
          hostId: get().clientId,
          hostName: name.trim() || "Host",
          createdAt: now,
          updatedAt: now,
          status: "lobby",
          content,
          members: [
            {
              id: get().clientId,
              name: name.trim() || "Host",
              role: "host",
              joinedAt: now,
              lastSeen: now,
            },
          ],
          playback: defaultPlayback(),
        };
        writePartySession(session);
        set({ session, role: "host", displayName: name.trim() || get().displayName, error: null });
        return session;
      },

      joinSession: (rawCode, name) => {
        const code = rawCode.trim().toUpperCase();
        const session = readPartySession(code);
        if (!session) {
          set({ error: "No party found with that code. Ask the host to share it again." });
          return null;
        }
        const now = Date.now();
        const guest: PartyMember = {
          id: get().clientId,
          name: name.trim() || "Guest",
          role: "guest",
          joinedAt: now,
          lastSeen: now,
        };
        const next: PartySession = {
          ...session,
          members: [
            ...session.members.filter((member) => member.id !== guest.id),
            guest,
          ],
          updatedAt: now,
        };
        writePartySession(next);
        set({
          session: next,
          role: "guest",
          displayName: name.trim() || get().displayName,
          error: null,
        });
        return next;
      },

      leaveSession: () => {
        const session = get().session;
        if (session && get().role === "guest") {
          const next: PartySession = {
            ...session,
            members: session.members.filter((member) => member.id !== get().clientId),
            updatedAt: Date.now(),
          };
          writePartySession(next);
        }
        if (session && get().role === "host") {
          clearPartySession(session.code);
        }
        set({ session: null, role: null, error: null });
      },

      setContent: (content) => {
        const session = get().session;
        if (!session || get().role !== "host") return;
        const next: PartySession = {
          ...session,
          content,
          status: "lobby",
          playback: defaultPlayback(),
          updatedAt: Date.now(),
        };
        writePartySession(next);
        set({ session: next });
      },

      updatePlayback: (patch) => {
        const session = get().session;
        if (!session || get().role !== "host") return;
        const next: PartySession = {
          ...session,
          status: patch.playing === false ? session.status : "playing",
          playback: {
            ...session.playback,
            ...patch,
            updatedAt: Date.now(),
          },
          updatedAt: Date.now(),
        };
        writePartySession(next);
        set({ session: next });
      },

      setStatus: (status) => {
        const session = get().session;
        if (!session || get().role !== "host") return;
        const next: PartySession = { ...session, status, updatedAt: Date.now() };
        writePartySession(next);
        set({ session: next });
      },

      applyRemoteSession: (session) => {
        if (!session) return;
        const current = get().session;
        // Ignore stale messages and sessions for a different party.
        if (current && current.code !== session.code) return;
        if (current && session.updatedAt < current.updatedAt) return;
        set({ session });
      },

      touchMember: (member) => {
        const session = get().session;
        if (!session || get().role !== "host") return;
        const now = Date.now();
        const existing = session.members.find((entry) => entry.id === member.id);
        const nextMember: PartyMember = {
          ...member,
          joinedAt: existing?.joinedAt ?? member.joinedAt ?? now,
          lastSeen: now,
        };
        const next: PartySession = {
          ...session,
          members: [
            ...session.members.filter((entry) => entry.id !== member.id),
            nextMember,
          ],
          updatedAt: now,
        };
        writePartySession(next);
        set({ session: next });
      },

      removeMember: (id) => {
        const session = get().session;
        if (!session || get().role !== "host") return;
        const next: PartySession = {
          ...session,
          members: session.members.filter((member) => member.id !== id),
          updatedAt: Date.now(),
        };
        writePartySession(next);
        set({ session: next });
      },

      setError: (error) => set({ error }),
    }),
    {
      name: "nuvio.party.v1",
      version: 1,
      partialize: (state) => ({
        displayName: state.displayName,
      }),
    },
  ),
);

/** The shareable join URL for a party code. */
export function partyJoinUrl(code: string): string {
  if (typeof window === "undefined") return `/party?code=${code}`;
  return `${window.location.origin}/party?code=${code}`;
}
