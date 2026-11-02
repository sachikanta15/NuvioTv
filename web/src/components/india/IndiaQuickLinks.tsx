import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Clapperboard,
  Film,
  MonitorPlay,
  Sparkles,
  Trophy,
  Tv,
} from "lucide-react";
import { indiaCollectionItems } from "@/lib/india";
import { cn } from "@/lib/cn";

interface IndiaQuickLinksProps {
  language?: string;
}

interface Tile {
  to: string;
  title: string;
  subtitle: string;
  icon: typeof Tv;
  count?: number;
  live?: boolean;
  accent?: string;
}

export function IndiaQuickLinks({ language = "all" }: IndiaQuickLinksProps) {
  const tiles: Tile[] = [
    {
      to: "/jiotv",
      title: "JioTV Live",
      subtitle: "900+ Indian channels",
      icon: Tv,
      live: true,
      accent: "from-[#FF5A1F]/25 via-[#FF8F1F]/10 to-transparent",
    },
    {
      to: "/india/sports",
      title: "Cricket & sports",
      subtitle: "Match-day movies",
      icon: Trophy,
      count: indiaCollectionItems("sports", { language }).length,
      accent: "from-[#0E7A3C]/25 via-[#22D37C]/10 to-transparent",
    },
    {
      to: "/india/bollywood",
      title: "Bollywood",
      subtitle: "Hindi blockbusters",
      icon: Film,
      count: indiaCollectionItems("bollywood", { language }).length,
      accent: "from-[#E53935]/25 via-[#FF8F1F]/10 to-transparent",
    },
    {
      to: "/india/hindi-series",
      title: "Web series",
      subtitle: "Indian originals",
      icon: MonitorPlay,
      count: indiaCollectionItems("hindi-series", { language }).length,
      accent: "from-[#8E24AA]/25 via-[#EC70A9]/10 to-transparent",
    },
    {
      to: "/india/south",
      title: "South cinema",
      subtitle: "Tamil · Telugu · Malayalam",
      icon: Clapperboard,
      count: indiaCollectionItems("south", { language }).length,
      accent: "from-[#FDD835]/20 via-[#FF8F1F]/10 to-transparent",
    },
    {
      to: "/india/classics",
      title: "Classics",
      subtitle: "Timeless Indian films",
      icon: Sparkles,
      count: indiaCollectionItems("classics", { language }).length,
      accent: "from-[#3185F5]/20 via-[#4DE3FF]/10 to-transparent",
    },
  ];

  return (
    <section className="px-4 sm:px-6 lg:px-8" aria-label="Indian quick links">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">
            Made for India <span aria-hidden>🇮🇳</span>
          </h2>
          <p className="mt-0.5 text-xs text-text-tertiary">
            Live TV, Bollywood, regional cinema and Indian originals — one tap away.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {tiles
          .filter((tile) => tile.live || tile.count === undefined || tile.count > 0)
          .map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.to}
              to={tile.to}
              className={cn(
                "group relative overflow-hidden rounded-panel border border-white/8 bg-[rgb(var(--nuvio-card))] p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-card sm:p-4",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80 transition-opacity duration-300 group-hover:opacity-100",
                  tile.accent,
                )}
              />
              <span className="relative flex items-start justify-between gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/25 text-white/90 backdrop-blur">
                  <Icon size={17} />
                </span>
                {tile.live ? (
                  <span className="flex items-center gap-1 rounded-full bg-[#E53935] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-glow">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                    Live
                  </span>
                ) : (
                  <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                    {tile.count}
                  </span>
                )}
              </span>
              <span className="relative mt-4 block">
                <span className="flex items-center gap-1 text-sm font-semibold leading-tight">
                  {tile.title}
                  <ArrowUpRight
                    size={13}
                    className="opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-70"
                  />
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-text-tertiary">
                  {tile.subtitle}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
