// What "delete my account" actually deletes, written down once.
//
// The list is DATA, not a sequence of hand-written deleteMany calls, for two
// reasons that have both burned other products:
//
//   1. A collection that is forgotten is invisible. A declarative plan can be
//      enumerated by a test and read by a reviewer, so "does deletion cover
//      journal entries?" is answered by looking rather than by grepping.
//   2. The Privacy Policy has to describe this exactly. One list means the
//      prose and the behaviour cannot drift apart silently.
//
// TWO ACTIONS, AND THE DIFFERENCE MATTERS LEGALLY
//   delete — rows that are only ever about this member. They go.
//   detach — rows other members' data points AT: an entry in the shared food
//            catalogue, a public program, a group somebody else is still in.
//            The member's id is cleared from them, which is erasure of the
//            personal data, while the shared record other people's history
//            depends on survives. GDPR Art. 17(1) is about the personal data,
//            not about breaking everyone else's logs.
//
// Ids are not all the same type. Most collections store an ObjectId; AiRun,
// Exercise and StreakCredit.createdBy store the hex STRING. A filter of the
// wrong type matches nothing and reports a cheerful zero, so each target says
// which it needs.

import mongoose from 'mongoose'

import AiRun from '@/models/AiRun'
import AllowanceUsage from '@/models/AllowanceUsage'
import CommunityEvent from '@/models/CommunityEvent'
import CommunityGroup from '@/models/CommunityGroup'
import Conversation from '@/models/Conversation'
import DailyContentLog from '@/models/DailyContentLog'
import DailyWin from '@/models/DailyWin'
import DayNutrition from '@/models/DayNutrition'
import DisciplineChallenge from '@/models/DisciplineChallenge'
import Exercise from '@/models/Exercise'
import ExerciseVideo from '@/models/ExerciseVideo'
import Feedback from '@/models/Feedback'
import Food from '@/models/Food'
import FoodFlag from '@/models/FoodFlag'
import Goal from '@/models/Goal'
import IdentityProfile from '@/models/IdentityProfile'
import InventoryClaim from '@/models/InventoryClaim'
import Journal from '@/models/Journal'
import MagicLink from '@/models/MagicLink'
import Meal from '@/models/Meal'
import MealLog from '@/models/MealLog'
import MealPlan from '@/models/MealPlan'
import MealTagSchedule from '@/models/MealTagSchedule'
import Meditation from '@/models/Meditation'
import Message from '@/models/Message'
import MindJournal from '@/models/MindJournal'
import MindNonNegotiable from '@/models/MindNonNegotiable'
import MindProgress from '@/models/MindProgress'
import MindSession from '@/models/MindSession'
import Mission from '@/models/Mission'
import NutritionGoal from '@/models/NutritionGoal'
import PlateScan from '@/models/PlateScan'
import Program from '@/models/Program'
import PushSubscription from '@/models/PushSubscription'
import Recipe from '@/models/Recipe'
import Schedule from '@/models/Schedule'
import Share from '@/models/Share'
import SharedSession from '@/models/SharedSession'
import Sleep from '@/models/Sleep'
import StateLog from '@/models/StateLog'
import StreakCredit from '@/models/StreakCredit'
import TutorialProgress from '@/models/TutorialProgress'
import User from '@/models/User'
import UserProgress from '@/models/UserProgress'

/** The `deleteMany` / `updateMany` surface, typed structurally so a test can
 *  hand in a recording fake and never touch a database. Mongoose Queries are
 *  thenable rather than real Promises, hence PromiseLike. */
export interface PurgeableCollection {
  deleteMany(filter: Record<string, unknown>): PromiseLike<{ deletedCount?: number | null }>
  updateMany(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): PromiseLike<{ modifiedCount?: number | null }>
}

export type PurgeAction = 'delete' | 'detach'
export type PurgeIdType = 'objectId' | 'string'

export interface PurgeTarget {
  /** Collection name as a human reads it. Used in the report and the tests. */
  name: string
  /** The field that names the member. */
  field: string
  idType: PurgeIdType
  action: PurgeAction
  collection: PurgeableCollection
  /** Why this one is detached rather than deleted. Required for `detach`. */
  because?: string
}

const asPurgeable = (model: unknown) => model as unknown as PurgeableCollection

/**
 * Everything a deletion removes or detaches, apart from the `users` row
 * itself — that is deleted last, by `purgeUserAccount`, so a crash halfway
 * through leaves an account that is still marked for deletion and will be
 * swept again rather than an orphaned pile of data with no owner.
 */
export const PURGE_TARGETS: readonly PurgeTarget[] = [
  // ── The member's own record of themselves ────────────────────────────────
  { name: 'UserProgress', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(UserProgress) },
  { name: 'IdentityProfile', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(IdentityProfile) },
  { name: 'Schedule', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(Schedule) },
  { name: 'Goal', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(Goal) },
  { name: 'Mission', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(Mission) },
  { name: 'StreakCredit', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(StreakCredit) },
  { name: 'TutorialProgress', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(TutorialProgress) },
  { name: 'DailyWin', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(DailyWin) },
  { name: 'DailyContentLog', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(DailyContentLog) },
  { name: 'DisciplineChallenge', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(DisciplineChallenge) },
  { name: 'StateLog', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(StateLog) },
  { name: 'Sleep', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(Sleep) },

  // ── Mind: the most sensitive thing in the product ────────────────────────
  { name: 'MindProgress', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(MindProgress) },
  { name: 'MindSession', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(MindSession) },
  { name: 'MindJournal', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(MindJournal) },
  { name: 'MindNonNegotiable', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(MindNonNegotiable) },
  { name: 'Journal', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(Journal) },
  { name: 'Meditation', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(Meditation) },

  // ── Nutrition ────────────────────────────────────────────────────────────
  { name: 'NutritionGoal', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(NutritionGoal) },
  { name: 'DayNutrition', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(DayNutrition) },
  { name: 'MealLog', field: 'user', idType: 'objectId', action: 'delete', collection: asPurgeable(MealLog) },
  { name: 'MealPlan', field: 'user', idType: 'objectId', action: 'delete', collection: asPurgeable(MealPlan) },
  { name: 'MealTagSchedule', field: 'user', idType: 'objectId', action: 'delete', collection: asPurgeable(MealTagSchedule) },
  { name: 'PlateScan', field: 'user', idType: 'objectId', action: 'delete', collection: asPurgeable(PlateScan) },
  { name: 'Meal', field: 'createdBy', idType: 'objectId', action: 'delete', collection: asPurgeable(Meal) },
  { name: 'Recipe', field: 'createdBy', idType: 'objectId', action: 'delete', collection: asPurgeable(Recipe) },
  { name: 'FoodFlag', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(FoodFlag) },

  // ── Chat, sharing and support ────────────────────────────────────────────
  { name: 'Message', field: 'senderId', idType: 'objectId', action: 'delete', collection: asPurgeable(Message) },
  { name: 'Conversation', field: 'participants', idType: 'objectId', action: 'delete', collection: asPurgeable(Conversation) },
  { name: 'Share', field: 'ownerId', idType: 'objectId', action: 'delete', collection: asPurgeable(Share) },
  { name: 'SharedSession', field: 'owner', idType: 'objectId', action: 'delete', collection: asPurgeable(SharedSession) },
  { name: 'Feedback', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(Feedback) },

  // ── Plumbing that still names the member ─────────────────────────────────
  // Push first in spirit, though the request path already dropped these the
  // moment deletion was asked for — re-run here so a subscription minted by a
  // device that was offline at request time cannot outlive the account.
  { name: 'PushSubscription', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(PushSubscription) },
  { name: 'AllowanceUsage', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(AllowanceUsage) },
  { name: 'InventoryClaim', field: 'userId', idType: 'objectId', action: 'delete', collection: asPurgeable(InventoryClaim) },
  // Stored as a hex STRING, not an ObjectId.
  { name: 'AiRun', field: 'userId', idType: 'string', action: 'delete', collection: asPurgeable(AiRun) },

  // ── Detached, not deleted ────────────────────────────────────────────────
  {
    name: 'Food',
    field: 'createdBy',
    idType: 'objectId',
    action: 'detach',
    collection: asPurgeable(Food),
    because: 'other members’ meal logs reference these catalogue entries by id',
  },
  {
    name: 'Exercise',
    field: 'createdBy',
    idType: 'string',
    action: 'detach',
    collection: asPurgeable(Exercise),
    because: 'programs reference exercises by slug, including other members’',
  },
  {
    name: 'ExerciseVideo',
    field: 'uploadedBy',
    idType: 'objectId',
    action: 'detach',
    collection: asPurgeable(ExerciseVideo),
    because: 'the demo video is shown to everyone doing that exercise',
  },
  {
    name: 'Program',
    field: 'createdBy',
    idType: 'objectId',
    action: 'detach',
    collection: asPurgeable(Program),
    because: 'other members may be enrolled in a program this account authored',
  },
  {
    name: 'CommunityGroup',
    field: 'createdBy',
    idType: 'objectId',
    action: 'detach',
    collection: asPurgeable(CommunityGroup),
    because: 'the group has other members in it',
  },
  {
    name: 'CommunityEvent',
    field: 'createdBy',
    idType: 'objectId',
    action: 'detach',
    collection: asPurgeable(CommunityEvent),
    because: 'other members have the event in their calendar',
  },
]

export interface PurgeOutcome {
  name: string
  action: PurgeAction
  /** Rows removed, or rows whose owner field was cleared. */
  count: number
  /** Set when that collection threw. The sweep continues regardless. */
  error?: string
}

export interface PurgeReport {
  userId: string
  /** True only when the `users` row itself was removed. */
  userDeleted: boolean
  deleted: number
  detached: number
  outcomes: PurgeOutcome[]
  /** Collections that threw. Non-empty means the account row was NOT deleted. */
  failures: string[]
  durationMs: number
}

function filterFor(target: PurgeTarget, userId: string): Record<string, unknown> {
  const value =
    target.idType === 'string' ? userId : new mongoose.Types.ObjectId(userId)
  return { [target.field]: value }
}

/**
 * Run the plan for one member.
 *
 * A collection that throws does NOT abort the run: every other collection
 * still gets cleaned, and the failure is reported. The `users` row is only
 * removed when nothing failed, so a partial purge is retried by the next sweep
 * instead of leaving data behind with no account to find it by.
 */
export async function purgeUserAccount(
  userId: string,
  options: {
    targets?: readonly PurgeTarget[]
    deleteUser?: boolean
    userCollection?: PurgeableCollection
    /** Keyed by EMAIL, not by user id — see the MagicLink step below. */
    email?: string | null
    magicLinkCollection?: PurgeableCollection
  } = {},
): Promise<PurgeReport> {
  const started = Date.now()
  const targets = options.targets ?? PURGE_TARGETS
  const outcomes: PurgeOutcome[] = []
  const failures: string[] = []
  let deleted = 0
  let detached = 0

  for (const target of targets) {
    const filter = filterFor(target, userId)
    try {
      if (target.action === 'delete') {
        const res = await target.collection.deleteMany(filter)
        const count = res?.deletedCount ?? 0
        deleted += count
        outcomes.push({ name: target.name, action: 'delete', count })
      } else {
        const res = await target.collection.updateMany(filter, { $set: { [target.field]: null } })
        const count = res?.modifiedCount ?? 0
        detached += count
        outcomes.push({ name: target.name, action: 'detach', count })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(target.name)
      outcomes.push({ name: target.name, action: target.action, count: 0, error: message })
    }
  }

  // Sign-in links are keyed by EMAIL — MagicLink has no userId — so this one
  // cannot live in the table above. A 15-minute TTL would clear them anyway;
  // not waiting for it means a link sitting in an inbox cannot be redeemed
  // into a fresh account row moments after the old one was purged.
  if (options.email) {
    const links = options.magicLinkCollection ?? asPurgeable(MagicLink)
    try {
      const res = await links.deleteMany({ email: options.email.toLowerCase() })
      const count = res?.deletedCount ?? 0
      deleted += count
      outcomes.push({ name: 'MagicLink', action: 'delete', count })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push('MagicLink')
      outcomes.push({ name: 'MagicLink', action: 'delete', count: 0, error: message })
    }
  }

  let userDeleted = false
  const shouldDeleteUser = options.deleteUser !== false
  if (shouldDeleteUser && failures.length === 0) {
    const users = options.userCollection ?? asPurgeable(User)
    try {
      const res = await users.deleteMany({ _id: new mongoose.Types.ObjectId(userId) })
      userDeleted = (res?.deletedCount ?? 0) > 0
    } catch (error) {
      failures.push('User')
      outcomes.push({
        name: 'User',
        action: 'delete',
        count: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    userId,
    userDeleted,
    deleted,
    detached,
    outcomes,
    failures,
    durationMs: Date.now() - started,
  }
}
