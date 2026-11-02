import { NavLink } from "react-router-dom";
import { Compass, Home, Layers, Menu, Tv } from "lucide-react";
import { useUi } from "@/store/ui";
import { cn } from "@/lib/cn";

const TABS = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/jiotv", label: "JioTV", icon: Tv, end: false },
  { to: "/discover", label: "Discover", icon: Compass, end: false },
  { to: "/library", label: "Library", icon: Layers, end: false },
];

/**
 * Bottom tab bar for phones. The last slot opens the full navigation drawer
 * so every destination stays reachable without crowding the bar.
 */
export function MobileNav() {
  const setMobileNavOpen = useUi((state) => state.setMobileNavOpen);

  return (
    <nav
      aria-label="Primary"
      className="glass-strong fixed inset-x-0 bottom-0 z-40 border-t border-white/8 pb-safe"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1.5">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "group relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-colors duration-200",
                isActive ? "text-text-primary" : "text-text-tertiary",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "flex h-8 w-14 items-center justify-center rounded-full transition-all duration-300 ease-nuvio",
                    isActive
                      ? "bg-[rgb(var(--nuvio-accent)/0.18)] text-[rgb(var(--nuvio-accent))]"
                      : "text-text-tertiary",
                  )}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span className="truncate leading-none">{label}</span>
              </>
            )}
          </NavLink>
        ))}

        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
          className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium text-text-tertiary transition-colors duration-200"
        >
          <span className="flex h-8 w-14 items-center justify-center rounded-full">
            <Menu size={20} />
          </span>
          <span className="leading-none">More</span>
        </button>
      </div>
    </nav>
  );
}
