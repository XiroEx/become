/**
 * ─── MY PROGRAMS, ON THE PHONE (NP-135) ─────────────────────────────────────
 *
 * Native counterpart of `webapp/app/dashboard/programs/mine/MyProgramsClient.tsx`.
 * Members build their own programs on the web (3 on the free tier); natively
 * they need at least to find, enrol in and delete them. Building one is a
 * heavy editor: NP-168 has ported its FRAME (program details, phases,
 * sessions, create, update and the draft), and until the exercise rows land
 * with NP-171 create and edit still open the web signed in through
 * `openWebSignedIn` (NP-121) — see `programCreateDestination` at the bottom of
 * this file, which is the one place that decision is made.
 *
 * FOUR RULES TRAVEL WITH EVERY READER OF THIS MODULE:
 *
 *   • read `canCreate`, never `allowed` and never `limit - used`. `allowed` is
 *     true for a capped free member on purpose so they can still edit and
 *     DELETE what they own; the kill-switch and the admin bypass live inside
 *     the server's `canCreate` calculation.
 *   • `enforced === false` (or an unknown snapshot) means NO lock, NO counter
 *     and NO plan card — `useEntitlements().canCreate()` already answers true
 *     there, so the create control stays a create control.
 *   • deleting frees the allowance AT ONCE. The caller refreshes the shared
 *     entitlements snapshot after a delete (NP-049's `refresh()`), or the 60s
 *     TTL keeps the create control locked at a cap the member just cleared —
 *     and deleting is the only way back under an inventory limit.
 *   • a program a trainer shared with the member (`isOwner === false`) can be
 *     enrolled in but NOT edited or deleted. Staff-only sharing to members
 *     (`POST /api/programs/[programId]/share`, trainer or admin) stays on the
 *     web entirely.
 */

import type { CustomProgram } from "@become/api-client";

/** The web paths create/edit open, signed in, through `openWebSignedIn`. */
export const CUSTOM_PROGRAM_CREATE_PATH = "/dashboard/programs/new";

export function customProgramEditPath(programId: string): string {
  return `/dashboard/programs/${encodeURIComponent(programId)}/edit`;
}

/**
 * One row of `GET /api/programs/custom`, as the My programs screen renders it.
 * `program_id` is the address (rule 2 of the program routes); `_id` is the
 * fallback when a projection omits it.
 */
export interface CustomProgramSummary {
  id: string;
  name: string;
  description: string;
  durationWeeks?: number;
  trainingDaysPerWeek?: number;
  goal?: string;
  tags?: string[];
  /** False when a trainer/admin shared this with the viewer — enrol, no edit. */
  isOwner: boolean;
  sharedByName?: string;
}

export function toCustomProgramSummary(
  raw: CustomProgram,
): CustomProgramSummary {
  return {
    id: raw.program_id ?? raw._id ?? "",
    name: raw.name || "Untitled Program",
    description: raw.description ?? "",
    ...(raw.duration_weeks !== undefined
      ? { durationWeeks: raw.duration_weeks }
      : {}),
    ...(raw.training_days_per_week !== undefined
      ? { trainingDaysPerWeek: raw.training_days_per_week }
      : {}),
    ...(raw.goal !== undefined ? { goal: raw.goal } : {}),
    ...(raw.tags !== undefined ? { tags: raw.tags } : {}),
    isOwner: raw.isOwner !== false,
    ...(raw.sharedByName !== undefined
      ? { sharedByName: raw.sharedByName }
      : {}),
  };
}

/** May this member edit/delete this row? Only what they own. */
export function canEditCustomProgram(program: CustomProgramSummary): boolean {
  return program.isOwner;
}

/** Delete path for one owned custom program. */
export function customProgramDeletePath(programId: string): string {
  return `/api/programs/custom/${encodeURIComponent(programId)}`;
}

// ─── WHERE "CREATE" AND "EDIT" GO (NP-168) ──────────────────────────────────

/**
 * Does THIS build carry the FULL builder?
 *
 * NP-168 built the frame: program details, phases, sessions with their day
 * labels and titles, create, update and the local draft. NP-171 adds the thing
 * a program is actually made of — the exercise rows, with search, the
 * prescription fields and custom exercises. NP-172 adds their order and
 * grouping (drag reorder plus superset/circuit/triset/giant-set/EMOM/AMRAP
 * blocks with a label, rest and rounds).
 *
 * Until the rows landed, a member sent to the native builder could save a
 * program with no exercises in it, which is strictly worse than the web editor
 * they have today. So the member-facing link only moves off the web on a build
 * that has the rows, and this is the one switch that moves it: NP-171 flips it
 * to `true` and every caller below follows. The screens themselves shipped
 * with NP-168 (`app/(app)/(tabs)/programming/new.tsx`,
 * `app/(app)/(tabs)/programming/[id]/edit.tsx`) so the flip is a one-line
 * change rather than a second port.
 */
export const NATIVE_BUILDER_HAS_EXERCISE_ROWS = true;

/** The native builder's own routes. */
export const NATIVE_PROGRAM_CREATE_ROUTE = "/(tabs)/programming/new";

export function nativeProgramEditRoute(programId: string): string {
  return `/(tabs)/programming/${encodeURIComponent(programId)}/edit`;
}

/**
 * Where a "Create"/"Edit" tap should land: a native route, or a web page
 * opened signed in (NP-121). One decision, so the two call sites — the My
 * programs list and a program's own screen — cannot disagree.
 */
export type ProgramBuilderDestination =
  | { surface: "native"; route: string }
  | { surface: "web"; path: string };

export function programCreateDestination(
  hasExerciseRows: boolean = NATIVE_BUILDER_HAS_EXERCISE_ROWS,
): ProgramBuilderDestination {
  return hasExerciseRows
    ? { surface: "native", route: NATIVE_PROGRAM_CREATE_ROUTE }
    : { surface: "web", path: CUSTOM_PROGRAM_CREATE_PATH };
}

export function programEditDestination(
  programId: string,
  hasExerciseRows: boolean = NATIVE_BUILDER_HAS_EXERCISE_ROWS,
): ProgramBuilderDestination {
  return hasExerciseRows
    ? { surface: "native", route: nativeProgramEditRoute(programId) }
    : { surface: "web", path: customProgramEditPath(programId) };
}
