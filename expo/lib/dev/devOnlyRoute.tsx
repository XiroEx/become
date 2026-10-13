import type { ComponentType } from "react";
import { Redirect } from "expo-router";

/**
 * DEV SCREENS ARE NOT SHIPPED SCREENS.
 *
 * expo-router ignores exactly three filenames — `+api`, `+html` and
 * `+native-intent` (`getIgnoreList` in `expo-router/build/getRoutesCore.js`) —
 * so a leading underscore buys nothing: `app/_stories.tsx` is a LIVE route and
 * `become://_stories` opens the component gallery in a store build. The two
 * read-only admin lists under `app/(app)/admin/` are the same story with a
 * client-side role check instead of a router one; admins do their admin on the
 * web (Tier 3 in `gap_analysis/GAPS.md`), and a member who guesses the URL
 * should land somewhere that exists for them.
 *
 * So: in a development build the screen renders as before, and in every other
 * build the route redirects to Home. `__DEV__` is a Metro-injected global —
 * `false` in a release bundle — and it is read at RENDER time here rather than
 * captured at module load, so a test can flip it.
 *
 * NP-122 deletes the admin screens outright and puts an admin-only link to the
 * web in their place. Until then this is what keeps them out of v1.
 */

/** Home. The web's `/dashboard`, which native reaches through the tab group. */
export const HOME_HREF = "/(tabs)/dashboard";

/** True only in a development bundle. */
export function isDevBuild(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__ === true;
}

/**
 * Wrap a screen so it only exists in a development build.
 *
 * The guard is a component of its own — not an early `return` inside the
 * screen — because the screens below it call hooks (`useAuth`, `useFetch`), and
 * a conditional return above a hook is the one shape React does not allow.
 */
export function devOnlyRoute<P extends object>(
  Screen: ComponentType<P>,
): ComponentType<P> {
  function DevOnlyRoute(props: P) {
    if (!isDevBuild()) return <Redirect href={HOME_HREF} />;
    return <Screen {...props} />;
  }
  DevOnlyRoute.displayName = `DevOnlyRoute(${
    Screen.displayName ?? Screen.name ?? "Screen"
  })`;
  return DevOnlyRoute;
}
