import type { ComponentProps } from "react";
import { Stack } from "expo-router";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  PUSH_ANIMATION,
  useStackAnimation,
} from "@/lib/navigation/screenAnimation";
import { useTabBarScreenInset } from "@/lib/navigation/tabBarInset";

/**
 * THE STACK EVERY TAB OWNS.
 *
 * Without a `_layout.tsx` of its own, a folder under `(tabs)` is not a screen:
 * expo-router flattens every file inside it into the TAB navigator, so
 * `programming/[id]/workout/[idx]/live` became a tab button of its own and a
 * detail screen replaced the tab it was opened from. One Stack per tab is what
 * makes a detail screen a PUSH inside that tab — the tab bar stays, the tab
 * keeps its history, and iOS gets its edge-swipe back for free.
 *
 * `headerShown: false` because every screen in this app draws its own header
 * inside a SafeAreaView (see `__tests__/iosSafeArea.test.ts`); a navigator
 * header on top of that is a second title bar.
 */
export const TAB_STACK_SCREEN_OPTIONS: ComponentProps<
  typeof Stack
>["screenOptions"] = {
  headerShown: false,
  // The iOS back swipe. On by default in a native stack — pinned here so a
  // future screenOptions edit has to say out loud that it is turning it off.
  gestureEnabled: true,
  // ONE EXPLICIT PUSH (NP-340). Unset, this is `presentation: "card"`'s
  // default, which react-native-screens documents as varying with the Android
  // OS version and theme — on Android 15 that is the Material predictive-back
  // transition, which jitters against our JS-drawn headers and uncovers the
  // native stack container at the left edge. See
  // `lib/navigation/screenAnimation.ts` for why `ios_from_right` is the value.
  // `TabStack()` below replaces it with `"none"` when the OS asks for reduced
  // motion; this constant is the app's choice when it does not.
  animation: PUSH_ANIMATION,
};

/**
 * The body of every `(tabs)/<tab>/_layout.tsx`. They differ in nothing, and a
 * copy in each of seven files is seven chances to drift.
 *
 * `contentStyle` is added HERE rather than in the constant above: the colour
 * comes from the theme (NP-123), so it is a hook call and cannot live in a
 * module-level object. The navigator paints it during a push, which is the one
 * frame a screen's own SafeAreaView does not cover.
 *
 * `animation` is overridden here for the same reason — "Reduce Motion" /
 * "Remove animations" is a live system setting, so it is a hook too (NP-340).
 * The native stack container BEHIND these screens is painted from React
 * Navigation's theme, which `app/_layout.tsx` now provides
 * (`lib/theme/navigationTheme.ts`); `contentStyle` alone never reached it,
 * which is why a push flashed white at the left edge whatever this file said.
 */
export function TabStack() {
  const { colors } = useThemeTokens();
  const animation = useStackAnimation();
  // NP-351: the tab bar is a floating capsule now, absolutely positioned over
  // the scene, so the navigator reserves NOTHING for it. This is the long
  // tail's share of that — see the `<Stack.Screen name="index">` below.
  const tabBarInset = useTabBarScreenInset();

  return (
    <Stack
      screenOptions={{
        ...TAB_STACK_SCREEN_OPTIONS,
        contentStyle: {
          backgroundColor: colors.background,
          paddingBottom: tabBarInset,
        },
        animation,
      }}
    >
      {/*
       * THE TAB'S ROOT SCREEN KEEPS THE FULL HEIGHT (NP-351).
       *
       * Every PUSHED screen inside a tab — a program's detail, Nutrition
       * Goals, the recipe editor, two dozen of them — gets the padding above,
       * because none of them is going to carry a hand-typed number and a
       * button under the glass bar is a button nobody can press.
       *
       * The five tab ROOTS are the screens the bar actually lives on, and they
       * are the reason it is glass at all: their content has to pass UNDER it.
       * So they opt out here and pad their own scroll content with
       * `TAB_BAR_CONTENT_INSET` instead (`DashboardScreen`,
       * `programming/index`, `mind/index`, `nutrition/index`, `ProfileScreen`).
       * Padding them twice would leave a dead band under the last card.
       */}
      <Stack.Screen
        name="index"
        options={{ contentStyle: { backgroundColor: colors.background } }}
      />
    </Stack>
  );
}
