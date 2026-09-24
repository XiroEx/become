// The model registry the purge runs against.
//
// It lives HERE rather than in the cron route because a Next.js `route.ts` may
// only export HTTP handlers and the handful of recognised route options — an
// extra export is a build-time type error, not a lint nit. It is also the one
// place that knows the mapping from a plan step's model NAME to the model
// itself, which is what `tests/unit/account/deletion.test.ts` checks against
// PURGE_PLAN: a name with no entry here would make its step silently skip.

import type { PurgeableModel } from '@/lib/accountPurge'

import User from '@/models/User'
import UserProgress from '@/models/UserProgress'
import Schedule from '@/models/Schedule'
import Goal from '@/models/Goal'
import StateLog from '@/models/StateLog'
import StreakCredit from '@/models/StreakCredit'
import Sleep from '@/models/Sleep'
import Journal from '@/models/Journal'
import DailyWin from '@/models/DailyWin'
import DailyContentLog from '@/models/DailyContentLog'
import DisciplineChallenge from '@/models/DisciplineChallenge'
import Meditation from '@/models/Meditation'
import TutorialProgress from '@/models/TutorialProgress'
import Feedback from '@/models/Feedback'
import AiRun from '@/models/AiRun'
import AllowanceUsage from '@/models/AllowanceUsage'
import InventoryClaim from '@/models/InventoryClaim'
import MindProgress from '@/models/MindProgress'
import MindSession from '@/models/MindSession'
import MindJournal from '@/models/MindJournal'
import MindNonNegotiable from '@/models/MindNonNegotiable'
import Mission from '@/models/Mission'
import IdentityProfile from '@/models/IdentityProfile'
import MealLog from '@/models/MealLog'
import MealPlan from '@/models/MealPlan'
import MealTagSchedule from '@/models/MealTagSchedule'
import DayNutrition from '@/models/DayNutrition'
import NutritionGoal from '@/models/NutritionGoal'
import PlateScan from '@/models/PlateScan'
import FoodFlag from '@/models/FoodFlag'
import Meal from '@/models/Meal'
import Recipe from '@/models/Recipe'
import Food from '@/models/Food'
import Program from '@/models/Program'
import Exercise from '@/models/Exercise'
import ExerciseVideo from '@/models/ExerciseVideo'
import Message from '@/models/Message'
import Conversation from '@/models/Conversation'
import CommunityGroup from '@/models/CommunityGroup'
import CommunityEvent from '@/models/CommunityEvent'
import Share from '@/models/Share'
import PushSubscription from '@/models/PushSubscription'
import MagicLink from '@/models/MagicLink'
// Cascade children: keyed by the row they illustrate, not by a member.
import MealImage from '@/models/MealImage'
import RecipeImage from '@/models/RecipeImage'
import ProgramImage from '@/models/ProgramImage'

export const dynamic = 'force-dynamic'

/**
 * Model name → model, for lib/accountPurge.ts. Every name in PURGE_PLAN must
 * appear here; `tests/unit/account/deletion.test.ts` fails the build when one
 * does not, because a missing entry is a step that silently skips.
 */
export const PURGE_MODELS: Record<string, PurgeableModel> = {
  User: User as unknown as PurgeableModel,
  UserProgress: UserProgress as unknown as PurgeableModel,
  Schedule: Schedule as unknown as PurgeableModel,
  Goal: Goal as unknown as PurgeableModel,
  StateLog: StateLog as unknown as PurgeableModel,
  StreakCredit: StreakCredit as unknown as PurgeableModel,
  Sleep: Sleep as unknown as PurgeableModel,
  Journal: Journal as unknown as PurgeableModel,
  DailyWin: DailyWin as unknown as PurgeableModel,
  DailyContentLog: DailyContentLog as unknown as PurgeableModel,
  DisciplineChallenge: DisciplineChallenge as unknown as PurgeableModel,
  Meditation: Meditation as unknown as PurgeableModel,
  TutorialProgress: TutorialProgress as unknown as PurgeableModel,
  Feedback: Feedback as unknown as PurgeableModel,
  AiRun: AiRun as unknown as PurgeableModel,
  AllowanceUsage: AllowanceUsage as unknown as PurgeableModel,
  InventoryClaim: InventoryClaim as unknown as PurgeableModel,
  MindProgress: MindProgress as unknown as PurgeableModel,
  MindSession: MindSession as unknown as PurgeableModel,
  MindJournal: MindJournal as unknown as PurgeableModel,
  MindNonNegotiable: MindNonNegotiable as unknown as PurgeableModel,
  Mission: Mission as unknown as PurgeableModel,
  IdentityProfile: IdentityProfile as unknown as PurgeableModel,
  MealLog: MealLog as unknown as PurgeableModel,
  MealPlan: MealPlan as unknown as PurgeableModel,
  MealTagSchedule: MealTagSchedule as unknown as PurgeableModel,
  DayNutrition: DayNutrition as unknown as PurgeableModel,
  NutritionGoal: NutritionGoal as unknown as PurgeableModel,
  PlateScan: PlateScan as unknown as PurgeableModel,
  FoodFlag: FoodFlag as unknown as PurgeableModel,
  Meal: Meal as unknown as PurgeableModel,
  Recipe: Recipe as unknown as PurgeableModel,
  Food: Food as unknown as PurgeableModel,
  Program: Program as unknown as PurgeableModel,
  Exercise: Exercise as unknown as PurgeableModel,
  ExerciseVideo: ExerciseVideo as unknown as PurgeableModel,
  Message: Message as unknown as PurgeableModel,
  Conversation: Conversation as unknown as PurgeableModel,
  CommunityGroup: CommunityGroup as unknown as PurgeableModel,
  CommunityEvent: CommunityEvent as unknown as PurgeableModel,
  Share: Share as unknown as PurgeableModel,
  PushSubscription: PushSubscription as unknown as PurgeableModel,
  MagicLink: MagicLink as unknown as PurgeableModel,
  MealImage: MealImage as unknown as PurgeableModel,
  RecipeImage: RecipeImage as unknown as PurgeableModel,
  ProgramImage: ProgramImage as unknown as PurgeableModel,
}
