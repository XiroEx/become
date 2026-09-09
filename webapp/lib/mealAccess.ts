// ---------------------------------------------------------------------------
// "May this caller READ this meal template?" — one predicate.
//
// A Meal is a private row unless its author published it (`isPublic`) or staff
// blessed it into the catalogue (`isVerified`). The rule was already written
// out, identically, in three route handlers:
//
//   app/api/meals/[id]/route.ts            (GET)
//   app/api/meals/[id]/log/route.ts        (POST)
//   app/api/meal-plans/bulk-from-meal/route.ts
//
// and MISSING from a fourth — `POST /api/meal-plans` with a `mealId` did a bare
// `Meal.findById(body.mealId)` and snapshotted `meal.items` into the caller's
// own plan, which handed any authenticated member another member's private meal
// name and its full per-item nutrition. This module is that rule extracted so
// the fourth site cannot be written without it.
//
// Two properties are load-bearing and are why this is not a one-liner:
//
//  1. **Admin is confirmed against the database, never read off the token
//     claim** (`isVerifiedAdmin`) — a demoted admin must stop seeing other
//     members' private meals immediately, and a token minted before the
//     demotion still carries `role: 'admin'` until it expires.
//  2. **Ordinary members never pay for that read.** The public / verified /
//     owner branches all answer before the admin lookup is reached, and
//     `isVerifiedAdmin` itself short-circuits a token that does not even claim
//     admin. So the hot path stays a single `findById`.
//
// A denial is reported by the CALLER as 404, not 403: "not found" and "not
// yours" must be indistinguishable, or the error code itself confirms that a
// meal with that id exists.
// ---------------------------------------------------------------------------

import { isVerifiedAdmin, type AdminClaimSubject } from '@/lib/adminAuth'

/** The only fields of a Meal the decision reads. */
export interface MealAccessSubject {
  createdBy?: { toString(): string } | string | null
  isPublic?: boolean
  isVerified?: boolean
}

/** Did this caller author the meal? */
export function isMealOwner(
  meal: MealAccessSubject,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false
  return meal.createdBy?.toString() === userId
}

/**
 * Pure form of the rule: public OR verified OR owner OR admin.
 *
 * `isAdmin` is a parameter rather than a lookup so the predicate can be
 * exercised without a database — see tests/unit/security/mealAccess.test.ts.
 */
export function canReadMeal(
  meal: MealAccessSubject,
  userId: string | null | undefined,
  isAdmin: boolean,
): boolean {
  return !!meal.isPublic || !!meal.isVerified || isMealOwner(meal, userId) || isAdmin
}

/**
 * The form a route handler uses: same rule, with the admin half resolved
 * against the User row and only when the cheaper branches have all failed.
 */
export async function canReadMealFor(
  meal: MealAccessSubject,
  auth: AdminClaimSubject | null | undefined,
): Promise<boolean> {
  if (canReadMeal(meal, auth?.userId, false)) return true
  return isVerifiedAdmin(auth)
}
