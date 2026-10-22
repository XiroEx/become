import { router } from "expo-router";
import {
  NATIVE_ROUTES,
  isBecomeWebHost,
  resolveWebPath,
} from "@/lib/navigation/webPathToRoute";
import { isCommunityEnabled } from "@/lib/flags/communityEnabled";
import { openWebSignedIn } from "@/lib/web/openWebSignedIn";

export interface NativeIntentInput {
  /** The path the OS handed us, already stripped of the scheme/host. */
  path: string;
  /** True when this link is what STARTED the process (a cold start). */
  initial: boolean;
}

/**
 * Direct native routes hosted under `app/(app)/`, `app/(auth)/`, or root `app/`.
 * These routes don't start with `/(tabs)/` or `/(app)/`, so `resolveWebPath`
 * doesn't recognise them by default without this resolver.
 */
export const DIRECT_NATIVE_ROUTES = new Set([
  "/plan",
  "/settings",
  "/progress",
  "/becoming",
  "/onboarding",
  "/login",
  "/verify",
  "/account/restore",
]);

/**
 * Holds the target href of a redirected system path until consumed by the
 * launch gate in `app/index.tsx`. This ensures deep links survive on Android
 * where the initial route / launch screen might mount during warm or cold starts.
 */
let pendingRedirect: string | null = null;

export function getPendingRedirect(): string | null {
  return pendingRedirect;
}

export function setPendingRedirect(target: string | null): void {
  pendingRedirect = target;
}

export function consumePendingRedirect(): string | null {
  const target = pendingRedirect;
  pendingRedirect = null;
  return target;
}

/**
 * Warm-start double-navigation guard. `redirectSystemPath`'s return value is
 * itself the navigation — expo-router resolves the incoming link to the
 * returned href — so the `router.push` below is a second, redundant navigation
 * to the same screen. A link the OS delivers twice (a re-fired intent, a
 * duplicate call) then mounts `/verify` twice, and a magic-link token is
 * single-use, so the second mount's POST can only fail. A repeated push of the
 * SAME href inside the window is therefore dropped; a new href still pushes.
 * Cold starts never push — the launch route consumes `pendingRedirect`.
 */
let lastWarmPush: { href: string; at: number } | null = null;
const WARM_PUSH_DEDUPE_MS = 2000;

/** Test-only reset for the warm-push dedupe. */
export function resetWarmPushDedupeForTests(): void {
  lastWarmPush = null;
}

/**
 * Normalise a direct native route from a bare path or `become://` / Web URL.
 * Preserves query parameters intact.
 */
export function resolveDirectNativeRoute(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let pathname = "";
  let search = "";

  try {
    if (trimmed.startsWith("/")) {
      if (trimmed.startsWith("//")) return null;
      const url = new URL(trimmed, "http://localhost");
      pathname = url.pathname;
      search = url.search;
    } else {
      const url = new URL(trimmed);
      const scheme = url.protocol.replace(":", "").toLowerCase();
      if (scheme === "become") {
        const joined = `/${url.hostname}${url.pathname}`.replace(/\/{2,}/g, "/");
        pathname = joined;
        search = url.search;
      } else if (scheme === "https" || scheme === "http") {
        if (!isBecomeWebHost(url.hostname)) return null;
        pathname = url.pathname;
        search = url.search;
      } else {
        return null;
      }
    }
  } catch {
    return null;
  }

  if (pathname.startsWith("/(") || pathname.startsWith("/_")) {
    return `${pathname}${search}`;
  }

  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  if (DIRECT_NATIVE_ROUTES.has(normalized)) {
    return `${normalized}${search}`;
  }

  return null;
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
export function redirectSystemPath({ path, initial }: NativeIntentInput): string {
  const direct = resolveDirectNativeRoute(path);
  let targetHref: string;

  if (direct) {
    targetHref = direct;
  } else {
    // NP-032: chat (and, flag or no flag, community/groups/events) resolve
    // Home while the build-time flag is off — the resolver's own "hidden"
    // fallback, read here rather than duplicated.
    const target = resolveWebPath(path, {
      communityEnabled: isCommunityEnabled(),
    });

    if (target.kind === "web") {
      // Fire and forget: `redirectSystemPath` is synchronous and the browser
      // open is not something a link resolution may wait on. A failure here is
      // already handled inside the helper (it falls back to a plain open); the
      // catch is for the module itself never taking the app down.
      void openWebSignedIn(target.path).catch(() => {});
      return NATIVE_ROUTES.home;
    }

    targetHref = target.href;
  }

  if (targetHref && targetHref !== "/" && targetHref !== NATIVE_ROUTES.launch) {
    setPendingRedirect(targetHref);
  }

  // On warm starts, actively navigate via router.push so existing activities
  // that don't remount root index still transition to the intended screen.
  // Dedupe: the returned href navigates on its own, so a second delivery of
  // the same link must not push a second copy of the screen.
  if (!initial && targetHref && targetHref !== "/" && targetHref !== NATIVE_ROUTES.launch) {
    const now = Date.now();
    if (
      !lastWarmPush ||
      lastWarmPush.href !== targetHref ||
      now - lastWarmPush.at >= WARM_PUSH_DEDUPE_MS
    ) {
      lastWarmPush = { href: targetHref, at: now };
      try {
        router.push(targetHref as any);
      } catch {
        // router might not be ready or active yet
      }
    }
  }

  return targetHref;
}
