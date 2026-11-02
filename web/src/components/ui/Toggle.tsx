import { cn } from "@/lib/cn";

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  description?: string;
  /** Accessible name when the toggle is rendered without a visible label. */
  ariaLabel?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, description, ariaLabel, disabled }: ToggleProps) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-nuvio disabled:opacity-40",
        checked ? "accent-gradient" : "bg-white/15",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-nuvio",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );

  if (!label) return control;

  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-text-tertiary">{description}</span>
        )}
      </span>
      {control}
    </label>
  );
}
