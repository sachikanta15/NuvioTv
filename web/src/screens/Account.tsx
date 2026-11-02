import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Check,
  CloudDownload,
  CloudUpload,
  ExternalLink,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Sparkles,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { SUPPORT_URL, isAuthConfigured } from "@/lib/config";
import { tierLabel, type CosmeticEntitlement, type MemberTier } from "@/lib/member-access";
import { useAuth } from "@/store/auth";
import { useUi } from "@/store/ui";

const ENTITLEMENT_LABELS: Record<CosmeticEntitlement, string> = {
  GOLD_THEME: "Gold theme",
  JADE_THEME: "Jade theme",
  ROSE_GOLD_THEME: "Rose Gold theme",
  ARCTIC_BLUE_THEME: "Arctic Blue theme",
  GRAPHITE_THEME: "Graphite theme",
  PROFILE_BACKGROUNDS: "Profile backgrounds",
  PROFILE_AVATARS: "Extra profile avatars",
};

export function AccountScreen() {
  const status = useAuth((state) => state.status);
  const session = useAuth((state) => state.session);
  const memberAccess = useAuth((state) => state.memberAccess);
  const memberAccessLoading = useAuth((state) => state.memberAccessLoading);
  const memberAccessError = useAuth((state) => state.memberAccessError);
  const restoring = useAuth((state) => state.restoringAddons);
  const signIn = useAuth((state) => state.signIn);
  const signUp = useAuth((state) => state.signUp);
  const signOut = useAuth((state) => state.signOut);
  const refreshMemberAccess = useAuth((state) => state.refreshMemberAccess);
  const restoreAddons = useAuth((state) => state.restoreAddons);
  const syncAddons = useAuth((state) => state.syncAddons);
  const pushToast = useUi((state) => state.pushToast);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [mode]);

  if (!isAuthConfigured) {
    return (
      <div className="space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Account</h1>
          <p className="text-sm text-text-secondary">Sign in to sync your add-ons and membership.</p>
        </header>
        <EmptyState
          icon={<AlertCircle size={24} />}
          title="Account services are not configured"
          description="This build has no Supabase backend configured, so sign-in, the supporter membership and cloud add-on restore are unavailable. Everything else works as usual."
        />
      </div>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await signUp(email, password);
      else await signIn(email, password);
      pushToast(
        mode === "signup" ? "Account created" : "Signed in",
        "success",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const signedIn = status === "signed_in" && session;

  return (
    <div className="space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="text-sm text-text-secondary">
          One Nuvio account for the app and the web — sign in to sync your add-ons and membership.
        </p>
      </header>

      {!signedIn && (
        <section className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
          <div className="mb-5 inline-flex rounded-full border border-white/8 bg-white/5 p-1">
            {(
              [
                { id: "signin", label: "Sign in" },
                { id: "signup", label: "Create account" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                onClick={() => setMode(option.id)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200",
                  mode === option.id
                    ? "accent-gradient text-on-accent shadow-glow"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="account-email" className="mb-2 block text-sm font-medium">
                Email
              </label>
              <input
                id="account-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none transition-colors placeholder:text-text-tertiary focus:border-[rgb(var(--nuvio-accent))]"
              />
            </div>
            <div>
              <label htmlFor="account-password" className="mb-2 block text-sm font-medium">
                Password
              </label>
              <input
                id="account-password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none transition-colors placeholder:text-text-tertiary focus:border-[rgb(var(--nuvio-accent))]"
              />
            </div>

            {error && (
              <p className="flex items-start gap-2 rounded-xl border border-[rgb(var(--nuvio-error)/0.4)] bg-[rgb(var(--nuvio-error)/0.08)] px-3 py-2.5 text-sm text-[rgb(var(--nuvio-error))]">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              block
              disabled={busy}
              icon={busy ? <Spinner size={16} /> : <LogIn size={16} />}
            >
              {mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="mt-4 text-xs leading-relaxed text-text-tertiary">
            Signing in restores the add-ons saved on your other Nuvio devices and unlocks your
            supporter themes.
          </p>
        </section>
      )}

      {signedIn && (
        <>
          <section className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--nuvio-accent)/0.14)] text-[rgb(var(--nuvio-accent))]">
                <User size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{session.user.email}</p>
                <p className="text-sm text-text-secondary">
                  {memberAccess.tier ? tierLabel(memberAccess.tier) : "Signed in"}
                </p>
              </div>
              <Button
                variant="outline"
                icon={<LogOut size={16} />}
                onClick={() => {
                  void signOut();
                  pushToast("Signed out", "info");
                }}
              >
                Sign out
              </Button>
            </div>
          </section>
        </>
      )}

      {/* Membership — mirrors the Android supporter panel. */}
      <MembershipCard
        signedIn={!!signedIn}
        tier={memberAccess.tier}
        entitlements={memberAccess.entitlements}
        loading={memberAccessLoading}
        error={memberAccessError}
        onRefresh={() => void refreshMemberAccess()}
      />

      {signedIn && (
        /* Cloud add-on restore. */
        <section className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <CloudDownload size={17} className="text-[rgb(var(--nuvio-accent))]" />
            Add-on sync
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Your add-ons are stored with your Nuvio account. Restoring replaces the list on this
            browser with the one saved on your other devices.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              disabled={restoring}
              icon={
                restoring ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CloudDownload size={16} />
                )
              }
              onClick={() => void restoreAddons()}
            >
              {restoring ? "Restoring…" : "Restore add-ons from account"}
            </Button>
            <Button
              variant="outline"
              disabled={restoring}
              icon={<CloudUpload size={16} />}
              onClick={() => {
                if (
                  !window.confirm(
                    "Replace the add-ons saved on your account with the list from this browser?",
                  )
                ) {
                  return;
                }
                void syncAddons();
              }}
            >
              Sync this list to account
            </Button>
            <Link to="/addons">
              <Button variant="outline">Manage add-ons</Button>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

interface MembershipCardProps {
  signedIn: boolean;
  tier: MemberTier | null;
  entitlements: CosmeticEntitlement[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function MembershipCard({
  signedIn,
  tier,
  entitlements,
  loading,
  error,
  onRefresh,
}: MembershipCardProps) {
  return (
    <section className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles
              size={17}
              className={cn(
                tier ? "text-[rgb(var(--nuvio-accent))]" : "text-text-tertiary",
              )}
            />
            Nuvio Supporter Membership
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {loading
              ? "Loading membership…"
              : !signedIn
                ? "Sign in with your Nuvio account to check your membership and restore your add-ons."
                : tier
                  ? `You're a ${tierLabel(tier)}. Thank you.`
                  : "Supporting Nuvio helps cover infrastructure and ongoing development while keeping the core experience free for everyone."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {signedIn && (
            <IconButton
              label="Refresh membership"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw size={17} className={cn(loading && "animate-spin")} />
            </IconButton>
          )}
          <a href={SUPPORT_URL} target="_blank" rel="noreferrer">
            <Button variant="primary" iconRight={<ExternalLink size={15} />}>
              {tier ? "Manage membership" : "View membership"}
            </Button>
          </a>
        </div>
      </div>

      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-[rgb(var(--nuvio-warning)/0.4)] bg-[rgb(var(--nuvio-warning)/0.08)] px-3 py-2.5 text-sm text-[rgb(var(--nuvio-warning))]">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {error} — showing your last known status.
        </p>
      )}

      {tier ? (
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {entitlements.map((entitlement) => (
            <li
              key={entitlement}
              className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm"
            >
              <Check size={14} className="shrink-0 text-[rgb(var(--nuvio-success))]" />
              {ENTITLEMENT_LABELS[entitlement] ?? entitlement}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-medium text-text-secondary">Supporter unlocks</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {Object.entries(ENTITLEMENT_LABELS).map(([key, label]) => (
              <li
                key={key}
                className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm text-text-secondary"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-tertiary" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
