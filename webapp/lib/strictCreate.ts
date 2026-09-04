/**
 * Refuse to write a field that is not a schema path.
 *
 * Mongoose strict mode (the default) silently DROPS an unknown top-level key
 * on a create. That is not a warning, a validation error or a log line — the
 * document is written without it and every read afterwards is missing a field
 * the calling code believes it stored.
 *
 * POST /api/meal-logs/combine did exactly this:
 *
 *     Meal.create({ user: auth.userId, name, items, totalNutrition })
 *
 * `user` is a path on MealLog, not on Meal, where the owner field is
 * `createdBy`. Mongoose dropped it, so every meal saved through combine landed
 * with NO owner at all. Two consequences, both reproduced on production:
 *
 *   • the free 3-meal allowance counts `Meal.countDocuments({ createdBy })`,
 *     so an ownerless meal was never counted — five successive combine-saves
 *     from a 0/3 baseline all returned 201 with used still 0;
 *   • GET /api/meals?mine=true filters on `createdBy` and DELETE checks it, so
 *     the meal was invisible to its creator and impossible to delete. Removing
 *     the rows took direct database access.
 *
 * A deny-list did not fail here and an allowlist would not have caught it: the
 * field was in the code, spelled confidently, and simply belonged to a
 * different model. The only thing that can catch that mechanically is the
 * schema itself, so the check is derived from the schema and cannot go stale:
 * add a path and it is accepted automatically, misspell one and the create
 * throws instead of quietly losing the value.
 *
 * TOP-LEVEL KEYS ONLY, deliberately. Nested subdocument keys go through their
 * own schemas and Mixed paths accept anything by design, so recursing would
 * report false positives on paths that are legitimately open. The class of bug
 * this exists for — a whole field addressed to the wrong model — is always
 * top-level.
 *
 * A schema declared `strict: false` opts out: there, an unknown key is stored
 * rather than dropped, so there is nothing silent to catch.
 */

export interface SchemaLike {
  /** Mongoose Schema#pathType: 'real' | 'nested' | 'virtual' | 'adhocOrUndefined'. */
  pathType(path: string): string
  options?: { strict?: boolean | 'throw' }
}

export interface ModelLike {
  modelName?: string
  schema: SchemaLike
}

type CreatableModel = ModelLike & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create(doc: any): Promise<any>
}

export class UnknownSchemaPathError extends Error {
  readonly modelName: string
  readonly paths: string[]

  constructor(modelName: string, paths: string[]) {
    super(
      `${modelName}: refusing to write ${paths.map((p) => `"${p}"`).join(', ')} — ` +
        'not a path on this schema. Mongoose would drop it silently.',
    )
    this.name = 'UnknownSchemaPathError'
    this.modelName = modelName
    this.paths = paths
  }
}

/** Which top-level keys of `doc` this model would silently drop. */
export function unknownSchemaPaths(
  model: ModelLike,
  doc: Record<string, unknown> | null | undefined,
): string[] {
  if (!doc || typeof doc !== 'object') return []
  if (model.schema.options?.strict === false) return []
  return Object.keys(doc).filter((key) => model.schema.pathType(key) === 'adhocOrUndefined')
}

/** Throw if this write would lose a field. */
export function assertKnownSchemaPaths(
  model: ModelLike,
  doc: Record<string, unknown> | null | undefined,
): void {
  const unknown = unknownSchemaPaths(model, doc)
  if (unknown.length > 0) {
    throw new UnknownSchemaPathError(model.modelName ?? 'Model', unknown)
  }
}

/**
 * `Model.create`, minus the silent drop. Use it on every create that pins
 * ownership or any other field the app later reads back to make a decision.
 */
export async function createStrict<T = unknown>(
  model: CreatableModel,
  doc: Record<string, unknown>,
): Promise<T> {
  assertKnownSchemaPaths(model, doc)
  return (await model.create(doc)) as T
}
