import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, Check, Play } from "lucide-react";
import type { MetaPreview } from "@/types";
import { cn } from "@/lib/cn";
import { AsyncImage } from "@/components/ui/AsyncImage";
import { RatingBadge } from "@/components/ui/RatingBadge";
import { progressPercent, yearOf } from "@/lib/format";
import { useSettings } from "@/store/settings";

export type PosterShapeKind = "poster" | "landscape" | "square" | "wide";

interface PosterCardProps {
  meta: MetaPreview;
  /** Originating add-on URL, used for detail lookups. */
  addonUrl?: string;
  catalogId?: string;
  catalogName?: string;
  shape?: PosterShapeKind;
  /** 0–100 resume progress. */
  progress?: number;
  duration?: number;
  position?: number;
  watched?: boolean;
  inWatchlist?: boolean;
  onToggleWatchlist?: (meta: MetaPreview) => void;
  /** Overrides the default card subtitle (defaults to release year). */
  subtitle?: string;
  priority?: boolean;
  className?: string;
}

const SHAPE_CLASS: Record<PosterShapeKind, string> = {
  poster: "aspect-[2/3]",
  landscape: "aspect-video",
  square: "aspect-square",
  wide: "aspect-[16/10]",
};

function buildDetailPath(meta: MetaPreview, addonUrl?: string) {
  const params = new URLSearchParams();
  if (addonUrl) params.set("addon", addonUrl);
  const query = params.toString();
  return `/detail/${encodeURIComponent(meta.type)}/${encodeURIComponent(meta.id)}${
    query ? `?${query}` : ""
  }`;
}

export const PosterCard = memo(function PosterCard({
  meta,
  addonUrl,
  shape = "poster",
  progress,
  duration,
  position,
  watched,
  inWatchlist,
  onToggleWatchlist,
  subtitle,
  priority,
  className,
}: PosterCardProps) {
  const navigate = useNavigate();
  const showLabels = useSettings((state) => state.posterLabelsEnabled);
  const ratingsVisibility = useSettings((state) => state.imdbRatingsVisibility);

  const year = yearOf(meta.releaseInfo ?? meta.year ?? meta.released);
  // `progress` (0–100) is authoritative; fall back to position/duration.
  const percent =
    progress != null
      ? progress
      : duration && duration > 0
        ? progressPercent(position ?? 0, duration)
        : 0;
  const metaLine = subtitle ?? year ?? meta.releaseInfo ?? "";

  const open = () => navigate(buildDetailPath(meta, addonUrl ?? meta.sourceAddonUrl));

  return (
    <div className={cn("group/card relative", className)}>
      <button
        type="button"
        onClick={open}
        className="block w-full text-left"
        aria-label={`Open ${meta.name}`}
      >
        <div
          className={cn(
            "relative overflow-hidden rounded-panel bg-[rgb(var(--nuvio-surface))] transition-all duration-300 ease-nuvio group-hover/card:-translate-y-1.5 group-hover/card:shadow-card group-focus-within/card:-translate-y-1.5 group-focus-within/card:shadow-card",
            SHAPE_CLASS[shape],
          )}
        >
          <AsyncImage
            src={meta.poster ?? meta.landscapePoster}
            alt={meta.name}
            loading={priority ? "eager" : "lazy"}
            className="h-full w-full"
          />

          {/* Gradient wash that only appears on hover. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent opacity-0 transition-opacity duration-300 group-hover/card:opacity-100 group-focus-within/card:opacity-100"
          />

          {watched && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgb(var(--nuvio-accent))] text-on-accent shadow-glow">
                <Check size={18} />
              </span>
            </div>
          )}

          <div className="absolute right-1.5 top-1.5 flex flex-col items-end gap-1">
            {ratingsVisibility === "all" && <RatingBadge rating={meta.imdbRating} compact />}
          </div>

          {/* Hover meta — replaces the caption below so the layout never shifts. */}
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 p-2.5 pb-3.5 transition-all duration-300 ease-nuvio",
              "translate-y-2 opacity-0 group-hover/card:translate-y-0 group-hover/card:opacity-100 group-focus-within/card:translate-y-0 group-focus-within/card:opacity-100",
            )}
          >
            <p className="line-clamp-1 text-xs font-semibold text-white drop-shadow">
              {meta.name}
            </p>
            {metaLine && (
              <p className="mt-0.5 line-clamp-1 text-[10px] text-white/70">{metaLine}</p>
            )}
          </div>

          {percent > 0 && (
            <div className="absolute inset-x-0 bottom-0 z-10 h-1 bg-white/20">
              <div
                className="h-full accent-gradient"
                style={{ width: `${Math.min(100, percent)}%` }}
              />
            </div>
          )}

          {/* Play affordance */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-11 w-11 scale-75 items-center justify-center rounded-full bg-white/95 text-black opacity-0 shadow-lift transition-all duration-300 ease-spring group-hover/card:scale-100 group-hover/card:opacity-100 group-focus-within/card:scale-100 group-focus-within/card:opacity-100">
              <Play size={18} className="translate-x-0.5 fill-black" />
            </span>
          </div>
        </div>
      </button>

      {onToggleWatchlist && (
        <button
          type="button"
          aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleWatchlist(meta);
          }}
          className={cn(
            "absolute left-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 backdrop-blur transition-all duration-200 hover:bg-black/80",
            inWatchlist
              ? "text-[rgb(var(--nuvio-accent))] opacity-100"
              : "text-white opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100",
          )}
        >
          <Bookmark size={15} className={inWatchlist ? "fill-[rgb(var(--nuvio-accent))]" : ""} />
        </button>
      )}

      {showLabels && (
        <div className="mt-2.5 px-0.5 transition-opacity duration-200 group-hover/card:opacity-0">
          <p className="line-clamp-1 text-sm font-medium text-text-primary">{meta.name}</p>
          {metaLine && (
            <p className="mt-0.5 line-clamp-1 text-xs text-text-tertiary">{metaLine}</p>
          )}
        </div>
      )}
    </div>
  );
});
