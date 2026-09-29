/**
 * Pure: notification payload → route string. Used by the tap-handler to
 * deep-link into the relevant screen.
 *
 * THE SERVER SENDS A URL, NOT A CATEGORY. Every push the notify cron sends
 * (`webapp/app/api/cron/notify/route.ts`) carries a web `url` — `/dashboard`,
 * `/dashboard/calendar`, `/dashboard/nutrition`, `/dashboard/mind`,
 * `/dashboard/streaks`, and the goal-nudge urls — which is exactly what the
 * web's service worker opens (`webapp/public/sw.js`: `data.url || '/dashboard'`).
 * This router used to switch on CATEGORIES the server has never sent, so every
 * real notification fell through to the default.
 *
 * So the url comes first, resolved by the one table
 * (`lib/navigation/webPathToRoute.ts`), and the category switch stays behind it
 * as the answer for a payload that carries no url at all.
 */
import {
  NATIVE_ROUTES,
  resolveWebPath,
} from "@/lib/navigation/webPathToRoute";

export type NotificationCategory =
  | "workout-reminder"
  | "streak-at-risk"
  | "streak-saved"
  | "re-engagement"
  | string;

export interface NotificationPayload {
  /**
   * The web path the server sent (`data.url`). Absolute urls on either Become
   * domain and `become://` links resolve identically — the resolver decides.
   */
  url?: string;
  category?: NotificationCategory;
  programId?: string;
  workoutIndex?: number;
  phaseIndex?: number;
}

export function routeForNotification(payload: NotificationPayload): string {
  if (typeof payload.url === "string" && payload.url.trim() !== "") {
    const target = resolveWebPath(payload.url);
    // A push can name a web-only surface (an admin link, say). Opening a
    // browser is not a tap handler's job, so it lands Home rather than nowhere.
    return target.kind === "native" ? target.href : NATIVE_ROUTES.home;
  }

  switch (payload.category) {
    case "workout-reminder": {
      if (
        typeof payload.programId === "string" &&
        typeof payload.workoutIndex === "number"
      ) {
        return `${NATIVE_ROUTES.workout}/${payload.programId}/workout/${payload.workoutIndex}/live`;
      }
      return NATIVE_ROUTES.home;
    }
    case "streak-at-risk":
    case "streak-saved":
      return NATIVE_ROUTES.home;
    case "re-engagement":
      return NATIVE_ROUTES.mind;
    default:
      return NATIVE_ROUTES.home;
  }
}
