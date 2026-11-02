import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileNav } from "./MobileNav";
import { Toasts } from "@/components/ui/Toasts";
import { PlayerOverlay } from "@/components/player/PlayerOverlay";
import { useUi } from "@/store/ui";
import { useProfiles } from "@/store/profiles";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { usePartySync } from "@/hooks/usePartySync";

export function AppShell() {
  const location = useLocation();
  const isDesktop = useIsDesktop();
  usePartySync();
  const toggleSidebar = useUi((state) => state.toggleSidebar);
  const mobileNavOpen = useUi((state) => state.mobileNavOpen);
  const setMobileNavOpen = useUi((state) => state.setMobileNavOpen);
  const activeProfileId = useProfiles((state) => state.activeProfileId);

  // Scroll the content region to top on navigation.
  useEffect(() => {
    document.getElementById("nuvio-scroll")?.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Lock the page behind the mobile drawer.
  useEffect(() => {
    if (isDesktop || !mobileNavOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isDesktop, mobileNavOpen]);

  // Close the drawer when the viewport grows past the desktop breakpoint.
  useEffect(() => {
    if (isDesktop && mobileNavOpen) setMobileNavOpen(false);
  }, [isDesktop, mobileNavOpen, setMobileNavOpen]);

  // Escape closes the mobile drawer, matching the modal behaviour.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen, setMobileNavOpen]);

  // Detail is immersive: the hero runs under the top bar and the tab bar
  // gives way to the page's own action bar. The source picker is a normal
  // scrolling page, so it keeps the shell's top spacer and tab bar.
  const immersive = location.pathname.startsWith("/detail");

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[rgb(var(--nuvio-bg))]">
      {/* Desktop sidebar */}
      {isDesktop && (
        <div
          onDoubleClick={toggleSidebar}
          className="shrink-0"
          title="Double-click to collapse"
        >
          <Sidebar />
        </div>
      )}

      {/* Mobile drawer */}
      {!isDesktop && mobileNavOpen && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm"
          />
          <div className="animate-slide-in-left absolute inset-y-0 left-0 w-[min(82vw,300px)] shadow-lift">
            <Sidebar onNavigate={() => setMobileNavOpen(false)} mobile />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main
          id="nuvio-scroll"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth"
        >
          {/* Keep the first screen clear of the floating top bar, except on
              routes whose artwork is designed to run underneath it. */}
          {location.pathname !== "/" && !immersive && (
            <div className="h-14 sm:h-16" aria-hidden />
          )}
          {/* Remount routes when the profile changes so profile-scoped data refreshes. */}
          <div key={`${location.pathname}-${activeProfileId}`} className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>

      <Toasts />
      <PlayerOverlay />

      {/* Mobile bottom tab bar */}
      {!isDesktop && !immersive && <MobileNav />}
    </div>
  );
}
