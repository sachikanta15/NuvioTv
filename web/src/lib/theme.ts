import type { AppFont, AppTheme, CustomThemeColors, StaticTheme } from "@/types";

/** A palette mirrors `ThemeColorPalette` in the Compose theme. */
export interface Palette {
  accent: string;
  accentVariant: string;
  accentGradient: string[];
  focusRing: string;
  focusBackground: string;
  bg: string;
  bgElevated: string;
  card: string;
  surface: string;
  surfaceVariant: string;
  panel: string;
  field: string;
  menu: string;
  modal: string;
}

/** Default custom-theme colours, mirrored from `CustomThemeColors.Default`. */
export const CUSTOM_THEME_DEFAULT: CustomThemeColors = {
  first: "#B75AFF",
  second: "#EC70A9",
  third: "#FFB37A",
};

/** Themes whose accent is light enough to need dark foreground text. */
const DARK_ON_ACCENT: ReadonlySet<string> = new Set([
  "saffron",
  "gold",
  "jade",
  "rose-gold",
  "graphite",
  "white",
]);

function channels(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function byte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase();
}

/** Linear sRGB blend, the web equivalent of Compose's `Color.lerp`. */
export function lerpHex(base: string, accent: string, t: number): string {
  const [br, bg, bb] = channels(base);
  const [ar, ag, ab] = channels(accent);
  return rgbToHex(br + (ar - br) * t, bg + (ag - bg) * t, bb + (ab - bb) * t);
}

/** Relative luminance of an sRGB colour, matching `Color.luminance()`. */
export function hexLuminance(hex: string): number {
  const gamma = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(hex);
  return 0.2126 * gamma(r) + 0.7152 * gamma(g) + 0.0722 * gamma(b);
}

/** Black or white text for an accent, matching `foreground()` in `CustomThemePalette.kt`. */
export function foregroundFor(hex: string): string {
  return hexLuminance(hex) > 0.179 ? "#000000" : "#FFFFFF";
}

/** Converts `#RRGGBB` (or `#RGB`) to the `"r g b"` form used by CSS variables. */
export function hexToRgb(hex: string): string {
  const [r, g, b] = channels(hex);
  return `${r} ${g} ${b}`;
}

export const PALETTES: Record<StaticTheme, Palette> = {
  violet: {
    accent: "#8E24AA",
    accentVariant: "#6A1B9A",
    accentGradient: ["#AB47BC", "#8E24AA", "#6A1B9A"],
    focusRing: "#AB47BC",
    focusBackground: "#2D1A3D",
    bg: "#0D0D0F",
    bgElevated: "#1A1A1E",
    card: "#1F1A24",
    surface: "#1E1E1E",
    surfaceVariant: "#2D2D2D",
    panel: "#1A1A1A",
    field: "#222222",
    menu: "#1E1E1E",
    modal: "#1A1A1A",
  },
  ocean: {
    accent: "#1E88E5",
    accentVariant: "#1565C0",
    accentGradient: ["#42A5F5", "#1E88E5", "#1565C0"],
    focusRing: "#42A5F5",
    focusBackground: "#1A2D3D",
    bg: "#0D0D0F",
    bgElevated: "#1A1A1E",
    card: "#1A1F24",
    surface: "#1E1E1E",
    surfaceVariant: "#2D2D2D",
    panel: "#1A1A1A",
    field: "#222222",
    menu: "#1E1E1E",
    modal: "#1A1A1A",
  },
  crimson: {
    accent: "#E53935",
    accentVariant: "#C62828",
    accentGradient: ["#FF5252", "#E53935", "#C62828"],
    focusRing: "#FF5252",
    focusBackground: "#3D1A1A",
    bg: "#0D0D0D",
    bgElevated: "#1A1A1A",
    card: "#241A1A",
    surface: "#1E1E1E",
    surfaceVariant: "#2D2D2D",
    panel: "#1A1A1A",
    field: "#222222",
    menu: "#1E1E1E",
    modal: "#1A1A1A",
  },
  emerald: {
    accent: "#43A047",
    accentVariant: "#2E7D32",
    accentGradient: ["#66BB6A", "#43A047", "#2E7D32"],
    focusRing: "#66BB6A",
    focusBackground: "#1A3D1E",
    bg: "#0D0D0D",
    bgElevated: "#1A1A1A",
    card: "#1A241A",
    surface: "#1E1E1E",
    surfaceVariant: "#2D2D2D",
    panel: "#1A1A1A",
    field: "#222222",
    menu: "#1E1E1E",
    modal: "#1A1A1A",
  },
  amber: {
    accent: "#FB8C00",
    accentVariant: "#EF6C00",
    accentGradient: ["#FFA726", "#FB8C00", "#EF6C00"],
    focusRing: "#FFA726",
    focusBackground: "#3D2D1A",
    bg: "#0F0D0D",
    bgElevated: "#1E1A1A",
    card: "#24201A",
    surface: "#1E1E1E",
    surfaceVariant: "#2D2D2D",
    panel: "#1A1A1A",
    field: "#222222",
    menu: "#1E1E1E",
    modal: "#1A1A1A",
  },
  rose: {
    accent: "#D81B60",
    accentVariant: "#C2185B",
    accentGradient: ["#EC407A", "#D81B60", "#C2185B"],
    focusRing: "#EC407A",
    focusBackground: "#3D1A2D",
    bg: "#0D0D0D",
    bgElevated: "#1A1A1A",
    card: "#241A1F",
    surface: "#1E1E1E",
    surfaceVariant: "#2D2D2D",
    panel: "#1A1A1A",
    field: "#222222",
    menu: "#1E1E1E",
    modal: "#1A1A1A",
  },
  saffron: {
    accent: "#FF8F1F",
    accentVariant: "#0E7A3C",
    accentGradient: ["#FFB347", "#FF8F1F", "#0E7A3C"],
    focusRing: "#FFC66D",
    focusBackground: "#3D2A14",
    bg: "#0F0C08",
    bgElevated: "#1E1812",
    card: "#261D14",
    surface: "#211A14",
    surfaceVariant: "#30251A",
    panel: "#1E1812",
    field: "#2A2118",
    menu: "#211A14",
    modal: "#1E1812",
  },
  gold: {
    accent: "#E8A91C",
    accentVariant: "#9A6200",
    accentGradient: ["#8A5700", "#E8A91C", "#FFF1A8", "#FFD45C", "#9A6200"],
    focusRing: "#FFD45C",
    focusBackground: "#3D2D1A",
    bg: "#0F0E0B",
    bgElevated: "#1D1A14",
    card: "#262116",
    surface: "#211D16",
    surfaceVariant: "#302A1D",
    panel: "#1D1A14",
    field: "#292318",
    menu: "#211D16",
    modal: "#1D1A14",
  },
  jade: {
    accent: "#22D37C",
    accentVariant: "#0BBF9A",
    accentGradient: ["#7BF08D", "#22D37C", "#0BBF9A"],
    focusRing: "#7BF08D",
    focusBackground: "#153A2C",
    bg: "#0B0F0D",
    bgElevated: "#141D18",
    card: "#16251D",
    surface: "#17221C",
    surfaceVariant: "#203128",
    panel: "#141D18",
    field: "#1B2A22",
    menu: "#17221C",
    modal: "#141D18",
  },
  "rose-gold": {
    accent: "#EC70A9",
    accentVariant: "#B75AFF",
    accentGradient: ["#B75AFF", "#EC70A9", "#FFB37A"],
    focusRing: "#FFB37A",
    focusBackground: "#442037",
    bg: "#100C0F",
    bgElevated: "#1F161D",
    card: "#281A24",
    surface: "#241921",
    surfaceVariant: "#34242F",
    panel: "#1F161D",
    field: "#2C1E28",
    menu: "#241921",
    modal: "#1F161D",
  },
  "arctic-blue": {
    accent: "#3185F5",
    accentVariant: "#4D55E8",
    accentGradient: ["#4DE3FF", "#3185F5", "#4D55E8"],
    focusRing: "#4DE3FF",
    focusBackground: "#172844",
    bg: "#0B0E14",
    bgElevated: "#141A24",
    card: "#161E2A",
    surface: "#171F2C",
    surfaceVariant: "#202B3B",
    panel: "#141A24",
    field: "#1B2533",
    menu: "#171F2C",
    modal: "#141A24",
  },
  graphite: {
    accent: "#AAB2BE",
    accentVariant: "#687381",
    accentGradient: ["#F3F5F7", "#AAB2BE", "#687381"],
    focusRing: "#F3F5F7",
    focusBackground: "#30343A",
    bg: "#0C0D0F",
    bgElevated: "#17191D",
    card: "#20242A",
    surface: "#1C1F23",
    surfaceVariant: "#292E35",
    panel: "#17191D",
    field: "#24282E",
    menu: "#1C1F23",
    modal: "#17191D",
  },
  white: {
    accent: "#F5F5F5",
    accentVariant: "#E0E0E0",
    accentGradient: ["#FFFFFF", "#F5F5F5", "#E0E0E0"],
    focusRing: "#FFFFFF",
    focusBackground: "#303030",
    bg: "#0D0D0D",
    bgElevated: "#1A1A1A",
    card: "#222222",
    surface: "#1E1E1E",
    surfaceVariant: "#2D2D2D",
    panel: "#1A1A1A",
    field: "#222222",
    menu: "#1E1E1E",
    modal: "#1A1A1A",
  },
};

export const THEME_LABELS: Record<AppTheme, string> = {
  violet: "Violet",
  ocean: "Ocean",
  crimson: "Crimson",
  emerald: "Emerald",
  amber: "Amber",
  rose: "Rose",
  saffron: "Saffron (India)",
  gold: "Gold",
  jade: "Jade",
  "rose-gold": "Rose Gold",
  "arctic-blue": "Arctic Blue",
  graphite: "Graphite",
  white: "White",
  custom: "Custom",
};

/** Themes that require a Nuvio supporter badge on Android. */
export const SUPPORTER_THEMES: AppTheme[] = ["gold", "jade", "rose-gold", "arctic-blue", "graphite"];

/** Collapses a gradient to its middle colour, matching `CustomThemeColors.solid()`. */
export function solidColors(colors: CustomThemeColors): CustomThemeColors {
  return { first: colors.second, second: colors.second, third: colors.second };
}

/**
 * Derives a full palette from three custom colours, mirroring
 * `CustomThemeColors.toColorPalette()` in `CustomThemePalette.kt`.
 */
export function customPalette(colors: CustomThemeColors): Palette {
  const gradient = [colors.first, colors.second, colors.third];
  const accent = gradient[1];
  const isSolid = colors.first === colors.second && colors.second === colors.third;
  const surface = (base: string, tint: number) => lerpHex(base, accent, tint);

  return {
    accent,
    accentVariant: gradient[2],
    accentGradient: isSolid ? [accent] : gradient,
    focusRing: gradient.reduce((best, next) =>
      hexLuminance(next) > hexLuminance(best) ? next : best,
    ),
    focusBackground: surface("#242424", 0.18),
    bg: surface("#0C0D0F", 0.025),
    bgElevated: surface("#17191D", 0.045),
    card: surface("#20242A", 0.06),
    surface: surface("#1C1F23", 0.05),
    surfaceVariant: surface("#292E35", 0.06),
    panel: surface("#17191D", 0.045),
    field: surface("#24282E", 0.055),
    menu: surface("#1C1F23", 0.05),
    modal: surface("#17191D", 0.045),
  };
}

/** Resolves the palette for any theme, including the derived `custom` one. */
export function resolvePalette(
  theme: AppTheme,
  customColors: CustomThemeColors = CUSTOM_THEME_DEFAULT,
  customGradient = true,
): Palette {
  if (theme === "custom") {
    return customPalette(customGradient ? customColors : solidColors(customColors));
  }
  return PALETTES[theme as StaticTheme] ?? PALETTES.violet;
}

/** Foreground colour that stays legible on top of the accent. */
export function onAccentFor(theme: AppTheme, palette: Palette): string {
  if (theme === "custom") return foregroundFor(palette.accent);
  return DARK_ON_ACCENT.has(theme) ? "#111111" : "#FFFFFF";
}

export const FONT_STACKS: Record<AppFont, string> = {
  inter: "'Inter', system-ui, sans-serif",
  "dm-sans": "'DM Sans', 'Inter', system-ui, sans-serif",
  "open-sans": "'Open Sans', 'Inter', system-ui, sans-serif",
};

export const FONT_LABELS: Record<AppFont, string> = {
  inter: "Inter",
  "dm-sans": "DM Sans",
  "open-sans": "Open Sans",
};

/**
 * Writes the palette to CSS custom properties on `<html>`.
 * `amoled` collapses surfaces to pure black, matching the Android AMOLED mode.
 */
export function applyPalette(
  theme: AppTheme,
  options: {
    amoled?: boolean;
    font?: AppFont;
    fontScale?: number;
    reduceMotion?: boolean;
    customColors?: CustomThemeColors;
    customGradient?: boolean;
  } = {},
): void {
  const {
    amoled = false,
    font = "inter",
    fontScale = 1,
    reduceMotion = false,
    customColors = CUSTOM_THEME_DEFAULT,
    customGradient = true,
  } = options;
  const palette = resolvePalette(theme, customColors, customGradient);
  const root = document.documentElement;

  const surfaceValue = (value: string) => (amoled ? "#000000" : value);

  root.style.setProperty("--nuvio-accent", hexToRgb(palette.accent));
  root.style.setProperty("--nuvio-accent-variant", hexToRgb(palette.accentVariant));
  root.style.setProperty("--nuvio-accent-grad", palette.accentGradient.join(", "));
  root.style.setProperty("--nuvio-on-accent", hexToRgb(onAccentFor(theme, palette)));
  root.style.setProperty("--nuvio-focus-ring", hexToRgb(palette.focusRing));
  root.style.setProperty("--nuvio-focus-bg", hexToRgb(palette.focusBackground));
  root.style.setProperty("--nuvio-bg", hexToRgb(amoled ? "#000000" : palette.bg));
  root.style.setProperty("--nuvio-bg-elevated", hexToRgb(surfaceValue(palette.bgElevated)));
  root.style.setProperty("--nuvio-card", hexToRgb(surfaceValue(palette.card)));
  root.style.setProperty("--nuvio-surface", hexToRgb(surfaceValue(palette.surface)));
  root.style.setProperty("--nuvio-surface-variant", hexToRgb(surfaceValue(palette.surfaceVariant)));
  root.style.setProperty("--nuvio-panel", hexToRgb(surfaceValue(palette.panel)));
  root.style.setProperty("--nuvio-field", hexToRgb(surfaceValue(palette.field)));
  root.style.setProperty("--nuvio-menu", hexToRgb(surfaceValue(palette.menu)));
  root.style.setProperty("--nuvio-modal", hexToRgb(surfaceValue(palette.modal)));

  const divider = amoled ? "38 38 38" : "255 255 255";
  root.style.setProperty("--nuvio-divider", divider);
  root.style.setProperty("--nuvio-text-primary", "255 255 255");
  root.style.setProperty("--nuvio-text-secondary", "179 179 179");
  root.style.setProperty("--nuvio-text-tertiary", "128 128 128");
  root.style.setProperty("--nuvio-rating", hexToRgb("#FFD700"));
  root.style.setProperty("--nuvio-error", hexToRgb("#CF6679"));
  root.style.setProperty("--nuvio-warning", hexToRgb("#FFB74D"));
  root.style.setProperty("--nuvio-success", hexToRgb("#4CAF50"));
  root.style.setProperty("--nuvio-info", hexToRgb("#29B6F6"));

  const accentSoft = amoled ? "18 18 18" : palette.surfaceVariant;
  root.style.setProperty("--nuvio-accent-soft", hexToRgb(accentSoft));

  root.style.setProperty("--nuvio-font", FONT_STACKS[font] ?? FONT_STACKS.inter);
  root.style.setProperty("--nuvio-font-scale", String(fontScale));
  root.style.setProperty("--nuvio-ease", reduceMotion ? "linear" : "cubic-bezier(0.2, 0, 0, 1)");
  // Ambient bloom is strongest for saturated, dark-friendly themes.
  const glow = amoled ? 0.35 : DARK_ON_ACCENT.has(theme) ? 0.4 : 0.6;
  root.style.setProperty("--nuvio-glow", String(glow));
  root.dataset.theme = theme;
}
