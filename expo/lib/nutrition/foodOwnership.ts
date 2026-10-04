/**
 * WHO OWNS A FOOD — native port of `webapp/lib/nutrition/foodOwnership.ts`.
 *
 * A Food carries two ids and they mean different things:
 *
 *   createdBy  — whoever's request materialised the row. Stamped on every
 *                import, INCLUDING a USDA / OpenFoodFacts catalogue row pulled
 *                in on someone's behalf. Provenance, not ownership.
 *   authoredBy — the member who deliberately AUTHORED a custom food through
 *                one of the gated create surfaces. This is the field the free
 *                custom-foods allowance counts.
 *
 * So `createdBy` only confers ownership on a row whose `source` is `manual` —
 * a row that exists because a person entered it, not because a catalogue was
 * mirrored. USDA and OpenFoodFacts rows are owned by nobody but an admin.
 *
 * Admin is a separate, database-confirmed check on the route and stays a
 * separate disjunct on the screen: a role question does not belong in an
 * ownership predicate. The screen reads the role off its own session
 * (`useAuth().user.role`, which comes from `GET /api/auth/me`), exactly like
 * the web reads it off its own `/api/auth/me` load.
 */

export interface FoodOwnershipFields {
  createdBy?: unknown;
  authoredBy?: unknown;
  /**
   * `webapp/models/Food.ts`: `'usda' | 'openfoodfacts' | 'manual'`, and
   * `required` on the schema — so a document read for a mutation always
   * carries it. Anything that is not exactly `'manual'` (including a missing
   * value on a partial projection) fails CLOSED: `createdBy` confers nothing.
   */
  source?: unknown;
}

function idString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  // ObjectId, string, or a populated doc — toString() is the common shape.
  const s = typeof value === "string" ? value : String(value);
  return s.length > 0 &&
    s !== "null" &&
    s !== "undefined" &&
    s !== "[object Object]"
    ? s
    : null;
}

/** A person entered this row; it did not arrive from a mirrored catalogue. */
export function isMemberEnteredFood(
  food: FoodOwnershipFields | null | undefined,
): boolean {
  return food?.source === "manual";
}

/**
 * Every member this food is attributed to. Ordinarily one, often empty — every
 * USDA and OpenFoodFacts row in the catalogue is owned by nobody.
 */
export function foodOwnerIds(
  food: FoodOwnershipFields | null | undefined,
): string[] {
  if (!food) return [];
  // authoredBy first: it is the primary key and the one the slot is charged on.
  const ids = [idString(food.authoredBy)];
  if (isMemberEnteredFood(food)) ids.push(idString(food.createdBy));
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

/**
 * May this member edit or delete this food?
 *
 * True for the member the custom-foods slot is charged to, and for whoever
 * entered a manual row. NEVER true for a USDA/OpenFoodFacts catalogue row —
 * `createdBy` on one of those names the member whose search happened to pull
 * it in, which is provenance and not a licence to rewrite shared data.
 */
export function isFoodOwner(
  food: FoodOwnershipFields | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  return foodOwnerIds(food).includes(userId);
}

/**
 * The admin half of the screen's `canMutate`, kept out of `isFoodOwner` on
 * purpose — the route confirms admin against the database
 * (`lib/adminAuth.ts`), and a role is not ownership.
 */
export function isFoodAdminRole(role: unknown): boolean {
  return role === "admin";
}
