/**
 * ─── GENERATE: SESSION OR PROGRAM FROM THE STANDARD GENERATOR (NP-133) ──────
 *
 * Native port of `webapp/components/GenerateModal.tsx` WITHOUT the AI switch
 * (NP-136 adds it): both modes, preview, Regenerate, Start (through the
 * NP-227 overview) and Save as program with the refusal classifier (NP-010)
 * and the upgrade sheet (NP-052).
 *
 * RULES THAT TRAVEL:
 *   • `/api/generate/*` is never metered — no allowance line, no gate check,
 *     no upgrade sheet on those two calls. A 403 there without `feature` and
 *     `requiresTier` is an ordinary error, never the sheet.
 *   • Save as program (`POST /api/programs/custom`) is quota-gated by the
 *     `custom-programs` allowance (3 on the free tier). Read `canCreate`, not
 *     `allowed`, before offering it, and bail when `enforced` is false.
 *   • A generated session hands off to the quick-session overview (NP-227):
 *     stash with `needsName: true` and push `quickSessionOverviewHref(id)`.
 *   • A saved program lands on its own detail screen (the web pushes
 *     `/dashboard/workout/{program_id}`); natively that is
 *     `/(tabs)/programming/{program_id}`.
 *
 * The web's option ranges, carried over exactly:
 *   session — focus (QUICK_FOCUS_ORDER), difficulty
 *   (beginner/intermediate/advanced), equipment (9 curated values),
 *   exercises 3–10 (default 5), cardio finisher toggle;
 *   program — same focus/difficulty/equipment, days per week 2–6 (default 3),
 *   weeks 2–12 (default 4), exercises per day 3–8 (default 5).
 */

import { z } from "zod";
import { apiFetch } from "@become/api-client";
import type { DraftExercise } from "@become/core";
import { WEBAPP_BASE_URL } from "@/lib/config";

/** Focus keys, in the web's `QUICK_FOCUS_ORDER` display order. */
export const GENERATE_FOCUS_ORDER = [
  "full_body",
  "push",
  "pull",
  "legs",
  "glutes",
  "upper",
  "lower",
  "core",
  "arms",
  "cardio",
] as const;

export type GenerateFocusKey = (typeof GENERATE_FOCUS_ORDER)[number];

/** Focus labels — the web's `FOCUS_DEFS[*].label`, copied, not derived. */
export const GENERATE_FOCUS_LABELS: Record<GenerateFocusKey, string> = {
  full_body: "Full Body",
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  glutes: "Glutes",
  upper: "Upper Body",
  lower: "Lower Body",
  core: "Core",
  arms: "Arms",
  cardio: "Cardio",
};

export function generateFocusLabel(focus?: string): string | undefined {
  if (!focus) return undefined;
  return (GENERATE_FOCUS_LABELS as Record<string, string>)[focus];
}

export type GenerateDifficulty = "beginner" | "intermediate" | "advanced";

export const GENERATE_DIFFICULTIES: GenerateDifficulty[] = [
  "beginner",
  "intermediate",
  "advanced",
];

/** Curated equipment list (value → label), the web's `EQUIPMENT_OPTIONS`. */
export const GENERATE_EQUIPMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "cable", label: "Cable" },
  { value: "smith_machine", label: "Smith" },
  { value: "leg_press", label: "Machines" },
  { value: "pull_up_bar", label: "Pull-up bar" },
  { value: "resistance_band", label: "Bands" },
  { value: "bodyweight", label: "Bodyweight" },
];

export type GenerateTab = "session" | "program";

/** Web option ranges, carried over exactly. */
export const GENERATE_SESSION_EXERCISES = { min: 3, max: 10, default: 5 };
export const GENERATE_PROGRAM_DAYS_PER_WEEK = { min: 2, max: 6, default: 3 };
export const GENERATE_PROGRAM_WEEKS = { min: 2, max: 12, default: 4 };
export const GENERATE_PROGRAM_EXERCISES_PER_DAY = { min: 3, max: 8, default: 5 };

export interface GenerateSessionParams {
  focus: string;
  difficulty: GenerateDifficulty;
  equipment: string[];
  exerciseCount: number;
  includeCardio: boolean;
}

export interface GenerateProgramParams {
  focus: string;
  difficulty: GenerateDifficulty;
  equipment: string[];
  daysPerWeek: number;
  weeks: number;
  exercisesPerDay: number;
}

export function defaultSessionParams(): GenerateSessionParams {
  return {
    focus: "full_body",
    difficulty: "intermediate",
    equipment: [],
    exerciseCount: GENERATE_SESSION_EXERCISES.default,
    includeCardio: false,
  };
}

export function defaultProgramParams(): GenerateProgramParams {
  return {
    focus: "full_body",
    difficulty: "intermediate",
    equipment: [],
    daysPerWeek: GENERATE_PROGRAM_DAYS_PER_WEEK.default,
    weeks: GENERATE_PROGRAM_WEEKS.default,
    exercisesPerDay: GENERATE_PROGRAM_EXERCISES_PER_DAY.default,
  };
}

export function sessionRequestBody(params: GenerateSessionParams): Record<string, unknown> {
  return {
    focus: params.focus,
    difficulty: params.difficulty,
    ...(params.equipment.length ? { equipment: params.equipment } : {}),
    exerciseCount: params.exerciseCount,
    includeCardio: params.includeCardio,
  };
}

export function programRequestBody(params: GenerateProgramParams): Record<string, unknown> {
  return {
    focus: params.focus,
    difficulty: params.difficulty,
    ...(params.equipment.length ? { equipment: params.equipment } : {}),
    daysPerWeek: params.daysPerWeek,
    weeks: params.weeks,
    exercisesPerDay: params.exercisesPerDay,
  };
}

// ─── Response shapes ─────────────────────────────────────────────────────────

const DraftExerciseSchema = z
  .object({
    exerciseSlug: z.string(),
    name: z.string(),
    trackingType: z.string(),
    sets: z.number(),
    reps: z.string(),
    rest: z.string().optional(),
    duration: z.string().optional(),
  })
  .passthrough();

export const GeneratedSessionSchema = z
  .object({
    session: z
      .object({
        title: z.string(),
        focus: z.string().optional(),
        exercises: z.array(DraftExerciseSchema),
      })
      .passthrough(),
    seed: z.number().optional(),
  })
  .passthrough();

export const GeneratedProgramSchema = z
  .object({
    program: z
      .object({
        name: z.string(),
        description: z.string(),
        focus: z.string().optional(),
        daysPerWeek: z.number(),
        weeks: z.number(),
        days: z.array(
          z
            .object({
              day: z.string(),
              title: z.string(),
              focus: z.string(),
              exercises: z.array(DraftExerciseSchema),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
    seed: z.number().optional(),
  })
  .passthrough();

export type GeneratedSession = z.infer<typeof GeneratedSessionSchema>;
export type GeneratedProgram = z.infer<typeof GeneratedProgramSchema>;

export interface GenerateDeps {
  baseUrl?: string;
  getToken?: () => string | undefined;
  fetchImpl?: typeof fetch;
}

function callOpts(deps: GenerateDeps) {
  return {
    baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
    ...(deps.getToken ? { getToken: deps.getToken } : {}),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  };
}

/**
 * `POST /api/generate/session` — the standard generator, never metered.
 * Throws `ApiError` on refusal; the caller routes it (a 403 here without
 * `feature` + `requiresTier` is an ordinary error, never the upgrade sheet).
 */
export async function generateSession(
  params: GenerateSessionParams,
  deps: GenerateDeps = {},
): Promise<GeneratedSession> {
  return apiFetch("/api/generate/session", GeneratedSessionSchema, {
    method: "POST",
    body: sessionRequestBody(params),
    ...callOpts(deps),
  });
}

/**
 * `POST /api/generate/program` — the standard generator, never metered.
 * Same refusal rule as the session call.
 */
export async function generateProgram(
  params: GenerateProgramParams,
  deps: GenerateDeps = {},
): Promise<GeneratedProgram> {
  return apiFetch("/api/generate/program", GeneratedProgramSchema, {
    method: "POST",
    body: programRequestBody(params),
    ...callOpts(deps),
  });
}

// ─── Save as program ─────────────────────────────────────────────────────────

const DIFFICULTY_TO_TARGET: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Advanced",
};

/**
 * The web's `draftProgramToProgramBody` (`webapp/lib/quickSession/generate.ts`):
 * a generated DraftProgram becomes the body `POST /api/programs/custom`
 * expects (single phase spanning all weeks). Pure — no IO.
 */
export function draftProgramToProgramBody(
  program: GeneratedProgram["program"],
  difficulty?: string,
): Record<string, unknown> {
  const focusLabel =
    generateFocusLabel(program.focus) ??
    generateFocusLabel(program.days[0]?.focus) ??
    "Full Body";
  return {
    name: program.name,
    description: program.description,
    duration_weeks: program.weeks,
    training_days_per_week: program.daysPerWeek,
    goal: "General Fitness",
    target_user: DIFFICULTY_TO_TARGET[difficulty ?? "intermediate"] ?? "Intermediate",
    tags: ["generated"],
    phases: [
      {
        phase: "Phase 1",
        weeks: `1-${program.weeks}`,
        focus: focusLabel,
        workouts: program.days.map((d) => ({
          day: d.day,
          title: d.title,
          exercises: d.exercises.map((e: DraftExercise) => ({
            exerciseSlug: e.exerciseSlug,
            name: e.name,
            sets: e.sets,
            reps: e.reps,
            ...(e.rest ? { rest: e.rest } : {}),
            ...(e.duration ? { duration: e.duration } : {}),
          })),
        })),
      },
    ],
  };
}

/** Where a saved generated program lands: its own detail screen. */
export function savedProgramRoute(programId: string): string {
  return `/(tabs)/programming/${encodeURIComponent(programId)}`;
}
