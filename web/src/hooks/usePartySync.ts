import { useEffect } from "react";
import {
  partyStorageKey,
  useParty,
  type PartySession,
} from "@/store/party";

interface PartyMessage {
  type: "session" | "hello";
  session?: PartySession;
  member?: { id: string; name: string; role: "host" | "guest" };
}

/**
 * Keeps a party in sync across tabs/windows in this browser.
 *
 * Hosts write the authoritative session to localStorage and a BroadcastChannel;
 * guests apply those updates and announce themselves with a heartbeat.
 */
export function usePartySync(): void {
  const code = useParty((state) => state.session?.code ?? null);
  const role = useParty((state) => state.role);
  const clientId = useParty((state) => state.clientId);
  const displayName = useParty((state) => state.displayName);
  const applyRemoteSession = useParty((state) => state.applyRemoteSession);
  const touchMember = useParty((state) => state.touchMember);

  useEffect(() => {
    if (!code) return;

    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(`nuvio.party.${code}`)
        : null;

    const readAndApply = (raw: string | null) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as PartySession;
        if (parsed?.code === code) applyRemoteSession(parsed);
      } catch {
        // Ignore malformed sessions from other tabs.
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === partyStorageKey(code)) readAndApply(event.newValue);
      if (event.key === `nuvio.party.hello.${code}` && role === "host" && event.newValue) {
        try {
          const member = JSON.parse(event.newValue) as {
            id: string;
            name: string;
            role: "host" | "guest";
          };
          if (member?.id) touchMember(member);
        } catch {
          // Ignore malformed heartbeats.
        }
      }
    };

    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<PartySession | null>).detail;
      if (detail?.code === code) applyRemoteSession(detail);
    };

    const onMessage = (event: MessageEvent<PartyMessage>) => {
      const message = event.data;
      if (!message) return;
      if (message.type === "session" && message.session) {
        if (message.session.code === code) applyRemoteSession(message.session);
      }
      if (message.type === "hello" && message.member && role === "host") {
        touchMember(message.member);
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("nuvio:party-session", onCustom);
    channel?.addEventListener("message", onMessage as EventListener);

    const unsubscribe =
      role === "host"
        ? useParty.subscribe((state, previous) => {
            if (
              state.session?.code === code &&
              state.session.updatedAt !== previous.session?.updatedAt
            ) {
              channel?.postMessage({ type: "session", session: state.session });
            }
          })
        : undefined;

    let heartbeat: number | undefined;
    if (role === "guest") {
      const announce = () => {
        const member = {
          id: clientId,
          name: displayName || "Guest",
          role: "guest" as const,
        };
        channel?.postMessage({ type: "hello", member });
        try {
          window.localStorage.setItem(
            `nuvio.party.hello.${code}`,
            JSON.stringify({ ...member, at: Date.now() }),
          );
        } catch {
          // Storage may be unavailable in private mode.
        }
      };
      announce();
      heartbeat = window.setInterval(announce, 8_000);
    } else {
      heartbeat = window.setInterval(
        () => touchMember({ id: clientId, name: displayName || "Host", role: "host" }),
        15_000,
      );
    }

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("nuvio:party-session", onCustom);
      channel?.removeEventListener("message", onMessage as EventListener);
      channel?.close();
      unsubscribe?.();
      if (heartbeat) window.clearInterval(heartbeat);
    };
  }, [code, role, clientId, displayName, applyRemoteSession, touchMember]);
}
