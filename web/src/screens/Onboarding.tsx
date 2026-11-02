import { useState } from "react";
import {
  ArrowRight,
  Check,
  Layers,
  MapPin,
  MonitorPlay,
  Palette,
  Sparkles,
  Tv,
  Zap,
} from "lucide-react";
import type { HomeLayout, StaticTheme } from "@/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { PALETTES, THEME_LABELS } from "@/lib/theme";
import { INDIA_AVAILABLE_LANGUAGES } from "@/lib/india";
import { useSettings } from "@/store/settings";
import { useAddons } from "@/store/addons";
import { useUi } from "@/store/ui";

const STEPS = ["Welcome", "India", "Mode", "Layout", "Theme"] as const;

export function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const settings = useSettings();
  const initDefaults = useAddons((state) => state.initDefaults);
  const pushToast = useUi((state) => state.pushToast);

  const finish = async () => {
    settings.setOnboarded(true);
    pushToast("Setting up your add-ons…", "info");
    await initDefaults();
  };

  const next = () => setStep((value) => Math.min(STEPS.length - 1, value + 1));
  const back = () => setStep((value) => Math.max(0, value - 1));

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute left-1/2 top-0 h-[320px] w-[min(120vw,720px)] -translate-x-1/2 rounded-full bg-[rgb(var(--nuvio-accent)/0.25)] blur-[110px]" />
      </div>

      <div className="relative w-full max-w-2xl">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl accent-gradient text-xl font-black text-on-accent shadow-glow">
            N
          </span>
          <span className="text-2xl font-bold tracking-tight">
            Nuvio<span className="text-[rgb(var(--nuvio-accent))]">TV</span>
          </span>
        </div>

        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((label, index) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "h-1.5 w-10 rounded-full transition-colors",
                  index <= step ? "bg-[rgb(var(--nuvio-accent))]" : "bg-white/15",
                )}
              />
            </div>
          ))}
        </div>

        <div className="glass rounded-panel-lg p-5 shadow-lift sm:p-10">
          {step === 0 && (
            <div className="animate-fade-in text-center">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-[rgb(var(--nuvio-accent))]">
                Namaste 🙏
              </p>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                India&apos;s stories, on every screen
              </h1>
              <p className="mx-auto mt-4 max-w-md text-text-secondary">
                Nuvio brings Bollywood, regional cinema, Hindi web series and live TV together —
                with your own add-ons on top. Pick a language, and the whole app follows.
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {[
                  { icon: MapPin, title: "Made for India", text: "8 languages, 160+ titles" },
                  { icon: Layers, title: "Bring your own", text: "Any Stremio-compatible add-on" },
                  { icon: MonitorPlay, title: "Play instantly", text: "HLS and MP4 in the browser" },
                ].map(({ icon: Icon, title, text }) => (
                  <div key={title} className="rounded-panel bg-white/5 p-4 text-left">
                    <Icon size={20} className="mb-2 text-[rgb(var(--nuvio-accent))]" />
                    <p className="font-medium">{title}</p>
                    <p className="mt-0.5 text-xs text-text-tertiary">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="animate-fade-in">
              <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <MapPin size={22} className="text-[rgb(var(--nuvio-accent))]" />
                Choose your India
              </h2>
              <p className="mt-2 text-sm text-text-secondary">
                We&apos;ll curate the home screen around the languages you watch.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  onClick={() => settings.setIndiaLanguage("all")}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                    settings.indiaLanguage === "all"
                      ? "accent-gradient border-transparent text-on-accent"
                      : "border-white/10 bg-white/5 text-text-secondary hover:border-white/25",
                  )}
                >
                  All India
                </button>
                {INDIA_AVAILABLE_LANGUAGES.map((language) => (
                  <button
                    key={language.id}
                    onClick={() => settings.setIndiaLanguage(language.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                      settings.indiaLanguage === language.id
                        ? "accent-gradient border-transparent text-on-accent"
                        : "border-white/10 bg-white/5 text-text-secondary hover:border-white/25",
                    )}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: language.color }}
                    />
                    {language.native}
                    <span className="text-xs opacity-70">{language.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => {
                    settings.setContentRegion("IN");
                    settings.setIndiaLanding(true);
                  }}
                  className={cn(
                    "rounded-panel border p-4 text-left transition-all",
                    settings.contentRegion === "IN"
                      ? "border-[rgb(var(--nuvio-accent))] bg-[rgb(var(--nuvio-accent)/0.08)]"
                      : "border-white/10 hover:border-white/25",
                  )}
                >
                  <p className="font-semibold">🇮🇳 India first</p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    Trending, Bollywood, South cinema and JioTV on top.
                  </p>
                </button>
                <button
                  onClick={() => settings.setContentRegion("GLOBAL")}
                  className={cn(
                    "rounded-panel border p-4 text-left transition-all",
                    settings.contentRegion === "GLOBAL"
                      ? "border-[rgb(var(--nuvio-accent))] bg-[rgb(var(--nuvio-accent)/0.08)]"
                      : "border-white/10 hover:border-white/25",
                  )}
                >
                  <p className="font-semibold">🌍 Global first</p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    Start with every catalog from your add-ons.
                  </p>
                </button>
              </div>
              <p className="mt-4 flex items-center gap-2 text-xs text-text-tertiary">
                <Tv size={13} /> JioTV Live is built in — 900+ Indian channels.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-in">
              <h2 className="text-2xl font-bold tracking-tight">Choose your experience</h2>
              <p className="mt-2 text-sm text-text-secondary">
                You can change this later in Settings.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {(
                  [
                    {
                      id: "essential",
                      title: "Essential",
                      icon: Zap,
                      text: "Just the basics — a handful of catalog rows and a clean player.",
                    },
                    {
                      id: "full",
                      title: "Full",
                      icon: Sparkles,
                      text: "Everything: every catalog, collections, profiles and deep settings.",
                    },
                  ] as const
                ).map(({ id, title, icon: Icon, text }) => (
                  <button
                    key={id}
                    onClick={() => settings.setExperienceMode(id)}
                    className={cn(
                      "rounded-panel border p-5 text-left transition-all",
                      settings.experienceMode === id
                        ? "border-[rgb(var(--nuvio-accent))] bg-[rgb(var(--nuvio-accent)/0.08)]"
                        : "border-white/10 hover:border-white/25",
                    )}
                  >
                    <Icon size={22} className="mb-3 text-[rgb(var(--nuvio-accent))]" />
                    <p className="font-semibold">{title}</p>
                    <p className="mt-1 text-sm text-text-secondary">{text}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-fade-in">
              <h2 className="text-2xl font-bold tracking-tight">Pick a home layout</h2>
              <p className="mt-2 text-sm text-text-secondary">How should your catalogs look?</p>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {(
                  [
                    { id: "modern", title: "Modern", text: "Hero banner + rows" },
                    { id: "classic", title: "Classic", text: "Dense poster rows" },
                    { id: "grid", title: "Grid", text: "Grouped poster grids" },
                  ] as const
                ).map(({ id, title, text }) => (
                  <button
                    key={id}
                    onClick={() => settings.setHomeLayout(id as HomeLayout)}
                    className={cn(
                      "rounded-panel border p-4 text-left transition-all",
                      settings.homeLayout === id
                        ? "border-[rgb(var(--nuvio-accent))] bg-[rgb(var(--nuvio-accent)/0.08)]"
                        : "border-white/10 hover:border-white/25",
                    )}
                  >
                    <div className="mb-3 h-16 w-full rounded-lg bg-gradient-to-br from-white/10 to-white/[0.03] p-2">
                      <div className="mb-1 h-2 w-2/3 rounded bg-white/25" />
                      <div className="flex gap-1">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <div key={index} className="h-8 flex-1 rounded bg-white/15" />
                        ))}
                      </div>
                    </div>
                    <p className="font-medium">{title}</p>
                    <p className="text-xs text-text-tertiary">{text}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="animate-fade-in">
              <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <Palette size={22} className="text-[rgb(var(--nuvio-accent))]" />
                Choose a theme
              </h2>
              <p className="mt-2 text-sm text-text-secondary">Accent colours and surface tones.</p>
              <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {(Object.keys(PALETTES) as StaticTheme[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => settings.setTheme(key)}
                    className={cn(
                      "relative overflow-hidden rounded-panel border p-2 text-left transition-all",
                      settings.theme === key
                        ? "border-[rgb(var(--nuvio-accent))]"
                        : "border-white/10 hover:border-white/25",
                    )}
                  >
                    <div
                      className="mb-2 h-10 w-full rounded-lg"
                      style={{
                        backgroundImage: `linear-gradient(135deg, ${PALETTES[key].accentGradient.join(", ")})`,
                      }}
                    />
                    <span className="text-xs font-medium">{THEME_LABELS[key]}</span>
                    {settings.theme === key && (
                      <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full accent-gradient text-on-accent">
                        <Check size={10} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={back} disabled={step === 0}>
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                variant="primary"
                iconRight={<ArrowRight size={16} />}
                onClick={next}
              >
                Continue
              </Button>
            ) : (
              <Button variant="primary" icon={<Check size={16} />} onClick={finish}>
                Get started
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
