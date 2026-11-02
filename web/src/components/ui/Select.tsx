import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export function Select({ label, className, children, ...rest }: SelectProps) {
  return (
    <label className="block w-full">
      {label && <span className="mb-2 block text-sm font-medium text-text-primary">{label}</span>}
      <span className="relative block">
        <select
          className={cn(
            "h-11 w-full appearance-none rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 pr-10 text-sm text-text-primary transition-colors hover:border-white/20 focus:border-[rgb(var(--nuvio-accent))]",
            className,
          )}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
      </span>
    </label>
  );
}
