/**
 * WHO OWNS A FOOD — and it has to be the same answer the allowance uses.
 *
 * A Food carries two ids and they mean different things:
 *
 *   createdBy  — whoever's request materialised the row. Stamped on every
 *                manual import, including the two UNGATED ones that exist so a
 *                free member can log a USDA/OpenFoodFacts hit
 *                (POST /api/nutrition/foods/import, the barcode scanner).
 *   authoredBy — the member who deliberately AUTHORED a custom food through
 *                one of the three gated create surfaces. This is the field the
 *                free custom-foods allowance counts
 *                (lib/allowances.ts: `Food.countDocuments({ authoredBy })`).
 *
 * The split was load-bearing for the count and accidental for authorisation:
 * PATCH and DELETE both authorised on `createdBy` alone. An inventory cap is
 * only humane because deleting frees a slot, so a row charged to one member and
 * deletable only by another is a member locked out of creating with no way back
 * — and that is not hypothetical. `authoredBy` was writable from the PATCH body
 * until the allowlist landed (lib/nutrition/foodFields.ts), and three calls of
 * `{"authoredBy": "<victim id>"}` filled a stranger's quota with rows their own
 * delete answered 403 on. Fixing the write path stops new damage; this fixes the
 * asymmetry that made the damage permanent, and un-sticks the rows already out
 * there.
 *
 * THE INVARIANT, in one line: whoever the slot is charged to can always delete
 * the row and get the slot back. So ownership is EITHER id, and every
 * member-facing food mutation asks this one function.
 */

export interface FoodOwnershipFields {
  createdBy?: unknown
  authoredBy?: unknown
}

function idString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  // ObjectId, string, or a populated doc — toString() is the common shape.
  const s = typeof value === 'string' ? value : String(value)
  return s.length > 0 && s !== 'null' && s !== 'undefined' && s !== '[object Object]' ? s : null
}

/** Every member this food is attributed to. Ordinarily one, sometimes empty. */
export function foodOwnerIds(food: FoodOwnershipFields | null | undefined): string[] {
  if (!food) return []
  const ids = [idString(food.createdBy), idString(food.authoredBy)]
  return [...new Set(ids.filter((id): id is string => id !== null))]
}

/**
 * May this member edit or delete this food?
 *
 * True for the creator AND for the member the custom-foods slot is charged to.
 * Admin is a separate, database-confirmed check (lib/adminAuth.ts) and is never
 * folded in here — a role question does not belong in an ownership predicate.
 */
export function isFoodOwner(
  food: FoodOwnershipFields | null | undefined,
  userId: string | null | undefined
): boolean {
  if (!userId) return false
  return foodOwnerIds(food).includes(userId)
}
