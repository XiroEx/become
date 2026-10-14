/**
 * THE SCREENS THAT TAKE OVER THE WHOLE PHONE (NP-381).
 *
 * Jon, on the 0.1.x build: "Live view needs to take over the full screen like
 * it does in the Web app. And also just how the spacing is is terrible."
 *
 * The web's Live workout is `fixed inset-0 z-100` — it covers the top nav AND
 * the floating BottomNav pill, so the clip is the whole viewport and the
 * chrome floats over it
 * (`webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`).
 * Natively, Live is a screen PUSHED inside the Workout tab, which cost it the
 * bottom of the phone twice over:
 *
 *   1. `TabStack` reserves `useTabBarScreenInset()` (≈86pt) at the bottom of
 *      every pushed screen, because the glass bar is absolute and the
 *      navigator reserves nothing for it (NP-351) — so the live screen ended
 *      above a dead band;
 *   2. the bar itself still floated over that band, so the `Complete Set →`
 *      CTA sat under a blurred capsule.
 *
 * Both are fixed by naming the routes that are immersive in ONE place: the
 * bar hides itself while one of them is focused (`GlassTabBar`), and
 * `TabStack` hands those screens a container with no reserved band
 * (`fullScreenRoutes`). Track is NOT in this list on purpose — the web's
 * Track page is an ordinary dashboard page under the same BottomNav, so it
 * keeps the bar and keeps clearing it.
 */

/**
 * The immersive routes of the Workout (`programming`) tab, named as that
 * tab's Stack names them: a folder with no `_layout.tsx` is flattened into
 * its parent navigator, so the live screens are ONE screen each of the
 * programming stack with a slash-joined name.
 *
 * `__tests__/card-NP-381-acceptance.test.tsx` reads `app/` off disk and fails
 * if a `live` route appears that is not listed here.
 */
export const IMMERSIVE_WORKOUT_ROUTES = [
  "[id]/workout/[idx]/live",
  "quick/live",
] as const;

/** Is this route name one of the immersive screens? */
export function isImmersiveRouteName(
  name: string | null | undefined,
): boolean {
  if (!name) return false;
  return IMMERSIVE_WORKOUT_ROUTES.some(
    (route) => name === route || name.endsWith(`/${route}`),
  );
}

/**
 * The shape this module needs from a navigation state — the tab navigator's
 * own, and the nested Stack state React Navigation hangs off the focused
 * route once that Stack has mounted. Declared structurally so the tab bar can
 * pass what bottom-tabs hands it without a cast and without this module
 * importing navigator types.
 */
export interface NavigationStateLike {
  index?: number | undefined;
  routes?: readonly { name: string; state?: NavigationStateLike | undefined }[];
}

/**
 * The name of the DEEPEST focused route — `[id]/workout/[idx]/live` rather
 * than `programming`. The tab navigator's state only names its own five
 * screens; which screen of a tab's Stack is on top lives in the nested state.
 */
export function focusedLeafRouteName(
  state: NavigationStateLike | null | undefined,
): string | undefined {
  let current = state ?? undefined;
  let name: string | undefined;
  // A nested state is absent until its navigator has rendered (React
  // Navigation populates it on mount), so this walks as far as it can and
  // answers with the deepest name it actually has.
  while (current?.routes && current.routes.length > 0) {
    const route = current.routes[current.index ?? 0] ?? current.routes[0];
    if (!route) break;
    name = route.name;
    current = route.state;
  }
  return name;
}

/** Is the screen on top of this navigation state an immersive one? */
export function isImmersiveNavigationState(
  state: NavigationStateLike | null | undefined,
): boolean {
  return isImmersiveRouteName(focusedLeafRouteName(state));
}
