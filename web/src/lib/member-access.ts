/**
 * Supporter membership rules, ported from the Android app so both clients
 * gate the same things the same way:
 *
 *   `CosmeticEntitlements.kt` — the entitlement list
 *   `ThemeAccess.kt`         — which themes need which entitlement
 *   `MemberAccess.kt`        — the tier enum
 *
 * The wire format is the enum *name* as a string, because that is what the
 * `get_my_member_access` RPC returns.
 */
import type { AppTheme, CustomThemeColors } from "@/types";

export type MemberTier = "SUPPORTER" | "SUPPORTER_PLUS";

export type CosmeticEntitlement =
  | "GOLD_THEME"
  | "JADE_THEME"
  | "ROSE_GOLD_THEME"
  | "ARCTIC_BLUE_THEME"
  | "GRAPHITE_THEME"
  | "PROFILE_BACKGROUNDS"
  | "PROFILE_AVATARS";

export interface MemberAccess {
  /** `null` means "not a member". */
  tier: MemberTier | null;
  entitlements: CosmeticEntitlement[];
}

export const NO_MEMBER_ACCESS: MemberAccess = { tier: null, entitlements: [] };

/** Every entitlement, used for the "what do I get" preview. */
export const ALL_ENTITLEMENTS: CosmeticEntitlement[] = [
  "GOLD_THEME",
  "JADE_THEME",
  "ROSE_GOLD_THEME",
  "ARCTIC_BLUE_THEME",
  "GRAPHITE_THEME",
  "PROFILE_BACKGROUNDS",
  "PROFILE_AVATARS",
];

/** Themes that need a supporter tier, mirroring `ThemeAccess.kt`. */
export const SUPPORTER_THEME_ENTITLEMENTS: Partial<
  Record<AppTheme, CosmeticEntitlement>
> = {
  gold: "GOLD_THEME",
  jade: "JADE_THEME",
  "rose-gold": "ROSE_GOLD_THEME",
  "arctic-blue": "ARCTIC_BLUE_THEME",
  graphite: "GRAPHITE_THEME",
};

/** Themes that are always available, mirroring `ThemeAccess.kt`. */
export const STANDARD_THEMES: AppTheme[] = [
  "white",
  "violet",
  "ocean",
  "crimson",
  "emerald",
  "amber",
  "rose",
];

export function hasEntitlement(
  entitlements: CosmeticEntitlement[],
  entitlement: CosmeticEntitlement,
): boolean {
  return entitlements.includes(entitlement);
}

/** True when the theme can be selected with the given entitlements. */
export function isThemeUnlocked(
  theme: AppTheme,
  entitlements: CosmeticEntitlement[],
): boolean {
  const required = SUPPORTER_THEME_ENTITLEMENTS[theme];
  return !required || hasEntitlement(entitlements, required);
}

/** The entitlement a theme needs, if any. */
export function themeRequirement(theme: AppTheme): CosmeticEntitlement | undefined {
  return SUPPORTER_THEME_ENTITLEMENTS[theme];
}

/** Themes the user may pick, unlocked ones first — mirrors `availableAppThemes`. */
export function availableAppThemes(entitlements: CosmeticEntitlement[]): AppTheme[] {
  const unlockedSupporters = Object.entries(SUPPORTER_THEME_ENTITLEMENTS)
    .filter(([, entitlement]) => hasEntitlement(entitlements, entitlement))
    .map(([theme]) => theme as AppTheme);
  return [...unlockedSupporters, "custom", ...STANDARD_THEMES];
}

/**
 * Falls back to a free theme when the selected one is not unlocked —
 * mirrors `resolveAppTheme`.
 */
export function resolveAppTheme(
  selected: AppTheme | null | undefined,
  entitlements: CosmeticEntitlement[],
): AppTheme {
  if (!selected) {
    const firstUnlocked = Object.entries(SUPPORTER_THEME_ENTITLEMENTS)
      .filter(([, entitlement]) => hasEntitlement(entitlements, entitlement))
      .map(([theme]) => theme as AppTheme)[0];
    return firstUnlocked ?? "white";
  }
  return isThemeUnlocked(selected, entitlements) ? selected : "white";
}

/**
 * Non-members get the solid middle colour instead of the gradient —
 * mirrors `resolveCustomThemeColors`.
 */
export function resolveCustomThemeColors(
  colors: CustomThemeColors,
  tier: MemberTier | null,
): CustomThemeColors {
  if (tier !== null) return colors;
  return { first: colors.second, second: colors.second, third: colors.second };
}

/** Human-readable tier label. */
export function tierLabel(tier: MemberTier | null): string {
  if (tier === "SUPPORTER_PLUS") return "Supporter Plus";
  if (tier === "SUPPORTER") return "Supporter";
  return "Not a member";
}
