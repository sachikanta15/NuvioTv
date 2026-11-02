import { Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRating } from "@/lib/format";

export function RatingBadge({
  rating,
  className,
  compact,
}: {
  rating?: string | number | null;
  className?: string;
  compact?: boolean;
}) {
  const value = formatRating(rating);
  if (!value) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-rating backdrop-blur",
        className,
      )}
    >
      <Star size={compact ? 10 : 12} className="fill-rating" />
      {value}
    </span>
  );
}
