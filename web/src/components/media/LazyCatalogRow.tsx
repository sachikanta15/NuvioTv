import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MetaPreview } from "@/types";
import { MediaRow } from "./MediaRow";
import type { PosterShapeKind } from "./PosterCard";
import { fetchCatalog } from "@/lib/stremio";

interface LazyCatalogRowProps {
  title: string;
  transportUrl: string;
  type: string;
  catalogId: string;
  extra?: Record<string, string | number | undefined>;
  shape?: PosterShapeKind;
  limit?: number;
}

/** A media row that fetches its own catalog on mount. */
export function LazyCatalogRow({
  title,
  transportUrl,
  type,
  catalogId,
  extra,
  shape = "poster",
  limit = 24,
}: LazyCatalogRowProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<MetaPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const extraKey = JSON.stringify(extra ?? {});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchCatalog(transportUrl, type, catalogId, { skip: 0, ...(extra ?? {}) })
      .then((result) => {
        if (!cancelled) setItems(result.slice(0, limit));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transportUrl, type, catalogId, extraKey, limit]);

  if (!loading && failed && items.length === 0) return null;

  const params = new URLSearchParams({ name: title });
  if (extra?.genre) params.set("genre", String(extra.genre));

  return (
    <MediaRow
      title={title}
      items={items}
      addonUrl={transportUrl}
      shape={shape}
      loading={loading}
      onSeeAll={() =>
        navigate(
          `/browse/${encodeURIComponent(transportUrl)}/${encodeURIComponent(type)}/${encodeURIComponent(
            catalogId,
          )}?${params.toString()}`,
        )
      }
    />
  );
}
