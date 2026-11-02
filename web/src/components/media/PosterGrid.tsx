import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Responsive poster grid shared by every catalog-style screen.
 * Column count grows with the viewport so a phone shows a dense, browsable
 * grid while a desktop shows a full shelf.
 */
const GRID_CLASSES =
  "grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8";

const LANDSCAPE_GRID_CLASSES =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

export function PosterGrid({
  children,
  className,
  variant = "poster",
}: {
  children: ReactNode;
  className?: string;
  /** Use fewer, wider columns for channel/landscape artwork. */
  variant?: "poster" | "landscape";
}) {
  return (
    <div className={cn(variant === "landscape" ? LANDSCAPE_GRID_CLASSES : GRID_CLASSES, className)}>
      {children}
    </div>
  );
}
