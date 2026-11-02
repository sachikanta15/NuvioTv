import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FolderOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import { PosterCard } from "@/components/media/PosterCard";
import { PosterGrid } from "@/components/media/PosterGrid";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useCollections } from "@/store/collections";
import { useUi } from "@/store/ui";

export function CollectionDetailScreen() {
  const { collectionId = "" } = useParams();
  const navigate = useNavigate();

  const collection = useCollections((state) =>
    state.collections.find((entry) => entry.id === collectionId),
  );
  const renameCollection = useCollections((state) => state.renameCollection);
  const deleteCollection = useCollections((state) => state.deleteCollection);
  const addFolder = useCollections((state) => state.addFolder);
  const renameFolder = useCollections((state) => state.renameFolder);
  const deleteFolder = useCollections((state) => state.deleteFolder);
  const removeItem = useCollections((state) => state.removeItem);
  const moveItem = useCollections((state) => state.moveItem);
  const pushToast = useUi((state) => state.pushToast);

  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [moveTarget, setMoveTarget] = useState<{ itemId: string; fromFolderId: string } | null>(null);
  const [moveTo, setMoveTo] = useState("");

  const folder = useMemo(() => {
    if (!collection) return null;
    if (!activeFolder) return collection.folders[0] ?? null;
    return collection.folders.find((entry) => entry.id === activeFolder) ?? collection.folders[0] ?? null;
  }, [collection, activeFolder]);

  if (!collection) {
    return (
      <div className="px-4 py-16 sm:px-6 lg:px-8">
        <EmptyState
          title="Collection not found"
          action={
            <Button variant="primary" onClick={() => navigate("/collections")}>
              Back to collections
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <header className="flex flex-wrap items-center gap-3">
        <IconButton label="Back" onClick={() => navigate("/collections")}>
          <ArrowLeft size={20} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
            {collection.title}
          </h1>
          <p className="text-sm text-text-secondary">
            {collection.folders.length} folders ·{" "}
            {collection.folders.reduce((sum, entry) => sum + entry.items.length, 0)} titles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            icon={<Pencil size={15} />}
            onClick={() => {
              setTitleDraft(collection.title);
              setRenameOpen(true);
            }}
          >
            Rename
          </Button>
          <IconButton
            label="Delete collection"
            variant="solid"
            onClick={() => {
              deleteCollection(collection.id);
              pushToast("Collection deleted", "info");
              navigate("/collections");
            }}
          >
            <Trash2 size={16} />
          </IconButton>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {collection.folders.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setActiveFolder(entry.id)}
            className={
              entry.id === folder?.id
                ? "accent-gradient rounded-full px-4 py-2 text-sm font-medium text-on-accent"
                : "rounded-full bg-white/5 px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
            }
          >
            {entry.name}
            <span className="ml-2 text-xs opacity-70">{entry.items.length}</span>
          </button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus size={15} />}
          onClick={() => {
            setFolderName("");
            setFolderOpen(true);
          }}
        >
          Folder
        </Button>
      </div>

      {folder && (
        <>
          <div className="flex items-center gap-2">
            <input
              defaultValue={folder.name}
              onBlur={(event) => {
                if (event.target.value.trim() && event.target.value !== folder.name) {
                  renameFolder(collection.id, folder.id, event.target.value.trim());
                }
              }}
              className="h-9 rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold hover:border-white/10 focus:border-[rgb(var(--nuvio-accent))] focus:outline-none"
              aria-label="Folder name"
            />
            {collection.folders.length > 1 && (
              <IconButton
                label="Delete folder"
                size="sm"
                onClick={() => {
                  deleteFolder(collection.id, folder.id);
                  setActiveFolder(null);
                  pushToast("Folder deleted", "info");
                }}
              >
                <Trash2 size={15} />
              </IconButton>
            )}
          </div>

          {folder.items.length === 0 ? (
            <EmptyState
              icon={<FolderOpen size={24} />}
              title="This folder is empty"
              description="Open any title and choose “Add to collection” to fill it up."
            />
          ) : (
            <PosterGrid>
              {folder.items.map((item) => (
                <div key={item.id} className="group/item relative">
                  <PosterCard meta={item.meta} addonUrl={item.meta.sourceAddonUrl} />
                  <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover/item:opacity-100">
                    {collection.folders.length > 1 && (
                      <button
                        aria-label="Move to folder"
                        onClick={() => {
                          setMoveTarget({ itemId: item.id, fromFolderId: folder.id });
                          setMoveTo(collection.folders.find((entry) => entry.id !== folder.id)?.id ?? "");
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur hover:bg-black/90"
                      >
                        <FolderOpen size={13} />
                      </button>
                    )}
                    <button
                      aria-label="Remove item"
                      onClick={() => {
                        removeItem(collection.id, folder.id, item.id);
                        pushToast("Removed from folder", "info");
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur hover:bg-black/90"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </PosterGrid>
          )}
        </>
      )}

      <Modal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename collection"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!titleDraft.trim()}
              onClick={() => {
                renameCollection(collection.id, titleDraft.trim());
                setRenameOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <input
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          autoFocus
          className="h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none focus:border-[rgb(var(--nuvio-accent))]"
        />
      </Modal>

      <Modal
        open={folderOpen}
        onClose={() => setFolderOpen(false)}
        title="New folder"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!folderName.trim()}
              onClick={() => {
                addFolder(collection.id, folderName.trim());
                setFolderOpen(false);
                pushToast("Folder created", "success");
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <input
          value={folderName}
          onChange={(event) => setFolderName(event.target.value)}
          placeholder="Folder name"
          autoFocus
          className="h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none focus:border-[rgb(var(--nuvio-accent))]"
        />
      </Modal>

      <Modal
        open={!!moveTarget}
        onClose={() => setMoveTarget(null)}
        title="Move to folder"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!moveTo}
              onClick={() => {
                if (moveTarget) {
                  moveItem(collection.id, moveTarget.fromFolderId, moveTo, moveTarget.itemId);
                  pushToast("Moved", "success");
                }
                setMoveTarget(null);
              }}
            >
              Move
            </Button>
          </>
        }
      >
        <Select value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>
          {collection.folders
            .filter((entry) => entry.id !== moveTarget?.fromFolderId)
            .map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
        </Select>
      </Modal>
    </div>
  );
}
