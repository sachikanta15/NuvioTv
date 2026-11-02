import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, MapPin, Radio, Sparkles, Tv } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { LazyCatalogRow } from "@/components/media/LazyCatalogRow";
import { MediaRow } from "@/components/media/MediaRow";
import { TopTenRow } from "@/components/media/TopTenRow";
import { IndiaLanguageBar } from "@/components/india/IndiaLanguageBar";
import { useCatalogDescriptors } from "@/hooks/useCatalogs";
import {
  CONTENT_TYPE_ORDER,
  contentTypeLabel,
  isLiveTvType,
} from "@/lib/content-type";
import {
  INDIA_COLLECTIONS,
  INDIA_TITLES,
  indiaCollectionItems,
} from "@/lib/india";
import { useLibrary } from "@/store/library";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";

/** Types we ask the add-on registry about. Unknown types are added dynamically. */
const DISCOVER_TYPES = CONTENT_TYPE_ORDER;

export function DiscoverScreen() {
  const [mode, setMode] = useState<"india" | "live" | "addons">("india");
  const [type, setType] = useState("movie");
  const [genre, setGenre] = useState<string | null>(null);
  const navigate = useNavigate();
  const settings = useSettings();
  const toggleList = useLibrary((state) => state.toggleList);
  const isInList = useLibrary((state) => state.isInList);
  const pushToast = useUi((state) => state.pushToast);

  const language = settings.indiaLanguage;

  const indiaRows = useMemo(
    () =>
      INDIA_COLLECTIONS.map((collection) => ({
        collection,
        items: indiaCollectionItems(collection.id, { language, limit: 24 }),
      })).filter((row) => row.items.length > 0),
    [language],
  );

  const descriptors = useCatalogDescriptors(DISCOVER_TYPES);

  const availableTypes = useMemo(() => {
    const present = [...new Set(descriptors.map((descriptor) => descriptor.type))];
    present.sort((a, b) => {
      const ai = CONTENT_TYPE_ORDER.findIndex((entry) => entry.toLowerCase() === a.toLowerCase());
      const bi = CONTENT_TYPE_ORDER.findIndex((entry) => entry.toLowerCase() === b.toLowerCase());
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    return present.map((id) => ({ id, label: contentTypeLabel(id) }));
  }, [descriptors]);

  useEffect(() => {
    if (availableTypes.length === 0) return;
    if (!availableTypes.some((option) => option.id === type)) {
      setType(availableTypes[0].id);
      setGenre(null);
    }
  }, [availableTypes, type]);

  const liveDescriptors = useMemo(
    () => descriptors.filter((descriptor) => isLiveTvType(descriptor.type)),
    [descriptors],
  );

  const genres = useMemo(() => {
    const found = new Set<string>();
    for (const descriptor of descriptors) {
      if (descriptor.type !== type) continue;
      const catalog = descriptor.addon.manifest.catalogs?.find(
        (entry) => entry.id === descriptor.catalogId,
      );
      const options =
        catalog?.extra?.find((extra) => extra.name === "genre")?.options ??
        (catalog as { genres?: string[] } | undefined)?.genres ??
        [];
      for (const option of options) found.add(option);
    }
    return [...found].sort();
  }, [descriptors, type]);

  const visible = descriptors.filter((descriptor) => descriptor.type === type);

  return (
    <div className="space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--nuvio-accent)/0.14)] text-[rgb(var(--nuvio-accent))]">
            <Compass size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Discover</h1>
            <p className="text-sm text-text-secondary">
              {mode === "india"
                ? "Curated Indian cinema, plus every catalog from your add-ons."
                : mode === "live"
                  ? "JioTV channels plus live TV catalogs from your add-ons."
                  : "Browse every catalog from your installed add-ons."}
            </p>
          </div>
        </div>
        <Tabs
          tabs={[
            { id: "india", label: "🇮🇳 India" },
            { id: "live", label: "🔴 Live TV" },
            { id: "addons", label: "Add-ons" },
          ]}
          active={mode}
          onChange={(value) => setMode(value as "india" | "live" | "addons")}
        />
      </header>

      {mode === "live" ? (
        <div className="space-y-7">
          <div className="relative overflow-hidden rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#E53935]/20 via-[#FF8F1F]/10 to-transparent"
            />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E53935]/15 text-[#FF5A5F]">
                  <Tv size={22} />
                </span>
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF5A5F]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#FF5A5F]" />
                    Live TV
                  </p>
                  <h2 className="mt-1 text-xl font-bold tracking-tight">
                    Live channels from JioTV, VZY & your add-ons
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {liveDescriptors.length > 0
                      ? `${liveDescriptors.length} live catalog${
                          liveDescriptors.length === 1 ? "" : "s"
                        } from your add-ons, plus 900+ JioTV and 300+ VZY channels.`
                      : "Open JioTV or VZY for live channels, or install a live TV add-on to see its catalogs here."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon={<Tv size={16} />} onClick={() => navigate("/jiotv")}>
                  Open JioTV Live
                </Button>
                <Button variant="outline" icon={<Radio size={16} />} onClick={() => navigate("/vzy")}>
                  Open VZY Live
                </Button>
                <Button variant="outline" onClick={() => setMode("addons")}>
                  Browse add-ons
                </Button>
              </div>
            </div>
          </div>

          {liveDescriptors.length === 0 ? (
            <EmptyState
              icon={<Tv size={24} />}
              title="No live TV add-ons yet"
              description="JioTV is built in. Install a live TV add-on to add more channel catalogs here."
              action={
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary" onClick={() => navigate("/jiotv")}>
                    Open JioTV
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/vzy")}>
                    Open VZY
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/addons")}>
                    Manage add-ons
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="space-y-8">
              {liveDescriptors.map((descriptor) => (
                <LazyCatalogRow
                  key={`${descriptor.key}-live`}
                  title={`${descriptor.addon.displayName ?? descriptor.addon.manifest.name} · ${descriptor.catalogName}`}
                  transportUrl={descriptor.addon.transportUrl}
                  type={descriptor.type}
                  catalogId={descriptor.catalogId}
                  shape="landscape"
                />
              ))}
            </div>
          )}
        </div>
      ) : mode === "india" ? (
        <div className="space-y-7">
          <div className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgb(var(--nuvio-accent))]">
                  <MapPin size={12} /> Made for India
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  {INDIA_TITLES.length} hand-picked titles across 8 languages. Pick a language to
                  filter the whole page.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={<Sparkles size={15} />}
                onClick={() => navigate(`/india/all${language !== "all" ? `?lang=${language}` : ""}`)}
              >
                Browse all
              </Button>
            </div>
            <div className="mt-4">
              <IndiaLanguageBar value={language} onChange={settings.setIndiaLanguage} />
            </div>
          </div>

          {indiaRows.length === 0 ? (
            <EmptyState
              icon={<Compass size={24} />}
              title="Nothing in this language yet"
              description="Try another Indian language, or browse the full catalogue."
              action={
                <Button variant="outline" onClick={() => settings.setIndiaLanguage("all")}>
                  Show all languages
                </Button>
              }
            />
          ) : (
            indiaRows.map(({ collection, items }) =>
              collection.ranked ? (
                <TopTenRow
                  key={collection.id}
                  title={`${collection.icon} ${collection.title}`}
                  subtitle={collection.subtitle}
                  items={items}
                  onSeeAll={() =>
                    navigate(
                      `/india/${collection.id}${language !== "all" ? `?lang=${language}` : ""}`,
                    )
                  }
                />
              ) : (
                <MediaRow
                  key={collection.id}
                  title={`${collection.icon} ${collection.title}`}
                  subtitle={collection.subtitle}
                  items={items}
                  shape={settings.cardShape}
                  inList={isInList}
                  onToggleWatchlist={(entry) => {
                    const added = toggleList(entry);
                    pushToast(
                      added ? `Added ${entry.name}` : `Removed ${entry.name}`,
                      added ? "success" : "info",
                    );
                  }}
                  onSeeAll={() =>
                    navigate(
                      `/india/${collection.id}${language !== "all" ? `?lang=${language}` : ""}`,
                    )
                  }
                />
              ),
            )
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {availableTypes.length > 0 ? (
              <Tabs
                tabs={availableTypes}
                active={type}
                onChange={(value) => {
                  setType(value);
                  setGenre(null);
                }}
              />
            ) : (
              <span className="text-sm text-text-tertiary">No catalog types available</span>
            )}
            <span className="text-xs text-text-tertiary">
              {visible.length} catalog{visible.length === 1 ? "" : "s"} for{" "}
              {contentTypeLabel(type)}
            </span>
          </div>

          {genres.length > 0 && (
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              <Chip active={genre === null} onClick={() => setGenre(null)}>
                All genres
              </Chip>
              {genres.map((option) => (
                <Chip key={option} active={genre === option} onClick={() => setGenre(option)}>
                  {option}
                </Chip>
              ))}
            </div>
          )}

          {visible.length === 0 ? (
            <EmptyState
              icon={<Compass size={24} />}
              title={`No ${contentTypeLabel(type)} catalogs`}
              description="Install an add-on that provides catalogs for this content type."
              action={
                <Button variant="primary" onClick={() => navigate("/addons")}>
                  Manage add-ons
                </Button>
              }
            />
          ) : (
            <div className="space-y-8">
              {visible.map((descriptor) => (
                <LazyCatalogRow
                  key={`${descriptor.key}-${genre ?? "all"}`}
                  title={`${descriptor.catalogName}${genre ? ` · ${genre}` : ""}`}
                  transportUrl={descriptor.addon.transportUrl}
                  type={descriptor.type}
                  catalogId={descriptor.catalogId}
                  shape={isLiveTvType(descriptor.type) ? "landscape" : settings.cardShape}
                  extra={genre ? { genre } : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
