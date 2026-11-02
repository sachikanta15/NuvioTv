import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Menu, Search, X } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useUi } from "@/store/ui";
import { cn } from "@/lib/cn";

/** Human-readable label for the current route, shown in the mobile header. */
function routeTitle(pathname: string): string {
  if (pathname === "/") return "Nuvio";
  if (pathname.startsWith("/detail")) return "Details";
  if (pathname.startsWith("/stream")) return "Sources";
  if (pathname.startsWith("/browse")) return "Catalog";
  if (pathname.startsWith("/collections/")) return "Collection";
  if (pathname.startsWith("/india")) return "Made for India";
  if (pathname.startsWith("/party")) return "Watch party";
  if (pathname.startsWith("/tracking")) return "Tracking";
  if (pathname.startsWith("/ambient")) return "Ambient";
  const segment = pathname.split("/").filter(Boolean)[0] ?? "";
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const setMobileNavOpen = useUi((state) => state.setMobileNavOpen);
  const mobileNavOpen = useUi((state) => state.mobileNavOpen);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);

  /* Keyboard shortcuts: "/" and ⌘K focus search. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* The bar turns solid once the content region is scrolled. */
  useEffect(() => {
    const container = document.getElementById("nuvio-scroll");
    if (!container) return;
    const onScroll = () => setScrolled(container.scrollTop > 12);
    onScroll();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  /* Focus the mobile search field when the sheet opens. */
  useEffect(() => {
    if (sheetOpen) {
      const timer = setTimeout(() => sheetInputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
  }, [sheetOpen]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    setExpanded(false);
    setSheetOpen(false);
    inputRef.current?.blur();
  };

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-40 pt-safe transition-colors duration-300",
          scrolled
            ? "glass shadow-soft"
            : "bg-gradient-to-b from-black/60 via-black/25 to-transparent",
        )}
      >
        <div className="flex h-14 items-center gap-3 px-4 sm:h-16 sm:px-6 lg:px-8">
          {/* Mobile: brand + current section */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5 lg:hidden">
            <IconButton
              label="Open menu"
              aria-controls="nuvio-sidebar"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu size={20} />
            </IconButton>
            <span className="truncate text-base font-semibold tracking-tight">
              {routeTitle(location.pathname)}
            </span>
          </div>

          {/* Desktop: search lives on the right */}
          <form
            onSubmit={submit}
            className={cn(
              "ml-auto hidden items-center gap-2 rounded-full transition-all duration-300 ease-nuvio focus-within:bg-white/10 lg:flex",
              scrolled
                ? "bg-white/5"
                : "border border-white/10 bg-black/45 backdrop-blur-md",
              expanded ? "w-full max-w-md px-4" : "w-auto px-3 sm:w-72",
            )}
          >
            <Search size={18} className="shrink-0 text-text-tertiary" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setExpanded(true)}
              onBlur={() => setExpanded(false)}
              placeholder="Search Indian movies, series, actors…"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
              aria-label="Search"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setQuery("")}
                className="text-text-tertiary transition-colors hover:text-text-primary"
              >
                <X size={16} />
              </button>
            )}
            {!expanded && (
              <kbd className="hidden rounded border border-white/15 px-1.5 text-[10px] text-text-tertiary xl:block">
                /
              </kbd>
            )}
          </form>

          {/* Mobile: search button that opens a full-width sheet */}
          <IconButton
            label="Search"
            className="lg:hidden"
            onClick={() => setSheetOpen(true)}
          >
            <Search size={20} />
          </IconButton>
        </div>
      </header>

      {/* Mobile search sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            aria-label="Close search"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm"
          />
          <div className="glass-strong absolute inset-x-0 top-0 animate-slide-down rounded-b-panel-lg border-x-0 border-t-0 p-4 pb-safe">
            <form onSubmit={submit} className="flex items-center gap-2">
              <IconButton label="Close search" onClick={() => setSheetOpen(false)}>
                <ArrowLeft size={20} />
              </IconButton>
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white/8 px-4 focus-within:bg-white/12">
                <Search size={18} className="shrink-0 text-text-tertiary" />
                <input
                  ref={sheetInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search Indian movies, series, actors…"
                  className="h-11 min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
                  aria-label="Search"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                    className="text-text-tertiary transition-colors hover:text-text-primary"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
