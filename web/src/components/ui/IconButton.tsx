import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "xs" | "sm" | "md" | "lg";
  active?: boolean;
  variant?: "ghost" | "solid";
  children: ReactNode;
}

const SIZES = {
  xs: "h-8 w-8",
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-12 w-12 sm:h-14 sm:w-14",
} as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", active, variant = "ghost", className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-all duration-200 ease-nuvio active:scale-95 disabled:opacity-40",
        SIZES[size],
        variant === "solid"
          ? "border border-white/10 bg-white/8 text-text-primary hover:bg-white/15"
          : "text-text-secondary hover:bg-white/10 hover:text-text-primary",
        active && "bg-[rgb(var(--nuvio-accent)/0.18)] text-[rgb(var(--nuvio-accent))]",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
