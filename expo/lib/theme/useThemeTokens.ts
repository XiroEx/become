import { useCallback, useEffect, useMemo } from "react";
import { useColorScheme } from "nativewind";
import * as SystemUI from "expo-system-ui";
import {
  getTokens,
  scrimByMode,
  tintToken,
  type ThemeMode,
  type TokenName,
} from "@/lib/theme/tokens";

/**
 * THE ONE PLACE A COLOUR COMES FROM (NP-123).
 *
 * The web follows `prefers-color-scheme` (`webapp/app/layout.tsx` toggles the
 * `dark` class from the media query). Native shipped dark-only: 43 `#0a0a0a`
 * literals and 20 `resolveToken(…, "dark")` calls, because a SafeAreaView's
 * `style`, a Stack's `contentStyle`, a lucide icon's `color` and a
 * `placeholderTextColor` cannot read a Tailwind class — while NativeWind's own
 * variables followed the system all along. A phone in light mode therefore drew
 * light-mode TEXT on those hard-coded dark surfaces.
 *
 * This hook is the bridge. It reads NativeWind's colour scheme — the same
 * signal `bg-background` and `text-foreground` resolve against — so a class and
 * a `style` on the same screen can never disagree, and a live flip of the system
 * setting re-renders both (NativeWind's `useColorScheme` is a subscription, not
 * a one-off read).
 *
 * Use `colors` for a plain RN style or a `color` prop, `tint` for the
 * translucent banner surfaces, `scrim` for a modal backdrop, `statusBarStyle`
 * for `<StatusBar>`. Use a CLASS whenever one will do — that path needs no hook.
 */
export interface ThemeTokens {
  /** The resolved scheme: what NativeWind is painting right now. */
  mode: ThemeMode;
  isDark: boolean;
  /** Every token as an `rgb(r g b)` string, ready for a style or a color prop. */
  colors: Record<TokenName, string>;
  /** A translucent wash of a token — the web's `bg-red-50 dark:bg-red-950/30`. */
  tint: (name: TokenName, alpha: number) => string;
  /** The modal backdrop for this mode. */
  scrim: string;
  /**
   * What `expo-status-bar` should draw: light CONTENT on a dark surface, dark
   * content on a light one. (`style` names the content, not the background.)
   */
  statusBarStyle: "light" | "dark";
}

/**
 * NativeWind reports `undefined` only before it has resolved a scheme (and on a
 * platform that reports none). Dark is the fallback: the launch surface, the
 * splash and the app icon background are all `#0a0a0a`, so an unknown scheme
 * paints the colour the frame before it was already showing.
 */
export function themeModeFrom(
  scheme: "light" | "dark" | undefined | null,
): ThemeMode {
  return scheme === "light" ? "light" : "dark";
}

export function useThemeTokens(): ThemeTokens {
  const { colorScheme } = useColorScheme();
  const mode = themeModeFrom(colorScheme);

  const colors = useMemo(() => {
    const triplets = getTokens(mode);
    const out = {} as Record<TokenName, string>;
    for (const name of Object.keys(triplets) as TokenName[]) {
      out[name] = `rgb(${triplets[name]})`;
    }
    return out;
  }, [mode]);

  const tint = useCallback(
    (name: TokenName, alpha: number) => tintToken(name, mode, alpha),
    [mode],
  );

  return {
    mode,
    isDark: mode === "dark",
    colors,
    tint,
    scrim: scrimByMode[mode],
    statusBarStyle: mode === "dark" ? "light" : "dark",
  };
}

/**
 * The colour of the window itself, which is neither a screen nor a class.
 *
 * `app.json`'s `backgroundColor` is applied once, before JS, so it cannot be
 * two colours; expo-system-ui repaints it from the theme while the splash is
 * still up, and again whenever the system setting flips. Without this, a
 * light-mode phone shows a near-black frame wherever nothing else paints —
 * behind a modal, under a bounced ScrollView, during a stack transition.
 *
 * Mounted once, in the root layout.
 */
export function useThemedWindowBackground(): void {
  const { colors } = useThemeTokens();
  const background = colors.background;

  useEffect(() => {
    // Fire-and-forget: a failure here is a cosmetic frame, never a crash.
    void SystemUI.setBackgroundColorAsync(background);
  }, [background]);
}
