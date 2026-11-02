import { useNavigate } from "react-router-dom";
import { ChevronRight, Play, Star } from "lucide-react";
import type { MetaPreview } from "@/types";
import { AsyncImage } from "@/components/ui/AsyncImage";
import { RatingBadge } from "@/components/ui/RatingBadge";
import { yearOf } from "@/lib/format";
import { useSettings } from "@/store/settings";
import { cn } from "@/lib/cn";

interface TopTenRowProps {
  title: string;
  subtitle?: string;
  items: MetaPreview[];
  onSeeAll?: () => void;
  className?: string;
}

/**
 * A "Top 10 in India" rail. The oversized outlined rank is drawn behind each
 * poster, the same visual language streaming services use for trending rows.
 */
export function TopTenRow({ title, subtitle, items, onSeeAll, className }: TopTenRowProps) {
  const navigate = useNavigate();
  const showLabels = useSettings((state) => state.posterLabelsEnabled);
  const ratingsVisibility = useSettings((state) => state.imdbRatingsVisibility);

  if (items.length === 0) return null;

  return (
    <section className={cn("group/row relative", className)}>
      <header className="mb-3 flex items-end justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-tight sm:text-lg">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-text-tertiary">{subtitle}</p>}
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

      <div className="no-scrollbar edge-fade flex gap-1 overflow-x-auto scroll-smooth px-4 pb-2 sm:px-6 lg:px-8">
        {items.map((meta, index) => {
          const year = yearOf(meta.releaseInfo ?? meta.released);
          return (
            <button
              key={meta.id}
              type="button"
              onClick={() =>
                navigate(
                  `/detail/${encodeURIComponent(meta.type)}/${encodeURIComponent(meta.id)}${
                    meta.sourceAddonUrl
                      ? `?addon=${encodeURIComponent(meta.sourceAddonUrl)}`
                      : ""
                  }`,
                )
              }
              className="group/card relative flex shrink-0 items-end text-left"
              style={{ width: "clamp(150px, 42vw, 210px)" }}
              aria-label={`Open ${meta.name}, rank ${index + 1}`}
            >
              <span
                aria-hidden
                className="pointer-events-none select-none pb-1 pr-1 text-[clamp(72px,20vw,104px)] font-black leading-[0.7] tracking-tighter text-transparent transition-transform duration-300 group-hover/card:-translate-x-0.5"
                style={{ WebkitTextStroke: "2px rgb(255 255 255 / 0.32)" }}
              >
                {index + 1}
              </span>
              <div className="relative -ml-3 aspect-[2/3] w-[calc(100%-2.25rem)] shrink-0 overflow-hidden rounded-panel bg-[rgb(var(--nuvio-surface))] shadow-card transition-transform duration-300 ease-nuvio group-hover/card:-translate-y-1.5 group-focus-visible/card:-translate-y-1.5">
                <AsyncImage
                  src={meta.poster ?? meta.landscapePoster}
                  alt={meta.name}
                  className="h-full w-full"
                  loading={index < 4 ? "eager" : "lazy"}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent opacity-70" />
                <div className="absolute right-1.5 top-1.5">
                  {ratingsVisibility === "all" && (
                    <RatingBadge rating={meta.imdbRating} compact />
                  )}
                </div>
                <div className="absolute inset-x-0 bottom-0 p-2.5">
                  <p className="line-clamp-2 text-xs font-semibold leading-tight text-white drop-shadow">
                    {meta.name}
                  </p>
                  {showLabels && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-white/65">
                      {meta.imdbRating && (
                        <span className="flex items-center gap-0.5 text-rating">
                          <Star size={9} className="fill-rating" />
                          {String(meta.imdbRating).slice(0, 3)}
                        </span>
                      )}
                      {year && <span>{year}</span>}
                      {meta.language && <span className="uppercase">{meta.language}</span>}
                    </p>
                  )}
                </div>
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover/card:opacity-100">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-black shadow-lift">
                    <Play size={16} className="translate-x-0.5 fill-black" />
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
