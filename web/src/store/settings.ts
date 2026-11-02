import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CUSTOM_THEME_DEFAULT } from "@/lib/theme";
import type { AppFont, AppTheme, CustomThemeColors, ExperienceMode, HomeLayout } from "@/types";

export type DetailVisibility = "all" | "first" | "none";
export type ContentRegion = "IN" | "GLOBAL";
export type CardShape = "poster" | "landscape" | "square";
export type DetailLayout = "cinematic" | "compact";
export type StreamLayout = "list" | "grid";
export type ContinueWatchingStyle = "rail" | "grid";
export type PlayerAspect = "contain" | "cover" | "fill";
export type HeroSource = "india" | "addons";

export interface SubtitleStyle {
  /** Percentage of the browser default cue size. */
  size: number;
  /** Opacity of the cue background, 0–100. */
  background: number;
  color: string;
}

export interface BufferingPreference {
  /** Preselect the highest quality stream automatically. */
  autoSelectBestStream: boolean;
  /** Auto-play the next episode when one finishes. */
  autoPlayNextEpisode: boolean;
  /** Skip the stream picker when a single high-confidence stream is found. */
  preferDirectPlay: boolean;
  /** Default subtitle language code (ISO 639-1) or `off`. */
  subtitleLanguage: string;
  /** Default audio language code, or `auto` to follow the source. */
  audioLanguage: string;
  /** Default audio description preference. */
  preferOriginalAudio: boolean;
  /** Show release-date info under titles. */
  showFullReleaseDate: boolean;
  /** Hide unreleased episodes and movies from lists. */
  hideUnreleasedContent: boolean;
  /** Blur thumbnails of unwatched episodes. */
  blurUnwatchedEpisodes: boolean;
  /** Show the skip-intro affordance during the opening minutes. */
  skipIntroEnabled: boolean;
  /** How long the opening is, in seconds. */
  skipIntroSeconds: number;
  /** Seconds to wait before auto-playing the next episode (0 = immediately). */
  autoPlayNextCountdown: number;
}

interface SettingsState {
  onboarded: boolean;
  experienceMode: ExperienceMode;
  homeLayout: HomeLayout;

  /* ---------------------------- India-first ---------------------------- */
  contentRegion: ContentRegion;
  /** `all` or one of the India language ids (Hindi, Tamil, …). */
  indiaLanguage: string;
  /** Show the curated Indian rails on the home screen. */
  indiaLanding: boolean;
  /** Which catalog powers the hero carousel. */
  heroSource: HeroSource;

  /* ------------------------------ theme -------------------------------- */
  theme: AppTheme;
  /** Three-stop colours for the `custom` theme. */
  themeColors: CustomThemeColors;
  /** Whether the `custom` theme renders as a gradient (vs. solid middle colour). */
  customGradient: boolean;
  amoled: boolean;
  font: AppFont;
  fontScale: number;
  reduceMotion: boolean;
  posterLabelsEnabled: boolean;
  imdbRatingsVisibility: DetailVisibility;

  /* ------------------------------ layout ------------------------------- */
  continueWatchingEnabled: boolean;
  continueWatchingStyle: ContinueWatchingStyle;
  /** Show the rotating hero banner on the home screen. */
  heroEnabled: boolean;
  playback: BufferingPreference;
  cardWidth: number;
  cardShape: CardShape;
  detailLayout: DetailLayout;
  streamLayout: StreamLayout;

  /* ------------------------------ player ------------------------------- */
  playerAspect: PlayerAspect;
  showPlayerStats: boolean;
  subtitleStyle: SubtitleStyle;

  /* ------------------------------ ambient ------------------------------ */
  ambientEnabled: boolean;

  setOnboarded: (value: boolean) => void;
  setExperienceMode: (mode: ExperienceMode) => void;
  setHomeLayout: (layout: HomeLayout) => void;
  setContentRegion: (region: ContentRegion) => void;
  setIndiaLanguage: (language: string) => void;
  setIndiaLanding: (value: boolean) => void;
  setHeroSource: (source: HeroSource) => void;
  setTheme: (theme: AppTheme) => void;
  setThemeColors: (colors: CustomThemeColors) => void;
  setCustomGradient: (value: boolean) => void;
  setAmoled: (value: boolean) => void;
  setFont: (font: AppFont) => void;
  setFontScale: (value: number) => void;
  setReduceMotion: (value: boolean) => void;
  setPosterLabelsEnabled: (value: boolean) => void;
  setImdbRatingsVisibility: (value: DetailVisibility) => void;
  setContinueWatchingEnabled: (value: boolean) => void;
  setContinueWatchingStyle: (value: ContinueWatchingStyle) => void;
  setHeroEnabled: (value: boolean) => void;
  setCardWidth: (value: number) => void;
  setCardShape: (value: CardShape) => void;
  setDetailLayout: (value: DetailLayout) => void;
  setStreamLayout: (value: StreamLayout) => void;
  setPlayerAspect: (value: PlayerAspect) => void;
  setShowPlayerStats: (value: boolean) => void;
  setSubtitleStyle: (patch: Partial<SubtitleStyle>) => void;
  setAmbientEnabled: (value: boolean) => void;
  updatePlayback: (patch: Partial<BufferingPreference>) => void;
  reset: () => void;
}

export const DEFAULT_PLAYBACK: BufferingPreference = {
  autoSelectBestStream: false,
  autoPlayNextEpisode: true,
  preferDirectPlay: false,
  subtitleLanguage: "off",
  audioLanguage: "auto",
  preferOriginalAudio: false,
  showFullReleaseDate: true,
  hideUnreleasedContent: true,
  blurUnwatchedEpisodes: false,
  skipIntroEnabled: true,
  skipIntroSeconds: 90,
  autoPlayNextCountdown: 8,
};

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  size: 100,
  background: 60,
  color: "#FFFFFF",
};

const initialState = {
  onboarded: false,
  experienceMode: "full" as ExperienceMode,
  homeLayout: "modern" as HomeLayout,

  contentRegion: "IN" as ContentRegion,
  indiaLanguage: "all",
  indiaLanding: true,
  heroSource: "india" as HeroSource,

  theme: "violet" as AppTheme,
  themeColors: CUSTOM_THEME_DEFAULT,
  customGradient: true,
  amoled: false,
  font: "inter" as AppFont,
  fontScale: 1,
  reduceMotion: false,
  posterLabelsEnabled: true,
  imdbRatingsVisibility: "all" as DetailVisibility,

  continueWatchingEnabled: true,
  continueWatchingStyle: "rail" as ContinueWatchingStyle,
  heroEnabled: true,
  playback: DEFAULT_PLAYBACK,
  cardWidth: 150,
  cardShape: "poster" as CardShape,
  detailLayout: "cinematic" as DetailLayout,
  streamLayout: "list" as StreamLayout,

  playerAspect: "contain" as PlayerAspect,
  showPlayerStats: false,
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,

  ambientEnabled: false,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialState,
      setOnboarded: (value) => set({ onboarded: value }),
      setExperienceMode: (mode) => set({ experienceMode: mode }),
      setHomeLayout: (layout) => set({ homeLayout: layout }),
      setContentRegion: (contentRegion) => set({ contentRegion }),
      setIndiaLanguage: (indiaLanguage) => set({ indiaLanguage }),
      setIndiaLanding: (indiaLanding) => set({ indiaLanding }),
      setHeroSource: (heroSource) => set({ heroSource }),
      setTheme: (theme) => set({ theme }),
      setThemeColors: (themeColors) => set({ themeColors }),
      setCustomGradient: (customGradient) => set({ customGradient }),
      setAmoled: (value) => set({ amoled: value }),
      setFont: (font) => set({ font }),
      setFontScale: (value) => set({ fontScale: Math.min(1.4, Math.max(0.85, value)) }),
      setReduceMotion: (value) => set({ reduceMotion: value }),
      setPosterLabelsEnabled: (value) => set({ posterLabelsEnabled: value }),
      setImdbRatingsVisibility: (value) => set({ imdbRatingsVisibility: value }),
      setContinueWatchingEnabled: (value) => set({ continueWatchingEnabled: value }),
      setContinueWatchingStyle: (value) => set({ continueWatchingStyle: value }),
      setHeroEnabled: (value) => set({ heroEnabled: value }),
      setCardWidth: (value) => set({ cardWidth: Math.min(240, Math.max(110, value)) }),
      setCardShape: (cardShape) => set({ cardShape }),
      setDetailLayout: (detailLayout) => set({ detailLayout }),
      setStreamLayout: (streamLayout) => set({ streamLayout }),
      setPlayerAspect: (playerAspect) => set({ playerAspect }),
      setShowPlayerStats: (showPlayerStats) => set({ showPlayerStats }),
      setSubtitleStyle: (patch) =>
        set((state) => ({
          subtitleStyle: {
            ...state.subtitleStyle,
            ...patch,
            size: Math.min(180, Math.max(70, patch.size ?? state.subtitleStyle.size)),
            background: Math.min(100, Math.max(0, patch.background ?? state.subtitleStyle.background)),
          },
        })),
      setAmbientEnabled: (ambientEnabled) => set({ ambientEnabled }),
      updatePlayback: (patch) => set((state) => ({ playback: { ...state.playback, ...patch } })),
      reset: () => set({ ...initialState }),
    }),
    {
      name: "nuvio.settings.v1",
      version: 2,
      migrate: (persisted) => persisted as SettingsState,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...saved,
          playback: { ...DEFAULT_PLAYBACK, ...(saved.playback ?? {}) },
          subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE, ...(saved.subtitleStyle ?? {}) },
        };
      },
    },
  ),
);
