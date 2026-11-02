import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface TabsProps {
  tabs: { id: string; label: string; badge?: number }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
  /** Stretches the strip to the full width with equally wide tabs. */
  fill?: boolean;
}

/** Segmented control with a sliding active pill. */
export function Tabs({ tabs, active, onChange, className, fill }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const measure = () => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(active)}"]`);
    if (!el) {
      setIndicator((current) => (current === null ? current : null));
      return;
    }
    const left = el.offsetLeft;
    const width = el.offsetWidth;
    // Keep the active tab visible when the strip overflows (mobile Settings,
    // Library, Discover type filters, etc.).
    if (left < list.scrollLeft || left + width > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ left: Math.max(0, left - 12), behavior: "smooth" });
    }
    // Guard against redundant state writes — `tabs` is often a fresh array on
    // every render, and an unguarded update would loop forever.
    setIndicator((current) =>
      current && current.left === left && current.width === width
        ? current
        : { left, width },
    );
  };

  useLayoutEffect(measure, [active, tabs]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [tabs]);

  return (
    <div
      ref={listRef}
      role="tablist"
      className={cn(
        "no-scrollbar relative flex gap-1 overflow-x-auto rounded-full border border-white/8 bg-white/5 p-1",
        fill && "w-full",
        className,
      )}
    >
      {indicator && (
        <span
          aria-hidden
          className="absolute top-1 h-[calc(100%-0.5rem)] rounded-full accent-gradient shadow-glow transition-[left,width] duration-300 ease-nuvio"
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            data-tab-id={tab.id}
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative z-10 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200",
              fill ? "min-w-0 flex-1 text-center" : "shrink-0",
              selected ? "text-on-accent" : "text-text-secondary hover:text-text-primary",
            )}
          >
            {tab.label}
            {tab.badge != null && (
              <span
                className={cn(
                  "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  selected ? "bg-black/25 text-on-accent" : "bg-white/10 text-text-tertiary",
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
