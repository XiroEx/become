/**
 * The ONE list of Program fields a member is allowed to supply.
 *
 * POST /api/programs/custom used to do `ProgramModel.create({ ...dehydrated,
 * isCustom: true, createdBy })` — the whole request body, spread straight into
 * the model. Program gained a `sharedWith` field (POST
 * /api/programs/[programId]/share, gated to trainers and admins by
 * requireTrainerOrAdmin) and nothing on the create path was updated, so a
 * plain `role: 'user'`, `tier: 'free'` account could put its own program into
 * any other member's "My Programs" list just by including `sharedWith` in the
 * body. Verified in production against two isolated accounts.
 *
 * A deny-list ("delete body.sharedWith") is what failed here: it was never
 * updated when the privileged field was added, and the next privileged field
 * would fail exactly the same way. This is an ALLOWLIST, so a new Program field
 * is unreachable from a request body until someone deliberately adds it here.
 *
 * Deliberately NOT in the list, and why:
 *   sharedWith   — the sharing grant. Only the share route may write it.
 *   isCustom     — pinned true by the create route.
 *   createdBy    — ownership; pinned to the authenticated caller.
 *   program_id   — server-minted (`custom-<user>-<slug>-<ts>`), never accepted.
 *   coverImage / coverParallax / coverZoom / coverPosition{X,Y}
 *                — written by the admin-only program image route.
 *   _id, __v, createdAt, updatedAt — Mongo's, not the client's.
 */
export const CUSTOM_PROGRAM_INPUT_FIELDS = [
  'name',
  'description',
  'duration_weeks',
  'training_days_per_week',
  'goal',
  'target_user',
  'equipment',
  'tags',
  'phases',
] as const

export type CustomProgramInputField = (typeof CUSTOM_PROGRAM_INPUT_FIELDS)[number]

/**
 * Copy across only the allowlisted keys. `undefined` values are dropped so a
 * caller cannot use the picker to blank a field it did not send, and so the
 * result is safe to spread over an existing document.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pickCustomProgramFields<T extends Record<string, any>>(
  input: T | null | undefined,
): Partial<Pick<T, CustomProgramInputField & keyof T>> {
  const out: Record<string, unknown> = {}
  if (!input || typeof input !== 'object') {
    return out as Partial<Pick<T, CustomProgramInputField & keyof T>>
  }
  for (const key of CUSTOM_PROGRAM_INPUT_FIELDS) {
    const value = input[key]
    if (value !== undefined) out[key] = value
  }
  return out as Partial<Pick<T, CustomProgramInputField & keyof T>>
}

/** Diagnostic: which keys of a body would be dropped. Used by the tests. */
export function rejectedProgramFields(
  input: Record<string, unknown> | null | undefined,
): string[] {
  if (!input || typeof input !== 'object') return []
  const allowed = new Set<string>(CUSTOM_PROGRAM_INPUT_FIELDS)
  return Object.keys(input).filter((k) => !allowed.has(k))
}
