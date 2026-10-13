/**
 * A TAP ON A WIDGET OPENS ITS SCREEN — through the one resolver, like every
 * other link.
 *
 * The feed gives each widget a `deepLink`, and it is a WEB path
 * (`/dashboard/streaks`, `/dashboard/nutrition`, `/dashboard/mind`,
 * `/dashboard/mind/becoming`) because the server only speaks web paths. None of
 * those routes exist natively.
 *
 * An Android widget cannot navigate, though. Its tap is an `Intent`: the library
 * fires `ACTION_VIEW` with the `uri` from `clickActionData` and
 * `FLAG_ACTIVITY_NEW_TASK`, whether or not the app is running. So the tap has to
 * carry a URL the OS can route to this app — the `become://` scheme declared by
 * `app.json` — and the path inside it is then resolved by
 * `app/+native-intent.tsx` → `lib/navigation/webPathToRoute.ts`, which is the
 * same table push taps and suggestion cards go through.
 *
 * That is the whole reason this file is four lines of logic and a test: there is
 * no widget routing table. `__tests__/widgetTaps.test.ts` drives every uri this
 * builds through `resolveWebPath` and fails if one resolves to Home by accident
 * (`fallback: "unknown"`), which is what a typo in a scheme or a lost path
 * segment looks like from the member's side.
 */
import { BECOME_APP_SCHEME } from "@/lib/navigation/webPathToRoute";

/**
 * Where the signed-out widget's tap goes. The sign-in screen, not Home: a
 * member whose widget says "Sign in to Become" and lands on a guarded route
 * would be redirected there anyway, one frame later.
 */
export const WIDGET_SIGN_IN_PATH = "/login";

/**
 * A web path (the feed's `deepLink`) as a `become://` url the launcher can fire.
 *
 * `become://dashboard/streaks` — no `//` before the path, because the custom
 * scheme parses its first segment as the HOST and `webPathToRoute` puts it back
 * (`become://dashboard/streaks` → `/dashboard/streaks`). A path with no leading
 * slash, or one carrying a query, ends up in the same shape.
 */
export function widgetTapUri(webPath: string): string {
  const trimmed = (webPath ?? "").trim();
  if (!trimmed) return `${BECOME_APP_SCHEME}://`;
  // An absolute url already names its own destination; a widget has no business
  // rewriting it (and the resolver refuses a foreign host anyway).
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `${BECOME_APP_SCHEME}://${trimmed.replace(/^\/+/, "")}`;
}

/** The sign-in tap, as a uri. */
export function widgetSignInUri(): string {
  return widgetTapUri(WIDGET_SIGN_IN_PATH);
}
