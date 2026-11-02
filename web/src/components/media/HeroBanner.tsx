import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, Info, Play, Plus, Star } from "lucide-react";
import type { MetaDetail, MetaPreview } from "@/types";
import { cn } from "@/lib/cn";
import { AsyncImage } from "@/components/ui/AsyncImage";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { formatRating, truncate, yearOf } from "@/lib/format";
import { useLibrary } from "@/store/library";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";

interface HeroBannerProps {
  items: MetaPreview[];
  /** Fetch richer detail for the highlighted item. */
  detailFor?: (meta: MetaPreview) => Promise<MetaDetail | null>;
  rotateMs?: number;
  /** Small label above the title, e.g. "Made for India". */
  eyebrow?: React.ReactNode;
}

export function HeroBanner({ items, detailFor, rotateMs = 9000, eyebrow }: HeroBannerProps) {
  const navigate = useNavigate();
  const reduceMotion = useSettings((state) => state.reduceMotion);
  const ratingsVisibility = useSettings((state) => state.imdbRatingsVisibility);
  const [index, setIndex] = useState(0);
  const [detail, setDetail] = useState<MetaDetail | null>(null);
  const [paused, setPaused] = useState(false);
  const cache = useRef(new Map<string, MetaDetail>());
  const touchStart = useRef<number | null>(null);

  const current = items[index % Math.max(1, items.length)];

  const toggleList = useLibrary((state) => state.toggleList);
  const isInList = useLibrary((state) => state.isInList);
  const pushToast = useUi((state) => state.pushToast);

  useEffect(() => {
    if (items.length <= 1 || reduceMotion || paused) return;
    const timer = setInterval(() => setIndex((value) => (value + 1) % items.length), rotateMs);
    return () => clearInterval(timer);
  }, [items.length, rotateMs, reduceMotion, paused]);

  useEffect(() => {
    if (!current || !detailFor) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    const cached = cache.current.get(current.id);
    if (cached) {
      setDetail(cached);
      return;
    }
    detailFor(current)
      .then((result) => {
        if (cancelled || !result) return;
        cache.current.set(current.id, result);
        setDetail(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [current, detailFor]);

  const backdrop = useMemo(
    () => detail?.background ?? current?.background ?? current?.landscapePoster ?? current?.poster,
    [detail, current],
  );

  const go = useCallback(
    (next: number) => {
      if (!items.length) return;
      setIndex(((next % items.length) + items.length) % items.length);
    },
    [items.length],
  );

  if (!current) return null;

  const logo = detail?.logo ?? current.logo;
  const year = yearOf(detail?.releaseInfo ?? current.releaseInfo ?? current.released);
  const rating = formatRating(detail?.imdbRating ?? current.imdbRating);
  const description = detail?.description ?? current.description;
  const genres = (detail?.genres ?? current.genres ?? []).slice(0, 3);
  const inList = isInList(current.id);

  const open = () =>
    navigate(
      `/detail/${encodeURIComponent(current.type)}/${encodeURIComponent(current.id)}${
        current.sourceAddonUrl ? `?addon=${encodeURIComponent(current.sourceAddonUrl)}` : ""
      }`,
    );

  return (
    <section
      className="relative h-[62vh] min-h-[400px] w-full overflow-hidden sm:h-[70vh] sm:min-h-[460px] lg:h-[80vh] lg:min-h-[560px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        const end = event.changedTouches[0]?.clientX ?? null;
        touchStart.current = null;
        if (start == null || end == null || items.length <= 1) return;
        const delta = end - start;
        if (Math.abs(delta) < 48) return;
        go(index + (delta < 0 ? 1 : -1));
      }}
    >
      {/* Artwork */}
      <div className="absolute inset-0">
        <AsyncImage
          src={backdrop}
          alt=""
          className="h-full w-full"
          loading="eager"
          fit="cover"
        />
      </div>

      {/* Ambient accent bloom behind the artwork. */}
      <div aria-hidden className="ambient-glow pointer-events-none absolute inset-0 opacity-70" />

      {/* Scrims — vertical on phones, split on wide screens. */}
      <div aria-hidden className="scrim-hero-mobile pointer-events-none absolute inset-0 lg:hidden" />
      <div aria-hidden className="scrim-hero pointer-events-none absolute inset-0 hidden lg:block" />

      <div className="relative flex h-full flex-col justify-end px-4 pb-24 sm:px-6 sm:pb-28 lg:px-8 lg:pb-32">
        <div key={current.id} className="max-w-2xl animate-fade-up">
          {eyebrow && (
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
              {eyebrow}
            </div>
          )}
          {logo ? (
            <img
              src={logo}
              alt={current.name}
              className="mb-4 max-h-16 w-auto max-w-[80%] object-contain drop-shadow-2xl sm:mb-5 sm:max-h-24 sm:max-w-[70%]"
            />
          ) : (
            <h1 className="mb-3 text-3xl font-extrabold leading-[1.05] tracking-tight drop-shadow-2xl sm:text-4xl lg:text-6xl">
              {current.name}
            </h1>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-text-secondary">
            {rating && ratingsVisibility === "all" && (
              <span className="flex items-center gap-1 font-semibold text-rating">
                <Star size={14} className="fill-rating" />
                {rating}
              </span>
            )}
            {year && <span>{year}</span>}
            {current.type && <span className="capitalize">{current.type}</span>}
            {current.ageRating && (
              <span className="rounded border border-white/30 px-1.5 text-xs">
                {current.ageRating}
              </span>
            )}
            {genres.length > 0 && (
              <span className="hidden items-center gap-1.5 sm:flex">
                {genres.map((genre) => (
                  <span
                    key={genre}
                    className="rounded-full bg-white/8 px-2.5 py-0.5 text-xs text-text-secondary"
                  >
                    {genre}
                  </span>
                ))}
              </span>
            )}
          </div>

          {description && (
            <p className="mb-5 line-clamp-3 max-w-xl text-sm leading-relaxed text-text-secondary sm:line-clamp-4 sm:mb-6 sm:text-base">
              {truncate(description, 260)}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <Button
              size="lg"
              variant="primary"
              icon={<Play size={18} className="fill-white" />}
              onClick={open}
            >
              Play
            </Button>
            <Button
              size="lg"
              variant="outline"
              icon={<Info size={18} />}
              onClick={open}
              className="border-white/20 bg-black/25 backdrop-blur-sm hover:bg-white/10"
            >
              <span className="hidden sm:inline">More info</span>
              <span className="sm:hidden">Info</span>
            </Button>
            <IconButton
              label={inList ? "Remove from watchlist" : "Add to watchlist"}
              size="lg"
              variant="solid"
              active={inList}
              onClick={() => {
                const added = toggleList(current);
                pushToast(
                  added ? `Added ${current.name} to your watchlist` : `Removed ${current.name}`,
                  added ? "success" : "info",
                );
              }}
            >
              <Bookmark size={20} className={inList ? "fill-current" : ""} />
            </IconButton>
          </div>

          {items.length > 1 && (
            <div className="mt-5 flex items-center gap-1.5 sm:mt-6 sm:gap-2">
              {items.slice(0, 8).map((item, dotIndex) => (
                <button
                  key={item.id}
                  aria-label={`Show ${item.name}`}
                  onClick={() => go(dotIndex)}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300",
                    dotIndex === index % items.length
                      ? "w-7 bg-[rgb(var(--nuvio-accent))]"
                      : "w-3 bg-white/30 hover:bg-white/60",
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick add affordance for touch devices. */}
      <button
        type="button"
        aria-label={`Add ${current.name} to watchlist`}
        onClick={() => {
          const added = toggleList(current);
          pushToast(
            added ? `Added ${current.name} to your watchlist` : `Removed ${current.name}`,
            added ? "success" : "info",
          );
        }}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-black/60 lg:hidden"
      >
        <Plus size={18} />
      </button>
    </section>
  );
}
