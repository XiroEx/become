import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { View } from "react-native";
import { useColorScheme, vars } from "nativewind";
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
 *
 * A surface that is ONE scheme whatever the system says (the Becoming stage,
 * NP-341) wraps its subtree in `ForcedThemeMode` below; inside it the hook
 * answers with that palette.
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

/**
 * A SUBTREE THAT IS ONE SCHEME WHATEVER THE SYSTEM SAYS (NP-341).
 *
 * The Becoming stage is a night sky in both schemes on the web
 * (`JourneyCanvas.tsx` is `bg-[#07060d] text-white`, with no `dark:` variant
 * anywhere under it), and so are its cards. Natively the stage itself drew from
 * `becomingStageTokens`, but every `WeekCard` / `HorizonCard` inside it read
 * `useThemeTokens()` — the SYSTEM scheme — so a phone in light mode put white
 * cards with dark ink on the purple sky, and an appearance flip while the stage
 * was open repainted them live.
 *
 * `ForcedThemeMode` pins the mode for everything beneath it: inside,
 * `useThemeTokens()` answers with that palette and ignores the system; outside,
 * nothing changes. It is a context and not a literal, so the components keep
 * reading tokens and still follow the system wherever else they are mounted.
 *
 * ONLY THE HOOK SEES IT — unless the subtree opts into `scopeClassColors`. A
 * Tailwind class (`bg-card`, `text-foreground`) resolves against NativeWind's
 * global scheme, which has no per-subtree override, so a forced subtree takes
 * every colour from `useThemeTokens()` by default. Pass `scopeClassColors` and
 * the forced palette is ALSO written onto a wrapping View as scoped CSS
 * variables (`vars()` from NativeWind, one `--<token>` per triplet, the same
 * strings `global.css` uses), so classes inside resolve to the forced palette
 * instead of the system's. `__tests__/card-NP-341-acceptance.test.tsx` checks
 * the stage's files for colour classes for that reason; Live opts in because
 * its panel is class-coloured throughout.
 */
const ThemeModeOverride = createContext<ThemeMode | null>(null);

/**
 * The forced palette as scoped CSS variables — one `--<token>` per triplet,
 * the same strings `global.css` uses under `.dark` / `:root` (proved equal by
 * `__tests__/themeFollowsSystem.test.tsx`). A View carrying this style makes
 * every Tailwind class beneath it resolve to `mode`'s palette, whatever the
 * system scheme is.
 */
const scopedVarsCache: Partial<Record<ThemeMode, ReturnType<typeof vars>>> = {};

export function scopedClassVars(mode: ThemeMode): ReturnType<typeof vars> {
  // One object per mode: NativeWind keeps the variables inside its own
  // structure (they are not plain `--name` keys), so a test can only
  // recognise the scope by identity — and the style need not be rebuilt
  // on every render either.
  const cached = scopedVarsCache[mode];
  if (cached) return cached;
  const built = vars(
    Object.fromEntries(
      Object.entries(getTokens(mode)).map(([name, triplet]) => [
        `--${name}`,
        triplet,
      ]),
    ),
  );
  scopedVarsCache[mode] = built;
  return built;
}

export interface ForcedThemeModeProps {
  mode: ThemeMode;
  /**
   * Also pin CLASS colours, not just the hook. Wraps the children in a View
   * carrying `scopedClassVars(mode)`, so `text-foreground` et al resolve to
   * the forced palette. Off by default: the Becoming stage (NP-341) takes
   * every colour from the hook and must not gain a class-colour override.
   */
  scopeClassColors?: boolean;
  children?: ReactNode;
}

export function ForcedThemeMode({
  mode,
  scopeClassColors = false,
  children,
}: ForcedThemeModeProps) {
  const content = scopeClassColors
    ? createElement(
        View,
        { style: [{ flex: 1 }, scopedClassVars(mode)] },
        children,
      )
    : children;
  return createElement(ThemeModeOverride.Provider, { value: mode }, content);
}

export function useThemeTokens(): ThemeTokens {
  const { colorScheme } = useColorScheme();
  // Subscribed to the system either way (hooks are unconditional); the forced
  // mode, when there is one above, is what resolves.
  const forced = useContext(ThemeModeOverride);
  const mode = forced ?? themeModeFrom(colorScheme);

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
