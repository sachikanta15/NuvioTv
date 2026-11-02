import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MetaPreview } from "@/types";
import { cn } from "@/lib/cn";
import { PosterCard, type PosterShapeKind } from "./PosterCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSettings } from "@/store/settings";

interface MediaRowProps {
  title?: string;
  subtitle?: string;
  items: MetaPreview[];
  addonUrl?: string;
  shape?: PosterShapeKind;
  loading?: boolean;
  /** Renders a trailing "See all" action. */
  onSeeAll?: () => void;
  progressFor?: (meta: MetaPreview) => number | undefined;
  onItemSelect?: (meta: MetaPreview) => void;
  onToggleWatchlist?: (meta: MetaPreview) => void;
  inList?: (contentId: string) => boolean;
  emptyMessage?: string;
}

/**
 * Card width scales with the viewport and is capped by the user's
 * "Poster size" preference, so rows look right from a 360 px phone up to a
 * 4K display.
 */
function cardWidth(shape: PosterShapeKind, preferred: number): string {
  if (shape === "poster" || shape === "square") {
    return `clamp(104px, 30vw, ${preferred}px)`;
  }
  const max = Math.round(preferred * 2);
  return `clamp(210px, 68vw, ${max}px)`;
}

export function MediaRow({
  title,
  subtitle,
  items,
  addonUrl,
  shape = "poster",
  loading,
  onSeeAll,
  progressFor,
  onItemSelect,
  onToggleWatchlist,
  inList,
  emptyMessage,
}: MediaRowProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const preferredWidth = useSettings((state) => state.cardWidth);
  const width = cardWidth(shape, preferredWidth);

  const updateArrows = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    setCanScrollLeft(node.scrollLeft > 8);
    setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateArrows();
    const node = scroller.current;
    if (!node) return;
    const observer = new ResizeObserver(updateArrows);
    observer.observe(node);
    return () => observer.disconnect();
  }, [items, updateArrows]);

  const scrollBy = (direction: -1 | 1) => {
    const node = scroller.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.85, behavior: "smooth" });
  };

  if (!loading && items.length === 0 && !emptyMessage) return null;

  return (
    <section className="group/row relative">
      {(title || onSeeAll) && (
        <header className="mb-3 flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2.5">
              {title && (
                <h2 className="truncate text-base font-semibold tracking-tight sm:text-lg">
                  {title}
                </h2>
              )}
              {!loading && items.length > 0 && (
                <span className="shrink-0 rounded-full bg-white/6 px-2 py-0.5 text-[11px] font-medium text-text-tertiary">
                  {items.length}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-text-tertiary">{subtitle}</p>
            )}
          </div>
          {onSeeAll && (
            <button
              onClick={onSeeAll}
              className="group/seeall flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
            >
              See all
              <ChevronRight
                size={15}
                className="transition-transform duration-200 group-hover/seeall:translate-x-0.5"
              />
            </button>
          )}
        </header>
      )}

      <div className="relative">
        {canScrollLeft && (
          <button
            aria-label="Scroll left"
            onClick={() => scrollBy(-1)}
            className="absolute -left-2 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[rgb(var(--nuvio-bg-elevated))]/90 text-white opacity-0 shadow-lift backdrop-blur transition-all duration-200 hover:scale-105 hover:opacity-100 focus-visible:opacity-100 group-hover/row:opacity-100 md:flex"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {canScrollRight && (
          <button
            aria-label="Scroll right"
            onClick={() => scrollBy(1)}
            className="absolute -right-2 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[rgb(var(--nuvio-bg-elevated))]/90 text-white opacity-0 shadow-lift backdrop-blur transition-all duration-200 hover:scale-105 hover:opacity-100 focus-visible:opacity-100 group-hover/row:opacity-100 md:flex"
          >
            <ChevronRight size={20} />
          </button>
        )}

        <div
          ref={scroller}
          onScroll={updateArrows}
          className={cn(
            "no-scrollbar snap-x-mandatory edge-fade flex gap-3 overflow-x-auto scroll-smooth scroll-pl-4 pb-2 sm:scroll-pl-6 sm:px-6 lg:scroll-pl-8 lg:px-8",
            shape === "poster" ? "gap-3" : "gap-4",
          )}
        >
          {loading
            ? Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="shrink-0" style={{ width }}>
                  <Skeleton
                    className={cn(
                      "w-full rounded-panel",
                      shape === "poster" ? "aspect-[2/3]" : "aspect-video",
                    )}
                  />
                  <Skeleton className="mt-2.5 h-3.5 w-3/4" />
                  <Skeleton className="mt-1.5 h-3 w-1/3" />
                </div>
              ))
            : items.map((meta) => (
                <div
                  key={`${meta.id}`}
                  className="shrink-0 snap-start-item"
                  style={{ width }}
                >
                  <PosterCard
                    meta={meta}
                    addonUrl={addonUrl ?? meta.sourceAddonUrl}
                    shape={shape}
                    progress={progressFor?.(meta)}
                    inWatchlist={inList?.(meta.id)}
                    onToggleWatchlist={onToggleWatchlist}
                  />
                  {onItemSelect && (
                    <button className="sr-only" onClick={() => onItemSelect(meta)}>
                      Select {meta.name}
                    </button>
                  )}
                </div>
              ))}
          {!loading && items.length === 0 && emptyMessage && (
            <p className="py-6 text-sm text-text-tertiary">{emptyMessage}</p>
          )}
        </div>
      </div>
    </section>
  );
}
