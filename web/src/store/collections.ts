import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Collection, CollectionFolder, MetaPreview } from "@/types";
import { uid } from "@/lib/id";

interface CollectionsState {
  collections: Collection[];
  createCollection: (title: string) => Collection;
  renameCollection: (id: string, title: string) => void;
  deleteCollection: (id: string) => void;

  addFolder: (collectionId: string, name: string) => CollectionFolder | null;
  renameFolder: (collectionId: string, folderId: string, name: string) => void;
  deleteFolder: (collectionId: string, folderId: string) => void;

  addItem: (collectionId: string, folderId: string, meta: MetaPreview) => void;
  removeItem: (collectionId: string, folderId: string, itemId: string) => void;
  moveItem: (collectionId: string, fromFolderId: string, toFolderId: string, itemId: string) => void;
}

const touch = (collection: Collection): Collection => ({ ...collection, updatedAt: Date.now() });

export const useCollections = create<CollectionsState>()(
  persist(
    (set, get) => ({
      collections: [],

      createCollection: (title) => {
        const collection: Collection = {
          id: uid("collection"),
          title,
          folders: [{ id: uid("folder"), name: "Default", items: [] }],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({ collections: [collection, ...state.collections] }));
        return collection;
      },

      renameCollection: (id, title) =>
        set((state) => ({
          collections: state.collections.map((collection) =>
            collection.id === id ? touch({ ...collection, title }) : collection,
          ),
        })),

      deleteCollection: (id) =>
        set((state) => ({
          collections: state.collections.filter((collection) => collection.id !== id),
        })),

      addFolder: (collectionId, name) => {
        const collection = get().collections.find((entry) => entry.id === collectionId);
        if (!collection) return null;
        const folder: CollectionFolder = { id: uid("folder"), name, items: [] };
        set((state) => ({
          collections: state.collections.map((entry) =>
            entry.id === collectionId ? touch({ ...entry, folders: [...entry.folders, folder] }) : entry,
          ),
        }));
        return folder;
      },

      renameFolder: (collectionId, folderId, name) =>
        set((state) => ({
          collections: state.collections.map((collection) =>
            collection.id === collectionId
              ? touch({
                  ...collection,
                  folders: collection.folders.map((folder) =>
                    folder.id === folderId ? { ...folder, name } : folder,
                  ),
                })
              : collection,
          ),
        })),

      deleteFolder: (collectionId, folderId) =>
        set((state) => ({
          collections: state.collections.map((collection) =>
            collection.id === collectionId
              ? touch({
                  ...collection,
                  folders: collection.folders.filter((folder) => folder.id !== folderId),
                })
              : collection,
          ),
        })),

      addItem: (collectionId, folderId, meta) =>
        set((state) => ({
          collections: state.collections.map((collection) =>
            collection.id === collectionId
              ? touch({
                  ...collection,
                  folders: collection.folders.map((folder) =>
                    folder.id === folderId && !folder.items.some((item) => item.id === meta.id)
                      ? { ...folder, items: [...folder.items, { id: meta.id, meta }] }
                      : folder,
                  ),
                })
              : collection,
          ),
        })),

      removeItem: (collectionId, folderId, itemId) =>
        set((state) => ({
          collections: state.collections.map((collection) =>
            collection.id === collectionId
              ? touch({
                  ...collection,
                  folders: collection.folders.map((folder) =>
                    folder.id === folderId
                      ? { ...folder, items: folder.items.filter((item) => item.id !== itemId) }
                      : folder,
                  ),
                })
              : collection,
          ),
        })),

      moveItem: (collectionId, fromFolderId, toFolderId, itemId) =>
        set((state) => ({
          collections: state.collections.map((collection) => {
            if (collection.id !== collectionId) return collection;
            const source = collection.folders.find((folder) => folder.id === fromFolderId);
            const item = source?.items.find((entry) => entry.id === itemId);
            if (!item) return collection;
            return touch({
              ...collection,
              folders: collection.folders.map((folder) => {
                if (folder.id === fromFolderId) {
                  return { ...folder, items: folder.items.filter((entry) => entry.id !== itemId) };
                }
                if (folder.id === toFolderId && !folder.items.some((entry) => entry.id === itemId)) {
                  return { ...folder, items: [...folder.items, item] };
                }
                return folder;
              }),
            });
          }),
        })),
    }),
    { name: "nuvio.collections.v1", version: 1 },
  ),
);
