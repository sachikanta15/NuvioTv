import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  icon?: ReactNode;
  size?: "sm" | "md";
}

/** Compact filter/selection pill used across catalog and filter surfaces. */
export function Chip({
  active = false,
  icon,
  size = "md",
  className,
  children,
  ...rest
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-all duration-200 ease-nuvio active:scale-[0.97]",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        active
          ? "accent-gradient text-on-accent shadow-glow"
          : "bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
