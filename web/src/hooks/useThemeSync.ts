import { useEffect } from "react";
import { applyPalette } from "@/lib/theme";
import { useSettings } from "@/store/settings";
import { useAuth } from "@/store/auth";
import { resolveAppTheme, resolveCustomThemeColors } from "@/lib/member-access";

/**
 * Applies the active palette + typography tokens to the document root.
 *
 * The theme is passed through the membership rules first, so a supporter
 * theme that the signed-in account does not own falls back to a free theme
 * and the custom theme degrades to a solid colour — exactly what the Android
 * app does in `MainActivity`.
 */
export function useThemeSync(): void {
  const theme = useSettings((state) => state.theme);
  const themeColors = useSettings((state) => state.themeColors);
  const customGradient = useSettings((state) => state.customGradient);
  const amoled = useSettings((state) => state.amoled);
  const font = useSettings((state) => state.font);
  const fontScale = useSettings((state) => state.fontScale);
  const reduceMotion = useSettings((state) => state.reduceMotion);
  const entitlements = useAuth((state) => state.memberAccess.entitlements);
  const tier = useAuth((state) => state.memberAccess.tier);

  useEffect(() => {
    const effectiveTheme = resolveAppTheme(theme, entitlements);
    const effectiveColors = resolveCustomThemeColors(themeColors, tier);
    applyPalette(effectiveTheme, {
      amoled,
      font,
      fontScale,
      reduceMotion,
      customColors: effectiveColors,
      customGradient: customGradient && tier !== null,
    });
  }, [
    theme,
    themeColors,
    customGradient,
    amoled,
    font,
    fontScale,
    reduceMotion,
    entitlements,
    tier,
  ]);
}
