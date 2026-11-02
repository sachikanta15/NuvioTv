import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Plus, Trash2, User, Users } from "lucide-react";
import type { Profile } from "@/types";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { Toggle } from "@/components/ui/Toggle";
import { cn } from "@/lib/cn";
import { PROFILE_COLORS, useProfiles } from "@/store/profiles";
import { useUi } from "@/store/ui";

const AVATARS = ["🎬", "🍿", "🌟", "🚀", "🐱", "🐶", "🎮", "🎧", "🦊", "🐼", "🧊", "🔥"];

export function ProfilesScreen() {
  const navigate = useNavigate();
  const profiles = useProfiles((state) => state.profiles);
  const activeProfileId = useProfiles((state) => state.activeProfileId);
  const createProfile = useProfiles((state) => state.createProfile);
  const updateProfile = useProfiles((state) => state.updateProfile);
  const deleteProfile = useProfiles((state) => state.deleteProfile);
  const setActiveProfile = useProfiles((state) => state.setActiveProfile);
  const pushToast = useUi((state) => state.pushToast);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Partial<Profile>>({});
  const [pinPrompt, setPinPrompt] = useState<Profile | null>(null);
  const [pinInput, setPinInput] = useState("");

  const openCreate = () => {
    setEditing(null);
    setDraft({
      name: "",
      avatar: AVATARS[0],
      color: PROFILE_COLORS[profiles.length % PROFILE_COLORS.length],
      pin: "",
      isKids: false,
    });
    setEditorOpen(true);
  };

  const openEdit = (profile: Profile) => {
    setEditing(profile);
    setDraft(profile);
    setEditorOpen(true);
  };

  const choose = (profile: Profile) => {
    if (profile.pin) {
      setPinPrompt(profile);
      setPinInput("");
      return;
    }
    setActiveProfile(profile.id);
    pushToast(`Switched to ${profile.name}`, "success");
  };

  const save = () => {
    if (!draft.name?.trim()) return;
    if (editing) {
      updateProfile(editing.id, draft);
      pushToast("Profile updated", "success");
    } else {
      const created = createProfile({ ...draft, name: draft.name.trim() });
      setActiveProfile(created.id);
      pushToast(`Created ${created.name}`, "success");
    }
    setEditorOpen(false);
  };

  return (
    <div className="space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[rgb(var(--nuvio-accent)/0.16)] text-[rgb(var(--nuvio-accent))]">
            <Users size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Profiles</h1>
            <p className="text-sm text-text-secondary">
              Separate watchlists, history and progress for everyone.
            </p>
          </div>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={openCreate}>
          New profile
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {profiles.map((profile) => {
          const isActive = profile.id === activeProfileId;
          return (
            <article
              key={profile.id}
              className={cn(
                "group relative overflow-hidden rounded-panel-lg border bg-[rgb(var(--nuvio-card))] p-5 transition-all duration-300 ease-nuvio hover:-translate-y-1 hover:shadow-card",
                isActive ? "border-[rgb(var(--nuvio-accent))]" : "border-white/8 hover:border-white/20",
              )}
            >
              <button onClick={() => choose(profile)} className="flex w-full items-center gap-4 text-left">
                <span
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl"
                  style={{ backgroundColor: `${profile.color}33`, border: `2px solid ${profile.color}` }}
                >
                  {profile.avatar}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold">{profile.name}</span>
                    {profile.isKids && (
                      <span className="rounded-full bg-[rgb(var(--nuvio-info)/0.2)] px-2 text-[10px] font-bold uppercase text-[rgb(var(--nuvio-info))]">
                        Kids
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-text-tertiary">
                    {profile.pin ? "PIN protected" : "No PIN"}
                  </span>
                  {isActive && (
                    <span className="mt-1 flex items-center gap-1 text-xs font-medium text-[rgb(var(--nuvio-accent))]">
                      <Check size={12} /> Active
                    </span>
                  )}
                </span>
              </button>

              <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-3">
                <Button size="sm" variant="ghost" onClick={() => openEdit(profile)}>
                  Edit
                </Button>
                <div className="flex items-center gap-1">
                  {!isActive && (
                    <Button size="sm" variant="ghost" onClick={() => choose(profile)}>
                      Switch
                    </Button>
                  )}
                  {profiles.length > 1 && !isActive && (
                    <IconButton
                      label={`Delete ${profile.name}`}
                      size="sm"
                      onClick={() => {
                        deleteProfile(profile.id);
                        pushToast(`Deleted ${profile.name}`, "info");
                      }}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="flex justify-center pt-2">
        <Button variant="ghost" onClick={() => navigate("/settings")}>
          Back to settings
        </Button>
      </div>

      {/* Editor */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? "Edit profile" : "New profile"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!draft.name?.trim()} onClick={save}>
              {editing ? "Save" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <span
              className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
              style={{
                backgroundColor: `${draft.color ?? PROFILE_COLORS[0]}33`,
                border: `2px solid ${draft.color ?? PROFILE_COLORS[0]}`,
              }}
            >
              {draft.avatar ?? "🎬"}
            </span>
            <input
              value={draft.name ?? ""}
              onChange={(event) => setDraft((state) => ({ ...state, name: event.target.value }))}
              placeholder="Profile name"
              autoFocus
              className="h-11 flex-1 rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none focus:border-[rgb(var(--nuvio-accent))]"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Avatar</p>
            <div className="flex flex-wrap gap-2">
              {AVATARS.map((avatar) => (
                <button
                  key={avatar}
                  onClick={() => setDraft((state) => ({ ...state, avatar }))}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl text-xl transition-all",
                    draft.avatar === avatar
                      ? "bg-[rgb(var(--nuvio-accent)/0.2)] ring-2 ring-[rgb(var(--nuvio-accent))]"
                      : "bg-white/5 hover:bg-white/10",
                  )}
                >
                  {avatar}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Colour</p>
            <div className="flex flex-wrap gap-2">
              {PROFILE_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setDraft((state) => ({ ...state, color }))}
                  aria-label={`Colour ${color}`}
                  className={cn(
                    "h-9 w-9 rounded-full transition-all",
                    draft.color === color && "ring-2 ring-white ring-offset-2 ring-offset-[rgb(var(--nuvio-modal))]",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">PIN (optional)</label>
            <input
              value={draft.pin ?? ""}
              onChange={(event) =>
                setDraft((state) => ({ ...state, pin: event.target.value.replace(/\D/g, "").slice(0, 4) }))
              }
              placeholder="4 digits"
              inputMode="numeric"
              className="h-11 w-32 rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm tracking-widest outline-none focus:border-[rgb(var(--nuvio-accent))]"
            />
          </div>

          <Toggle
            checked={!!draft.isKids}
            onChange={(value) => setDraft((state) => ({ ...state, isKids: value }))}
            label="Kids profile"
            description="Restrict to family-friendly catalogs"
          />
        </div>
      </Modal>

      {/* PIN prompt */}
      <Modal
        open={!!pinPrompt}
        onClose={() => setPinPrompt(null)}
        title={`Enter PIN for ${pinPrompt?.name ?? ""}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPinPrompt(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={pinInput.length < 4}
              onClick={() => {
                if (pinPrompt && pinInput === pinPrompt.pin) {
                  setActiveProfile(pinPrompt.id);
                  pushToast(`Switched to ${pinPrompt.name}`, "success");
                  setPinPrompt(null);
                } else {
                  pushToast("Incorrect PIN", "error");
                  setPinInput("");
                }
              }}
            >
              Unlock
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-3">
          <User size={20} className="text-text-tertiary" />
          <input
            value={pinInput}
            onChange={(event) => setPinInput(event.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            autoFocus
            className="h-11 flex-1 rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-center text-lg tracking-[0.5em] outline-none focus:border-[rgb(var(--nuvio-accent))]"
          />
        </div>
      </Modal>
    </div>
  );
}
