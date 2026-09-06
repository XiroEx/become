/**
 * WHO OWNS A FOOD — and it has to be the same answer the allowance uses.
 *
 * A Food carries two ids and they mean different things:
 *
 *   createdBy  — whoever's request materialised the row. Stamped on every
 *                import, INCLUDING a USDA / OpenFoodFacts catalogue row pulled
 *                in on someone's behalf: `importFromUSDA` and
 *                `importFromOpenFoodFacts` both stamp it, and the food search
 *                route's background import (`after(() =>
 *                backgroundImportExternals(paged, authResult.userId, …))`)
 *                passes the SEARCHING member's id. models/Food.ts calls it
 *                "provenance, not ownership" and means it.
 *   authoredBy — the member who deliberately AUTHORED a custom food through
 *                one of the three gated create surfaces. This is the field the
 *                free custom-foods allowance counts
 *                (lib/allowances.ts: `Food.countDocuments({ authoredBy })`).
 *
 * `createdBy` alone was treated as ownership, and that made the SHARED
 * CATALOGUE writable by whoever happened to search for a food first. Member A
 * types "chicken breast"; the background import mints the USDA rows with
 * `createdBy: A`; A may now PATCH them — the field allowlist permits
 * `variants`, so every calorie value on a row the whole app logs against is
 * theirs to set — or DELETE them, which runs `clearFoodReferences` and
 * `$unset`s `foodId` from every OTHER member's MealLogs, MealPlans, Meals,
 * Recipes, PlateScans and savedFoods. No tier, no kill-switch, every member.
 *
 * So `createdBy` only confers ownership on a row whose `source` is `manual` —
 * a row that exists because a person entered it, not because a catalogue was
 * mirrored. USDA and OpenFoodFacts rows are owned by nobody but an admin.
 *
 * `authoredBy` stays the PRIMARY key and is unconditional, because of the
 * invariant below. It was writable from the PATCH body until the allowlist
 * landed (lib/nutrition/foodFields.ts), and three calls of
 * `{"authoredBy": "<victim id>"}` filled a stranger's quota with rows their own
 * delete answered 403 on. Those rows are still in the database.
 *
 * THE INVARIANT, in one line: whoever the slot is charged to can always delete
 * the row and get the slot back. The slot is charged on `authoredBy`, and
 * `authoredBy` is only ever stamped by `importManualFood`, which hardcodes
 * `source: 'manual'` — so the manual-source qualifier can never strand a payer.
 *
 * Admin is a separate, database-confirmed check (lib/adminAuth.ts) and is never
 * folded in here — a role question does not belong in an ownership predicate.
 */

export interface FoodOwnershipFields {
  createdBy?: unknown
  authoredBy?: unknown
  /**
   * models/Food.ts: `'usda' | 'openfoodfacts' | 'manual'`, and `required` on
   * the schema — so a document read for a mutation always carries it. Anything
   * that is not exactly `'manual'` (including a missing value on a partial
   * projection) fails CLOSED: `createdBy` confers nothing.
   */
  source?: unknown
}

function idString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  // ObjectId, string, or a populated doc — toString() is the common shape.
  const s = typeof value === 'string' ? value : String(value)
  return s.length > 0 && s !== 'null' && s !== 'undefined' && s !== '[object Object]' ? s : null
}

/** A person entered this row; it did not arrive from a mirrored catalogue. */
export function isMemberEnteredFood(food: FoodOwnershipFields | null | undefined): boolean {
  return food?.source === 'manual'
}

/**
 * Every member this food is attributed to. Ordinarily one, often empty — every
 * USDA and OpenFoodFacts row in the catalogue is owned by nobody.
 */
export function foodOwnerIds(food: FoodOwnershipFields | null | undefined): string[] {
  if (!food) return []
  // authoredBy first: it is the primary key and the one the slot is charged on.
  const ids = [idString(food.authoredBy)]
  if (isMemberEnteredFood(food)) ids.push(idString(food.createdBy))
  return [...new Set(ids.filter((id): id is string => id !== null))]
}

/**
 * May this member edit or delete this food?
 *
 * True for the member the custom-foods slot is charged to, and for whoever
 * entered a manual row. NEVER true for a USDA/OpenFoodFacts catalogue row —
 * `createdBy` on one of those names the member whose search happened to pull it
 * in, which is provenance and not a licence to rewrite shared data.
 */
export function isFoodOwner(
  food: FoodOwnershipFields | null | undefined,
  userId: string | null | undefined
): boolean {
  if (!userId) return false
  return foodOwnerIds(food).includes(userId)
}
