/**
 * THE NATIVE TAP ROUTER (NP-066).
 *
 * The server identifies a notification by `tag` and a web `url`
 * (`webapp/app/api/cron/notify/route.ts` sends both on every push; the
 * streak-freeze push in `webapp/lib/streak.ts` sends `tag:
 * 'streak-freeze-used'` with `url: '/dashboard'`; chat pushes send
 * `tag: 'chat-<conversationId>'` with `url: '/dashboard/chat'`).
 *
 * The web's service worker (`webapp/public/sw.js`) opens the payload's `url`
 * on click. Native does the same through the one route resolver
 * (`lib/navigation/webPathToRoute.ts`, NP-034): `data.url` is the ONLY routing
 * input. The `tag` is an identifier for replacement/dedup, never a route.
 *
 * Three app states, three entry points, one rule:
 *
 *   cold start   — the tap started the process. `getLastNotificationResponseAsync`
 *                  returns the response the OS held for us; drain it once and
 *                  route it. Nothing to drain (a normal launch) is not an error.
 *   background   — the app was alive but hidden. The response listener fires on
 *                  tap; route each response as it arrives.
 *   foreground   — the app is on screen. Reminders present quietly (no banner,
 *                  no sound, no badge, no list) so a workout reminder never
 *                  covers the set being logged; the member already sees the day.
 *
 * Chat urls resolve to Home while NP-032's flag keeps chat out — that is the
 * resolver's `hidden` fallback, not a special case here. An unknown url opens
 * Home for the same reason: the resolver never returns an unmatched route.
 *
 * Everything that touches the native module lives behind the `TapDeps`
 * interface so unit tests never import `expo-notifications` (which needs a
 * device). The production deps (`defaultTapDeps`) are the thin wrappers at the
 * bottom. Every failure is caught and logged, never a crash, never a block —
 * nothing in the app requires notifications.
 */

import { NATIVE_ROUTES } from "@/lib/navigation/webPathToRoute";
import { routeForNotification } from "./deepLinkRouter";

/** What the OS hands back for a tap: the push's `data` plus its identifier. */
export interface TapResponse {
  /** The push payload's `data` (`{ url }` on every server push). */
  data: Record<string, unknown> | null | undefined;
  /** True when the tap was the default tap, not a category action button. */
  isDefaultAction: boolean;
}

/** The foreground presentation for an in-app reminder. All off = quiet. */
export interface ForegroundPresentation {
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
}

/**
 * Reminders present quietly in the foreground: no banner over the screen the
 * member is on, no sound, no badge, no list entry. The member is already
 * looking at the app; a banner would cover the set, the meal log, the session.
 */
export const QUIET_FOREGROUND_PRESENTATION: ForegroundPresentation = {
  shouldShowBanner: false,
  shouldShowList: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
};

export interface TapDeps {
  /** The tap that cold-started the app, if any. Never throws. */
  getColdStartTap: () => Promise<TapResponse | null>;
  /** Subscribe to background taps. Returns the unsubscribe. */
  onBackgroundTap: (listener: (tap: TapResponse) => void) => () => void;
  /** The foreground presentation for in-app reminders. */
  foregroundPresentation: () => ForegroundPresentation;
  navigate: (route: string) => void;
  log: (message: string, ...args: unknown[]) => void;
}

export interface TapDepsInput {
  navigate: (route: string) => void;
  getColdStartTap?: TapDeps["getColdStartTap"];
  onBackgroundTap?: TapDeps["onBackgroundTap"];
  foregroundPresentation?: TapDeps["foregroundPresentation"];
  log?: (message: string, ...args: unknown[]) => void;
}

/**
 * Read `data.url` out of a tap response. The only routing input: the payload's
 * url, exactly as the service worker reads `notification.data.url`.
 */
export function urlFromTapResponse(tap: TapResponse | null | undefined): string | undefined {
  if (!tap || typeof tap.data !== "object" || tap.data === null) return undefined;
  const url = (tap.data as Record<string, unknown>).url;
  return typeof url === "string" && url.trim() !== "" ? url : undefined;
}

/**
 * Route one tap response through the resolver and navigate. Returns the route
 * navigated to, or null when there was nothing to route (a null response, or a
 * non-default action the app does not handle).
 */
export function routeTapResponse(
  tap: TapResponse | null | undefined,
  navigate: (route: string) => void,
): string | null {
  if (!tap) return null;
  if (!tap.isDefaultAction) return null;
  const route = routeForNotification({ url: urlFromTapResponse(tap) });
  navigate(route);
  return route;
}

/**
 * Cold start: drain the tap the OS held for us, if any, and route it. A null
 * response (a normal launch) resolves null without navigating.
 */
export async function handleColdStartTap(deps: TapDeps): Promise<string | null> {
  try {
    const tap = await deps.getColdStartTap();
    return routeTapResponse(tap, deps.navigate);
  } catch (error) {
    deps.log("[push] cold-start tap failed", error);
    return null;
  }
}

/**
 * Wire the tap router for the life of the app:
 *
 *   1. drain the cold-start tap (`getLastNotificationResponseAsync`),
 *   2. subscribe to background taps (the response listener),
 *   3. install the quiet foreground presentation (reminders never cover the
 *      screen the member is on).
 *
 * Returns the background-tap unsubscribe. Every step is best-effort: a tap
 * router may never take the app with it.
 */
export async function startTapRouter(deps: TapDeps): Promise<() => void> {
  try {
    deps.foregroundPresentation();
  } catch (error) {
    deps.log("[push] foreground presentation failed", error);
  }
  let unsubscribe: () => void = () => {};
  try {
    unsubscribe = deps.onBackgroundTap((tap) => {
      try {
        routeTapResponse(tap, deps.navigate);
      } catch (error) {
        deps.log("[push] background tap failed", error);
      }
    });
  } catch (error) {
    deps.log("[push] background tap subscribe failed", error);
  }
  await handleColdStartTap(deps);
  return unsubscribe;
}

/**
 * Production deps: the only place `expo-notifications` is imported for taps.
 * Required lazily so Jest (no native module) can import this file freely —
 * tests inject their own `TapDeps` and never touch these.
 */
export function defaultTapDeps(input: TapDepsInput): TapDeps {
  const log = input.log ?? ((message: string) => console.warn(message));
  return {
    navigate: input.navigate,
    log,
    getColdStartTap:
      input.getColdStartTap ??
      (async () => {
        const Notifications = await import("expo-notifications");
        const response = await Notifications.getLastNotificationResponseAsync();
        if (!response) return null;
        return {
          data: (response.notification.request.content.data ?? null) as Record<string, unknown> | null,
          isDefaultAction:
            response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER,
        };
      }),
    onBackgroundTap:
      input.onBackgroundTap ??
      ((listener) => {
        let subscription: { remove: () => void } | null = null;
        void (async () => {
          try {
            const Notifications = await import("expo-notifications");
            subscription = Notifications.addNotificationResponseReceivedListener(
              (response) => {
                listener({
                  data: (response.notification.request.content.data ??
                    null) as Record<string, unknown> | null,
                  isDefaultAction:
                    response.actionIdentifier ===
                    Notifications.DEFAULT_ACTION_IDENTIFIER,
                });
              },
            );
          } catch (error) {
            log("[push] background tap subscribe failed", error);
          }
        })().catch(() => {
          /* a tap router may never take the app with it */
        });
        return () => {
          try {
            subscription?.remove();
          } catch {
            /* unsubscribe is best-effort */
          }
        };
      }),
    foregroundPresentation:
      input.foregroundPresentation ??
      (() => {
        void (async () => {
          try {
            const Notifications = await import("expo-notifications");
            Notifications.setNotificationHandler({
              handleNotification: async () => ({
                ...QUIET_FOREGROUND_PRESENTATION,
              }),
            });
          } catch (error) {
            log("[push] foreground presentation failed", error);
          }
        })().catch(() => {
          /* a tap router may never take the app with it */
        });
        return { ...QUIET_FOREGROUND_PRESENTATION };
      }),
  };
}

/** Home, by name — the landing for an unknown url. */
export const TAP_FALLBACK_ROUTE = NATIVE_ROUTES.home;
