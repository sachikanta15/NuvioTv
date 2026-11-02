import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  Download,
  Globe2,
  GripVertical,
  Info,
  LayoutGrid,
  Lock,
  MapPin,
  Palette,
  PlayCircle,
  RotateCcw,
  Sliders,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import type { AppTheme, CustomThemeColors, StaticTheme } from "@/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Tabs } from "@/components/ui/Tabs";
import { Toggle } from "@/components/ui/Toggle";
import { cn } from "@/lib/cn";
import {
  CUSTOM_THEME_DEFAULT,
  FONT_LABELS,
  PALETTES,
  SUPPORTER_THEMES,
  THEME_LABELS,
  customPalette,
  solidColors,
} from "@/lib/theme";
import { isThemeUnlocked, tierLabel } from "@/lib/member-access";
import { INDIA_AVAILABLE_LANGUAGES, INDIA_LANGUAGES, INDIA_TITLES } from "@/lib/india";
import { catalogKey } from "@/store/addons";
import {
  DEBRID_PROVIDER_LABELS,
  DEBRID_SIGNUP_URLS,
  useDebrid,
} from "@/store/debrid";
import { testDebridConnection } from "@/lib/debrid";
import { useSettings } from "@/store/settings";
import { useAddons } from "@/store/addons";
import { useProfiles } from "@/store/profiles";
import { useAuth } from "@/store/auth";
import { useUi } from "@/store/ui";

const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "india", label: "India", icon: MapPin },
  { id: "home", label: "Home", icon: Sliders },
  { id: "layout", label: "Layout", icon: LayoutGrid },
  { id: "playback", label: "Playback", icon: PlayCircle },
  { id: "debrid", label: "Debrid", icon: Cloud },
  { id: "profiles", label: "Profiles", icon: Users },
  { id: "data", label: "Data & about", icon: Info },
];

const SUBTITLE_LANGUAGES = [
  { code: "off", label: "Off" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
];

const THEME_ORDER: AppTheme[] = [...(Object.keys(PALETTES) as StaticTheme[]), "custom"];

export function SettingsScreen() {
  const [section, setSection] = useState("appearance");
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const settings = useSettings();
  const debrid = useDebrid();
  const [debridKey, setDebridKey] = useState(debrid.apiKey);
  const [debridTesting, setDebridTesting] = useState(false);
  const [debridAccount, setDebridAccount] = useState<string | null>(null);
  const addons = useAddons((state) => state.addons);
  const installAddons = useAddons((state) => state.install);
  const mediaServerInstalled = addons.some((addon) =>
    addon.transportUrl.includes("mediaserver"),
  );
  const setCatalogOrder = useAddons((state) => state.setCatalogOrder);
  const setCatalogEnabled = useAddons((state) => state.setCatalogEnabled);
  const catalogOrder = useAddons((state) => state.catalogOrder);
  const disabledCatalogs = useAddons((state) => state.disabledCatalogs);
  const allCatalogs = useMemo(() => {
    const list = addons
      .filter((addon) => addon.enabled)
      .flatMap((addon) =>
        (addon.manifest.catalogs ?? []).map((catalog) => ({
          key: catalogKey(addon.transportUrl, catalog.type, catalog.id),
          type: catalog.type,
          name: catalog.name,
          addonName: addon.displayName ?? addon.manifest.name,
        })),
      );
    const orderIndex = new Map(catalogOrder.map((key, index) => [key, index]));
    return list.sort((a, b) => {
      const ai = orderIndex.get(a.key);
      const bi = orderIndex.get(b.key);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return 0;
    });
  }, [addons, catalogOrder]);
  const profiles = useProfiles((state) => state.profiles);
  const pushToast = useUi((state) => state.pushToast);
  const navigate = useNavigate();
  const authStatus = useAuth((state) => state.status);
  const memberTier = useAuth((state) => state.memberAccess.tier);
  const entitlements = useAuth((state) => state.memberAccess.entitlements);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportData = () => {
    const payload: Record<string, unknown> = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith("nuvio.")) continue;
      try {
        payload[key] = JSON.parse(localStorage.getItem(key) ?? "null");
      } catch {
        payload[key] = localStorage.getItem(key);
      }
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nuvio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    pushToast("Backup downloaded", "success");
  };

  const importData = async (file: File) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as Record<string, unknown>;
      for (const [key, value] of Object.entries(payload)) {
        if (!key.startsWith("nuvio.")) continue;
        localStorage.setItem(key, JSON.stringify(value));
      }
      pushToast("Backup restored — reloading…", "success");
      setTimeout(() => window.location.reload(), 800);
    } catch {
      pushToast("That file could not be read.", "error");
    }
  };

  const moveCatalog = (key: string, direction: -1 | 1) => {
    const keys = allCatalogs.map((catalog) => catalog.key);
    const index = keys.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= keys.length) return;
    [keys[index], keys[target]] = [keys[target], keys[index]];
    setCatalogOrder(keys);
  };

  return (
    <div className="space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-text-secondary">Personalise Nuvio TV for the web.</p>
      </header>

      <div className="no-scrollbar -mx-4 sm:-mx-6 lg:-mx-8">
        <Tabs
          tabs={SECTIONS.map(({ id, label }) => ({ id, label }))}
          active={section}
          onChange={setSection}
          className="mx-4 w-[calc(100%-2rem)] sm:mx-6 sm:w-[calc(100%-3rem)] lg:mx-8 lg:w-fit"
        />
      </div>

      {section === "appearance" && (
        <div className="space-y-8">
          <Card title="Membership" description="Your Nuvio account and supporter perks.">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                    memberTier
                      ? "bg-[rgb(var(--nuvio-accent)/0.16)] text-[rgb(var(--nuvio-accent))]"
                      : "bg-white/5 text-text-tertiary",
                  )}
                >
                  <Sparkles size={20} />
                </span>
                <div>
                  <p className="font-medium">
                    {authStatus === "signed_in" ? tierLabel(memberTier) : "Not signed in"}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {authStatus === "signed_in"
                      ? memberTier
                        ? "Your supporter themes are unlocked on every device."
                        : "Sign in to restore your add-ons and unlock supporter themes."
                      : "Sign in with the same account you use in the Nuvio app."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {authStatus === "signed_in" && (
                  <Button variant="outline" onClick={() => navigate("/account")}>
                    Manage
                  </Button>
                )}
                <Button variant="primary" onClick={() => navigate("/account")}>
                  {authStatus === "signed_in" ? "Account" : "Sign in"}
                </Button>
              </div>
            </div>
          </Card>

          <Card title="Theme" description="Accent colour and surface tinting.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {THEME_ORDER.map((key) => {
                const selected = settings.theme === key;
                const isCustom = key === "custom";
                const unlocked = isThemeUnlocked(key, entitlements);
                const gradient = isCustom
                  ? customPalette(
                      settings.customGradient
                        ? settings.themeColors
                        : solidColors(settings.themeColors),
                    ).accentGradient
                  : PALETTES[key as StaticTheme].accentGradient;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      if (!unlocked) {
                        pushToast(
                          authStatus === "signed_in"
                            ? `${THEME_LABELS[key]} is a Supporter theme`
                            : "Sign in to unlock Supporter themes",
                          "info",
                        );
                        navigate("/account");
                        return;
                      }
                      settings.setTheme(key);
                      if (isCustom) setCustomEditorOpen(true);
                    }}
                    className={cn(
                      "group relative overflow-hidden rounded-panel border p-3 text-left transition-all duration-200",
                      selected
                        ? "border-[rgb(var(--nuvio-accent))] bg-white/5 shadow-glow"
                        : "border-white/10 hover:border-white/25 hover:bg-white/[0.03]",
                      !unlocked && "opacity-70",
                    )}
                  >
                    <div
                      className="mb-2 h-12 w-full rounded-lg transition-transform duration-300 group-hover:scale-[1.02]"
                      style={{
                        backgroundImage: `linear-gradient(135deg, ${gradient.join(", ")})`,
                      }}
                    />
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {THEME_LABELS[key]}
                      {SUPPORTER_THEMES.includes(key) && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 text-[9px] font-bold uppercase",
                            unlocked
                              ? "bg-[rgb(var(--nuvio-warning)/0.2)] text-[rgb(var(--nuvio-warning))]"
                              : "bg-white/10 text-text-tertiary",
                          )}
                        >
                          {unlocked ? "Supporter" : "Locked"}
                        </span>
                      )}
                      {isCustom && (
                        <span className="text-[10px] font-normal text-text-tertiary">
                          edit
                        </span>
                      )}
                    </span>
                    {!unlocked && (
                      <Lock
                        size={13}
                        className="absolute right-2.5 top-2.5 text-text-tertiary"
                      />
                    )}
                    {selected && unlocked && (
                      <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full accent-gradient text-on-accent">
                        <Check size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title="Display" description="Typography and motion.">
            <Toggle
              checked={settings.amoled}
              onChange={settings.setAmoled}
              label="AMOLED black"
              description="Use pure black surfaces (great on OLED screens)"
            />
            <Toggle
              checked={settings.reduceMotion}
              onChange={settings.setReduceMotion}
              label="Reduce motion"
              description="Disable animations and auto-rotating hero artwork"
            />
            <Toggle
              checked={settings.posterLabelsEnabled}
              onChange={settings.setPosterLabelsEnabled}
              label="Show titles under posters"
              description="Display the name and year beneath each card"
            />
            <div className="grid gap-5 py-3 sm:grid-cols-2">
              <Select
                label="Font"
                value={settings.font}
                onChange={(event) => settings.setFont(event.target.value as never)}
              >
                {Object.entries(FONT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <div className="flex items-end">
                <Slider
                  label="Text size"
                  min={0.85}
                  max={1.3}
                  step={0.05}
                  value={settings.fontScale}
                  onChange={settings.setFontScale}
                  format={(value) => `${Math.round(value * 100)}%`}
                />
              </div>
            </div>
          </Card>
        </div>
      )}

      {section === "india" && (
        <div className="space-y-8">
          <Card
            title="India-first home"
            description="Nuvio opens with curated Indian cinema, live TV and regional languages."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    id: "IN" as const,
                    title: "🇮🇳 India",
                    text: "Bollywood, regional cinema, web series and JioTV first.",
                  },
                  {
                    id: "GLOBAL" as const,
                    title: "🌍 Global",
                    text: "Show every catalog from your add-ons first.",
                  },
                ]
              ).map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    settings.setContentRegion(option.id);
                    if (option.id === "IN") settings.setIndiaLanding(true);
                  }}
                  className={cn(
                    "rounded-panel border p-4 text-left transition-all duration-200",
                    settings.contentRegion === option.id
                      ? "border-[rgb(var(--nuvio-accent))] bg-[rgb(var(--nuvio-accent)/0.08)]"
                      : "border-white/10 hover:border-white/25 hover:bg-white/[0.03]",
                  )}
                >
                  <p className="font-medium">{option.title}</p>
                  <p className="mt-1 text-xs text-text-tertiary">{option.text}</p>
                </button>
              ))}
            </div>

            <div className="pt-2">
              <Toggle
                checked={settings.indiaLanding}
                onChange={settings.setIndiaLanding}
                label="Show Indian rails on home"
                description="Curated Trending, Bollywood, web series, South cinema and classics rows."
              />
            </div>

            <div className="grid gap-5 py-3 sm:grid-cols-2">
              <Select
                label="Preferred Indian language"
                value={settings.indiaLanguage}
                onChange={(event) => settings.setIndiaLanguage(event.target.value)}
              >
                <option value="all">All Indian languages</option>
                {INDIA_AVAILABLE_LANGUAGES.map((language) => (
                  <option key={language.id} value={language.id}>
                    {language.native} · {language.label}
                  </option>
                ))}
              </Select>
              <Select
                label="Hero carousel"
                value={settings.heroSource}
                onChange={(event) => settings.setHeroSource(event.target.value as never)}
              >
                <option value="india">Made for India</option>
                <option value="addons">My add-on catalogs</option>
              </Select>
            </div>
          </Card>

          <Card
            title="Curated catalogue"
            description="Hand-picked Indian films and series, refreshed from Cinemeta."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Titles", value: String(INDIA_TITLES.length) },
                { label: "Languages", value: String(new Set(INDIA_TITLES.map((title) => title.language)).size) },
                { label: "Industries", value: "Bollywood · South · Bengali · Marathi" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-panel border border-white/8 bg-black/15 p-4"
                >
                  <p className="text-xs text-text-tertiary">{stat.label}</p>
                  <p className="mt-1 text-lg font-semibold leading-tight">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="primary" icon={<MapPin size={16} />} onClick={() => navigate("/india/all")}>
                Browse all Indian titles
              </Button>
              <Button variant="outline" icon={<Globe2 size={16} />} onClick={() => navigate("/discover")}>
                Discover India
              </Button>
              <Button variant="ghost" onClick={() => navigate("/jiotv")}>
                Open JioTV Live
              </Button>
            </div>
          </Card>

          <Card title="Languages" description="Tap a language to filter the India home instantly.">
            <div className="flex flex-wrap gap-2">
              {INDIA_AVAILABLE_LANGUAGES.map((language) => (
                <button
                  key={language.id}
                  onClick={() => settings.setIndiaLanguage(language.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-colors",
                    settings.indiaLanguage === language.id
                      ? "border-[rgb(var(--nuvio-accent))] bg-[rgb(var(--nuvio-accent)/0.12)] text-text-primary"
                      : "border-white/10 bg-white/[0.03] text-text-secondary hover:border-white/25",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: language.color }}
                  />
                  <span>{language.native}</span>
                  <span className="text-xs text-text-tertiary">{language.label}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {section === "layout" && (
        <div className="space-y-8">
          <Card title="Home layout" description="How catalogs and posters are arranged.">
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  { id: "modern", label: "Modern", hint: "Hero banner with rows" },
                  { id: "classic", label: "Classic", hint: "Dense poster rows" },
                  { id: "grid", label: "Grid", hint: "Grouped poster grids" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  onClick={() => settings.setHomeLayout(option.id)}
                  className={cn(
                    "rounded-panel border p-4 text-left transition-all duration-200",
                    settings.homeLayout === option.id
                      ? "border-[rgb(var(--nuvio-accent))] bg-[rgb(var(--nuvio-accent)/0.08)]"
                      : "border-white/10 hover:border-white/25 hover:bg-white/[0.03]",
                  )}
                >
                  <p className="font-medium">{option.label}</p>
                  <p className="mt-1 text-xs text-text-tertiary">{option.hint}</p>
                </button>
              ))}
            </div>

            <div className="pt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Poster shape
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    { id: "poster", label: "Poster", hint: "2:3 artwork" },
                    { id: "landscape", label: "Landscape", hint: "16:9 artwork" },
                    { id: "square", label: "Square", hint: "1:1 artwork" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    onClick={() => settings.setCardShape(option.id)}
                    className={cn(
                      "rounded-panel border p-3 text-left transition-all duration-200",
                      settings.cardShape === option.id
                        ? "border-[rgb(var(--nuvio-accent))] bg-[rgb(var(--nuvio-accent)/0.08)]"
                        : "border-white/10 hover:border-white/25",
                    )}
                  >
                    <p className="text-sm font-medium">{option.label}</p>
                    <p className="text-xs text-text-tertiary">{option.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4">
              <Slider
                label="Poster size"
                min={110}
                max={220}
                step={10}
                value={settings.cardWidth}
                onChange={settings.setCardWidth}
                format={(value) => `${value}px`}
              />
            </div>

            <div className="grid gap-5 pt-3 sm:grid-cols-2">
              <Select
                label="Continue watching"
                value={settings.continueWatchingStyle}
                onChange={(event) => settings.setContinueWatchingStyle(event.target.value as never)}
              >
                <option value="rail">Landscape rail</option>
                <option value="grid">Poster grid</option>
              </Select>
              <Select
                label="Detail page"
                value={settings.detailLayout}
                onChange={(event) => settings.setDetailLayout(event.target.value as never)}
              >
                <option value="cinematic">Cinematic backdrop</option>
                <option value="compact">Compact header</option>
              </Select>
              <Select
                label="Stream list"
                value={settings.streamLayout}
                onChange={(event) => settings.setStreamLayout(event.target.value as never)}
              >
                <option value="list">Comfortable list</option>
                <option value="grid">Two-column grid</option>
              </Select>
              <Select
                label="Video aspect"
                value={settings.playerAspect}
                onChange={(event) => settings.setPlayerAspect(event.target.value as never)}
              >
                <option value="contain">Fit (letterbox)</option>
                <option value="cover">Fill (crop)</option>
                <option value="fill">Stretch</option>
              </Select>
            </div>
          </Card>

          <Card title="Player overlays" description="What appears on top of the video.">
            <Toggle
              checked={settings.showPlayerStats}
              onChange={settings.setShowPlayerStats}
              label="Playback stats"
              description="Show resolution, buffer, dropped frames and party state."
            />
          </Card>
        </div>
      )}

      {section === "home" && (
        <div className="space-y-8">
          <Card title="Layout" description="How catalogs are arranged on the home screen.">
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  { id: "modern", label: "Modern", hint: "Hero banner with rows" },
                  { id: "classic", label: "Classic", hint: "Dense poster rows" },
                  { id: "grid", label: "Grid", hint: "Grouped poster grids" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  onClick={() => settings.setHomeLayout(option.id)}
                  className={cn(
                    "rounded-panel border p-4 text-left transition-all duration-200",
                    settings.homeLayout === option.id
                      ? "border-[rgb(var(--nuvio-accent))] bg-[rgb(var(--nuvio-accent)/0.08)]"
                      : "border-white/10 hover:border-white/25 hover:bg-white/[0.03]",
                  )}
                >
                  <p className="font-medium">{option.label}</p>
                  <p className="mt-1 text-xs text-text-tertiary">{option.hint}</p>
                </button>
              ))}
            </div>
            <div className="pt-4">
              <Slider
                label="Poster size"
                min={110}
                max={220}
                step={10}
                value={settings.cardWidth}
                onChange={settings.setCardWidth}
                format={(value) => `${value}px`}
              />
            </div>
            <Toggle
              checked={settings.heroEnabled}
              onChange={settings.setHeroEnabled}
              label="Hero banner"
              description="Show the rotating spotlight artwork at the top of home"
            />
            <Toggle
              checked={settings.continueWatchingEnabled}
              onChange={settings.setContinueWatchingEnabled}
              label="Continue watching row"
              description="Resume in-progress titles from the top of home"
            />
          </Card>

          <Card
            title="Catalog order"
            description="Choose which catalogs appear on Home, and in what order."
          >
            {allCatalogs.length === 0 ? (
              <p className="text-sm text-text-secondary">
                Install a catalog add-on to control its rows here.
              </p>
            ) : (
              <ol className="space-y-1.5">
                {allCatalogs.map((catalog, index) => {
                  const enabled = !disabledCatalogs.includes(catalog.key);
                  return (
                    <li
                      key={catalog.key}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border border-white/8 bg-black/15 p-2.5",
                        !enabled && "opacity-55",
                      )}
                    >
                      <GripVertical size={15} className="shrink-0 text-text-tertiary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{catalog.name}</p>
                        <p className="truncate text-xs text-text-tertiary">
                          {catalog.addonName} · {catalog.type}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Move ${catalog.name} up`}
                        disabled={index === 0}
                        onClick={() => moveCatalog(catalog.key, -1)}
                        className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-white/10 hover:text-text-primary disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ChevronUp size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${catalog.name} down`}
                        disabled={index === allCatalogs.length - 1}
                        onClick={() => moveCatalog(catalog.key, 1)}
                        className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-white/10 hover:text-text-primary disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ChevronDown size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCatalogEnabled(catalog.key, !enabled)}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                          enabled
                            ? "bg-[rgb(var(--nuvio-accent)/0.16)] text-[rgb(var(--nuvio-accent))]"
                            : "bg-white/8 text-text-tertiary",
                        )}
                      >
                        {enabled ? "On" : "Off"}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          <Card title="Ratings" description="Where IMDb ratings appear.">
            <Select
              label="Show ratings"
              value={settings.imdbRatingsVisibility}
              onChange={(event) =>
                settings.setImdbRatingsVisibility(event.target.value as never)
              }
            >
              <option value="all">Everywhere</option>
              <option value="first">Detail pages only</option>
              <option value="none">Hide ratings</option>
            </Select>
          </Card>
        </div>
      )}

      {section === "playback" && (
        <Card title="Playback" description="Stream selection and player behaviour.">
          <Toggle
            checked={settings.playback.autoSelectBestStream}
            onChange={(value) => settings.updatePlayback({ autoSelectBestStream: value })}
            label="Auto-select best stream"
            description="Skip the source picker and play the highest-quality source"
          />
          <Toggle
            checked={settings.playback.autoPlayNextEpisode}
            onChange={(value) => settings.updatePlayback({ autoPlayNextEpisode: value })}
            label="Auto-play next episode"
            description="Continue to the next episode when one finishes"
          />
          <Toggle
            checked={settings.playback.preferDirectPlay}
            onChange={(value) => settings.updatePlayback({ preferDirectPlay: value })}
            label="Prefer direct play"
            description="Favour sources that start instantly"
          />
          <Toggle
            checked={settings.playback.hideUnreleasedContent}
            onChange={(value) => settings.updatePlayback({ hideUnreleasedContent: value })}
            label="Hide unreleased content"
            description="Skip movies and episodes that haven't aired yet"
          />
          <Toggle
            checked={settings.playback.blurUnwatchedEpisodes}
            onChange={(value) => settings.updatePlayback({ blurUnwatchedEpisodes: value })}
            label="Blur unwatched episodes"
            description="Hide spoilers in episode thumbnails"
          />
          <div className="grid gap-5 pt-2 sm:grid-cols-2">
            <Select
              label="Default subtitle language"
              value={settings.playback.subtitleLanguage}
              onChange={(event) =>
                settings.updatePlayback({ subtitleLanguage: event.target.value })
              }
            >
              {SUBTITLE_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </Select>
            <Select
              label="Preferred audio language"
              value={settings.playback.audioLanguage}
              onChange={(event) =>
                settings.updatePlayback({ audioLanguage: event.target.value })
              }
            >
              <option value="auto">Match the source</option>
              {INDIA_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.native} · {language.label}
                </option>
              ))}
              <option value="en">English</option>
            </Select>
          </div>

          <Toggle
            checked={settings.playback.skipIntroEnabled}
            onChange={(value) => settings.updatePlayback({ skipIntroEnabled: value })}
            label="Skip intro button"
            description="Show a skip button during the opening minutes"
          />
          <div className="grid gap-5 pt-2 sm:grid-cols-2">
            <Slider
              label="Intro length"
              min={30}
              max={180}
              step={15}
              value={settings.playback.skipIntroSeconds}
              onChange={(value) => settings.updatePlayback({ skipIntroSeconds: value })}
              format={(value) => `${value}s`}
            />
            <Slider
              label="Next episode countdown"
              min={0}
              max={20}
              step={1}
              value={settings.playback.autoPlayNextCountdown}
              onChange={(value) => settings.updatePlayback({ autoPlayNextCountdown: value })}
              format={(value) => (value === 0 ? "Instant" : `${value}s`)}
            />
          </div>

          <div className="mt-5 rounded-panel border border-white/8 bg-black/15 p-4">
            <p className="text-sm font-semibold">Subtitle appearance</p>
            <p className="mt-0.5 text-xs text-text-tertiary">
              Applies to sidecar subtitle tracks in the player.
            </p>
            <div className="grid gap-5 pt-3 sm:grid-cols-3">
              <Slider
                label="Text size"
                min={70}
                max={180}
                step={5}
                value={settings.subtitleStyle.size}
                onChange={(value) => settings.setSubtitleStyle({ size: value })}
                format={(value) => `${value}%`}
              />
              <Slider
                label="Background"
                min={0}
                max={100}
                step={5}
                value={settings.subtitleStyle.background}
                onChange={(value) => settings.setSubtitleStyle({ background: value })}
                format={(value) => `${value}%`}
              />
              <label className="block">
                <span className="text-xs font-medium text-text-secondary">Text colour</span>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.subtitleStyle.color}
                    onChange={(event) =>
                      settings.setSubtitleStyle({ color: event.target.value.toUpperCase() })
                    }
                    className="h-9 w-9 cursor-pointer rounded-lg border border-white/15 bg-transparent"
                    aria-label="Subtitle text colour"
                  />
                  <span className="font-mono text-xs text-text-tertiary">
                    {settings.subtitleStyle.color}
                  </span>
                </div>
              </label>
            </div>
          </div>

          <p className="pt-3 text-xs text-text-tertiary">
            Note: torrent and debrid-only sources can't be played by a browser without a resolver.
            They remain available in the Nuvio mobile app.
          </p>
        </Card>
      )}

      {section === "debrid" && (
        <div className="space-y-8">
          <Card
            title="Debrid service"
            description="Resolve torrent and magnet sources to direct links so they play in the browser."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {(["none", "realdebrid", "premiumize"] as const).map((provider) => (
                <button
                  key={provider}
                  onClick={() => debrid.setProvider(provider)}
                  className={cn(
                    "rounded-panel border p-4 text-left transition-all duration-200",
                    debrid.provider === provider
                      ? "border-[rgb(var(--nuvio-accent))] bg-[rgb(var(--nuvio-accent)/0.08)]"
                      : "border-white/10 hover:border-white/25 hover:bg-white/[0.03]",
                  )}
                >
                  <p className="font-medium">{DEBRID_PROVIDER_LABELS[provider]}</p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {provider === "none"
                      ? "Torrent sources stay hidden."
                      : provider === "realdebrid"
                        ? "Popular, fast cached torrents."
                        : "Direct-download torrent resolution."}
                  </p>
                </button>
              ))}
            </div>

            {debrid.provider !== "none" && (
              <div className="mt-5 space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                    {DEBRID_PROVIDER_LABELS[debrid.provider]} API key
                  </span>
                  <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="password"
                      value={debridKey}
                      onChange={(event) => {
                        setDebridKey(event.target.value);
                        debrid.setApiKey(event.target.value);
                      }}
                      placeholder="Paste your API key"
                      className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-[rgb(var(--nuvio-field))] px-4 text-sm outline-none focus:border-[rgb(var(--nuvio-accent))]"
                    />
                    <Button
                      variant="secondary"
                      disabled={!debridKey.trim() || debridTesting}
                      onClick={() => {
                        debrid.setApiKey(debridKey);
                        setDebridTesting(true);
                        setDebridAccount(null);
                        void testDebridConnection(debrid.provider, debridKey.trim())
                          .then((account) => {
                            setDebridAccount(
                              `${account.username}${account.premium ? " · Premium" : ""}`,
                            );
                            pushToast("Debrid key works", "success");
                          })
                          .catch((error: unknown) =>
                            pushToast(
                              error instanceof Error ? error.message : "That key did not work.",
                              "error",
                            ),
                          )
                          .finally(() => setDebridTesting(false));
                      }}
                    >
                      {debridTesting ? "Testing…" : "Save & test"}
                    </Button>
                  </div>
                </label>
                {debridAccount && (
                  <p className="flex items-center gap-1.5 text-xs text-[rgb(var(--nuvio-success))]">
                    <Check size={13} /> {debridAccount}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                  <a
                    href={DEBRID_SIGNUP_URLS[debrid.provider]}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-[rgb(var(--nuvio-accent))] hover:underline"
                  >
                    Get an API key
                  </a>
                  <span>·</span>
                  <span>The key is stored only in this browser.</span>
                </div>
              </div>
            )}

            <div className="pt-2">
              <Toggle
                checked={debrid.autoResolve}
                onChange={debrid.setAutoResolve}
                label="Auto-resolve torrents"
                description="Resolve a torrent automatically when you pick it (otherwise it resolves on tap)."
              />
            </div>
          </Card>

          <Card title="How it works" description="What changes when debrid is connected.">
            <ul className="space-y-2 text-sm text-text-secondary">
              <li className="flex gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-[rgb(var(--nuvio-success))]" />
                Torrent and magnet sources are resolved to a direct HTTPS link before playback.
              </li>
              <li className="flex gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-[rgb(var(--nuvio-success))]" />
                Real-Debrid and Premiumize work directly from the browser — no proxy needed.
              </li>
              <li className="flex gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-[rgb(var(--nuvio-success))]" />
                Debrid stays optional: direct HTTP sources keep working without it.
              </li>
            </ul>
          </Card>
        </div>
      )}

      {section === "profiles" && (
        <Card title="Profiles" description="Each profile keeps its own library and history.">
          <div className="flex flex-wrap items-center gap-3">
            {profiles.map((profile) => (
              <span
                key={profile.id}
                className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-sm"
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: profile.color }}
                >
                  {profile.name.slice(0, 1).toUpperCase()}
                </span>
                {profile.name}
              </span>
            ))}
          </div>
          <Link to="/profiles" className="mt-4 inline-block">
            <Button variant="primary">Manage profiles</Button>
          </Link>
        </Card>
      )}

      {section === "data" && (
        <div className="space-y-8">
          <Card
            title="Media servers"
            description="Play from Jellyfin, Emby or Plex through the community Media Server add-on."
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-xl text-sm text-text-secondary">
                The web build uses the same Stremio add-on bridge as the TV app. Install the Media
                Server add-on to expose your Jellyfin, Emby or Plex catalogs through that protocol.
              </p>
              {mediaServerInstalled ? (
                <span className="flex items-center gap-1.5 rounded-full bg-[rgb(var(--nuvio-success)/0.16)] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--nuvio-success))]">
                  <Check size={13} /> Installed
                </span>
              ) : (
                <Button
                  variant="primary"
                  icon={<Cloud size={16} />}
                  onClick={() => {
                    void installAddons(["https://mediaserver.strem.io"]).then((result) => {
                      pushToast(
                        result.installed.length > 0
                          ? "Media Server add-on installed"
                          : "Couldn’t install the Media Server add-on",
                        result.installed.length > 0 ? "success" : "error",
                      );
                    });
                  }}
                >
                  Install add-on
                </Button>
              )}
            </div>
          </Card>

          <Card title="Backup" description="Export or restore add-ons, library and settings.">
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" icon={<Download size={16} />} onClick={exportData}>
                Export backup
              </Button>
              <Button
                variant="outline"
                icon={<Upload size={16} />}
                onClick={() => fileRef.current?.click()}
              >
                Import backup
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importData(file);
                }}
              />
            </div>
          </Card>

          <Card title="Danger zone" description="Reset this device to a fresh state.">
            <Button
              variant="danger"
              icon={<RotateCcw size={16} />}
              onClick={() => {
                if (window.confirm("Reset all Nuvio data on this browser? This cannot be undone.")) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}
            >
              Reset everything
            </Button>
          </Card>

          <Card title="About">
            <dl className="space-y-3 text-sm">
              <Row label="App" value="Nuvio TV for the web" />
              <Row label="Version" value="1.2.0 (web)" />
              <Row label="Add-ons installed" value={String(addons.length)} />
              <Row label="Protocol" value="Stremio add-on protocol" />
            </dl>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to="/about">
                <Button variant="outline">About & licenses</Button>
              </Link>
            </div>
          </Card>
        </div>
      )}

      <CustomThemeEditor
        open={customEditorOpen}
        initial={settings.themeColors}
        gradient={settings.customGradient}
        gradientLocked={memberTier === null}
        onGradientChange={settings.setCustomGradient}
        onClose={() => setCustomEditorOpen(false)}
        pushToast={pushToast}
        onSave={(colors) => {
          settings.setThemeColors(colors);
          settings.setTheme("custom");
          setCustomEditorOpen(false);
          pushToast("Custom theme updated", "success");
        }}
      />
    </div>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2">
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

const HEX_PATTERN = /^#?[0-9a-fA-F]{6}$/;

function normalizeHex(value: string): string {
  const trimmed = value.trim();
  return (trimmed.startsWith("#") ? trimmed : `#${trimmed}`).toUpperCase();
}

/**
 * Ports `CustomThemeEditor.kt`: pick three colours (or a single solid accent),
 * preview the derived palette, and save it as the active `custom` theme.
 */
function CustomThemeEditor({
  open,
  initial,
  gradient,
  onGradientChange,
  onClose,
  onSave,
  gradientLocked,
  pushToast,
}: {
  open: boolean;
  initial: CustomThemeColors;
  gradient: boolean;
  onGradientChange: (value: boolean) => void;
  onClose: () => void;
  onSave: (colors: CustomThemeColors) => void;
  /** Non-members only get the solid accent — mirrors `resolveCustomThemeColors`. */
  gradientLocked: boolean;
  pushToast: (message: string, tone?: "info" | "success" | "error") => void;
}) {
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  const useGradient = gradient && !gradientLocked;
  const effective = useGradient ? draft : solidColors(draft);
  const palette = customPalette(effective);
  const stops: Array<{ key: keyof CustomThemeColors; label: string }> = useGradient
    ? [
        { key: "first", label: "Colour 1" },
        { key: "second", label: "Colour 2" },
        { key: "third", label: "Colour 3" },
      ]
    : [{ key: "second", label: "Accent colour" }];

  const update = (key: keyof CustomThemeColors, value: string) => {
    setDraft((current) => ({
      ...current,
      [key]: HEX_PATTERN.test(value.trim()) ? normalizeHex(value) : value,
    }));
  };

  const invalid = stops.some(({ key }) => !HEX_PATTERN.test(draft[key]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={useGradient ? "Custom gradient theme" : "Custom solid theme"}
      description="Surfaces are tinted from the middle colour."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={invalid}
            onClick={() => onSave(useGradient ? draft : solidColors(draft))}
          >
            Save theme
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {[true, false].map((value) => (
          <button
            key={String(value)}
            onClick={() => {
              if (value && gradientLocked) {
                pushToast("Gradient themes are a Supporter perk", "info");
                return;
              }
              onGradientChange(value);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm transition-colors",
              gradient === value
                ? "accent-gradient border-transparent text-on-accent"
                : "border-white/15 text-text-secondary hover:border-white/30",
              value && gradientLocked && "opacity-60",
            )}
          >
            {value && gradientLocked && <Lock size={12} />}
            {value ? "Gradient" : "Solid"}
          </button>
        ))}
        <button
          onClick={() => setDraft(CUSTOM_THEME_DEFAULT)}
          className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-text-secondary transition-colors hover:border-white/30 hover:text-text-primary"
        >
          Reset
        </button>
        {gradientLocked && (
          <p className="w-full text-xs text-text-tertiary">
            Gradient custom themes are a Supporter perk. Sign in to unlock them.
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          {stops.map(({ key, label }) => {
            const value = draft[key];
            const valid = HEX_PATTERN.test(value);
            return (
              <div
                key={key}
                className="flex items-center gap-3 rounded-panel border border-white/10 bg-black/20 p-3"
              >
                <input
                  type="color"
                  aria-label={`${label} swatch`}
                  value={valid ? normalizeHex(value) : "#000000"}
                  onChange={(event) => update(key, event.target.value)}
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-white/15 bg-transparent"
                />
                <div className="min-w-0 flex-1">
                  <span className="block text-xs text-text-tertiary">{label}</span>
                  <input
                    value={value}
                    onChange={(event) => update(key, event.target.value)}
                    spellCheck={false}
                    className={cn(
                      "mt-1 w-full rounded-lg border bg-black/30 px-2 py-1 font-mono text-sm uppercase tracking-wide focus:outline-none",
                      valid ? "border-white/15" : "border-[rgb(var(--nuvio-error))]",
                    )}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="flex min-h-[176px] w-full flex-col justify-between gap-4 rounded-2xl p-5 sm:w-56"
          style={{ backgroundColor: palette.bg }}
        >
          <span className="text-xs text-text-secondary">Preview</span>
          <div
            className="rounded-xl p-[2px]"
            style={{
              backgroundImage: `linear-gradient(135deg, ${palette.accentGradient.join(", ")})`,
            }}
          >
            <div
              className="rounded-[10px] px-4 py-5 text-center text-sm font-semibold"
              style={{ backgroundColor: palette.bgElevated, color: "#fff" }}
            >
              Focus ring
            </div>
          </div>
          <div className="flex gap-1.5">
            {(gradient ? palette.accentGradient : [palette.accent]).map((color) => (
              <span
                key={color}
                className="h-5 flex-1 rounded-full"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
