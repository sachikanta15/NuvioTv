import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layers, Plus, Trash2 } from "lucide-react";
import { PosterCard } from "@/components/media/PosterCard";
import { PosterGrid } from "@/components/media/PosterGrid";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { useLibrary, selectLibraryItems, selectContinueWatching, selectWatched, WATCHLIST_ID } from "@/store/library";
import { useUi } from "@/store/ui";
import { useSettings } from "@/store/settings";

export function LibraryScreen() {
  const navigate = useNavigate();
  const lists = useLibrary((state) => state.lists);
  const items = useLibrary(selectLibraryItems);
  const continueWatching = useLibrary(selectContinueWatching);
  const watchedItems = useLibrary(selectWatched);
  const createList = useLibrary((state) => state.createList);
  const deleteList = useLibrary((state) => state.deleteList);
  const removeFromList = useLibrary((state) => state.removeFromList);
  const clearHistory = useLibrary((state) => state.clearHistory);
  const pushToast = useUi((state) => state.pushToast);
  const showProgress = useSettings((state) => state.posterLabelsEnabled);
  const cardShape = useSettings((state) => state.cardShape);

  const [activeList, setActiveList] = useState(WATCHLIST_ID);
  const [activeView, setActiveView] = useState<"lists" | "history" | "watched">("lists");
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");

  const listItems = useMemo(
    () => items.filter((item) => item.listId === activeList),
    [items, activeList],
  );

  const tabs = [
    { id: "lists", label: "Lists", badge: items.length },
    { id: "history" as const, label: "History", badge: continueWatching.length },
    { id: "watched" as const, label: "Watched", badge: watchedItems.length },
  ];

  return (
    <div className="space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--nuvio-accent)/0.14)] text-[rgb(var(--nuvio-accent))]">
            <Layers size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Library</h1>
            <p className="text-sm text-text-secondary">Your saved titles, history and progress.</p>
          </div>
        </div>
        <Tabs
          tabs={tabs}
          active={activeView}
          onChange={(id) => setActiveView(id as typeof activeView)}
        />
      </header>

      {activeView === "lists" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {lists.map((list) => (
              <button
                key={list.id}
                onClick={() => setActiveList(list.id)}
                className={
                  list.id === activeList
                    ? "accent-gradient rounded-full px-4 py-2 text-sm font-medium text-on-accent"
                    : "rounded-full bg-white/5 px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
                }
              >
                {list.name}
                <span className="ml-2 text-xs opacity-70">
                  {items.filter((item) => item.listId === list.id).length}
                </span>
              </button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus size={15} />}
              onClick={() => setNewListOpen(true)}
            >
              New list
            </Button>
            {!lists.find((list) => list.id === activeList)?.builtIn && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 size={15} />}
                onClick={() => {
                  deleteList(activeList);
                  setActiveList(WATCHLIST_ID);
                  pushToast("List deleted", "info");
                }}
              >
                Delete list
              </Button>
            )}
          </div>

          {listItems.length === 0 ? (
            <EmptyState
              icon={<Layers size={24} />}
              title="Nothing saved yet"
              description="Add titles to this list using the bookmark button on any poster or detail page."
              action={
                <Button variant="primary" onClick={() => navigate("/")}>
                  Browse home
                </Button>
              }
            />
          ) : (
            <PosterGrid>
              {listItems.map((item) => (
                <PosterCard
                  key={`${item.listId}-${item.id}`}
                  meta={item.meta}
                  addonUrl={item.meta.sourceAddonUrl}
                  shape={cardShape}
                  inWatchlist
                  onToggleWatchlist={() => {
                    removeFromList(item.id, activeList);
                    pushToast("Removed from list", "info");
                  }}
                />
              ))}
            </PosterGrid>
          )}
        </>
      )}

      {activeView === "history" && (
        <>
          {continueWatching.length > 0 && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 size={15} />}
                onClick={() => {
                  clearHistory();
                  pushToast("History cleared", "info");
                }}
              >
                Clear history
              </Button>
            </div>
          )}
          {continueWatching.length === 0 ? (
            <EmptyState
              icon={<Layers size={24} />}
              title="No watch history"
              description="Titles you start watching will appear here."
            />
          ) : (
            <div className="space-y-2">
              {continueWatching.map((entry) => (
                <button
                  key={entry.contentId}
                  onClick={() =>
                    navigate(
                      `/stream/${encodeURIComponent(entry.contentType)}/${encodeURIComponent(
                        entry.contentId,
                      )}?videoId=${encodeURIComponent(entry.videoId)}`,
                    )
                  }
                  className="flex w-full items-center gap-4 rounded-panel border border-white/8 bg-[rgb(var(--nuvio-card))] p-3 text-left transition-colors hover:border-white/20"
                >
                  <img
                    src={entry.poster ?? ""}
                    alt=""
                    className="h-20 w-14 shrink-0 rounded object-cover"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{entry.name}</p>
                    <p className="text-sm text-text-secondary">
                      {entry.season != null
                        ? `S${entry.season}E${entry.episode}${entry.episodeTitle ? ` · ${entry.episodeTitle}` : ""}`
                        : "Movie"}
                    </p>
                    {showProgress && entry.duration > 0 && (
                      <div className="mt-2 h-1 w-full max-w-xs overflow-hidden rounded-full bg-white/15">
                        <div
                          className="h-full accent-gradient"
                          style={{ width: `${(entry.position / entry.duration) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {activeView === "watched" && (
        <>
          {watchedItems.length === 0 ? (
            <EmptyState
              icon={<Layers size={24} />}
              title="Nothing marked as watched"
              description="Mark titles or episodes as watched to keep track."
            />
          ) : (
            <PosterGrid>
              {watchedItems.map((entry) => (
                <PosterCard
                  key={entry.contentId}
                  meta={{
                    id: entry.contentId,
                    type: entry.contentType,
                    name: entry.name,
                    poster: entry.poster ?? null,
                  }}
                  shape={cardShape}
                  watched
                />
              ))}
            </PosterGrid>
          )}
        </>
      )}

      <Modal
        open={newListOpen}
        onClose={() => setNewListOpen(false)}
        title="Create a list"
        description="Group titles however you like."
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewListOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!newListName.trim()}
              onClick={() => {
                const list = createList(newListName.trim());
                setNewListName("");
                setNewListOpen(false);
                setActiveList(list.id);
                pushToast(`Created “${list.name}”`, "success");
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <input
          value={newListName}
          onChange={(event) => setNewListName(event.target.value)}
          placeholder="e.g. Sci-fi marathon"
          autoFocus
          className="h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none placeholder:text-text-tertiary focus:border-[rgb(var(--nuvio-accent))]"
        />
      </Modal>
    </div>
  );
}
