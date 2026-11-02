import { cn } from "@/lib/cn";

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  format?: (value: number) => string;
  className?: string;
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  format,
  className,
}: SliderProps) {
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-text-primary">{label}</span>
          <span className="text-text-tertiary">{format ? format(value) : value}</span>
        </div>
      )}
      <input
        type="range"
        className="nuvio-range w-full"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
      />
    </div>
  );
}
