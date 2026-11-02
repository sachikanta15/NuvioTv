import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Check,
  Clock3,
  Download,
  ExternalLink,
  Film,
  Link2,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tv,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Toggle } from "@/components/ui/Toggle";
import { useLibrary, selectContinueWatching, selectWatched } from "@/store/library";
import { useTracking } from "@/store/tracking";
import { useUi } from "@/store/ui";
import {
  TraktError,
  fetchTraktProfile,
  pollTraktDeviceToken,
  pushTraktHistory,
  requestTraktDeviceCode,
  type TraktDeviceCode,
  type TraktHistoryItem,
} from "@/lib/trakt";
import { INDIA_TITLES, languageFor } from "@/lib/india";
import { relativeTime } from "@/lib/format";

const TITLE_BY_ID = new Map(INDIA_TITLES.map((title) => [title.id, title]));

export function TrackingScreen() {
  const watched = useLibrary(selectWatched);
  const continueWatching = useLibrary(selectContinueWatching);
  const trakt = useTracking((state) => state.trakt);
  const setTrakt = useTracking((state) => state.setTrakt);
  const mdblist = useTracking((state) => state.mdblist);
  const setMdblist = useTracking((state) => state.setMdblist);
  const simkl = useTracking((state) => state.simkl);
  const setSimkl = useTracking((state) => state.setSimkl);
  const scrobbleEnabled = useTracking((state) => state.scrobbleEnabled);
  const setScrobbleEnabled = useTracking((state) => state.setScrobbleEnabled);
  const markSynced = useTracking((state) => state.markSynced);
  const lastSyncAt = useTracking((state) => state.lastSyncAt);
  const pushToast = useUi((state) => state.pushToast);

  const [traktOpen, setTraktOpen] = useState(false);
  const [mdblistOpen, setMdblistOpen] = useState(false);
  const [simklOpen, setSimklOpen] = useState(false);
  const [clientId, setClientId] = useState(trakt?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState(trakt?.clientSecret ?? "");
  const [device, setDevice] = useState<TraktDeviceCode | null>(null);
  const [deviceStatus, setDeviceStatus] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [mdblistKey, setMdblistKey] = useState(mdblist?.apiKey ?? "");
  const [mdblistUser, setMdblistUser] = useState(mdblist?.username ?? "");
  const [simklClientId, setSimklClientId] = useState(simkl?.clientId ?? "");
  const [simklToken, setSimklToken] = useState(simkl?.accessToken ?? "");
  const [simklUser, setSimklUser] = useState(simkl?.username ?? "");
  const pollTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, []);

  const stats = useMemo(() => {
    const hours = continueWatching.reduce((sum, entry) => sum + entry.position / 3_600_000, 0);
    const languages = new Map<string, number>();
    for (const entry of watched) {
      const title = TITLE_BY_ID.get(entry.contentId);
      if (title) languages.set(title.language, (languages.get(title.language) ?? 0) + 1);
    }
    for (const entry of continueWatching) {
      const title = TITLE_BY_ID.get(entry.contentId);
      if (title) languages.set(title.language, (languages.get(title.language) ?? 0) + 1);
    }
    return {
      hours,
      languages: [...languages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
      recent: [...continueWatching].sort((a, b) => b.lastWatched - a.lastWatched).slice(0, 6),
    };
  }, [watched, continueWatching]);

  const startTrakt = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      pushToast("Enter your Trakt client ID and secret first.", "error");
      return;
    }
    setDeviceStatus("");
    try {
      const code = await requestTraktDeviceCode(clientId.trim());
      setDevice(code);
      void pollTrakt(code);
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : "Couldn’t start Trakt sign-in.",
        "error",
      );
    }
  };

  const pollTrakt = async (code: TraktDeviceCode) => {
    try {
      const token = await pollTraktDeviceToken({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        deviceCode: code.device_code,
      });
      const profile = await fetchTraktProfile(clientId.trim(), token.access_token).catch(() => null);
      setTrakt({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + token.expires_in * 1000,
        username: profile?.username ?? "Trakt user",
        avatar: profile?.images?.avatar?.full ?? null,
        connectedAt: Date.now(),
      });
      setDevice(null);
      setTraktOpen(false);
      pushToast(`Connected to Trakt as ${profile?.username ?? "your account"}`, "success");
    } catch (error) {
      if (error instanceof TraktError && error.status === 400) {
        setDeviceStatus("Waiting for you to approve the code on Trakt…");
        pollTimer.current = window.setTimeout(
          () => void pollTrakt(code),
          Math.max(5, code.interval) * 1000,
        );
        return;
      }
      setDeviceStatus(error instanceof Error ? error.message : "Trakt sign-in failed.");
      setDevice(null);
    }
  };

  const syncHistory = async () => {
    if (!trakt) return;
    const items: TraktHistoryItem[] = [];
    for (const entry of continueWatching) {
      if (!entry.contentId.startsWith("tt")) continue;
      if (entry.contentType === "series" && entry.season != null && entry.episode != null) {
        items.push({
          watched_at: new Date(entry.lastWatched).toISOString(),
          show: { ids: { imdb: entry.contentId } },
          episode: { season: entry.season, number: entry.episode },
        });
      } else {
        items.push({
          watched_at: new Date(entry.lastWatched).toISOString(),
          movie: { ids: { imdb: entry.contentId } },
        });
      }
    }
    if (items.length === 0) {
      pushToast("No IMDb-matched history to sync yet.", "info");
      return;
    }
    setSyncing(true);
    try {
      await pushTraktHistory(trakt.clientId, trakt.accessToken, items);
      markSynced();
      pushToast(`Synced ${items.length} title${items.length === 1 ? "" : "s"} to Trakt`, "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Trakt sync failed.", "error");
    } finally {
      setSyncing(false);
    }
  };

  const exportHistory = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      watched,
      continueWatching,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nuvio-watch-history-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    pushToast("Watch history exported", "success");
  };

  return (
    <div className="space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgb(var(--nuvio-accent)/0.14)] text-[rgb(var(--nuvio-accent))]">
            <BarChart3 size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tracking & stats</h1>
            <p className="text-sm text-text-secondary">
              Scrobble to Trakt and see what you watch — locally first.
            </p>
          </div>
        </div>
        <Button variant="outline" icon={<Download size={16} />} onClick={exportHistory}>
          Export history
        </Button>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Titles watched" value={String(watched.length)} icon={<Check size={18} />} />
        <StatCard
          label="In progress"
          value={String(continueWatching.length)}
          icon={<Clock3 size={18} />}
        />
        <StatCard
          label="Hours tracked"
          value={stats.hours.toFixed(1)}
          icon={<Film size={18} />}
        />
        <StatCard
          label="Languages"
          value={String(stats.languages.length)}
          icon={<Sparkles size={18} />}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4">
          <div className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#ED1C24]/15 text-[#FF5A5F]">
                  <Tv size={20} />
                </span>
                <div>
                  <h2 className="font-semibold">Trakt</h2>
                  <p className="text-sm text-text-secondary">
                    {trakt ? `Connected as ${trakt.username}` : "Scrobble playback and sync history"}
                  </p>
                </div>
              </div>
              {trakt ? (
                <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[rgb(var(--nuvio-success)/0.16)] px-2.5 py-1 text-[11px] font-semibold text-[rgb(var(--nuvio-success))]">
                  <Check size={11} /> Connected
                </span>
              ) : (
                <span className="shrink-0 whitespace-nowrap rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-text-tertiary">
                  Not connected
                </span>
              )}
            </div>

            {trakt ? (
              <div className="mt-4 space-y-3">
                <Toggle
                  checked={scrobbleEnabled}
                  onChange={setScrobbleEnabled}
                  label="Scrobble while playing"
                  description="Sends start, pause and stop events to Trakt."
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    disabled={syncing}
                    onClick={() => void syncHistory()}
                  >
                    Push history
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<LogOut size={15} />}
                    onClick={() => {
                      setTrakt(null);
                      pushToast("Disconnected Trakt", "info");
                    }}
                  >
                    Disconnect
                  </Button>
                  {lastSyncAt && (
                    <span className="self-center text-xs text-text-tertiary">
                      Last sync {relativeTime(lastSyncAt)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <Button
                variant="primary"
                className="mt-4"
                icon={<Link2 size={16} />}
                onClick={() => setTraktOpen(true)}
              >
                Connect Trakt
              </Button>
            )}
          </div>

          <div className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#00B0FF]/15 text-[#4FC3F7]">
                  <BarChart3 size={20} />
                </span>
                <div>
                  <h2 className="font-semibold">MDBList</h2>
                  <p className="text-sm text-text-secondary">
                    {mdblist ? `Connected as ${mdblist.username || "MDBList user"}` : "Import ratings and lists"}
                  </p>
                </div>
              </div>
              {mdblist ? (
                <span className="shrink-0 whitespace-nowrap rounded-full bg-[rgb(var(--nuvio-success)/0.16)] px-2.5 py-1 text-[11px] font-semibold text-[rgb(var(--nuvio-success))]">
                  Connected
                </span>
              ) : (
                <span className="shrink-0 whitespace-nowrap rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-text-tertiary">
                  Optional
                </span>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setMdblistOpen(true)}>
                {mdblist ? "Update key" : "Add API key"}
              </Button>
              {mdblist && (
                <Button variant="ghost" size="sm" onClick={() => setMdblist(null)}>
                  Disconnect
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#7E57C2]/15 text-[#B39DDB]">
                  <Tv size={20} />
                </span>
                <div>
                  <h2 className="font-semibold">Simkl</h2>
                  <p className="text-sm text-text-secondary">
                    {simkl ? `Connected as ${simkl.username || "Simkl user"}` : "Import watch history"}
                  </p>
                </div>
              </div>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-text-tertiary">
                Optional
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setSimklOpen(true)}>
                {simkl ? "Update token" : "Add access token"}
              </Button>
              {simkl && (
                <Button variant="ghost" size="sm" onClick={() => setSimkl(null)}>
                  Disconnect
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-tertiary">
              <Sparkles size={14} /> Your languages
            </h2>
            {stats.languages.length === 0 ? (
              <p className="mt-3 text-sm text-text-secondary">
                Start watching Indian titles and your language mix appears here.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {stats.languages.map(([language, count]) => {
                  const meta = languageFor(language);
                  const max = stats.languages[0][1] || 1;
                  return (
                    <div key={language} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-xs text-text-secondary">
                        {meta?.native ?? language}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(count / max) * 100}%`,
                            backgroundColor: meta?.color ?? "rgb(var(--nuvio-accent))",
                          }}
                        />
                      </div>
                      <span className="w-6 text-right text-xs text-text-tertiary">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-tertiary">
              <Clock3 size={14} /> Recent activity
            </h2>
            {stats.recent.length === 0 ? (
              <p className="mt-3 text-sm text-text-secondary">Nothing played yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {stats.recent.map((entry) => (
                  <div key={entry.contentId} className="flex items-center gap-3">
                    <div className="h-12 w-8 shrink-0 overflow-hidden rounded bg-white/8">
                      {entry.poster && (
                        <img src={entry.poster} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{entry.name}</p>
                      <p className="truncate text-[11px] text-text-tertiary">
                        {entry.season != null ? `S${entry.season}E${entry.episode}` : "Movie"} ·{" "}
                        {relativeTime(entry.lastWatched)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-panel border border-white/8 bg-white/[0.03] p-4 text-xs leading-relaxed text-text-tertiary">
            <ShieldCheck size={14} className="mb-1 inline text-[rgb(var(--nuvio-success))]" /> Trakt
            tokens and API keys stay in this browser. Nothing is sent to Nuvio servers.
          </div>
        </section>
      </div>

      {/* Trakt connect modal */}
      <Modal
        open={traktOpen}
        onClose={() => {
          if (pollTimer.current) window.clearTimeout(pollTimer.current);
          setTraktOpen(false);
          setDevice(null);
          setDeviceStatus("");
        }}
        title="Connect Trakt"
        description="Use your own Trakt application credentials. Create one at trakt.tv/oauth/applications."
        footer={
          device ? (
            <Button
              variant="ghost"
              onClick={() => {
                if (pollTimer.current) window.clearTimeout(pollTimer.current);
                setDevice(null);
                setDeviceStatus("");
              }}
            >
              Cancel
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setTraktOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void startTrakt()}>
                Continue
              </Button>
            </>
          )
        }
      >
        {device ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-text-secondary">
              Open Trakt and enter this code to approve Nuvio:
            </p>
            <p className="font-mono text-4xl font-black tracking-[0.3em]">{device.user_code}</p>
            <a
              href={device.verification_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--nuvio-accent))] hover:underline"
            >
              Open {device.verification_url} <ExternalLink size={14} />
            </a>
            <p className="flex items-center justify-center gap-2 text-xs text-text-tertiary">
              <Loader2 size={13} className="animate-spin" /> {deviceStatus || "Waiting for approval…"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Client ID
              </span>
              <input
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder="Trakt application client ID"
                className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none focus:border-[rgb(var(--nuvio-accent))]"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Client secret
              </span>
              <input
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                placeholder="Trakt application client secret"
                className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none focus:border-[rgb(var(--nuvio-accent))]"
              />
            </label>
            {deviceStatus && <p className="text-xs text-[rgb(var(--nuvio-error))]">{deviceStatus}</p>}
            <p className="text-xs text-text-tertiary">
              Trakt&apos;s device flow lets you approve Nuvio without a redirect URL. Credentials are
              stored only in this browser.
            </p>
          </div>
        )}
      </Modal>

      {/* MDBList modal */}
      <Modal
        open={mdblistOpen}
        onClose={() => setMdblistOpen(false)}
        title="Connect MDBList"
        description="Paste the API key from your MDBList account settings."
        footer={
          <>
            <Button variant="ghost" onClick={() => setMdblistOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!mdblistKey.trim()) return;
                setMdblist({
                  apiKey: mdblistKey.trim(),
                  username: mdblistUser.trim(),
                  connectedAt: Date.now(),
                });
                setMdblistOpen(false);
                pushToast("MDBList key saved", "success");
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <input
            value={mdblistKey}
            onChange={(event) => setMdblistKey(event.target.value)}
            placeholder="MDBList API key"
            className="h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none focus:border-[rgb(var(--nuvio-accent))]"
          />
          <input
            value={mdblistUser}
            onChange={(event) => setMdblistUser(event.target.value)}
            placeholder="Username (optional)"
            className="h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none focus:border-[rgb(var(--nuvio-accent))]"
          />
        </div>
      </Modal>

      {/* Simkl modal */}
      <Modal
        open={simklOpen}
        onClose={() => setSimklOpen(false)}
        title="Connect Simkl"
        description="Paste your Simkl client ID and access token."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSimklOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!simklClientId.trim() || !simklToken.trim()) return;
                setSimkl({
                  clientId: simklClientId.trim(),
                  accessToken: simklToken.trim(),
                  username: simklUser.trim(),
                  connectedAt: Date.now(),
                });
                setSimklOpen(false);
                pushToast("Simkl saved", "success");
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <input
            value={simklClientId}
            onChange={(event) => setSimklClientId(event.target.value)}
            placeholder="Simkl client ID"
            className="h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none focus:border-[rgb(var(--nuvio-accent))]"
          />
          <input
            type="password"
            value={simklToken}
            onChange={(event) => setSimklToken(event.target.value)}
            placeholder="Access token"
            className="h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none focus:border-[rgb(var(--nuvio-accent))]"
          />
          <input
            value={simklUser}
            onChange={(event) => setSimklUser(event.target.value)}
            placeholder="Username (optional)"
            className="h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none focus:border-[rgb(var(--nuvio-accent))]"
          />
        </div>
      </Modal>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-panel border border-white/8 bg-[rgb(var(--nuvio-card))] p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--nuvio-accent)/0.14)] text-[rgb(var(--nuvio-accent))]">
        {icon}
      </span>
      <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-text-tertiary">{label}</p>
    </div>
  );
}
