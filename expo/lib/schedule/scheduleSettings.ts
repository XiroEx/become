/**
 * Validation helpers for the schedule settings form.
 *
 * Training days are integers 0-6 (Sunday=0). Start-date changes belong to
 * program management (NP-111). Pure helpers — UI binding happens in
 * ScheduleSettingsForm.
 */
export interface ScheduleSettings {
  trainingDays: number[];
}

export type ScheduleSettingsError =
  | "training-days-empty"
  | "training-days-too-many"
  | "training-days-out-of-range"
  | "training-days-duplicate";

export interface ScheduleSettingsValidation {
  ok: boolean;
  errors: ScheduleSettingsError[];
}

export function validateScheduleSettings(
  s: ScheduleSettings,
): ScheduleSettingsValidation {
  const errors: ScheduleSettingsError[] = [];
  if (s.trainingDays.length === 0) errors.push("training-days-empty");
  if (s.trainingDays.length > 7) errors.push("training-days-too-many");
  if (s.trainingDays.some((d) => d < 0 || d > 6 || !Number.isInteger(d))) {
    errors.push("training-days-out-of-range");
  }
  if (new Set(s.trainingDays).size !== s.trainingDays.length) {
    errors.push("training-days-duplicate");
  }
  return { ok: errors.length === 0, errors };
}

export const DAY_LABELS: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};
