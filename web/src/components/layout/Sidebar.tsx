import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Compass,
  FolderHeart,
  Home,
  Layers,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PartyPopper,
  Puzzle,
  Search,
  Settings,
  Tv,
  UserCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useUi } from "@/store/ui";
import { useProfiles } from "@/store/profiles";
import { useAuth } from "@/store/auth";
import { initials } from "@/lib/format";

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/discover", label: "Discover", icon: Compass, end: false },
  { to: "/jiotv", label: "Live TV", icon: Tv, end: false },
  { to: "/search", label: "Search", icon: Search, end: false },
  { to: "/library", label: "Library", icon: Layers, end: false },
  { to: "/collections", label: "Collections", icon: FolderHeart, end: false },
  { to: "/party", label: "Watch party", icon: PartyPopper, end: false },
  { to: "/tracking", label: "Tracking", icon: BarChart3, end: false },
  { to: "/ambient", label: "Ambient", icon: Moon, end: false },
  { to: "/addons", label: "Add-ons", icon: Puzzle, end: false },
  { to: "/account", label: "Account", icon: UserCircle, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

interface SidebarProps {
  onNavigate?: () => void;
  /** Drawer presentation: wider, always expanded, with a close affordance. */
  mobile?: boolean;
}

export function Sidebar({ onNavigate, mobile = false }: SidebarProps) {
  const collapsed = useUi((state) => state.sidebarCollapsed);
  const toggleSidebar = useUi((state) => state.toggleSidebar);
  const setMobileNavOpen = useUi((state) => state.setMobileNavOpen);
  const memberTier = useAuth((state) => state.memberAccess.tier);
  const signedIn = useAuth((state) => state.status === "signed_in");
  const profile = useProfiles((state) =>
    state.profiles.find((entry) => entry.id === state.activeProfileId),
  );

  const isCollapsed = !mobile && collapsed;

  return (
    <nav
      id="nuvio-sidebar"
      aria-label="Primary"
      className={cn(
        "relative flex h-full flex-col bg-[rgb(var(--nuvio-bg-elevated))] transition-[width] duration-300 ease-nuvio",
        mobile
          ? "w-full border-r border-white/8"
          : "border-r border-white/8 px-3 py-4",
        !mobile && (isCollapsed ? "w-[76px]" : "w-[240px]"),
      )}
    >
      {isCollapsed && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Open sidebar"
          aria-controls="nuvio-sidebar"
          aria-expanded={false}
          title="Open sidebar"
          className="absolute -right-3.5 top-24 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-[rgb(var(--nuvio-accent)/0.45)] bg-[rgb(var(--nuvio-bg-elevated))] text-[rgb(var(--nuvio-accent))] shadow-soft transition-colors hover:bg-[rgb(var(--nuvio-accent))] hover:text-on-accent"
        >
          <PanelLeftOpen size={13} />
        </button>
      )}
      <div
        className={cn(
          "flex items-center gap-3",
          mobile ? "px-4 py-4" : "mb-6 px-2",
          isCollapsed && "justify-center px-0",
        )}
      >
        {isCollapsed ? (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Expand sidebar"
            aria-controls="nuvio-sidebar"
            aria-expanded={false}
            title="Expand sidebar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl accent-gradient text-lg font-black text-on-accent shadow-glow"
          >
            N
          </button>
        ) : (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl accent-gradient text-lg font-black text-on-accent shadow-glow">
              N
            </span>
            <span className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight">
              Nuvio<span className="text-[rgb(var(--nuvio-accent))]">TV</span>
            </span>
            <span
              className="shrink-0 rounded-full bg-[#FF8F1F]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#FFB347]"
              title="India-first"
            >
              IN
            </span>
            {!mobile && (
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Collapse sidebar"
                aria-controls="nuvio-sidebar"
                aria-expanded
                title="Collapse sidebar"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-text-secondary transition-colors hover:border-white/25 hover:bg-white/10 hover:text-text-primary"
              >
                <PanelLeftClose size={17} />
              </button>
            )}
          </>
        )}
        {mobile && (
          <button
            type="button"
            aria-label="Close menu"
            aria-controls="nuvio-sidebar"
            onClick={() => setMobileNavOpen(false)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-white/10 hover:text-text-primary"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div
        className={cn(
          "no-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto",
          mobile && "px-3",
        )}
      >
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            title={isCollapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-nuvio",
                isCollapsed && "justify-center px-0",
                isActive
                  ? "bg-[rgb(var(--nuvio-accent)/0.16)] text-[rgb(var(--nuvio-accent))]"
                  : "text-text-secondary hover:bg-white/5 hover:text-text-primary",
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Active rail marker */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[rgb(var(--nuvio-accent))] transition-all duration-300",
                    isActive ? "opacity-100" : "scale-y-0 opacity-0",
                  )}
                />
                <Icon
                  size={20}
                  className={cn(
                    "shrink-0 transition-transform duration-200",
                    isActive ? "scale-105" : "group-hover:scale-105",
                  )}
                />
                {!isCollapsed && <span className="truncate">{label}</span>}
                {to === "/account" && memberTier && (
                  <span
                    aria-label="Supporter"
                    title="Supporter"
                    className="ml-auto h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--nuvio-accent))] shadow-glow"
                  />
                )}
                {to === "/account" && !memberTier && signedIn && (
                  <span
                    aria-label="Signed in"
                    title="Signed in"
                    className="ml-auto h-2 w-2 shrink-0 rounded-full bg-white/25"
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>

      <div className={cn("mt-auto shrink-0", mobile ? "p-3 pb-safe" : "px-1")}>
        <NavLink
          to="/profiles"
          onClick={onNavigate}
          title={isCollapsed ? (profile?.name ?? "Profiles") : undefined}
          className={cn(
            "flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/5",
            isCollapsed && "justify-center px-0",
          )}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ring-2 ring-white/10"
            style={{ backgroundColor: profile?.color ?? "#8E24AA" }}
          >
            {profile?.name ? initials(profile.name) : "?"}
          </span>
          {!isCollapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {profile?.name ?? "Profiles"}
              </span>
              <span className="block text-xs text-text-tertiary">Switch profile</span>
            </span>
          )}
        </NavLink>
      </div>
    </nav>
  );
}
