import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "accent-gradient text-on-accent shadow-glow hover:brightness-110 hover:shadow-glow-lg",
  secondary:
    "bg-[rgb(var(--nuvio-surface-variant))] text-text-primary hover:bg-[rgb(var(--nuvio-surface-variant))]/80",
  ghost: "bg-transparent text-text-secondary hover:bg-white/5 hover:text-text-primary",
  outline:
    "border border-white/15 bg-white/5 text-text-primary hover:border-white/30 hover:bg-white/10",
  danger:
    "bg-[rgb(var(--nuvio-error))] text-white shadow-[0_8px_24px_-8px_rgb(var(--nuvio-error)/0.7)] hover:brightness-110",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2.5 sm:h-13 sm:px-7 sm:py-3.5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, iconRight, block, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-xl font-semibold transition-all duration-200 ease-nuvio active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
});
