import { useMemo } from "react";
import { DarkTheme, DefaultTheme, type Theme } from "expo-router";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { getTokens, type ThemeMode } from "@/lib/theme/tokens";

/**
 * THE NAVIGATORS' OWN THEME — the surface nobody draws (NP-340).
 *
 * George, on his Pixel: "the screen sliding/changing … just kinda jitters and
 * shows a flash of white on the left edge of the screen." The white is not a
 * screen. It is React Navigation's DEFAULT theme, which expo-router installs
 * for us and which this app never replaced:
 *
 *   expo-router's `ExpoRoot` renders a `NavigationContainer` whose `theme`
 *   defaults to `DefaultTheme` — the LIGHT one, `background: rgb(242 242 242)`
 *   and `card: rgb(255 255 255)` — in BOTH colour schemes, because nothing in
 *   the tree ever provided a different one.
 *
 * Two navigator surfaces are painted from that theme and from nothing else, so
 * no amount of `contentStyle` reaches them:
 *
 *   • `ScreenStack`'s `nativeContainerStyle` (native-stack's
 *     `NativeStackView.native.tsx`) — the NATIVE view BEHIND the two sliding
 *     screens of a push or a back. That is the left-edge flash, frame for
 *     frame: `rgb(242 242 242)` for the few hundred milliseconds either screen
 *     is not covering it.
 *   • `elements/Background` — the wrapper every bottom-tabs scene is rendered
 *     into, which is why a tab switch can flash the same near-white.
 *
 * `contentStyle` styles the screen's CONTENT view, one level inside the native
 * container, which is why the app looked right while it was standing still and
 * wrong the moment anything moved.
 *
 * So the theme is ours: one object, built from the same tokens every class and
 * every `useThemeTokens()` style resolves against (NP-123), re-derived when the
 * system flips. `background` AND `card` are both our `background` on purpose —
 * React Navigation's `card` is the colour of the surfaces IT draws (its header,
 * its tab bar), and in this app those are either hidden (`headerShown: false`
 * everywhere, every screen draws its own header inside a SafeAreaView) or
 * already overridden to the page colour (`tabBarStyle.backgroundColor`). A
 * navigator-drawn fallback must therefore be the page, not our elevated `card`
 * token, or it reintroduces exactly the seam this card is about.
 *
 * `fonts` is the base theme's, untouched: it feeds React Navigation's own
 * `Header` and tab-bar label, and changing the app's typeface is not this card.
 */
export function navigationThemeFor(mode: ThemeMode): Theme {
  const base = mode === "dark" ? DarkTheme : DefaultTheme;
  const triplets = getTokens(mode);
  const rgb = (name: keyof typeof triplets) => `rgb(${triplets[name]})`;

  return {
    ...base,
    // What React Navigation reports to anything calling `useTheme()`, and what
    // it picks its own defaults from. It has to agree with NativeWind's scheme.
    dark: mode === "dark",
    colors: {
      ...base.colors,
      primary: rgb("primary"),
      background: rgb("background"),
      card: rgb("background"),
      text: rgb("foreground"),
      border: rgb("border"),
      // The badge red the web keeps on purpose (`TopNav.tsx`'s `bg-red-500`).
      notification: rgb("brand"),
    },
  };
}

/**
 * The live version: mounted once in `app/_layout.tsx`, above every navigator,
 * and re-derived on a flip of the system setting because `useThemeTokens()` is
 * a subscription to NativeWind's colour scheme rather than a one-off read.
 */
export function useNavigationTheme(): Theme {
  const { mode } = useThemeTokens();
  return useMemo(() => navigationThemeFor(mode), [mode]);
}
