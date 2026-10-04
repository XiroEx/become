/**
 * ─── AI WORKOUT GENERATION: SESSION OR PROGRAM THROUGH THE AI RUN CLIENT ────
 *
 * Shared by the Workout Now sheet (NP-076) and the Generate sheet (NP-133)
 * for the AI switch (NP-136). Mirrors the web's
 * `webapp/components/QuickSessionModal.tsx` + `webapp/components/GenerateModal.tsx`
 * AI path:
 *
 *   POST once through `runAiTask` (NP-038) → `/api/ai/workout/session` or
 *   `/api/ai/workout/program`, then resolve the returned exercise NAMES to
 *   real library rows (`GET /api/exercises/search`, unmatched names dropped,
 *   never synthetic slugs — the web's `lib/ai/resolveExercises.ts`).
 *
 * RULES THAT TRAVEL:
 *   • Consent is checked on the server before any charge, so a consent refusal
 *     (`error: 'ai_consent'`) opens the consent prompt (NP-046) and nothing
 *     else — no outage line, no upgrade sheet, and the standard generator
 *     still works when the member declines.
 *   • An allowance refusal (`error: 'entitlement'` with `gate`) falls through
 *     to the standard generator and is a NOTE, never a wall: the web's
 *     fallback-note wording, verbatim. The upgrade sheet is never raised over
 *     a result that exists.
 *   • A 429 spend cap (`error: 'rate_limited'`) is never an upsell: it falls
 *     through to the standard generator with no note at all.
 *   • Post once per member action and never retry the POST (the route charges
 *     on entry). Only the poll retries, inside the run client.
 */

import { apiFetch, ExerciseSearchResponseSchema } from "@become/api-client";
import type { DraftExercise } from "@become/core";
import { runAiTask, type AiTaskResult } from "@/lib/ai/runClient";
import { WEBAPP_BASE_URL } from "@/lib/config";

/** Minimum real exercises before an AI session/day is worth showing. */
export const MIN_RESOLVED_AI_EXERCISES = 3;

export interface AiExerciseIn {
  name?: string;
  sets?: number;
  reps?: string | number;
  rest?: string;
}

export interface AiSessionPayload {
  title?: string;
  focus?: string;
  exercises?: AiExerciseIn[];
}

export interface AiProgramPayload {
  name?: string;
  description?: string;
  focus?: string;
  daysPerWeek?: number;
  weeks?: number;
  days?: Array<{
    day?: number;
    title?: string;
    focus?: string;
    exercises?: AiExerciseIn[];
  }>;
}

export interface AiWorkoutDeps {
  baseUrl?: string;
  getToken?: () => string | undefined;
  runTask?: typeof runAiTask;
}

function callOpts(deps: AiWorkoutDeps) {
  return {
    baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
    ...(deps.getToken ? { getToken: deps.getToken } : {}),
  };
}

function taskOf(deps: AiWorkoutDeps): typeof runAiTask {
  return deps.runTask ?? runAiTask;
}

function clampSets(s?: number): number {
  return typeof s === "number" && s > 0 ? Math.min(8, Math.round(s)) : 3;
}

function cleanReps(r?: string | number): string {
  if (r === undefined || r === null) return "8-12";
  const s = String(r).trim();
  return s ? s.slice(0, 16) : "8-12";
}

function cleanRest(r?: string): string | undefined {
  if (!r) return undefined;
  const s = String(r).trim();
  return s ? s.slice(0, 16) : undefined;
}

/**
 * Resolve AI exercise NAMES to real library rows. Unmatched names are
 * DROPPED, never turned into synthetic slugs (a fake slug renders a tile
 * with no video / no metadata). Dedupes by slug and clamps sets/reps/rest.
 */
export async function resolveAiWorkoutExercises(
  aiExercises: AiExerciseIn[],
  deps: AiWorkoutDeps = {},
): Promise<{ exercises: DraftExercise[]; matched: number; dropped: number }> {
  const settled = await Promise.allSettled(
    (aiExercises ?? []).map(async (ai): Promise<DraftExercise | null> => {
      const name = (ai.name ?? "").trim();
      if (!name) return null;
      try {
        const data = await apiFetch(
          `/api/exercises/search?q=${encodeURIComponent(name)}&limit=3`,
          ExerciseSearchResponseSchema,
          callOpts(deps),
        );
        const m = (data as { exercises?: Array<{ slug?: string; name?: string; trackingType?: string }> } | null)?.exercises?.[0];
        if (!m?.slug) return null; // no real match → drop (no synthetic slug)
        const rest = cleanRest(ai.rest);
        return {
          exerciseSlug: m.slug,
          name: m.name || name,
          trackingType: m.trackingType || "reps_weight",
          sets: clampSets(ai.sets),
          reps: cleanReps(ai.reps),
          ...(rest ? { rest } : {}),
        };
      } catch {
        return null;
      }
    }),
  );

  const resolved = settled.map((r) => (r.status === "fulfilled" ? r.value : null));
  const dropped = resolved.filter((x) => x === null).length;

  // Dedupe by slug — the model sometimes lists the same lift twice.
  const seen = new Set<string>();
  const exercises: DraftExercise[] = [];
  for (const e of resolved) {
    if (e && !seen.has(e.exerciseSlug)) {
      seen.add(e.exerciseSlug);
      exercises.push(e);
    }
  }
  return { exercises, matched: exercises.length, dropped };
}

export type AiWorkoutOutcome =
  | { status: "ai"; session: { title: string; focus?: string; exercises: DraftExercise[] } }
  | { status: "ai-program"; program: AiProgramResult }
  /** A consent refusal — the caller opens the consent prompt, nothing else. */
  | { status: "consent" }
  /**
   * An allowance refusal — the caller falls through to the standard
   * generator and shows the fallback note. Carries the server's wording.
   */
  | { status: "gate"; gate: AiTaskResult["gate"] }
  /** A 429 spend cap, an outage, or an unusable AI answer — fall through silently. */
  | { status: "unavailable" };

export interface AiProgramDay {
  day: string;
  title: string;
  focus: string;
  exercises: DraftExercise[];
}

export interface AiProgramResult {
  name?: string;
  description?: string;
  focus?: string;
  daysPerWeek?: number;
  weeks?: number;
  days: AiProgramDay[];
}

function toSessionOutcome(
  r: AiTaskResult,
  fallbackTitle: string,
  fallbackFocus: string,
  resolved: DraftExercise[],
): AiWorkoutOutcome {
  if (r.ok && resolved.length >= MIN_RESOLVED_AI_EXERCISES) {
    const payload = (r.result ?? {}) as AiSessionPayload;
    return {
      status: "ai",
      session: {
        title: payload.title || fallbackTitle,
        focus: fallbackFocus,
        exercises: resolved,
      },
    };
  }
  return toRefusalOutcome(r);
}

/**
 * Classify a finished AI task. The gate is checked BEFORE a failure is
 * called an outage — and consent before the gate, because a permission
 * refusal must never raise the upgrade sheet.
 */
function toRefusalOutcome(r: AiTaskResult): AiWorkoutOutcome {
  if (r.error === "ai_consent") return { status: "consent" };
  if (r.error === "entitlement" && r.gate) return { status: "gate", gate: r.gate };
  return { status: "unavailable" };
}

/**
 * Run the AI session generation for one focus. Posts exactly ONCE through
 * the run client and never retries. Never throws for a classified refusal —
 * those come back as outcomes.
 */
export async function generateAiSession(
  focusLabel: string,
  fallbackFocus: string,
  deps: AiWorkoutDeps = {},
): Promise<AiWorkoutOutcome> {
  const runTask = taskOf(deps);
  const r = await runTask("/api/ai/workout/session", { focus: focusLabel });
  if (!r.ok) return toRefusalOutcome(r);
  const payload = (r.result ?? {}) as AiSessionPayload;
  const { exercises } = await resolveAiWorkoutExercises(payload.exercises ?? [], deps);
  return toSessionOutcome(r, payload.title || `${focusLabel} Session`, fallbackFocus, exercises);
}

/**
 * Run the AI session generation for the Generate sheet (prompt + level +
 * equipment, the web's GenerateModal session body). Same single-POST,
 * same outcomes.
 */
export async function generateAiSheetSession(
  body: { prompt?: string; focus: string; equipment?: string; level: string },
  fallbackFocus: string,
  deps: AiWorkoutDeps = {},
): Promise<AiWorkoutOutcome> {
  const runTask = taskOf(deps);
  const r = await runTask("/api/ai/workout/session", body);
  if (!r.ok) return toRefusalOutcome(r);
  const payload = (r.result ?? {}) as AiSessionPayload;
  const { exercises } = await resolveAiWorkoutExercises(payload.exercises ?? [], deps);
  return toSessionOutcome(r, payload.title || `${body.focus} Session`, fallbackFocus, exercises);
}

/**
 * Run the AI program generation for the Generate sheet (goal + shape, the
 * web's GenerateModal program body). Days left empty after dropping
 * unmatched exercises are dropped; the program is only accepted when it is
 * substantial enough to not look broken (≥2 days, ≥3 exercises total).
 */
export async function generateAiSheetProgram(
  body: { goal: string; daysPerWeek: number; weeks: number; level: string; equipment?: string },
  fallbackFocus: string,
  fallbackName: string,
  deps: AiWorkoutDeps = {},
): Promise<AiWorkoutOutcome> {
  const runTask = taskOf(deps);
  const r = await runTask("/api/ai/workout/program", body);
  if (!r.ok) return toRefusalOutcome(r);
  const payload = (r.result ?? {}) as AiProgramPayload;
  const daysIn = payload.days ?? [];
  if (!daysIn.length) return { status: "unavailable" };
  const resolvedDays = await Promise.all(
    daysIn.map(async (d, i): Promise<AiProgramDay> => {
      const { exercises } = await resolveAiWorkoutExercises(d.exercises ?? [], deps);
      return {
        day: `Day ${typeof d.day === "number" ? d.day : i + 1}`,
        title: d.title ?? `Day ${i + 1}`,
        focus: fallbackFocus,
        exercises,
      };
    }),
  );
  const days = resolvedDays.filter((d) => d.exercises.length > 0);
  const totalExercises = days.reduce((n, d) => n + d.exercises.length, 0);
  if (days.length >= 2 && totalExercises >= MIN_RESOLVED_AI_EXERCISES) {
    return {
      status: "ai-program",
      program: {
        ...(payload.name ? { name: payload.name } : {}),
        ...(payload.description ? { description: payload.description } : {}),
        ...(payload.focus ? { focus: payload.focus } : {}),
        daysPerWeek: payload.daysPerWeek ?? days.length,
        weeks: payload.weeks ?? body.weeks,
        days,
      },
    };
  }
  return { status: "unavailable" };
}

/**
 * The web's fallback-note wording. Session and program each carry their own
 * noun ("session" / "program"); the Workout Now sheet uses the session one.
 */
export function aiFallbackNote(gateError: string, noun: "session" | "program"): string {
  const base = (gateError ?? "").trim();
  const prefix = base ? `${base} ` : "";
  return noun === "session"
    ? `${prefix}Built you a standard session instead — switch AI off to keep generating without using one.`
    : `${prefix}Built you a standard program instead — switch AI off below to keep generating without using one.`;
}
