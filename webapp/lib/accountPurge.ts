// The irreversible half of account deletion: what actually leaves the database
// when the restore window closes.
//
// IT IS A PLAN, NOT A FUNCTION FULL OF DELETES. Every collection that names a
// member appears below as DATA — which model, which field, and what happens to
// the row — for three reasons:
//
//   1. A reviewer (ours, Apple's, or a regulator asking under GDPR Article 17)
//      can read what deletion covers without reading control flow.
//   2. `tests/unit/account/deletion.test.ts` walks `models/` and fails the
//      build when a model with a member field is neither purged nor explicitly
//      exempted with a reason. A new collection added next month cannot
//      silently start surviving deletion.
//   3. The member-facing copy (lib/accountDeletion.ts DELETION_COVERS /
//      DELETION_EXCEPTIONS, Privacy Policy section 13) is checked against this
//      list rather than against someone's memory of it.
//
// THREE ACTIONS, AND THE DIFFERENCE MATTERS
//
//   delete  — the rows are the member's, and they go.
//   detach  — the row is shared: other members' logs point at it, and deleting
//             it would break THEIR history. The member's id is unset, so the
//             row survives with nothing linking it to a person. This is what
//             the Privacy Policy means by "separated from you rather than
//             deleted", and it is the only honest way to keep a food catalogue
//             usable.
//   pull    — the member's id is one entry in an array on somebody else's row
//             (a group's member list). Pull it; leave the row.
//
// ORDER IS PART OF THE PLAN: the User row is deleted LAST. If the run dies
// half way, a user document still carrying `deletion.purgeAfter` in the past is
// still selected by the next run, so the purge resumes. Deleting the user first
// would strand every remaining row with nothing to find it by.

export type PurgeAction = 'delete' | 'detach' | 'pull'

/** Which of the member's identifiers the field holds. */
export type PurgeMatch = 'userId' | 'email'

export interface PurgeStep {
  /** Model name as registered with mongoose (see models/*.ts). */
  model: string
  /** The path naming the member. */
  field: string
  action: PurgeAction
  match?: PurgeMatch
  /** Extra clauses ANDed into the filter — e.g. "only the rows nobody else can
   *  see". */
  filter?: Record<string, unknown>
  /** Why this row is treated this way. Read by humans, not by code. */
  note?: string
}

/**
 * Models that carry no member identifier, or that are deliberately left alone.
 * Listing them is what lets the coverage test be exhaustive instead of a
 * best-effort grep.
 */
/**
 * Rows that belong to a member through SOMETHING ELSE. An image is keyed by
 * the meal it illustrates, not by a member, so no filter on `userId` can find
 * it — and a purge that deleted the meal and left the photo would leave the
 * one category of personal data a member is most likely to mean when they say
 * "delete my photos".
 *
 * Each cascade runs BEFORE its parent step, while the parent rows still exist
 * to be found by. The parent filter is the parent step's filter, so a meal that
 * is DETACHED rather than deleted (published to the shared library) keeps its
 * picture — the row is staying, and a card with a missing image is a broken
 * row for everyone else.
 */
export interface PurgeCascade {
  parent: string
  parentField: string
  /** Same clauses as the parent DELETE step, so the two select the same rows. */
  parentFilter?: Record<string, unknown>
  child: string
  childField: string
  note?: string
}

export const PURGE_CASCADES: readonly PurgeCascade[] = [
  {
    parent: 'Meal',
    parentField: 'createdBy',
    parentFilter: { isPublic: { $ne: true } },
    child: 'MealImage',
    childField: 'mealId',
    note: 'Meal photos, stored as binary keyed by mealId.',
  },
  {
    parent: 'Recipe',
    parentField: 'createdBy',
    parentFilter: { isPublic: { $ne: true } },
    child: 'RecipeImage',
    childField: 'recipeId',
  },
  {
    parent: 'Program',
    parentField: 'createdBy',
    parentFilter: { $or: [{ sharedWith: { $size: 0 } }, { sharedWith: { $exists: false } }] },
    child: 'ProgramImage',
    childField: 'programId',
  },
] as const

export const PURGE_EXEMPT: Readonly<Record<string, string>> = {
  Exercise: 'Catalogue rows. Custom exercises are detached below, not deleted — other members’ programs reference them by slug.',
  OpenFoodFact: 'A cache of a public third-party database. It holds no member data.',
  StripeEvent: 'Webhook idempotency claims: an event id and a status, no member field. Billing records we must keep anyway.',
  TierResweepRun: 'An operational change log of tier moves, by id only. Kept as the audit trail for a billing decision.',
  SharedSession: 'A frozen, token-addressed snapshot with no owner field; the member’s copy lives in MindSession and goes with it.',
  MealImage: 'Keyed by mealId, not by member — deleted by the Meal cascade above.',
  ProgramImage: 'Keyed by programId, not by member — deleted by the Program cascade above.',
  RecipeImage: 'Keyed by recipeId, not by member — deleted by the Recipe cascade above.',
  User: 'Deleted last, by the runner itself — see PURGE_PLAN’s closing note.',
}

/**
 * THE PLAN. Ordered; the User row is not in it (the runner deletes that last).
 */
export const PURGE_PLAN: readonly PurgeStep[] = [
  // ── The account's own records ──────────────────────────────────────────
  { model: 'UserProgress', field: 'userId', action: 'delete', note: 'Weight, mood, workout logs, streaks.' },
  { model: 'Schedule', field: 'userId', action: 'delete' },
  { model: 'Goal', field: 'userId', action: 'delete' },
  { model: 'StateLog', field: 'userId', action: 'delete' },
  { model: 'StreakCredit', field: 'userId', action: 'delete' },
  { model: 'Sleep', field: 'userId', action: 'delete' },
  { model: 'Journal', field: 'userId', action: 'delete' },
  { model: 'DailyWin', field: 'userId', action: 'delete' },
  { model: 'DailyContentLog', field: 'userId', action: 'delete' },
  { model: 'DisciplineChallenge', field: 'userId', action: 'delete' },
  { model: 'Meditation', field: 'userId', action: 'delete' },
  { model: 'TutorialProgress', field: 'userId', action: 'delete' },
  { model: 'Feedback', field: 'userId', action: 'delete' },
  { model: 'AiRun', field: 'userId', action: 'delete', note: 'userId is a STRING here, not an ObjectId — see the model.' },
  { model: 'AllowanceUsage', field: 'userId', action: 'delete' },
  { model: 'InventoryClaim', field: 'userId', action: 'delete' },

  // ── Mind ───────────────────────────────────────────────────────────────
  { model: 'MindProgress', field: 'userId', action: 'delete' },
  { model: 'MindSession', field: 'userId', action: 'delete' },
  { model: 'MindJournal', field: 'userId', action: 'delete' },
  { model: 'MindNonNegotiable', field: 'userId', action: 'delete' },
  { model: 'Mission', field: 'userId', action: 'delete' },
  { model: 'IdentityProfile', field: 'userId', action: 'delete' },

  // ── Nutrition ──────────────────────────────────────────────────────────
  { model: 'MealLog', field: 'user', action: 'delete' },
  { model: 'MealPlan', field: 'user', action: 'delete' },
  { model: 'MealTagSchedule', field: 'user', action: 'delete' },
  { model: 'DayNutrition', field: 'userId', action: 'delete' },
  { model: 'NutritionGoal', field: 'userId', action: 'delete' },
  { model: 'PlateScan', field: 'user', action: 'delete', note: 'Meal photos sent to the estimator.' },
  { model: 'FoodFlag', field: 'userId', action: 'delete' },
  {
    model: 'Meal',
    field: 'createdBy',
    action: 'delete',
    filter: { isPublic: { $ne: true } },
    note: 'Their own meals. A meal they published to the shared library is detached instead.',
  },
  { model: 'Meal', field: 'createdBy', action: 'detach', filter: { isPublic: true } },
  {
    model: 'Recipe',
    field: 'createdBy',
    action: 'delete',
    filter: { isPublic: { $ne: true } },
  },
  { model: 'Recipe', field: 'createdBy', action: 'detach', filter: { isPublic: true } },
  {
    model: 'Food',
    field: 'authoredBy',
    action: 'detach',
    note: 'The shared food catalogue. Other members’ logs reference these rows by id, so the authorship link goes and the row stays.',
  },
  { model: 'Food', field: 'createdBy', action: 'detach', note: 'Stamped on whoever first materialised a USDA/OFF row. Not ownership; still an identifier.' },

  // ── Training ───────────────────────────────────────────────────────────
  {
    model: 'Program',
    field: 'createdBy',
    action: 'delete',
    // An ABSENT sharedWith is not an empty array to Mongo: `$size: 0` matches
    // only a field that exists and is empty. Both clauses, or every program
    // written before sharing existed falls between the two steps and survives.
    filter: { $or: [{ sharedWith: { $size: 0 } }, { sharedWith: { $exists: false } }] },
    note: 'Programs they wrote and nobody else holds.',
  },
  {
    model: 'Program',
    field: 'createdBy',
    action: 'detach',
    filter: { sharedWith: { $exists: true, $not: { $size: 0 } } },
    note: 'A program already planted in someone else’s library. Deleting it would empty their shelf.',
  },
  { model: 'Program', field: 'sharedWith', action: 'pull', note: 'Grants pointing AT this member.' },
  { model: 'Exercise', field: 'createdBy', action: 'detach', note: 'Custom exercises are referenced by slug from other members’ programs.' },
  { model: 'ExerciseVideo', field: 'uploadedBy', action: 'detach' },

  // ── Social ─────────────────────────────────────────────────────────────
  { model: 'Message', field: 'senderId', action: 'delete', note: 'Everything they wrote in chat.' },
  { model: 'Conversation', field: 'participants', action: 'pull' },
  { model: 'CommunityGroup', field: 'createdBy', action: 'detach' },
  { model: 'CommunityGroup', field: 'memberIds', action: 'pull' },
  { model: 'CommunityGroup', field: 'adminIds', action: 'pull' },
  { model: 'CommunityEvent', field: 'createdBy', action: 'detach' },
  { model: 'CommunityEvent', field: 'attendeeIds', action: 'pull' },
  { model: 'Share', field: 'ownerId', action: 'delete', note: 'Public share snapshots they minted.' },

  // ── Notifications and sign-in ──────────────────────────────────────────
  {
    model: 'PushSubscription',
    field: 'userId',
    action: 'delete',
    note: 'Web endpoints AND native Expo push tokens. Already dropped at request time; repeated here so a purge is complete on its own.',
  },
  {
    model: 'MagicLink',
    field: 'email',
    action: 'delete',
    match: 'email',
    note: 'Unused sign-in links. They expire in 15 minutes anyway; a purge that left one behind would leave a way in.',
  },
] as const

// ─── The runner ──────────────────────────────────────────────────────────────

/** The minimum of a mongoose Model this needs. Narrow on purpose: the route
 *  hands it real models, a unit test hands it fakes that record their calls. */
export interface PurgeableModel {
  deleteMany(filter: Record<string, unknown>): Promise<{ deletedCount?: number }>
  updateMany(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<{ modifiedCount?: number }>
  /** Only the cascade parents need this. Optional so a fake in a test that
   *  exercises the plan alone does not have to implement it. */
  distinct?(field: string, filter: Record<string, unknown>): Promise<unknown[]>
}

export interface PurgeDeps {
  /** Model name → model. Missing names are reported, never thrown: a purge
   *  that stops half way because one collection was renamed leaves a member
   *  half-deleted, which is worse than a loud report. */
  models: Record<string, PurgeableModel | undefined>
  userId: string
  /** Needed for the MagicLink step, which is keyed by address. */
  email?: string | null
  /** The id in whatever form the driver expects (ObjectId for most rows).
   *  Defaults to the string, which is correct for the string-keyed models. */
  objectId?: unknown
}

export interface PurgeStepResult {
  model: string
  field: string
  action: PurgeAction
  affected: number
  skipped?: 'model_missing' | 'no_email'
  error?: string
}

export interface PurgeReport {
  userId: string
  steps: PurgeStepResult[]
  /** Rows deleted or modified across every step. */
  affected: number
  /** True when the User row itself was removed — i.e. the purge completed. */
  userDeleted: boolean
  errors: number
}

function valueFor(step: PurgeStep, deps: PurgeDeps): unknown {
  if ((step.match ?? 'userId') === 'email') return deps.email
  // An ObjectId-keyed collection needs the cast value; the string-keyed ones
  // (AiRun.userId, Exercise.createdBy) need the string. Mongoose casts per
  // schema path, so handing it the ObjectId when the path is a String throws.
  return deps.objectId ?? deps.userId
}

function filterFor(step: PurgeStep, value: unknown): Record<string, unknown> {
  const base: Record<string, unknown> = { [step.field]: value }
  return step.filter ? { ...base, ...step.filter } : base
}

/**
 * Run the plan for one member. Every step is independent and a failure is
 * recorded rather than thrown, so one broken collection cannot leave the rest
 * of a member's data in place. The caller decides what a partial run means;
 * the cron route leaves `deletion` set, so the next run retries.
 */
export async function purgeAccountData(deps: PurgeDeps): Promise<PurgeReport> {
  const steps: PurgeStepResult[] = []
  const value = deps.objectId ?? deps.userId

  // Cascades FIRST: they find their rows through the parent, and the parent is
  // about to be deleted by the plan below.
  for (const cascade of PURGE_CASCADES) {
    const parent = deps.models[cascade.parent]
    const child = deps.models[cascade.child]
    if (!parent?.distinct || !child) {
      steps.push({
        model: cascade.child,
        field: cascade.childField,
        action: 'delete',
        affected: 0,
        skipped: 'model_missing',
      })
      continue
    }
    try {
      const ids = await parent.distinct('_id', {
        [cascade.parentField]: value,
        ...(cascade.parentFilter ?? {}),
      })
      let affected = 0
      if (ids.length > 0) {
        const res = await child.deleteMany({ [cascade.childField]: { $in: ids } })
        affected = res.deletedCount ?? 0
      }
      steps.push({ model: cascade.child, field: cascade.childField, action: 'delete', affected })
    } catch (error) {
      steps.push({
        model: cascade.child,
        field: cascade.childField,
        action: 'delete',
        affected: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  for (const step of PURGE_PLAN) {
    const model = deps.models[step.model]
    if (!model) {
      steps.push({ model: step.model, field: step.field, action: step.action, affected: 0, skipped: 'model_missing' })
      continue
    }
    const stepValue = valueFor(step, deps)
    if (stepValue === undefined || stepValue === null || stepValue === '') {
      steps.push({ model: step.model, field: step.field, action: step.action, affected: 0, skipped: 'no_email' })
      continue
    }

    try {
      if (step.action === 'delete') {
        const res = await model.deleteMany(filterFor(step, stepValue))
        steps.push({ model: step.model, field: step.field, action: step.action, affected: res.deletedCount ?? 0 })
      } else if (step.action === 'detach') {
        const res = await model.updateMany(filterFor(step, stepValue), { $unset: { [step.field]: '' } })
        steps.push({ model: step.model, field: step.field, action: step.action, affected: res.modifiedCount ?? 0 })
      } else {
        const res = await model.updateMany(filterFor(step, stepValue), { $pull: { [step.field]: stepValue } })
        steps.push({ model: step.model, field: step.field, action: step.action, affected: res.modifiedCount ?? 0 })
      }
    } catch (error) {
      steps.push({
        model: step.model,
        field: step.field,
        action: step.action,
        affected: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const errors = steps.filter((s) => s.error).length

  // LAST, and only when everything else answered. A user row deleted while a
  // step was failing is a member whose data is unreachable AND undeleted.
  let userDeleted = false
  if (errors === 0) {
    const users = deps.models.User
    if (users) {
      const res = await users.deleteMany({ _id: deps.objectId ?? deps.userId })
      userDeleted = (res.deletedCount ?? 0) > 0
    }
  }

  return {
    userId: deps.userId,
    steps,
    affected: steps.reduce((sum, s) => sum + s.affected, 0),
    userDeleted,
    errors,
  }
}
