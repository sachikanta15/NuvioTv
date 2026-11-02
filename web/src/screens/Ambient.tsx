import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Pause, Play } from "lucide-react";
import { AsyncImage } from "@/components/ui/AsyncImage";
import { indiaHeroItems } from "@/lib/india";
import { cn } from "@/lib/cn";

/** A TV-style ambient screen: artwork, clock and date, no chrome. */
export function AmbientScreen() {
  const navigate = useNavigate();
  const items = useMemo(() => indiaHeroItems(12), []);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (paused || items.length <= 1) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % items.length), 20_000);
    return () => window.clearInterval(timer);
  }, [paused, items.length]);

  useEffect(() => {
    const exit = () => navigate("/");
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === " ") exit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const current = items[index % Math.max(1, items.length)];
  const time = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const date = now.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div
      className="relative flex h-[100dvh] w-full cursor-none flex-col overflow-hidden bg-black"
      onClick={() => navigate("/")}
    >
      {current?.background ? (
        <div className="absolute inset-0">
          <AsyncImage
            key={current.id}
            src={current.background}
            alt=""
            className={cn(
              "h-full w-full animate-kenburns opacity-70",
              paused && "[animation-play-state:paused]",
            )}
            fit="cover"
            loading="eager"
          />
        </div>
      ) : null}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/30" />
      <div aria-hidden className="ambient-glow absolute inset-0 opacity-50" />

      <div className="relative flex flex-1 flex-col justify-between p-6 sm:p-10 lg:p-16">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl accent-gradient text-lg font-black text-on-accent shadow-glow">
              N
            </span>
            <div>
              <p className="text-sm font-semibold tracking-wide">Nuvio Ambient</p>
              <p className="text-xs text-white/50">Made for India</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setPaused((value) => !value);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white/80 backdrop-blur transition-colors hover:bg-black/50 hover:text-white"
              aria-label={paused ? "Resume ambient rotation" : "Pause ambient rotation"}
            >
              {paused ? <Play size={17} /> : <Pause size={17} />}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                navigate("/");
              }}
              className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-3 py-2 text-xs font-medium text-white/80 backdrop-blur transition-colors hover:bg-black/50 hover:text-white"
            >
              <ArrowLeft size={14} /> Exit
            </button>
          </div>
        </div>

        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/55">
            {date}
          </p>
          <p className="mt-2 text-[clamp(4rem,16vw,11rem)] font-black leading-[0.85] tracking-tighter text-white drop-shadow-2xl">
            {time}
          </p>
          <div className="mt-6 flex items-center gap-3">
            <span className="h-px w-10 bg-[rgb(var(--nuvio-accent))]" />
            <div>
              <p className="text-lg font-semibold text-white/90 sm:text-xl">
                {current?.name ?? "Nuvio"}
              </p>
              <p className="text-sm text-white/50">
                {current?.language ? `${current.language} cinema` : "Your stories, on your screen"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between gap-4">
          <p className="text-xs text-white/40">
            Press any key or tap anywhere to return. Nothing is playing.
          </p>
          <div className="flex gap-1.5">
            {items.map((item, dotIndex) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Show ${item.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setIndex(dotIndex);
                }}
                className={cn(
                  "h-1 rounded-full transition-all duration-300",
                  dotIndex === index % items.length
                    ? "w-7 bg-[rgb(var(--nuvio-accent))]"
                    : "w-3 bg-white/25 hover:bg-white/50",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
