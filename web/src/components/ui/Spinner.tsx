import { cn } from "@/lib/cn";

export function Spinner({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-block animate-spin rounded-full border-2 border-white/20", className)}
      style={{
        width: size,
        height: size,
        borderTopColor: "rgb(var(--nuvio-accent))",
      }}
    />
  );
}
