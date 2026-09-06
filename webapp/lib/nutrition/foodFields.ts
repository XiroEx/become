/**
 * The ONE list of Food fields a PATCH body may write, split member vs admin.
 *
 * PATCH /api/nutrition/foods/[id] did `Food.findByIdAndUpdate(id, { $set: body })`
 * behind a DENY-list:
 *
 *     if (!isAdmin) {
 *       delete body.isVerified; delete body.isFirstClass; delete body.usageCount
 *       delete body.createdBy;  delete body.source;       delete body.externalId
 *       delete body.externalDataType; delete body.slug
 *     }
 *
 * Everything the list did not name was writable by anyone who owned the row —
 * and `authoredBy` was added later and never added to the list. `authoredBy` is
 * the live count behind the free custom-foods allowance
 * (lib/allowances.ts: `Food.countDocuments({ authoredBy: userId })`), so a
 * member sitting at 3/3 could PATCH one of their OWN foods with
 * `{"authoredBy": null}` and mint another slot, over and over. Same failure
 * mode as the `sharedWith` leak on the program create path: a deny-list that
 * was not updated when a privileged field arrived.
 *
 * So: allowlist. The admin set is deliberately the member set plus EXACTLY the
 * eight fields the old deny-list named as admin-only — admins keep what they
 * had, and nobody gets the fields the deny-list forgot. Admin food editing has
 * its own surface (/api/admin/foods/[id]) and does not go through here.
 *
 * Never writable through this route, by anyone:
 *   authoredBy   — the allowance ledger; only a gated create surface stamps it.
 *   recipeId     — the recipe → food link, owned by save-as-food.
 *   barcode      — a GLOBAL key, not a property of your row. See below.
 *   verification / reviewFlag / needsReview / hiddenFromSearch / groupKey
 *                — owned by the verification and review pipelines, which have
 *                  their own provenance rules about who may overwrite what.
 *   _id, __v, createdAt, updatedAt — Mongo's.
 *
 * BARCODE was on the member list and had to come off. `barcode` is unique and
 * sparse (models/Food.ts) and it is the FIRST thing
 * GET /api/nutrition/foods/barcode resolves — `Food.findOne({ barcode })`, with
 * no check on `source`, ahead of OpenFoodFacts and USDA. So a member who could
 * write it could stamp a real UPC onto a row they control and every scan of
 * that product, for every member, would return their row instead of the real
 * product. It is not editable data; it is a claim on a namespace nobody here
 * owns. Barcodes are set ONLY by the server-sourced paths: an OFF/USDA import,
 * or the scanner materialising the code it just resolved against the live
 * OpenFoodFacts API. Admins curate them on their own surface,
 * PATCH /api/admin/foods/[id], which has its own allowlist.
 */
export const MEMBER_FOOD_INPUT_FIELDS = [
  'name',
  'brand',
  'category',
  'aliases',
  'variants',
  'imageUrl',
] as const

/** Named admin-only by the deny-list this replaces. Unchanged in effect. */
export const ADMIN_ONLY_FOOD_INPUT_FIELDS = [
  'isVerified',
  'isFirstClass',
  'usageCount',
  'createdBy',
  'source',
  'externalId',
  'externalDataType',
  'slug',
] as const

export type FoodInputField =
  | (typeof MEMBER_FOOD_INPUT_FIELDS)[number]
  | (typeof ADMIN_ONLY_FOOD_INPUT_FIELDS)[number]

export function allowedFoodFields(isAdmin: boolean): readonly string[] {
  return isAdmin
    ? [...MEMBER_FOOD_INPUT_FIELDS, ...ADMIN_ONLY_FOOD_INPUT_FIELDS]
    : MEMBER_FOOD_INPUT_FIELDS
}

/**
 * Copy across only what this caller may write. `undefined` is dropped so a
 * PATCH cannot blank a field it did not send.
 */
export function pickFoodFields(
  input: Record<string, unknown> | null | undefined,
  isAdmin: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!input || typeof input !== 'object') return out
  for (const key of allowedFoodFields(isAdmin)) {
    const value = input[key]
    if (value !== undefined) out[key] = value
  }
  return out
}

/** Diagnostic: which keys of a body would be dropped for this caller. */
export function rejectedFoodFields(
  input: Record<string, unknown> | null | undefined,
  isAdmin: boolean,
): string[] {
  if (!input || typeof input !== 'object') return []
  const allowed = new Set<string>(allowedFoodFields(isAdmin))
  return Object.keys(input).filter((k) => !allowed.has(k))
}
