/**
 * Pure: notification payload → route string. Used by the tap-handler to
 * deep-link into the relevant screen.
 *
 * Categories mirror the webapp's push-sender (api/cron/notify):
 *   - workout-reminder  → today's workout live screen if IDs provided, else dashboard
 *   - streak-at-risk    → dashboard
 *   - streak-saved      → dashboard
 *   - re-engagement     → mind tab (the brand differentiator)
 *   - <anything else>   → dashboard fallback
 */
export type NotificationCategory =
  | "workout-reminder"
  | "streak-at-risk"
  | "streak-saved"
  | "re-engagement"
  | string;

export interface NotificationPayload {
  category: NotificationCategory;
  programId?: string;
  workoutIndex?: number;
  phaseIndex?: number;
}

export function routeForNotification(payload: NotificationPayload): string {
  switch (payload.category) {
    case "workout-reminder": {
      if (
        typeof payload.programId === "string" &&
        typeof payload.workoutIndex === "number"
      ) {
        return `/(tabs)/programming/${payload.programId}/workout/${payload.workoutIndex}/live`;
      }
      return "/(tabs)/dashboard";
    }
    case "streak-at-risk":
    case "streak-saved":
      return "/(tabs)/dashboard";
    case "re-engagement":
      return "/(tabs)/mind";
    default:
      return "/(tabs)/dashboard";
  }
}
