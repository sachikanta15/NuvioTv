import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderHeart, FolderPlus, Layers, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/IconButton";
import { AsyncImage } from "@/components/ui/AsyncImage";
import { useCollections } from "@/store/collections";
import { useUi } from "@/store/ui";
import { relativeTime } from "@/lib/format";

export function CollectionsScreen() {
  const navigate = useNavigate();
  const collections = useCollections((state) => state.collections);
  const createCollection = useCollections((state) => state.createCollection);
  const deleteCollection = useCollections((state) => state.deleteCollection);
  const addFolder = useCollections((state) => state.addFolder);
  const pushToast = useUi((state) => state.pushToast);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [folderFor, setFolderFor] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");

  return (
    <div className="space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--nuvio-accent)/0.14)] text-[rgb(var(--nuvio-accent))]">
            <FolderHeart size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Collections</h1>
            <p className="text-sm text-text-secondary">
              Curate your own folders of movies and series.
            </p>
          </div>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
          New collection
        </Button>
      </header>

      {collections.length === 0 ? (
        <EmptyState
          icon={<FolderHeart size={24} />}
          title="No collections yet"
          description="Create a collection to group titles into folders — like a custom streaming shelf."
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              Create your first collection
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => {
            const posters = collection.folders
              .flatMap((folder) => folder.items)
              .slice(0, 4)
              .map((item) => item.meta.poster);
            const count = collection.folders.reduce((sum, folder) => sum + folder.items.length, 0);
            return (
              <article
                key={collection.id}
                className="group overflow-hidden rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] transition-all duration-300 ease-nuvio hover:-translate-y-1 hover:border-white/20 hover:shadow-card"
              >
                <button
                  onClick={() => navigate(`/collections/${collection.id}`)}
                  className="block w-full text-left"
                >
                  <div className="grid grid-cols-2 gap-0.5 bg-black/30">
                    {posters.length === 0 &&
                      Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="aspect-[2/3] bg-white/5" />
                      ))}
                    {posters.map((poster, index) => (
                      <AsyncImage
                        key={`${poster}-${index}`}
                        src={poster}
                        alt=""
                        className="aspect-[2/3] w-full"
                      />
                    ))}
                    {posters.length > 0 &&
                      posters.length < 4 &&
                      Array.from({ length: 4 - posters.length }).map((_, index) => (
                        <div key={`ph-${index}`} className="aspect-[2/3] bg-white/5" />
                      ))}
                  </div>
                  <div className="p-4">
                    <h2 className="truncate font-semibold">{collection.title}</h2>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {collection.folders.length} folder
                      {collection.folders.length === 1 ? "" : "s"} · {count} title
                      {count === 1 ? "" : "s"}
                    </p>
                    <p className="mt-0.5 text-xs text-text-tertiary">
                      Updated {relativeTime(collection.updatedAt)}
                    </p>
                  </div>
                </button>
                <div className="flex items-center justify-between border-t border-white/8 px-2 py-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<FolderPlus size={14} />}
                    onClick={() => {
                      setFolderFor(collection.id);
                      setFolderName("");
                    }}
                  >
                    Folder
                  </Button>
                  <IconButton
                    label="Delete collection"
                    size="sm"
                    onClick={() => {
                      deleteCollection(collection.id);
                      pushToast(`Deleted “${collection.title}”`, "info");
                    }}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New collection"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!title.trim()}
              onClick={() => {
                const collection = createCollection(title.trim());
                setTitle("");
                setCreateOpen(false);
                pushToast(`Created “${collection.title}”`, "success");
                navigate(`/collections/${collection.id}`);
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Collection name"
          autoFocus
          className="h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none placeholder:text-text-tertiary focus:border-[rgb(var(--nuvio-accent))]"
        />
      </Modal>

      <Modal
        open={!!folderFor}
        onClose={() => setFolderFor(null)}
        title="New folder"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFolderFor(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!folderName.trim()}
              onClick={() => {
                if (folderFor) addFolder(folderFor, folderName.trim());
                setFolderFor(null);
                pushToast("Folder created", "success");
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <input
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            placeholder="e.g. Watch with friends"
            autoFocus
            className="h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none placeholder:text-text-tertiary focus:border-[rgb(var(--nuvio-accent))]"
          />
          <p className="flex items-center gap-2 text-xs text-text-tertiary">
            <Layers size={13} /> Folders keep different moods or watch orders separate.
          </p>
        </div>
      </Modal>
    </div>
  );
}
