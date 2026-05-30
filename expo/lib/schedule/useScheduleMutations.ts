import { z } from "zod";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useMutation } from "@/lib/hooks/useMutation";

// reschedule/swap return { message, … }; settings PUT returns { settings: … }.
// We only need success, so accept any object shape.
const ScheduleMutationResponseSchema = z.object({}).passthrough();
type ScheduleMutationResponse = z.infer<typeof ScheduleMutationResponseSchema>;

export interface ScheduleMutationsOptions {
  getToken: () => string | undefined;
  /** Called after any mutation resolves so the caller can re-pull the grid. */
  onSuccess?: () => void;
}

export interface RescheduleInput {
  programId: string;
  workoutDate: string;
  newDate: string;
}

export interface SwapInput {
  programId: string;
  workoutDate: string;
  swapWithDate: string;
}

export interface SettingsInput {
  programId: string;
  trainingDays: number[];
  startDate?: string;
}

/**
 * Schedule write operations. reschedule/swap are PATCH /api/schedule actions;
 * training-days config is PUT /api/schedule/settings (note: PUT, not PATCH).
 * Each mutation re-pulls the schedule via onSuccess so the grid reflects the
 * change.
 */
export function useScheduleMutations(options: ScheduleMutationsOptions) {
  const base = {
    baseUrl: WEBAPP_BASE_URL,
    getToken: options.getToken,
    onSuccess: () => options.onSuccess?.(),
  };

  const patch = useMutation<Record<string, unknown>, ScheduleMutationResponse>(
    "/api/schedule",
    ScheduleMutationResponseSchema,
    { method: "PATCH", ...base },
  );

  const settings = useMutation<SettingsInput, ScheduleMutationResponse>(
    "/api/schedule/settings",
    ScheduleMutationResponseSchema,
    { method: "PUT", ...base },
  );

  return {
    reschedule: (input: RescheduleInput) =>
      patch.mutate({
        programId: input.programId,
        action: "reschedule",
        workoutDate: input.workoutDate,
        newDate: input.newDate,
      }),
    swap: (input: SwapInput) =>
      patch.mutate({
        programId: input.programId,
        action: "swap",
        workoutDate: input.workoutDate,
        swapWithDate: input.swapWithDate,
      }),
    updateSettings: (input: SettingsInput) =>
      settings.mutate({
        programId: input.programId,
        trainingDays: input.trainingDays,
        ...(input.startDate ? { startDate: input.startDate } : {}),
      }),
    pending: patch.loading || settings.loading,
  };
}
