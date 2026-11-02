import { useNavigate } from "react-router-dom";
import { Play, X } from "lucide-react";
import type { WatchProgress } from "@/types";
import { AsyncImage } from "@/components/ui/AsyncImage";
import { cn } from "@/lib/cn";
import { episodeLabel, formatClock, progressPercent, relativeTime } from "@/lib/format";

interface ContinueWatchingRowProps {
  items: WatchProgress[];
  onRemove: (item: WatchProgress) => void;
  onSelect: (item: WatchProgress, fromBeginning: boolean) => void;
  loading?: boolean;
}

/** Landscape cards scale with the viewport, mirroring the poster rails. */
const CARD_WIDTH = "clamp(230px, 68vw, 300px)";

export function ContinueWatchingRow({
  items,
  onRemove,
  onSelect,
  loading,
}: ContinueWatchingRowProps) {
  const navigate = useNavigate();

  if (!loading && items.length === 0) return null;

  return (
    <section className="group/row relative">
      <header className="mb-3 flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <h2 className="text-base font-semibold tracking-tight sm:text-lg">
          Continue watching
        </h2>
      </header>

      <div className="no-scrollbar snap-x-mandatory edge-fade flex gap-3 overflow-x-auto scroll-smooth scroll-pl-4 pb-2 sm:scroll-pl-6 sm:gap-4 sm:px-6 lg:scroll-pl-8 lg:px-8">
        {loading
          ? Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="shrink-0" style={{ width: CARD_WIDTH }}>
                <div className="shimmer aspect-video w-full rounded-panel" />
              </div>
            ))
          : items.map((item) => {
              const percent = progressPercent(item.position, item.duration);
              const remaining = Math.max(0, item.duration - item.position);
              const label =
                item.contentType === "series"
                  ? episodeLabel(item.season, item.episode)
                  : relativeTime(item.lastWatched);
              return (
                <div
                  key={item.contentId}
                  className="group/cw relative shrink-0 snap-start-item"
                  style={{ width: CARD_WIDTH }}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(item, false)}
                    className="block w-full text-left"
                    aria-label={`Resume ${item.name}`}
                  >
                    <div className="relative aspect-video overflow-hidden rounded-panel bg-[rgb(var(--nuvio-surface))] transition-transform duration-300 ease-nuvio group-hover/cw:scale-[1.02] group-focus-within/cw:scale-[1.02]">
                      <AsyncImage
                        src={item.backdrop ?? item.poster}
                        alt={item.name}
                        className="h-full w-full"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover/cw:opacity-100 group-focus-within/cw:opacity-100">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-black shadow-lift">
                          <Play size={20} className="translate-x-0.5 fill-black" />
                        </span>
                      </span>
                      <span className="absolute left-2.5 top-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur">
                        {label}
                      </span>
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                        <div
                          className="h-full accent-gradient"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    aria-label={`Remove ${item.name} from continue watching`}
                    onClick={() => onRemove(item)}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white opacity-0 backdrop-blur transition-opacity duration-200 hover:bg-black/90 group-hover/cw:opacity-100 group-focus-within/cw:opacity-100"
                  >
                    <X size={14} />
                  </button>

                  <div className="mt-2.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-medium">{item.name}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-text-tertiary">
                        {item.episodeTitle ? ` · ${item.episodeTitle}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-text-tertiary">
                      {formatClock(remaining)} left
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(itemDetailPath(item))}
                    className="mt-1 text-xs font-medium text-text-tertiary underline-offset-2 transition-colors hover:text-[rgb(var(--nuvio-accent))] hover:underline"
                  >
                    Details
                  </button>
                </div>
              );
            })}
      </div>
    </section>
  );
}

function itemDetailPath(item: WatchProgress): string {
  return `/detail/${encodeURIComponent(item.contentType)}/${encodeURIComponent(item.contentId)}`;
}

export function ContinueWatchingEmpty({ className }: { className?: string }) {
  return <div className={cn("hidden", className)} />;
}
