import {
  routeForNotification,
  type NotificationPayload,
} from "./deepLinkRouter";

export type PermissionStatus =
  | "granted"
  | "denied"
  | "blocked"
  | "undetermined";

export interface PermissionFetcher {
  get: () => Promise<{ status: PermissionStatus }>;
  request: () => Promise<{ status: PermissionStatus }>;
}

/**
 * Idempotent permission handler: returns the current status, only prompting
 * when it's undetermined. Granted / denied / blocked are terminal — calling
 * request() again would either no-op or be rejected by the OS.
 */
export async function ensureNotificationPermission(
  fetcher: PermissionFetcher,
): Promise<{ status: PermissionStatus }> {
  const current = await fetcher.get();
  if (current.status === "undetermined") {
    return fetcher.request();
  }
  return current;
}

export interface ForegroundDisplay {
  title: string;
  body: string;
}

/**
 * Friendly default messages for foreground (in-app toast) display. Server-
 * provided title/body still override; this just builds a fallback when only
 * the category is known.
 */
export function buildForegroundDisplay(
  payload: NotificationPayload,
): ForegroundDisplay {
  switch (payload.category) {
    case "workout-reminder":
      return {
        title: "Time to train",
        body: "Your workout is ready when you are.",
      };
    case "streak-at-risk":
      return {
        title: "Streak at risk",
        body: "Log something today to keep it alive.",
      };
    case "streak-saved":
      return {
        title: "Streak saved",
        body: "We used a freeze. Tomorrow's on you.",
      };
    case "re-engagement":
      return {
        title: "Come back",
        body: "Even one mood log keeps the thread alive.",
      };
    default:
      return { title: "Become", body: "Open the app for details." };
  }
}

/**
 * Tap handler: maps a notification to a route, then delegates to the
 * caller-provided navigator (typically `router.push`). Returns the route
 * string so callers can also log / persist last-route.
 */
export function handleNotificationTap(
  payload: NotificationPayload,
  navigate: (route: string) => void,
): string {
  const route = routeForNotification(payload);
  navigate(route);
  return route;
}
