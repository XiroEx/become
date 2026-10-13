/**
 * The ONE list of Recipe fields a member is allowed to supply.
 *
 * Same class of bug as lib/programFields.ts, found while auditing for it:
 * POST /api/nutrition/recipes did `Recipe.create({ ...body, ... })` and PUT
 * /api/nutrition/recipes/[id] did `Object.assign(recipe, body)`, so every key
 * in the request body reached the model. `createdBy` (ownership), `usageCount`
 * (ranking — recipes sort by it, so it is a self-promotion lever) and
 * `savedFoodId` (the recipe ↔ Food link that POST .../save-as-food owns, and
 * which the "Save or Log" affordance is driven by) were all writable from a
 * request.
 *
 * These are not privilege escalation the way `sharedWith` was — both routes are
 * already owner-scoped — but they are the same shape, and the create route
 * spread the body before ANY ownership pinning, so the fix is the same:
 * allowlist, never deny-list. components/nutrition/RecipeForm.tsx already sends
 * exactly these keys, so nothing user-visible changes.
 */
export const RECIPE_INPUT_FIELDS = [
  'name',
  'description',
  'category',
  'servings',
  'ingredients',
  'instructions',
  'prepTime',
  'cookTime',
  'totalsPerServing',
  'gramsPerServing',
  'mlPerServing',
  'tags',
  'isPublic',
  'imageUrl',
] as const

export type RecipeInputField = (typeof RECIPE_INPUT_FIELDS)[number]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pickRecipeFields<T extends Record<string, any>>(
  input: T | null | undefined,
): Partial<Pick<T, RecipeInputField & keyof T>> {
  const out: Record<string, unknown> = {}
  if (!input || typeof input !== 'object') {
    return out as Partial<Pick<T, RecipeInputField & keyof T>>
  }
  for (const key of RECIPE_INPUT_FIELDS) {
    const value = input[key]
    if (value !== undefined) out[key] = value
  }
  return out as Partial<Pick<T, RecipeInputField & keyof T>>
}

/** Diagnostic: which keys of a body would be dropped. Used by the tests. */
export function rejectedRecipeFields(
  input: Record<string, unknown> | null | undefined,
): string[] {
  if (!input || typeof input !== 'object') return []
  const allowed = new Set<string>(RECIPE_INPUT_FIELDS)
  return Object.keys(input).filter((k) => !allowed.has(k))
}
