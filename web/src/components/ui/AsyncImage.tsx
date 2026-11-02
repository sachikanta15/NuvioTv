import { useState } from "react";
import { Film } from "lucide-react";
import { cn } from "@/lib/cn";

interface AsyncImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  /** Object-fit behaviour. */
  fit?: "cover" | "contain";
  /** Show a film-reel placeholder when the image is missing. */
  fallbackIcon?: boolean;
  loading?: "lazy" | "eager";
}

/** Image with a graceful placeholder and fade-in, used for artwork. */
export function AsyncImage({
  src,
  alt,
  className,
  fit = "cover",
  fallbackIcon = true,
  loading = "lazy",
}: AsyncImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const showFallback = !src || failed;

  return (
    <div className={cn("relative overflow-hidden bg-[rgb(var(--nuvio-surface))]", className)}>
      {!loaded && !showFallback && <div className="absolute inset-0 shimmer" />}
      {showFallback ? (
        <div className="flex h-full w-full items-center justify-center bg-[rgb(var(--nuvio-surface-variant))]">
          {fallbackIcon && <Film className="h-1/4 w-1/4 text-white/15" />}
        </div>
      ) : (
        <img
          src={src ?? undefined}
          alt={alt}
          loading={loading}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "h-full w-full transition-opacity duration-500",
            fit === "cover" ? "object-cover" : "object-contain",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}
