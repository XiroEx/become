import {
  NATIVE_ROUTES,
  resolveWebPath,
} from "@/lib/navigation/webPathToRoute";
import { openWebSignedIn } from "@/lib/web/openWebSignedIn";

export interface NativeIntentInput {
  /** The path the OS handed us, already stripped of the scheme/host. */
  path: string;
  /** True when this link is what STARTED the process (a cold start). */
  initial: boolean;
}

/**
 * EVERY LINK THE OS OPENS THE APP WITH COMES THROUGH HERE FIRST.
 *
 * expo-router calls `redirectSystemPath` for each incoming URL — a universal
 * link, an App Link, a `become://` URL, a notification tap — before it
 * resolves the route, including the one the app was cold-started on. That
 * makes this the one place a link can be rewritten, and it now rewrites every
 * WEB path onto its native route through the one resolver
 * (`lib/navigation/webPathToRoute.ts`): `/dashboard/streaks` → Home,
 * `/dashboard/workout/p1/workout/live?day=Day%202&sd=2026-09-29` → the live
 * workout with its day label and slot date intact.
 *
 * Three properties this file has to keep:
 *
 *   • a route the app already owns passes through untouched — `/verify?token=…`
 *     is still `/verify?token=…`, and `/(tabs)/…` is still itself. The launch
 *     decision used to happen elsewhere and win: the cold-open gate in
 *     `app/_layout.tsx` replaced the route with `/login` while `/verify?token=…`
 *     was still mounting, so tapping a magic link on a cold app spent the token
 *     and showed the sign-in screen. The gate no longer navigates at all, and
 *     `app/index.tsx` — mounted only when the app was opened on `/` — decides
 *     where a launch with no link goes;
 *   • nothing lands on a blank screen. An unrecognised path resolves to Home
 *     deliberately, which is the resolver's rule, not this file's;
 *   • a web-only surface (admin, the legal pages) opens ON THE WEB, signed in,
 *     through NP-121's hand-off — and the app still lands somewhere real while
 *     the browser opens, because this function has to return a route.
 */
export function redirectSystemPath({ path }: NativeIntentInput): string {
  const target = resolveWebPath(path);

  if (target.kind === "web") {
    // Fire and forget: `redirectSystemPath` is synchronous and the browser
    // open is not something a link resolution may wait on. A failure here is
    // already handled inside the helper (it falls back to a plain open); the
    // catch is for the module itself never taking the app down.
    void openWebSignedIn(target.path).catch(() => {});
    return NATIVE_ROUTES.home;
  }

  return target.href;
}
