import { useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import { PosterCard } from "@/components/media/PosterCard";
import { PosterGrid } from "@/components/media/PosterGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCatalogItems } from "@/hooks/useCatalogs";
import { contentTypeLabel, isLiveTvType } from "@/lib/content-type";
import { useLibrary } from "@/store/library";
import { useUi } from "@/store/ui";

export function BrowseScreen() {
  const { transportUrl = "", type = "movie", catalogId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const addonUrl = decodeURIComponent(transportUrl);
  const name = params.get("name") ?? "Catalog";
  const genre = params.get("genre") ?? undefined;

  const { items, loading, loadingMore, hasMore, loadMore, error } = useCatalogItems(
    addonUrl,
    type,
    catalogId,
  );
  const sentinel = useRef<HTMLDivElement>(null);

  const toggleList = useLibrary((state) => state.toggleList);
  const isInList = useLibrary((state) => state.isInList);
  const pushToast = useUi((state) => state.pushToast);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  const filtered = items;

  return (
    <div className="space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <header className="flex items-center gap-3">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
            {name}
            {genre ? ` · ${genre}` : ""}
          </h1>
          <p className="text-sm text-text-secondary">
            {contentTypeLabel(type)} · {items.length} loaded
          </p>
        </div>
      </header>

      {error && (
        <EmptyState
          icon={<LayoutGrid size={24} />}
          title="Couldn't load this catalog"
          description={error}
        />
      )}

      {loading ? (
        <PosterGrid variant={isLiveTvType(type) ? "landscape" : "poster"}>
          {Array.from({ length: 21 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="aspect-[2/3] w-full rounded-panel" />
              <Skeleton className="mt-2.5 h-3.5 w-3/4" />
            </div>
          ))}
        </PosterGrid>
      ) : filtered.length === 0 && !error ? (
        <EmptyState icon={<LayoutGrid size={24} />} title="No items in this catalog" />
      ) : (
        <>
          <PosterGrid variant={isLiveTvType(type) ? "landscape" : "poster"}>
            {filtered.map((meta, index) => (
              <PosterCard
                key={`${meta.id}-${index}`}
                meta={meta}
                addonUrl={addonUrl}
                shape={isLiveTvType(type) ? "landscape" : undefined}
                priority={index < 10}
                inWatchlist={isInList(meta.id)}
                onToggleWatchlist={(entry) => {
                  const added = toggleList(entry);
                  pushToast(
                    added ? `Added ${entry.name}` : `Removed ${entry.name}`,
                    added ? "success" : "info",
                  );
                }}
              />
            ))}
          </PosterGrid>

          <div ref={sentinel} className="flex justify-center py-8">
            {loadingMore && <Spinner size={28} />}
            {!hasMore && filtered.length > 0 && (
              <p className="text-sm text-text-tertiary">End of catalog</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
