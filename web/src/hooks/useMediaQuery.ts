import { useEffect, useState } from "react";

/** Subscribes to a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
export const useIsTablet = () => useMediaQuery("(min-width: 768px)");
/** Phones and small tablets — the breakpoint that drives the bottom tab bar. */
export const useIsMobile = () => useMediaQuery("(max-width: 1023px)");
/** Extra-small phones where two-column grids get cramped. */
export const useIsCompact = () => useMediaQuery("(max-width: 479px)");
/** Coarse pointers cannot hover, so hover-only affordances need fallbacks. */
export const useHasTouch = () => useMediaQuery("(hover: none) and (pointer: coarse)");
export const usePrefersReducedMotion = () =>
  useMediaQuery("(prefers-reduced-motion: reduce)");
