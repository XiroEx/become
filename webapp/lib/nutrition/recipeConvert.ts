/**
 * Who may turn a Recipe into a Meal — and what that does to the recipe.
 *
 * POST /api/nutrition/recipes/[id]/to-meal is documented as a MOVE (commit
 * 6e78648): the meal replaces the recipe, so the recipe, its image and the
 * recipeId back-pointers are dropped once the meal exists. That is correct for
 * the OWNER and only for the owner.
 *
 * The route used to authorise with `if (!isOwner && !recipe.isPublic) 403`,
 * which is a READ check — it passes for every public recipe. Recipes default to
 * `isPublic: true` (models/Recipe.ts) and GET /api/nutrition/recipes lists
 * other members' public recipes, so the convert button on
 * /dashboard/recipes/[id] was reachable for recipes the caller did not own, and
 * pressing it deleted the OWNER's recipe and image while the caller kept the
 * meal. Verified in production against two isolated accounts.
 *
 * The fix keeps the affordance and removes the destruction: a non-owner gets a
 * COPY. Refusing outright was the alternative, but it would break a button that
 * is visible on every public recipe in the app, and "save someone else's public
 * recipe as one of my meals" is a coherent, non-destructive product action —
 * whereas deleting a stranger's data can never be one. Destruction is now
 * conditioned on ownership rather than on a read-access predicate, so a future
 * widening of who may READ a recipe cannot re-open this.
 *
 * Kept as a pure function so the decision is testable without a database, and
 * so there is exactly one place that answers "may this delete anything".
 */

export type RecipeConvertMode =
  /** The caller owns it: create the meal, then remove the recipe (today's behaviour). */
  | 'move'
  /** The caller may read it but does not own it: create the meal, delete NOTHING. */
  | 'copy'
  /** Not the caller's, and not public: refuse. */
  | 'forbidden'

export interface RecipeConvertSubject {
  createdBy?: { toString(): string } | null
  isPublic?: boolean | null
}

/**
 * `move` requires PROVEN ownership; everything else falls through to a
 * non-destructive outcome. An ownerless recipe is never a `move`, so a legacy
 * row with no `createdBy` can never be deleted by whoever happens to open it.
 */
export function recipeConvertMode(
  recipe: RecipeConvertSubject | null | undefined,
  userId: string | undefined | null,
): RecipeConvertMode {
  if (!recipe) return 'forbidden'
  const owner = recipe.createdBy ? recipe.createdBy.toString() : ''
  if (userId && owner && owner === userId) return 'move'
  if (recipe.isPublic === true) return 'copy'
  return 'forbidden'
}

/** The single predicate the route uses to decide whether to delete anything. */
export function convertDeletesSource(mode: RecipeConvertMode): boolean {
  return mode === 'move'
}
