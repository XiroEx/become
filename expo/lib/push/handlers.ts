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

/**
 * Tap handler: maps a notification to a route, then delegates to the
 * caller-provided navigator (typically `router.push`). Returns the route
 * string so callers can also log / persist last-route.
 *
 * The payload's url is the only routing input — see `deepLinkRouter.ts`.
 */
export function handleNotificationTap(
  payload: NotificationPayload,
  navigate: (route: string) => void,
): string {
  const route = routeForNotification(payload);
  navigate(route);
  return route;
}
