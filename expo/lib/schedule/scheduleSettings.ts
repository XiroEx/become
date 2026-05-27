/**
 * Validation helpers for the schedule settings form.
 *
 * Mirrors the webapp's Schedule model: training days are integers 0-6
 * (Sunday=0), the start date is a YYYY-MM-DD string, and auto-advance is a
 * boolean. Pure helpers — UI binding happens in ScheduleSettingsForm.
 */
export interface ScheduleSettings {
  trainingDays: number[];
  startDate: string;
  autoAdvance: boolean;
}

export type ScheduleSettingsError =
  | "training-days-empty"
  | "training-days-too-many"
  | "training-days-out-of-range"
  | "training-days-duplicate"
  | "start-date-bad-format"
  | "start-date-impossible";

export interface ScheduleSettingsValidation {
  ok: boolean;
  errors: ScheduleSettingsError[];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  if (!ISO_DATE_RE.test(s.startDate)) {
    errors.push("start-date-bad-format");
  } else {
    const parsed = new Date(`${s.startDate}T00:00:00Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== s.startDate
    ) {
      errors.push("start-date-impossible");
    }
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
