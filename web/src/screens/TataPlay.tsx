import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Tv2, X } from "lucide-react";
import { VzyPlayer } from "@/components/media/VzyPlayer";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebounced } from "@/hooks/useDebounced";
import {
  TATAPLAY_COLLECTIONS,
  loadTataPlayChannels,
  matchesTataPlayCollection,
} from "@/lib/tataplay";
import type { TataPlayChannel, TataPlayCollectionId } from "@/lib/tataplay";

const PAGE_SIZE = 48;

export function TataPlayScreen() {
  const [channels, setChannels] = useState<TataPlayChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState<TataPlayCollectionId>("all");
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<TataPlayChannel | null>(null);
  const lastChannelId = useRef<string | null>(null);

  const debouncedSearch = useDebounced(search, 250);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    loadTataPlayChannels()
      .then((directory) => setChannels(directory))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [retry]);

  const categories = useMemo(
    () =>
      [...new Set(channels.map((channel) => channel.category))]
        .filter(Boolean)
        .sort(),
    [channels],
  );

  const languages = useMemo(
    () =>
      [...new Set(channels.map((channel) => channel.language))]
        .filter(Boolean)
        .sort(),
    [channels],
  );

  const filtered = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    return channels.filter((channel) => {
      if (
        query &&
        !channel.name.toLowerCase().includes(query) &&
        !channel.category.toLowerCase().includes(query) &&
        !channel.language.toLowerCase().includes(query) &&
        !(channel.lcn && String(channel.lcn).includes(query))
      ) {
        return false;
      }
      if (!matchesTataPlayCollection(channel, collection)) return false;
      if (
        category &&
        channel.category.toLowerCase() !== category.toLowerCase()
      ) {
        return false;
      }
      if (
        language &&
        channel.language.toLowerCase() !== language.toLowerCase()
      ) {
        return false;
      }
      return true;
    });
  }, [channels, collection, category, language, debouncedSearch]);

  const closePlayer = useCallback(() => {
    setSelected(null);
    if (lastChannelId.current) {
      const element = document.querySelector<HTMLElement>(
        `[data-channel-id="${lastChannelId.current}"]`,
      );
      element?.focus();
    }
  }, []);

  const changeChannel = useCallback(
    (offset: number) => {
      if (!selected) return;
      const index = filtered.findIndex((c) => c.id === selected.id);
      if (index === -1) return;
      const nextIndex =
        (index + offset + filtered.length) % filtered.length;
      const nextChannel = filtered[nextIndex];
      if (nextChannel) {
        lastChannelId.current = nextChannel.id;
        setSelected(nextChannel);
      }
    },
    [filtered, selected],
  );

  const resetFilters = useCallback(() => {
    setSearch("");
    setCollection("all");
    setCategory("");
    setLanguage("");
    setVisible(PAGE_SIZE);
  }, []);

  return (
    <div className="space-y-6">
      {selected && (
        <VzyPlayer
          channel={selected}
          onClose={closePlayer}
          onPrevious={() => changeChannel(-1)}
          onNext={() => changeChannel(1)}
        />
      )}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-soft">
            <Tv2 size={22} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">
                TataPlay+ Live
              </h1>
              <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-semibold text-indigo-400">
                {channels.length} Channels
              </span>
            </div>
            <p className="text-xs text-text-tertiary">
              Direct MPEG-DASH & HLS manifest streaming · Direct from tataplaysmart.com
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setVisible(PAGE_SIZE);
            }}
            placeholder="Search all 695 TataPlay channels (e.g. Star Plus, Aaj Tak, Discovery, Toons+, 115)"
            aria-label="Search Tata Play channels"
            className="h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] pl-11 pr-10 text-sm text-text-primary placeholder:text-text-tertiary transition-colors hover:border-white/20 focus:border-[rgb(var(--nuvio-accent))] focus:outline-none"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary transition-colors hover:text-text-primary"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="flex gap-2 sm:w-auto">
          <div className="w-40 sm:w-48">
            <Select
              aria-label="Channel category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setVisible(PAGE_SIZE);
              }}
            >
              <option value="">All Categories ({categories.length})</option>
              {categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-36 sm:w-44">
            <Select
              aria-label="Channel language"
              value={language}
              onChange={(event) => {
                setLanguage(event.target.value);
                setVisible(PAGE_SIZE);
              }}
            >
              <option value="">All Languages ({languages.length})</option>
              {languages.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
        aria-label="Tata Play collections"
      >
        {TATAPLAY_COLLECTIONS.map((entry) => (
          <Chip
            key={entry.id}
            active={collection === entry.id}
            onClick={() => {
              setCollection(entry.id);
              setCategory("");
              setVisible(PAGE_SIZE);
            }}
          >
            {entry.label}
          </Chip>
        ))}
      </div>

      {failed ? (
        <EmptyState
          icon={<Tv2 size={24} />}
          title="Couldn't load Tata Play channels"
          description="The Tata Play catalog could not be loaded. Please try again."
          action={
            <Button variant="primary" onClick={() => setRetry((value) => value + 1)}>
              Try again
            </Button>
          }
        />
      ) : loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 16 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="h-16 w-full rounded-card" />
              <Skeleton className="mt-2.5 h-3.5 w-3/4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Tv2 size={24} />}
          title="No channels matched your filters"
          description="Try a different search term, collection chip, or category."
          action={
            <Button variant="outline" onClick={resetFilters}>
              Reset filters
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-sm text-text-secondary">
            {filtered.length} channels available · Direct DASH manifest streaming
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.slice(0, visible).map((channel) => (
              <button
                type="button"
                key={channel.id}
                data-channel-id={channel.id}
                onClick={() => {
                  lastChannelId.current = channel.id;
                  setSelected(channel);
                }}
                className="nuvio-card group flex items-center gap-3 rounded-panel p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgb(var(--nuvio-accent)/0.45)] hover:bg-white/5"
              >
                {channel.logo ? (
                  <img
                    src={channel.logo}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                    className="h-11 w-11 shrink-0 rounded-lg object-contain bg-white/5"
                  />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/5 text-text-tertiary">
                    <Tv2 size={18} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={
                        channel.free || !channel.drm
                          ? "block text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--nuvio-error))]"
                          : "block text-[10px] font-bold uppercase tracking-widest text-indigo-400"
                      }
                    >
                      {channel.free || !channel.drm ? "Live · Direct" : "Tata Play"}
                    </span>
                    <span className="text-[9px] font-medium text-purple-400/80 bg-purple-500/10 rounded px-1">
                      {channel.hlsUrl ? "HLS" : "DASH"}
                    </span>
                  </div>
                  <span className="block truncate font-semibold text-text-primary">
                    {channel.name}
                  </span>
                  <span className="block truncate text-xs text-text-tertiary">
                    {channel.category}
                    {channel.language ? ` · ${channel.language}` : ""}
                    {channel.lcn !== null ? ` · Ch ${channel.lcn}` : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {filtered.length > visible && (
            <div className="flex justify-center py-6">
              <Button
                variant="outline"
                onClick={() => setVisible((value) => value + PAGE_SIZE)}
              >
                Show more channels ({filtered.length - visible} remaining)
              </Button>
            </div>
          )}
        </>
      )}

      {!loading && !failed && (
        <p className="text-xs text-text-tertiary">
          Covering 695 TataPlay channels via direct MPEG-DASH manifests (.mpd) and HLS streams.
          Zero JioTV dependency. Native playback via same-origin proxy or unified relay.
        </p>
      )}
    </div>
  );
}
