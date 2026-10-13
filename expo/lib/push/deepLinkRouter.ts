/**
 * Pure: notification payload → route string. Used by the tap router
 * (`lib/push/tapRouter.ts`) to deep-link into the relevant screen.
 *
 * THE SERVER SENDS A URL, NOT A CATEGORY. Every push the server sends carries
 * a web `url` — the notify cron (`webapp/app/api/cron/notify/route.ts`)
 * sends `/dashboard`, `/dashboard/calendar`, `/dashboard/nutrition`,
 * `/dashboard/mind`, `/dashboard/streaks` and the goal-nudge urls; the
 * streak-freeze push (`webapp/lib/streak.ts`) sends `url: '/dashboard'` with
 * `tag: 'streak-freeze-used'`; chat pushes
 * (`webapp/app/api/chat/conversations/[conversationId]/messages/route.ts`)
 * send `url: '/dashboard/chat'` with `tag: 'chat-<conversationId>'` — which
 * is exactly what the web's service worker opens (`webapp/public/sw.js`:
 * `data.url || '/dashboard'`). The `tag` is an identifier for
 * replacement/dedup, never a route.
 *
 * So the url is the ONLY routing input, resolved by the one table
 * (`lib/navigation/webPathToRoute.ts`, NP-034). Chat urls resolve to Home
 * while NP-032's flag keeps chat out (the resolver's `hidden` fallback), and
 * an unknown url opens Home (the resolver's `unknown` fallback) — never a
 * blank screen, never an unmatched route.
 */
import {
  NATIVE_ROUTES,
  resolveWebPath,
} from "@/lib/navigation/webPathToRoute";

export type NotificationCategory =
  | "workout-reminder"
  | "streak-at-risk"
  | "streak-freeze-used"
  | "re-engagement"
  | string;

/**
 * The server's tags, for reference only — a `tag` identifies a notification
 * for replacement/dedup and NEVER routes. Kept here so a reader meeting the
 * old category switch knows where the names went. The server sends
 * `workout-reminder`, `meal-reminder`, `mind-reminder`, `streak-at-risk`,
 * `super-streak-at-risk`, `goal-nudge`, `checkin-reminder`, `schedule-setup`,
 * `daily-glance`, `re-engagement` (the notify cron), `streak-freeze-used`
 * (`webapp/lib/streak.ts`) and `chat-<conversationId>` (chat pushes).
 */

export interface NotificationPayload {
  /**
   * The web path the server sent (`data.url`). Absolute urls on either Become
   * domain and `become://` links resolve identically — the resolver decides.
   * The only routing input: a payload with no url opens Home.
   *
   * `category`, `programId`, `workoutIndex` and `phaseIndex` were removed:
   * the server never sent them (it sends `tag` + `url`), so the category
   * switch they fed answered every real notification with the default.
   */
  url?: string;
}

export function routeForNotification(payload: NotificationPayload): string {
  if (typeof payload.url === "string" && payload.url.trim() !== "") {
    const target = resolveWebPath(payload.url);
    // A push can name a web-only surface (an admin link, say). Opening a
    // browser is not a tap router's job, so it lands Home rather than nowhere.
    return target.kind === "native" ? target.href : NATIVE_ROUTES.home;
  }

  return NATIVE_ROUTES.home;
}
