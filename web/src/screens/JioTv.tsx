import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Tv, X } from "lucide-react";
import { JioTvPlayer } from "@/components/media/JioTvPlayer";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebounced } from "@/hooks/useDebounced";
import {
  JIO_TV_COLLECTIONS,
  loadJioTvChannels,
  matchesJioTvCollection,
} from "@/lib/jiotv";
import type { JioTvChannel, JioTvCollectionId } from "@/lib/jiotv";

const PAGE_SIZE = 48;

export function JioTvScreen() {
  const [channels, setChannels] = useState<JioTvChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState<JioTvCollectionId>("all");
  const [category, setCategory] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<JioTvChannel | null>(null);
  const lastChannelId = useRef<string | null>(null);

  const debouncedSearch = useDebounced(search, 250);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    loadJioTvChannels(controller.signal)
      .then((directory) => setChannels(directory))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);

  const categories = useMemo(
    () =>
      [...new Set(channels.map((channel) => channel.category))]
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
        !channel.category.toLowerCase().includes(query)
      ) {
        return false;
      }
      if (!matchesJioTvCollection(channel, collection)) return false;
      if (
        category &&
        channel.category.toLowerCase() !== category.toLowerCase()
      ) {
        return false;
      }
      return true;
    });
  }, [channels, collection, category, debouncedSearch]);

  const closePlayer = useCallback(() => {
    setSelected(null);
    requestAnimationFrame(() => {
      const target = [
        ...document.querySelectorAll<HTMLElement>("[data-channel-id]"),
      ].find((element) => element.dataset.channelId === lastChannelId.current);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest" });
    });
  }, []);

  const changeChannel = useCallback(
    (step: number) => {
      setSelected((current) => {
        if (!current || filtered.length === 0) return current;
        const index = filtered.findIndex(
          (channel) => channel.id === current.id,
        );
        const next = filtered[(index + step + filtered.length) % filtered.length];
        lastChannelId.current = next.id;
        setVisible((value) => Math.max(value, filtered.indexOf(next) + 1));
        return next;
      });
    },
    [filtered],
  );

  const previousChannel = useCallback(() => changeChannel(-1), [changeChannel]);
  const nextChannel = useCallback(() => changeChannel(1), [changeChannel]);

  const resetFilters = () => {
    setSearch("");
    setCategory("");
    setCollection("all");
    setVisible(PAGE_SIZE);
  };

  if (selected) {
    return (
      <JioTvPlayer
        key={selected.id}
        channel={selected}
        onClose={closePlayer}
        onPrevious={previousChannel}
        onNext={nextChannel}
      />
    );
  }

  return (
    <div className="space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[rgb(var(--nuvio-accent)/0.16)] text-[rgb(var(--nuvio-accent))]">
            <Tv size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">JioTV</h1>
            <p className="text-sm text-text-secondary">
              {loading
                ? "Loading the live channel directory…"
                : `${channels.length} live channels — Star, Sony, Zee, Colors, Sports18 and regional networks.`}
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
            placeholder="Search JioTV channels (e.g. Star Gold, Aaj Tak, Sports18)"
            aria-label="Search JioTV channels"
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
        <div className="sm:w-64">
          <Select
            aria-label="Channel category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setVisible(PAGE_SIZE);
            }}
          >
            <option value="">All categories ({channels.length})</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
        aria-label="Channel collections"
      >
        {JIO_TV_COLLECTIONS.map((entry) => (
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
          icon={<Tv size={24} />}
          title="Couldn't load the JioTV directory"
          description="The channel directory is unreachable right now. Check your connection and try again."
          action={
            <Button variant="primary" onClick={() => setRetry((value) => value + 1)}>
              Try again
            </Button>
          }
        />
      ) : loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 18 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="h-16 w-full rounded-card" />
              <Skeleton className="mt-2.5 h-3.5 w-3/4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Tv size={24} />}
          title="No channels matched your filters"
          description="Try a different search term, collection or category."
          action={
            <Button variant="outline" onClick={resetFilters}>
              Reset filters
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-sm text-text-secondary">
            {filtered.length} channels available · Source: JioTV Live
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
                    className="h-11 w-11 shrink-0 rounded-lg object-contain"
                  />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/5 text-text-tertiary">
                    <Tv size={18} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--nuvio-error))]">
                    Live
                  </span>
                  <span className="block truncate font-semibold text-text-primary">
                    {channel.name}
                  </span>
                  <span className="block truncate text-xs text-text-tertiary">
                    {channel.category}
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
          Channel directory and player provided by JioTV. Availability depends
          on the broadcaster and network conditions.
        </p>
      )}
    </div>
  );
}
