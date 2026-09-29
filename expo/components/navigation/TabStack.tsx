import type { ComponentProps } from "react";
import { Stack } from "expo-router";

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
  contentStyle: { backgroundColor: "#0a0a0a" },
};

/**
 * The body of every `(tabs)/<tab>/_layout.tsx`. They differ in nothing, and a
 * copy in each of seven files is seven chances to drift.
 */
export function TabStack() {
  return <Stack screenOptions={TAB_STACK_SCREEN_OPTIONS} />;
}
