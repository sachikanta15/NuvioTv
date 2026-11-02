import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  CloudDownload,
  Download,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Puzzle,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import type { InstalledAddon } from "@/types";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { Toggle } from "@/components/ui/Toggle";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { AsyncImage } from "@/components/ui/AsyncImage";
import { ADDON_REGISTRY, REGISTRY_CATEGORY_LABELS, type RegistryAddon } from "@/lib/addon-registry";
import { catalogKey, useAddons } from "@/store/addons";
import { useAuth } from "@/store/auth";
import { useUi } from "@/store/ui";
import { cn } from "@/lib/cn";

export function AddonsScreen() {
  const addons = useAddons((state) => state.addons);
  const installing = useAddons((state) => state.installing);
  const errors = useAddons((state) => state.errors);
  const disabledCatalogs = useAddons((state) => state.disabledCatalogs);
  const install = useAddons((state) => state.install);
  const importText = useAddons((state) => state.importText);
  const remove = useAddons((state) => state.remove);
  const toggle = useAddons((state) => state.toggle);
  const move = useAddons((state) => state.move);
  const setDisplayName = useAddons((state) => state.setDisplayName);
  const setCatalogEnabled = useAddons((state) => state.setCatalogEnabled);
  const refresh = useAddons((state) => state.refresh);
  const authStatus = useAuth((state) => state.status);
  const restoringAddons = useAuth((state) => state.restoringAddons);
  const restoreAddons = useAuth((state) => state.restoreAddons);
  const pushToast = useUi((state) => state.pushToast);

  const [installOpen, setInstallOpen] = useState(false);
  const [installText, setInstallText] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<InstalledAddon | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [tab, setTab] = useState("installed");
  const [expanded, setExpanded] = useState<string | null>(null);

  const installedUrls = useMemo(
    () => new Set(addons.map((addon) => addon.transportUrl)),
    [addons],
  );

  const registryByCategory = useMemo(() => {
    const map = new Map<RegistryAddon["category"], RegistryAddon[]>();
    for (const addon of ADDON_REGISTRY) {
      if (!map.has(addon.category)) map.set(addon.category, []);
      map.get(addon.category)!.push(addon);
    }
    return map;
  }, []);

  const handleInstallText = async () => {
    setBusy(true);
    try {
      const result = await importText(installText);
      if (result.installed.length > 0) {
        pushToast(`Installed ${result.installed.length} add-on${result.installed.length === 1 ? "" : "s"}`, "success");
      }
      for (const message of result.messages) pushToast(message, "error");
      if (result.installed.length > 0) {
        setInstallText("");
        setInstallOpen(false);
        setTab("installed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[rgb(var(--nuvio-accent)/0.16)] text-[rgb(var(--nuvio-accent))]">
            <Puzzle size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Add-ons</h1>
            <p className="text-sm text-text-secondary">
              Nuvio brings your own sources. Install from the registry or paste a URL.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            tabs={[
              { id: "installed", label: "Installed", badge: addons.length },
              { id: "registry", label: "Registry" },
            ]}
            active={tab}
            onChange={setTab}
          />
          {authStatus === "signed_in" && (
            <Button
              variant="outline"
              icon={restoringAddons ? <Loader2 size={16} className="animate-spin" /> : <CloudDownload size={16} />}
              disabled={restoringAddons}
              onClick={() => void restoreAddons()}
            >
              {restoringAddons ? "Restoring…" : "Restore"}
            </Button>
          )}
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setInstallOpen(true)}>
            Install
          </Button>
        </div>
      </header>

      {authStatus !== "signed_in" && (
        <p className="flex items-center gap-2 rounded-panel border border-white/8 bg-[rgb(var(--nuvio-card))] px-4 py-3 text-sm text-text-secondary">
          <CloudDownload size={15} className="shrink-0 text-text-tertiary" />
          <span>
            Sign in to restore the add-ons saved on your other Nuvio devices.{" "}
            <Link to="/account" className="font-medium text-[rgb(var(--nuvio-accent))] hover:underline">
              Sign in
            </Link>
          </span>
        </p>
      )}

      {tab === "installed" &&
        (addons.length === 0 ? (
          <EmptyState
            icon={<Puzzle size={24} />}
            title="No add-ons installed"
            description="Install a metadata add-on such as Cinemeta to browse catalogs, and a stream add-on for sources."
            action={
              <Button variant="primary" onClick={() => setTab("registry")}>
                Browse the registry
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {addons.map((addon, index) => {
              const catalogCount = addon.manifest.catalogs?.length ?? 0;
              const isInstalling = installing.includes(addon.transportUrl);
              const isExpanded = expanded === addon.transportUrl;
              return (
                <article
                  key={addon.transportUrl}
                  className={cn(
                    "overflow-hidden rounded-panel-lg border bg-[rgb(var(--nuvio-card))] transition-colors",
                    addon.enabled ? "border-white/8" : "border-white/5 opacity-70",
                  )}
                >
                  <div className="flex items-start gap-4 p-4">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/5">
                      {addon.manifest.logo ? (
                        <AsyncImage
                          src={addon.manifest.logo}
                          alt={addon.manifest.name}
                          className="h-full w-full"
                          fit="contain"
                          fallbackIcon={false}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[rgb(var(--nuvio-accent))]">
                          <Puzzle size={20} />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate font-semibold">
                          {addon.displayName ?? addon.manifest.name}
                        </h2>
                        <span className="hidden rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-text-tertiary sm:inline">
                          v{addon.manifest.version}
                        </span>
                        {isInstalling && <Spinner size={13} />}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-text-secondary">
                        {addon.manifest.description ?? "No description provided."}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
                        <span className="sm:hidden">v{addon.manifest.version}</span>
                        <span>{addon.manifest.types.join(", ")}</span>
                        {catalogCount > 0 && <span>{catalogCount} catalogs</span>}
                        <span className="truncate">{addon.transportUrl}</span>
                      </div>
                      {errors[addon.transportUrl] && (
                        <p className="mt-2 text-xs text-[rgb(var(--nuvio-error))]">
                          {errors[addon.transportUrl]}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Toggle
                        checked={addon.enabled}
                        onChange={() => toggle(addon.transportUrl)}
                        ariaLabel={`${addon.enabled ? "Disable" : "Enable"} ${addon.manifest.name}`}
                      />
                      <div className="flex items-center">
                        <IconButton
                          label="Move up"
                          size="sm"
                          disabled={index === 0}
                          onClick={() => move(addon.transportUrl, -1)}
                        >
                          <ChevronUp size={16} />
                        </IconButton>
                        <IconButton
                          label="Move down"
                          size="sm"
                          disabled={index === addons.length - 1}
                          onClick={() => move(addon.transportUrl, 1)}
                        >
                          <ChevronDown size={16} />
                        </IconButton>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-white/8 px-2 py-1.5">
                    <div className="flex items-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<RefreshCw size={14} />}
                        onClick={() => {
                          void refresh(addon.transportUrl);
                          pushToast(`Refreshing ${addon.manifest.name}…`, "info");
                        }}
                      >
                        Refresh
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pencil size={14} />}
                        onClick={() => {
                          setRenaming(addon);
                          setRenameDraft(addon.displayName ?? addon.manifest.name);
                        }}
                      >
                        Rename
                      </Button>
                      {catalogCount > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpanded(isExpanded ? null : addon.transportUrl)}
                        >
                          {isExpanded ? "Hide" : "Catalogs"}
                        </Button>
                      )}
                    </div>
                    <IconButton
                      label={`Remove ${addon.manifest.name}`}
                      size="sm"
                      onClick={() => {
                        remove(addon.transportUrl);
                        pushToast(`Removed ${addon.manifest.name}`, "info");
                      }}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>

                  {isExpanded && (
                    <div className="space-y-1 border-t border-white/8 bg-black/20 p-3">
                      {(addon.manifest.catalogs ?? []).map((catalog) => {
                        const key = catalogKey(addon.transportUrl, catalog.type, catalog.id);
                        const enabled = !disabledCatalogs.includes(key);
                        return (
                          <label
                            key={key}
                            className="flex cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-2 transition-colors hover:bg-white/5"
                          >
                            <span>
                              <span className="block text-sm">{catalog.name}</span>
                              <span className="text-xs text-text-tertiary">{catalog.type}</span>
                            </span>
                            <Toggle
                              checked={enabled}
                              onChange={(value) => setCatalogEnabled(key, value)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ))}

      {tab === "registry" && (
        <div className="space-y-8">
          {[...registryByCategory.entries()].map(([category, entries]) => (
            <section key={category}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-tertiary">
                {REGISTRY_CATEGORY_LABELS[category]}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {entries.map((addon) => {
                  const installed = installedUrls.has(addon.transportUrl);
                  return (
                    <article
                      key={addon.id}
                      className="flex flex-col rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20"
                    >
                      <div className="flex-1">
                        <h3 className="font-semibold">{addon.name}</h3>
                        <p className="mt-1 text-sm text-text-secondary">{addon.description}</p>
                      </div>
                      <Button
                        className="mt-4"
                        size="sm"
                        variant={installed ? "outline" : "primary"}
                        disabled={installed || installing.includes(addon.transportUrl)}
                        icon={
                          installing.includes(addon.transportUrl) ? (
                            <Spinner size={14} />
                          ) : (
                            <Download size={14} />
                          )
                        }
                        onClick={async () => {
                          const result = await install([addon.transportUrl]);
                          if (result.installed.length) pushToast(`Installed ${addon.name}`, "success");
                          for (const failure of result.failed) pushToast(failure.error, "error");
                        }}
                      >
                        {installed ? "Installed" : "Install"}
                      </Button>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Install modal */}
      <Modal
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        title="Install add-on"
        description="Paste an add-on URL, a Stremio collection JSON, or multiple URLs."
        footer={
          <>
            <Button variant="ghost" onClick={() => setInstallOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy || !installText.trim()}
              icon={busy ? <Spinner size={15} /> : <Upload size={15} />}
              onClick={handleInstallText}
            >
              Install
            </Button>
          </>
        }
      >
        <textarea
          value={installText}
          onChange={(event) => setInstallText(event.target.value)}
          rows={6}
          placeholder={"https://v3-cinemeta.strem.io\n\nor paste {\"addons\":[…]} from Stremio"}
          className="w-full resize-none rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] p-4 font-mono text-xs outline-none placeholder:text-text-tertiary focus:border-[rgb(var(--nuvio-accent))]"
        />
        <p className="mt-3 flex items-center gap-2 text-xs text-text-tertiary">
          <Link2 size={13} /> Tip: an add-on's “Install” page URL usually works directly.
        </p>
      </Modal>

      {/* Rename modal */}
      <Modal
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title="Rename add-on"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (renaming) setDisplayName(renaming.transportUrl, renameDraft);
                setRenaming(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <input
          value={renameDraft}
          onChange={(event) => setRenameDraft(event.target.value)}
          autoFocus
          className="h-11 w-full rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none focus:border-[rgb(var(--nuvio-accent))]"
        />
      </Modal>
    </div>
  );
}
