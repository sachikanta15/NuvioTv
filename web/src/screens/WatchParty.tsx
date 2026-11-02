import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Check,
  Copy,
  Crown,
  Link2,
  LogOut,
  PartyPopper,
  Play,
  Plus,
  Radio,
  Users,
  X,
} from "lucide-react";
import type { MetaPreview } from "@/types";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { AsyncImage } from "@/components/ui/AsyncImage";
import { useParty, partyJoinUrl } from "@/store/party";
import { useLibrary, selectContinueWatching, selectLibraryItems } from "@/store/library";
import { useProfiles } from "@/store/profiles";
import { useUi } from "@/store/ui";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";

export function WatchPartyScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inviteCode = params.get("code") ?? "";
  const party = useParty();
  const profile = useProfiles((state) =>
    state.profiles.find((entry) => entry.id === state.activeProfileId),
  );
  const continueWatching = useLibrary(selectContinueWatching);
  const libraryItems = useLibrary(selectLibraryItems);
  const pushToast = useUi((state) => state.pushToast);

  const [name, setName] = useState(party.displayName || profile?.name || "Host");
  const [joinCode, setJoinCode] = useState(inviteCode.toUpperCase());
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    if (inviteCode) setJoinCode(inviteCode.toUpperCase());
  }, [inviteCode]);

  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const list: MetaPreview[] = [];
    for (const entry of continueWatching) {
      if (seen.has(entry.contentId)) continue;
      seen.add(entry.contentId);
      list.push({
        id: entry.contentId,
        type: entry.contentType,
        name: entry.name,
        poster: entry.poster ?? null,
        background: entry.backdrop ?? null,
        releaseInfo: entry.season != null ? `S${entry.season}E${entry.episode}` : "Movie",
      });
    }
    for (const entry of libraryItems) {
      if (seen.has(entry.meta.id)) continue;
      seen.add(entry.meta.id);
      list.push(entry.meta);
    }
    return list.slice(0, 18);
  }, [continueWatching, libraryItems]);

  const copy = async (value: string, kind: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
      pushToast(kind === "code" ? "Party code copied" : "Invite link copied", "success");
    } catch {
      pushToast("Couldn’t copy — select and copy it manually.", "error");
    }
  };

  if (!party.session) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
        <header className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgb(var(--nuvio-accent)/0.14)] text-[rgb(var(--nuvio-accent))]">
            <PartyPopper size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Watch party</h1>
            <p className="text-sm text-text-secondary">
              Watch together and keep playback in sync.
            </p>
          </div>
        </header>

        <div className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
          <label className="block text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Your name
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="How should friends see you?"
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none focus:border-[rgb(var(--nuvio-accent))]"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="flex flex-col rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--nuvio-accent)/0.16)] text-[rgb(var(--nuvio-accent))]">
              <Plus size={18} />
            </span>
            <h2 className="mt-4 text-lg font-semibold">Start a party</h2>
            <p className="mt-1 flex-1 text-sm text-text-secondary">
              Create a code, invite friends, and choose something to watch together.
            </p>
            <Button
              variant="primary"
              className="mt-5"
              icon={<Radio size={16} />}
              onClick={() => {
                const session = party.createSession({ name });
                pushToast(`Party ${session.code} created`, "success");
              }}
            >
              Create party
            </Button>
          </section>

          <section className="flex flex-col rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/6 text-text-secondary">
              <Users size={18} />
            </span>
            <h2 className="mt-4 text-lg font-semibold">Join a party</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Enter the 6-character code your host shared with you.
            </p>
            <input
              value={joinCode}
              onChange={(event) =>
                setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
              }
              placeholder="ABC123"
              className="mt-4 h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 font-mono text-lg tracking-[0.3em] outline-none focus:border-[rgb(var(--nuvio-accent))]"
            />
            {party.error && <p className="mt-2 text-xs text-[rgb(var(--nuvio-error))]">{party.error}</p>}
            <Button
              variant="outline"
              className="mt-3"
              disabled={joinCode.length < 6}
              onClick={() => {
                const session = party.joinSession(joinCode, name);
                if (session) pushToast(`Joined party ${session.code}`, "success");
              }}
            >
              Join party
            </Button>
          </section>
        </div>

        <div className="rounded-panel border border-white/8 bg-white/[0.03] p-4 text-xs leading-relaxed text-text-tertiary">
          <strong className="text-text-secondary">How sync works:</strong> this build keeps the
          party in this browser, so every tab or window using the same party code stays in sync.
          The host&apos;s play, pause and seek controls are mirrored for guests. Cross-device
          rooms are available in the Nuvio mobile app.
        </div>
      </div>
    );
  }

  const session = party.session;
  const isHost = party.role === "host";
  const content = session.content;
  const openContent = () => {
    if (!content) return;
    navigate(
      `/detail/${encodeURIComponent(content.type)}/${encodeURIComponent(content.id)}?party=${session.code}`,
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgb(var(--nuvio-accent)/0.14)] text-[rgb(var(--nuvio-accent))]">
            <PartyPopper size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Watch party</h1>
            <p className="text-sm text-text-secondary">
              {isHost ? "You’re hosting" : "You joined as a guest"} ·{" "}
              {session.members.length} watching
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          icon={<LogOut size={16} />}
          onClick={() => {
            party.leaveSession();
            pushToast("Left the party", "info");
            navigate("/party");
          }}
        >
          {isHost ? "End party" : "Leave"}
        </Button>
      </header>

      <section className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Party code
            </p>
            <p className="mt-1 font-mono text-3xl font-black tracking-[0.25em] sm:text-4xl">
              {session.code}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={copied === "code" ? <Check size={15} /> : <Copy size={15} />}
              onClick={() => void copy(session.code, "code")}
            >
              Copy code
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={copied === "link" ? <Check size={15} /> : <Link2 size={15} />}
              onClick={() => void copy(partyJoinUrl(session.code), "link")}
            >
              Copy invite link
            </Button>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-xs text-text-tertiary">
          <Link2 size={13} className="shrink-0" />
          <span className="truncate">{partyJoinUrl(session.code)}</span>
        </div>
      </section>

      {content ? (
        <section className="overflow-hidden rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))]">
          <div className="relative h-[240px] w-full sm:h-auto sm:aspect-[21/8]">
            <AsyncImage
              src={content.background ?? content.poster}
              alt={content.name}
              className="h-full w-full"
              fit="cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-4 p-5">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                  Now watching
                </p>
                <h2 className="mt-1 truncate text-xl font-bold sm:text-2xl">{content.name}</h2>
                {content.episodeTitle && (
                  <p className="text-sm text-white/65">{content.episodeTitle}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="primary" icon={<Play size={16} className="fill-current" />} onClick={openContent}>
                  {isHost ? "Open title" : "Join playback"}
                </Button>
                {isHost && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      party.setContent(null);
                      pushToast("Cleared the party title", "info");
                    }}
                  >
                    Change
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">
              {isHost ? "Choose something to watch" : "Waiting for the host"}
            </h2>
            <p className="text-sm text-text-secondary">
              {isHost
                ? "Pick a title from continue watching or your watchlist."
                : "The host hasn’t picked a title yet. This page updates automatically."}
            </p>
          </div>
          {isHost ? (
            candidates.length > 0 ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {candidates.map((meta) => (
                  <button
                    key={`${meta.type}:${meta.id}`}
                    type="button"
                    onClick={() => {
                      party.setContent({
                        id: meta.id,
                        type: meta.type,
                        name: meta.name,
                        poster: meta.poster ?? null,
                        background: meta.background ?? null,
                      });
                      pushToast(`Party title set to ${meta.name}`, "success");
                    }}
                    className="group/pick relative overflow-hidden rounded-panel border border-white/8 bg-[rgb(var(--nuvio-card))] text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgb(var(--nuvio-accent))]"
                  >
                    <div className="aspect-[2/3] w-full">
                      <AsyncImage
                        src={meta.poster ?? meta.landscapePoster}
                        alt={meta.name}
                        className="h-full w-full"
                      />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-2.5">
                      <p className="line-clamp-2 text-xs font-semibold text-white">{meta.name}</p>
                      <p className="mt-0.5 text-[10px] text-white/60">{meta.releaseInfo}</p>
                    </div>
                    <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover/pick:opacity-100">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-black">
                        <Play size={15} className="translate-x-0.5 fill-black" />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<PartyPopper size={24} />}
                title="Nothing saved yet"
                description="Start watching something, or add titles to your watchlist, then come back to pick it."
                action={
                  <Button variant="primary" onClick={() => navigate("/")}>
                    Browse home
                  </Button>
                }
              />
            )
          ) : (
            <div className="flex items-center gap-3 rounded-panel border border-white/8 bg-white/[0.03] p-4 text-sm text-text-tertiary">
              <Radio size={18} className="animate-pulse text-[rgb(var(--nuvio-accent))]" />
              Waiting for the host to choose a title…
            </div>
          )}
        </section>
      )}

      <section className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-tertiary">
          <Users size={14} /> In the party
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {session.members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-panel border border-white/8 bg-black/15 px-3 py-2.5"
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white",
                  member.role === "host"
                    ? "bg-[rgb(var(--nuvio-accent))]"
                    : "bg-white/12",
                )}
              >
                {member.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {member.name}
                  {member.id === party.clientId && (
                    <span className="text-[10px] text-text-tertiary">(you)</span>
                  )}
                  {member.role === "host" && <Crown size={12} className="text-rating" />}
                </p>
                <p className="text-[11px] text-text-tertiary">
                  {member.role === "host" ? "Host" : "Guest"} · seen {relativeTime(member.lastSeen)}
                </p>
              </div>
              {isHost && member.role !== "host" && (
                <button
                  type="button"
                  aria-label={`Remove ${member.name}`}
                  onClick={() => party.removeMember(member.id)}
                  className="rounded-full p-1.5 text-text-tertiary transition-colors hover:bg-white/10 hover:text-[rgb(var(--nuvio-error))]"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
