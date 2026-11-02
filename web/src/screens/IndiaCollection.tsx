import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Compass, SlidersHorizontal } from "lucide-react";
import { PosterCard } from "@/components/media/PosterCard";
import { PosterGrid } from "@/components/media/PosterGrid";
import { IndiaLanguageBar } from "@/components/india/IndiaLanguageBar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Tabs } from "@/components/ui/Tabs";
import {
  INDIA_TITLES,
  indiaCollection,
  indiaCollectionItems,
} from "@/lib/india";
import { useLibrary } from "@/store/library";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";

const TYPES = [
  { id: "all", label: "All" },
  { id: "movie", label: "Movies" },
  { id: "series", label: "Series" },
];

const PAGE = 48;

export function IndiaCollectionScreen() {
  const { collectionId = "all" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const toggleList = useLibrary((state) => state.toggleList);
  const isInList = useLibrary((state) => state.isInList);
  const pushToast = useUi((state) => state.pushToast);

  const language = params.get("lang") ?? settings.indiaLanguage;
  const [type, setType] = useState("all");
  const [visible, setVisible] = useState(PAGE);

  const collection = indiaCollection(collectionId);
  const title =
    collectionId === "all"
      ? "All Indian titles"
      : collection?.title ?? "Indian titles";
  const subtitle =
    collectionId === "all"
      ? `${INDIA_TITLES.length} curated films and series`
      : collection?.subtitle ?? "Curated for India";

  const items = useMemo(
    () => indiaCollectionItems(collectionId, { language, type, limit: undefined }),
    [collectionId, language, type],
  );

  const setLanguage = (value: string) => {
    setVisible(PAGE);
    if (value === "all") setParams({}, { replace: true });
    else setParams({ lang: value }, { replace: true });
    settings.setIndiaLanguage(value);
  };

  return (
    <div className="space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <IconButton label="Back" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </IconButton>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgb(var(--nuvio-accent))]">
              Made for India
            </p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
          </div>
        </div>
        <Tabs tabs={TYPES} active={type} onChange={setType} />
      </header>

      <IndiaLanguageBar value={language} onChange={setLanguage} />

      <div className="flex items-center justify-between gap-3 text-xs text-text-tertiary">
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal size={13} />
          {items.length} title{items.length === 1 ? "" : "s"}
          {language !== "all" ? ` in ${language}` : " across India"}
        </span>
        <span className="hidden sm:inline">
          Metadata by Cinemeta · streams come from your add-ons
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Compass size={24} />}
          title="No titles match this filter"
          description="Try another language or switch between movies and series."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setType("all");
                setLanguage("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <PosterGrid>
            {items.slice(0, visible).map((meta) => (
              <PosterCard
                key={meta.id}
                meta={meta}
                addonUrl={meta.sourceAddonUrl}
                shape={settings.cardShape}
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

          {visible < items.length && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => setVisible((value) => value + PAGE)}>
                Show more ({items.length - visible} left)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
