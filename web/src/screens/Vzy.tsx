import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyRound, Radio, Search, X } from "lucide-react";
import { VzyPlayer } from "@/components/media/VzyPlayer";
import { VzyAuthModal } from "@/components/media/VzyAuthModal";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebounced } from "@/hooks/useDebounced";
import {
  VZY_COLLECTIONS,
  getStoredVzyAuth,
  loadVzyChannels,
  matchesVzyCollection,
} from "@/lib/vzy";
import type { VzyChannel, VzyCollectionId } from "@/lib/vzy";

const PAGE_SIZE = 48;

export function VzyScreen() {
  const [channels, setChannels] = useState<VzyChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState<VzyCollectionId>("all");
  const [category, setCategory] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<VzyChannel | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const lastChannelId = useRef<string | null>(null);
  const hasAuth = Boolean(getStoredVzyAuth()?.token);

  const debouncedSearch = useDebounced(search, 250);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    loadVzyChannels(controller.signal)
      .then((directory) => setChannels(directory))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);

  const playableCount = useMemo(
    () => channels.filter((channel) => channel.playable).length,
    [channels],
  );

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
        !channel.category.toLowerCase().includes(query) &&
        !channel.language.toLowerCase().includes(query) &&
        !(channel.partner && channel.partner.toLowerCase().includes(query))
      ) {
        return false;
      }
      if (!matchesVzyCollection(channel, collection)) return false;
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
      <VzyPlayer
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
            <Radio size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">VZY Live</h1>
            <p className="text-sm text-text-secondary">
              {loading
                ? "Loading the VZY channel directory…"
                : `${playableCount} free & playable channels · ${channels.length} total channels covering all networks (JioHotstar, SonyLIV, Zee, FTA).`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={hasAuth ? "outline" : "primary"}
            size="sm"
            icon={<KeyRound size={15} />}
            onClick={() => setAuthModalOpen(true)}
          >
            {hasAuth ? "Account Active" : "Connect VZY / Unlock"}
          </Button>
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
            placeholder="Search all 318 channels (e.g. Star Plus, Aaj Tak, Sony, Zee, 9XM)"
            aria-label="Search VZY channels"
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
        {VZY_COLLECTIONS.map((entry) => (
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
          icon={<Radio size={24} />}
          title="Couldn't load the VZY directory"
          description="The VZY channel directory is unreachable right now. Check your connection and try again."
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
          icon={<Radio size={24} />}
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
            {filtered.length} channels available · Source: VZY / Watcho OTT
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
                    <Radio size={18} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={
                        channel.playable
                          ? "block text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--nuvio-error))]"
                          : channel.partner?.toLowerCase() === "jiohotstar"
                            ? "block text-[10px] font-bold uppercase tracking-widest text-sky-400"
                            : channel.partner?.toLowerCase() === "sonyliv"
                              ? "block text-[10px] font-bold uppercase tracking-widest text-emerald-400"
                              : channel.drm
                                ? "block text-[10px] font-bold uppercase tracking-widest text-[#FFB347]"
                                : "block text-[10px] font-bold uppercase tracking-widest text-text-secondary"
                      }
                    >
                      {channel.playable
                        ? "Live · Free"
                        : channel.partner?.toLowerCase() === "jiohotstar"
                          ? "Hotstar"
                          : channel.partner?.toLowerCase() === "sonyliv"
                            ? "SonyLIV"
                            : channel.drm
                              ? "DRM"
                              : "Premium"}
                    </span>
                    {channel.dashUrl && !channel.playable && (
                      <span className="text-[9px] font-medium text-purple-400/80 bg-purple-500/10 rounded px-1">
                        MPD
                      </span>
                    )}
                  </div>
                  <span className="block truncate font-semibold text-text-primary">
                    {channel.name}
                  </span>
                  <span className="block truncate text-xs text-text-tertiary">
                    {channel.category}
                    {channel.language ? ` · ${channel.language}` : ""}
                    {channel.lcn !== null ? ` · LCN ${channel.lcn}` : ""}
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
          Covering all 318 channels from VZY / Watcho OTT directory: 47 clear FTA streams
          with instant playback via stream-proxy; 116 JioHotstar & 25 SonyLIV channels;
          plus Nagra HLS & DASH MPD streams.
        </p>
      )}

      <VzyAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => setRetry((r) => r + 1)}
      />
    </div>
  );
}
