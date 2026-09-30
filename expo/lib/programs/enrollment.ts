import {
  ProgramEnrollResponseSchema,
  ScheduleCreateResponseSchema,
  type ProgramEnrollRequest,
  type ProgramEnrollResponse,
  type ScheduleCreateRequest,
  type ScheduleCreateResponse,
} from "@become/api-client";
import { apiFetch } from "@become/api-client";
import { localDateKey } from "@/lib/time/localDay";

export interface EnrollProgramOptions {
  baseUrl?: string;
  getToken?: () => string | undefined | Promise<string | undefined>;
  fetchImpl?: typeof fetch;
}

export interface EnrollProgramInput {
  programId: string;
  /** YYYY-MM-DD local calendar date. Omitted in onboarding (NP-057). */
  startDate?: string;
}

/**
 * Enroll a member in a program via POST /api/programs/enroll.
 *
 * Keeps one unified request helper for both:
 * 1. Native onboarding (NP-057): enrols with `{ programId }` only (server stamps start).
 * 2. Program detail (NP-074): enrols with `{ programId, startDate }` (local calendar date).
 *
 * Rules:
 * - Start dates MUST be device-local calendar dates (YYYY-MM-DD), never `toISOString()`.
 */
export async function enrollProgram(
  options: EnrollProgramOptions,
  input: EnrollProgramInput,
): Promise<ProgramEnrollResponse> {
  const body: ProgramEnrollRequest = {
    programId: input.programId,
    ...(input.startDate ? { startDate: input.startDate } : {}),
  };

  return apiFetch<ProgramEnrollResponse>(
    "/api/programs/enroll",
    ProgramEnrollResponseSchema,
    {
      method: "POST",
      baseUrl: options.baseUrl,
      getToken: options.getToken,
      fetchImpl: options.fetchImpl,
      body,
    },
  );
}

export interface ScheduleWithWorkouts {
  scheduledWorkouts?: { date: string | Date }[];
}

/**
 * Suggest a sensible default start date matching the web implementation:
 * suggests next Monday (or today if today is Monday), or the Monday after the
 * member's existing schedules end when that is later.
 *
 * Rules:
 * - Uses device local calendar dates (YYYY-MM-DD), never toISOString.
 * - At 22:00 Pacific, 'today' is the Pacific day, not UTC tomorrow.
 */
export function suggestStartDate(
  schedules?: ScheduleWithWorkouts[] | null,
  now: Date = new Date(),
): string {
  // Default to next Monday (or today if today is Monday)
  const d = new Date(now);
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  let defaultSuggested = localDateKey(d);

  const scheduleList = schedules ?? [];
  let latestDate = "";
  for (const s of scheduleList) {
    for (const w of s.scheduledWorkouts ?? []) {
      const dateStr =
        typeof w.date === "string"
          ? w.date.split("T")[0]
          : localDateKey(new Date(w.date));
      if (dateStr && dateStr > latestDate) {
        latestDate = dateStr;
      }
    }
  }

  if (latestDate) {
    const parts = latestDate.split("-").map(Number);
    const y = parts[0] ?? now.getFullYear();
    const m = (parts[1] ?? 1) - 1;
    const dayNum = parts[2] ?? 1;
    const endDate = new Date(y, m, dayNum, 12, 0, 0);
    endDate.setDate(endDate.getDate() + 1); // day after last workout
    const dow = endDate.getDay();
    const daysUntilMon = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
    endDate.setDate(endDate.getDate() + daysUntilMon);
    const suggested = localDateKey(endDate);
    const todayStr = localDateKey(now);
    if (suggested > todayStr) {
      defaultSuggested = suggested;
    }
  }

  return defaultSuggested;
}

/**
 * Suggest sensible default training days based on program frequency (1-7 days/week).
 * Matches web implementation in ScheduleSetupClient.tsx.
 */
export function suggestTrainingDays(count: number): number[] {
  const suggestions: Record<number, number[]> = {
    1: [1], // Mon
    2: [1, 4], // Mon, Thu
    3: [1, 3, 5], // Mon, Wed, Fri
    4: [1, 2, 4, 5], // Mon, Tue, Thu, Fri
    5: [1, 2, 3, 4, 5], // Mon-Fri
    6: [1, 2, 3, 4, 5, 6], // Mon-Sat
    7: [0, 1, 2, 3, 4, 5, 6], // Every day
  };
  return suggestions[count] ?? suggestions[4] ?? [1, 2, 4, 5];
}

export interface SchedulePreviewDay {
  date: string;
  dayLabel: string;
  title: string;
}

/**
 * Generate preview of the first N days of training for the schedule setup screen.
 */
export function generateSchedulePreview(
  startDateStr: string,
  trainingDays: number[],
  previewDaysCount: number = 14,
): SchedulePreviewDay[] {
  if (trainingDays.length === 0 || !startDateStr) return [];
  const sorted = [...trainingDays].sort((a, b) => a - b);
  const preview: SchedulePreviewDay[] = [];

  const parts = startDateStr.split("-").map(Number);
  const current = new Date(parts[0] ?? 2026, (parts[1] ?? 1) - 1, parts[2] ?? 1, 12, 0, 0);
  const endPreview = new Date(current);
  endPreview.setDate(endPreview.getDate() + previewDaysCount);

  let dayCount = 1;
  while (current < endPreview) {
    if (sorted.includes(current.getDay())) {
      preview.push({
        date: localDateKey(current),
        dayLabel: `Day ${dayCount}`,
        title: `Training Day ${dayCount}`,
      });
      dayCount++;
    }
    current.setDate(current.getDate() + 1);
  }
  return preview;
}

export interface CreateScheduleInput {
  programId: string;
  trainingDays: number[];
  /** Local YYYY-MM-DD calendar date. */
  startDate: string;
}

/**
 * Create a program schedule via POST /api/schedule.
 *
 * Rules:
 * - startDate is a local YYYY-MM-DD date, read as 00:00 UTC marker by the server.
 */
export async function createSchedule(
  options: {
    baseUrl?: string;
    getToken?: () => string | undefined | Promise<string | undefined>;
    fetchImpl?: typeof fetch;
  },
  input: CreateScheduleInput,
): Promise<ScheduleCreateResponse> {
  const body: ScheduleCreateRequest = {
    programId: input.programId,
    trainingDays: input.trainingDays,
    startDate: input.startDate,
  };

  return apiFetch<ScheduleCreateResponse>(
    "/api/schedule",
    ScheduleCreateResponseSchema,
    {
      method: "POST",
      baseUrl: options.baseUrl,
      getToken: options.getToken,
      fetchImpl: options.fetchImpl,
      body,
    },
  );
}
