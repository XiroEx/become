/**
 * ─── MY PROGRAMS, ON THE PHONE (NP-135) ─────────────────────────────────────
 *
 * Native counterpart of `webapp/app/dashboard/programs/mine/MyProgramsClient.tsx`.
 * Members build their own programs on the web (3 on the free tier); natively
 * they need at least to find, enrol in and delete them. Building one is a
 * heavy editor, so create and edit stay web-only until the native builder
 * (NP-168, NP-171, NP-172) exists and open signed-in through `openWebSignedIn`
 * (NP-121).
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
