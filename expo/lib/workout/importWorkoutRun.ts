/**
 * ─── IMPORT FROM TEXT: RUN THE AI ONCE, MATCH NAMES TO THE LIBRARY (NP-242) ───
 *
 * Split 2/4 of NP-170 (import a session or a program from pasted text), on
 * top of NP-241's pure parsers (`expo/lib/workout/importWorkoutText.ts`). No
 * UI here — `importSessionFromText` / `importProgramFromText` are the native
 * analogs of the web's `webapp/components/workout/ImportSessionFlow.tsx`
 * (`runImport` + `buildLibraryIndex`) and
 * `webapp/app/dashboard/programs/new/ImportProgramFlow.tsx` (`runImport` +
 * `flagAgainstLibrary`), through the AI run client (NP-038) and the consent
 * prompt (NP-046) — same injected-`deps` shape as the sibling
 * `expo/lib/workout/aiGenerate.ts`.
 *
 * RULES THAT TRAVEL:
 *   • POST `/api/ai/workout/import` through `runAiTask` exactly ONCE per
 *     import and never retry it — the route charges on entry.
 *   • Consent is checked on the server before any charge: a refusal
 *     (`error: 'ai_consent'`) raises the consent prompt (never the upgrade
 *     sheet, no outage line) and returns `{ status: 'consent' }` — nothing
 *     else happens.
 *   • An entitlement refusal (`error: 'entitlement'`) returns
 *     `{ status: 'gate', gate }` so the caller shows the EXISTING upgrade
 *     path — never a wall thrown up over a result.
 *   • A 429 spend cap (`error: 'rate_limited'`) returns
 *     `{ status: 'rate_limited' }` — a plain try-again-later, no upsell.
 *   • An unusable AI answer (nothing the parser can use) returns
 *     `{ status: 'empty', message }` with the web's copy verbatim.
 *   • Any other failure returns `{ status: 'error', message }` with the
 *     web's outage copy verbatim.
 *   • Session names resolve through the member's custom exercises
 *     (`GET /api/exercises/custom`) plus one `GET /api/exercises/search` per
 *     parsed name, same as the web's `buildLibraryIndex`; unmatched names
 *     come back in `unresolved` rather than being dropped silently.
 *   • Program names flag through `POST /api/exercises/match`, best-effort:
 *     when that call fails the program still comes back, just unflagged —
 *     same as the web's `flagAgainstLibrary`.
 */

import { z } from "zod";
import {
  apiFetch,
  CustomExercisesResponseSchema,
  ExerciseSearchResponseSchema,
  type PlanGate,
} from "@become/api-client";
import { runAiTask, type AiTaskResult } from "@/lib/ai/runClient";
import { raiseAiConsentPrompt } from "@/lib/ai/aiConsentPrompt";
import {
  flagImportedProgram,
  normalizeImportedProgram,
  normalizeImportedSession,
  resolveImportedSession,
  type ImportedProgram,
  type ResolvableExercise,
  type ResolvedImportedSession,
} from "@/lib/workout/importWorkoutText";
import { WEBAPP_BASE_URL } from "@/lib/config";

export interface ImportWorkoutDeps {
  baseUrl?: string;
  getToken?: () => string | undefined;
  runTask?: typeof runAiTask;
}

function callOpts(deps: ImportWorkoutDeps) {
  return {
    baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
    ...(deps.getToken ? { getToken: deps.getToken } : {}),
  };
}

function taskOf(deps: ImportWorkoutDeps): typeof runAiTask {
  return deps.runTask ?? runAiTask;
}

/** The web's copy, verbatim (ImportSessionFlow.tsx / ImportProgramFlow.tsx). */
const EMPTY_SESSION_MESSAGE =
  "Couldn't find a workout in that. Try pasting the full text instead.";
const EMPTY_PROGRAM_MESSAGE =
  "Couldn't find a program in that. Try pasting the full text instead.";
const UNREACHABLE_MESSAGE = "Couldn't reach the import AI. Try again in a minute.";

export type ImportRefusal =
  /** A consent refusal — the caller already saw the consent prompt raised. */
  | { status: "consent" }
  /** An entitlement refusal — the caller shows the existing upgrade path. */
  | { status: "gate"; gate: PlanGate | undefined }
  /** A 429 spend cap — plain try-again-later, no upsell. */
  | { status: "rate_limited" }
  /** An outage, or anything else the run client could not classify. */
  | { status: "error"; message: string };

export type ImportSessionOutcome =
  | { status: "ok"; session: ResolvedImportedSession }
  | { status: "empty"; message: string }
  | ImportRefusal;

export type ImportProgramOutcome =
  | { status: "ok"; program: ImportedProgram }
  | { status: "empty"; message: string }
  | ImportRefusal;

/**
 * Classify a finished `/api/ai/workout/import` task. Consent is checked
 * BEFORE the gate (a permission refusal must never raise the upgrade sheet),
 * and the gate before calling anything else an outage.
 */
function toRefusal(r: AiTaskResult): ImportRefusal {
  if (r.error === "ai_consent") {
    raiseAiConsentPrompt();
    return { status: "consent" };
  }
  if (r.error === "entitlement") {
    return { status: "gate", gate: r.gate };
  }
  if (r.error === "rate_limited") {
    return { status: "rate_limited" };
  }
  return { status: "error", message: UNREACHABLE_MESSAGE };
}

function toResolvable(e: {
  slug?: string;
  name?: string;
  trackingType?: string;
  equipment?: string[];
  laterality?: string;
  movementPatterns?: string[];
}): ResolvableExercise | null {
  if (!e.slug || !e.name) return null;
  return {
    slug: e.slug,
    name: e.name,
    trackingType: e.trackingType || "reps_weight",
    ...(e.equipment ? { equipment: e.equipment } : {}),
    ...(e.laterality ? { laterality: e.laterality } : {}),
    ...(e.movementPatterns ? { movementPatterns: e.movementPatterns } : {}),
  };
}

/**
 * Builds a name → exercise index from the member's own custom exercises plus
 * one `/api/exercises/search` lookup per parsed name — the native analog of
 * the web's `buildLibraryIndex`. Each lookup is independent: one failing
 * (network, schema) just leaves that name out of the index, same as the web
 * silently skipping a non-ok response.
 */
async function buildLibraryIndex(
  names: string[],
  deps: ImportWorkoutDeps,
): Promise<Map<string, ResolvableExercise>> {
  const opts = callOpts(deps);
  const known = new Map<string, ResolvableExercise>();

  const custom = await apiFetch(
    "/api/exercises/custom",
    CustomExercisesResponseSchema,
    opts,
  ).catch(() => null);
  for (const e of custom?.exercises ?? []) {
    const resolvable = toResolvable(e);
    if (resolvable) known.set(resolvable.name.trim().toLowerCase(), resolvable);
  }

  const searched = await Promise.allSettled(
    names.map((name) =>
      apiFetch(
        `/api/exercises/search?q=${encodeURIComponent(name)}&limit=5`,
        ExerciseSearchResponseSchema,
        opts,
      ),
    ),
  );
  for (const result of searched) {
    if (result.status !== "fulfilled") continue;
    for (const e of result.value.exercises ?? []) {
      const resolvable = toResolvable(e);
      if (!resolvable) continue;
      const key = resolvable.name.trim().toLowerCase();
      if (!known.has(key)) known.set(key, resolvable);
    }
  }

  return known;
}

/** `POST /api/exercises/match` answers `{ known: string[] }`. */
const ExerciseMatchResponseSchema = z
  .object({ known: z.array(z.string()).default([]) })
  .passthrough();

/**
 * Flags each exercise as new/broken/possibly-grouped against
 * `POST /api/exercises/match` — the native analog of the web's
 * `flagAgainstLibrary`. Best-effort: a failed lookup still returns the
 * program, just unflagged, rather than blocking the import on it.
 */
async function flagAgainstLibrary(
  program: ImportedProgram,
  deps: ImportWorkoutDeps,
): Promise<ImportedProgram> {
  const names = Array.from(
    new Set(
      program.phases.flatMap((p) =>
        p.workouts.flatMap((w) => w.exercises.map((e) => e.name)),
      ),
    ),
  );
  if (names.length === 0) return program;

  try {
    const data = await apiFetch(
      "/api/exercises/match",
      ExerciseMatchResponseSchema,
      { ...callOpts(deps), method: "POST", body: { names } },
    );
    const knownNames = new Set(data.known.map((n) => n.trim().toLowerCase()));
    return flagImportedProgram(program, knownNames);
  } catch {
    return program;
  }
}

/**
 * Imports a single session from pasted/uploaded text. POSTs
 * `/api/ai/workout/import` through `runAiTask` exactly ONCE and never
 * retries. Never throws — every refusal and failure comes back as a
 * discriminated outcome.
 */
export async function importSessionFromText(
  text: string,
  deps: ImportWorkoutDeps = {},
): Promise<ImportSessionOutcome> {
  const runTask = taskOf(deps);
  const r = await runTask(
    "/api/ai/workout/import",
    { text },
    { label: "Reading your session…" },
  );
  if (!r.ok) return toRefusal(r);

  const parsed = normalizeImportedSession(r.result);
  if (!parsed) return { status: "empty", message: EMPTY_SESSION_MESSAGE };

  const names = Array.from(new Set(parsed.exercises.map((e) => e.name)));
  const known = await buildLibraryIndex(names, deps);
  return { status: "ok", session: resolveImportedSession(parsed, known) };
}

/**
 * Imports a full program from pasted/uploaded text. POSTs
 * `/api/ai/workout/import` through `runAiTask` exactly ONCE and never
 * retries. Never throws — every refusal and failure comes back as a
 * discriminated outcome.
 */
export async function importProgramFromText(
  text: string,
  deps: ImportWorkoutDeps = {},
): Promise<ImportProgramOutcome> {
  const runTask = taskOf(deps);
  const r = await runTask(
    "/api/ai/workout/import",
    { text },
    { label: "Reading your program…" },
  );
  if (!r.ok) return toRefusal(r);

  const normalized = normalizeImportedProgram(r.result);
  if (!normalized) return { status: "empty", message: EMPTY_PROGRAM_MESSAGE };

  return { status: "ok", program: await flagAgainstLibrary(normalized, deps) };
}
