import {
  SchedulePatchResponseSchema,
  ScheduleSettingsUpdateResponseSchema,
  type SchedulePatchRequest,
  type SchedulePatchResponse,
  type ScheduleRescheduleRequest,
  type ScheduleSettingsUpdateRequest,
  type ScheduleSettingsUpdateResponse,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useMutation } from "@/lib/hooks/useMutation";

/**
 * `Omit` over a union collapses it to its common keys, which would throw away
 * the `action` discriminant — and with it the whole point of the union. This
 * distributes, so each member keeps its own shape.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/**
 * Any PATCH /api/schedule action, minus the two fields the caller must NOT
 * supply: `apiFetch` merges `tz` (minutes west of UTC) and `tzZone` into every
 * date-scoped write body from the device clock, per request, because DST moves
 * the offset (shared/api-client/src/tz.ts). A screen that set them itself would
 * be reporting a zone it guessed.
 */
export type SchedulePatchInput = DistributiveOmit<
  SchedulePatchRequest,
  "tz" | "tzZone"
>;

/** `reschedule`'s body, with the action supplied by the hook. */
export type RescheduleInput = Omit<
  ScheduleRescheduleRequest,
  "action" | "tz" | "tzZone"
>;

export type SettingsInput = Omit<
  ScheduleSettingsUpdateRequest,
  "tz" | "tzZone" | "startDate"
>;

export interface ScheduleMutationsOptions {
  getToken: () => string | undefined;
  /** Called after any mutation resolves so the caller can re-pull the grid. */
  onSuccess?: () => void;
}

/**
 * Schedule write operations.
 *
 * `patch` is PATCH /api/schedule and takes the DISCRIMINATED UNION of the eight
 * actions the route accepts (`skip`, `unskip`, `uncomplete`, `reschedule`,
 * `swap`, `shift`, `pause`, `resume`) — so `reschedule` without a `newDate`, or
 * `shift` without `days`, fails to compile instead of coming back as a 400 from
 * a device. It used to take `Record<string, unknown>` and parse the answer with
 * `z.object({}).passthrough()`, which accepted literally any object.
 *
 * `reschedule` is the one action a screen calls today (the calendar's
 * RescheduleModal), so it is the one that gets a named wrapper. The others are
 * reachable through `patch` with no wrapper on purpose: a method no screen
 * calls is exactly the dead `swap` mutation this replaced.
 *
 * Training-day config is PUT /api/schedule/settings (note: PUT, not PATCH).
 * Each mutation re-pulls the schedule via onSuccess so the grid reflects the
 * change.
 */
export function useScheduleMutations(options: ScheduleMutationsOptions) {
  const base = {
    baseUrl: WEBAPP_BASE_URL,
    getToken: options.getToken,
    onSuccess: () => options.onSuccess?.(),
  };

  const patch = useMutation<SchedulePatchInput, SchedulePatchResponse>(
    "/api/schedule",
    SchedulePatchResponseSchema,
    { method: "PATCH", ...base },
  );

  const settings = useMutation<SettingsInput, ScheduleSettingsUpdateResponse>(
    "/api/schedule/settings",
    ScheduleSettingsUpdateResponseSchema,
    { method: "PUT", ...base },
  );

  return {
    patch: (input: SchedulePatchInput) => patch.mutate(input),
    reschedule: (input: RescheduleInput) =>
      patch.mutate({ ...input, action: "reschedule" }),
    updateSettings: (input: SettingsInput) => settings.mutate(input),
    pending: patch.loading || settings.loading,
  };
}
