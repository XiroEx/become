// SERVER-ONLY. The data an app reviewer sees when they sign in with the review
// code (lib/reviewSignIn.ts).
//
// WHY IT IS GENERATED AND NOT A REAL ACCOUNT
//
// A reviewer needs an account that looks lived-in: a program part way through,
// meals in the log, a streak, Mind progress, and Plus so no surface is behind a
// paywall they cannot cross. The obvious way to get one is to hand over a
// member's credentials, and that is the one thing that must never happen —
// production and beta share one database, so "a real account" means a real
// person's weigh-ins, meals and journal entries in front of a stranger.
//
// So the demo account's data is WRITTEN, every time the review code is used.
//
// TWO PROPERTIES, BOTH DELIBERATE
//
//   • IT IS RE-ANCHORED TO NOW. A streak is a fact about the last few days, so
//     a seed written once in March reads as a streak of zero in September. Each
//     review sign-in rewrites the demo account's own activity relative to the
//     moment it happens (at most once every SEED_MAX_AGE_MS, so signing in on a
//     second device mid-review does not move the data under the first).
//   • IT ONLY EVER TOUCHES THE DEMO ROW. Every write below is filtered by the
//     demo userId, and the caller has already proved the row carries
//     `isReviewAccount: true` (lib/reviewAccount.ts). There is no code path
//     here that can reach another member's documents.

import { Types } from 'mongoose'
import User, { type IUser } from '@/models/User'
import UserProgress from '@/models/UserProgress'
import MindProgress from '@/models/MindProgress'
import MealLog from '@/models/MealLog'
import Schedule from '@/models/Schedule'
import Program from '@/models/Program'
import { AI_CONSENT_VERSION, LEGAL_MINIMUM_AGE, LEGAL_VERSION } from '@/lib/legal'

/** How stale the demo data may be before a sign-in rewrites it. */
export const SEED_MAX_AGE_MS = 6 * 60 * 60 * 1000

/** The display name on the demo account. Not a person. */
export const REVIEW_ACCOUNT_NAME = 'Alex Reviewer'

/** Days of meals / mood the seed lays down, ending today. */
export const SEED_ACTIVITY_DAYS = 12

/** The streak the seeded activity is written to support. */
export const SEED_STREAK_DAYS = 12

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

/** A day marker: UTC midnight of the day `days` before `now`. */
function dayMarker(now: Date, days: number): Date {
  return startOfUtcDay(daysAgo(now, days))
}

/** An instant on the day `days` before `now`, at `hour` UTC. */
function atHour(now: Date, days: number, hour: number): Date {
  const day = dayMarker(now, days)
  return new Date(day.getTime() + hour * 60 * 60 * 1000)
}

// ── The profile ──────────────────────────────────────────────────────────────

/**
 * Everything the reviewer's User row must say. Plus is the point: every gated
 * surface has to be reachable, and `grandfathered` says what is true — this
 * member holds Plus because it was granted, not because Stripe charged anyone.
 * No `subscription` block for the same reason: inventing one would put a
 * customer id that does not exist in front of the billing screen.
 */
export function reviewUserFields(now: Date = new Date()): Partial<IUser> {
  return {
    name: REVIEW_ACCOUNT_NAME,
    role: 'user',
    tier: 'plus',
    grandfathered: true,
    onboardingCompleted: true,
    isReviewAccount: true,
    // A demo account must never be able to mail anybody.
    emailPreferences: { engagement: false },
    consent: {
      termsVersion: LEGAL_VERSION,
      acceptedAt: daysAgo(now, 40),
      minimumAge: LEGAL_MINIMUM_AGE,
      source: 'signup',
    },
    // Granted so the AI surfaces can be reviewed. Nothing a reviewer types is
    // a member's data, and the toggle in Settings still works either way.
    aiConsent: {
      version: AI_CONSENT_VERSION,
      granted: true,
      decidedAt: daysAgo(now, 40),
      source: 'gate',
    },
    profile: {
      fitnessGoal: 'gain_muscle',
      fitnessGoals: ['gain_muscle', 'improve_performance'],
      nutritionDirection: 'gain',
      experienceLevel: 'intermediate',
      age: 34,
      biologicalSex: 'prefer_not_to_say',
      heightCm: 178,
      currentWeightKg: 79.4,
      targetWeightKg: 82,
      equipmentAccess: ['full_gym'],
      weeklyAvailability: 3,
      weightUnit: 'lbs',
      planPromoteMode: 'manual',
    },
  }
}

// ── The activity ─────────────────────────────────────────────────────────────

const MEALS = [
  {
    hour: 8,
    tag: 'breakfast',
    name: 'Oats, banana and whey',
    items: [
      { name: 'Rolled oats', servingSize: 80, servingUnit: 'g', nutrition: { calories: 303, protein: 11, carbs: 54, fats: 5 } },
      { name: 'Banana', servingSize: 118, servingUnit: 'g', nutrition: { calories: 105, protein: 1, carbs: 27, fats: 0 } },
      { name: 'Whey protein', servingSize: 30, servingUnit: 'g', nutrition: { calories: 120, protein: 24, carbs: 3, fats: 1 } },
    ],
  },
  {
    hour: 13,
    tag: 'lunch',
    name: 'Chicken, rice and greens',
    items: [
      { name: 'Grilled chicken breast', servingSize: 180, servingUnit: 'g', nutrition: { calories: 297, protein: 56, carbs: 0, fats: 6 } },
      { name: 'Cooked white rice', servingSize: 200, servingUnit: 'g', nutrition: { calories: 260, protein: 5, carbs: 57, fats: 1 } },
      { name: 'Steamed broccoli', servingSize: 150, servingUnit: 'g', nutrition: { calories: 51, protein: 4, carbs: 10, fats: 1 } },
    ],
  },
  {
    hour: 19,
    tag: 'dinner',
    name: 'Salmon and sweet potato',
    items: [
      { name: 'Baked salmon', servingSize: 170, servingUnit: 'g', nutrition: { calories: 354, protein: 39, carbs: 0, fats: 21 } },
      { name: 'Sweet potato', servingSize: 200, servingUnit: 'g', nutrition: { calories: 180, protein: 4, carbs: 41, fats: 0 } },
      { name: 'Olive oil', servingSize: 10, servingUnit: 'ml', nutrition: { calories: 88, protein: 0, carbs: 0, fats: 10 } },
    ],
  },
] as const

function totalNutrition(items: readonly { nutrition: { calories: number; protein: number; carbs: number; fats: number } }[]) {
  return items.reduce(
    (sum, item) => ({
      calories: sum.calories + item.nutrition.calories,
      protein: sum.protein + item.nutrition.protein,
      carbs: sum.carbs + item.nutrition.carbs,
      fats: sum.fats + item.nutrition.fats,
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 },
  )
}

/** Meal logs for the last SEED_ACTIVITY_DAYS days, today included. */
export function reviewMealLogs(userId: Types.ObjectId, now: Date = new Date()) {
  const rows: Record<string, unknown>[] = []
  for (let day = SEED_ACTIVITY_DAYS - 1; day >= 0; day--) {
    for (const meal of MEALS) {
      // Today's dinner has not happened yet at review time — a log in the
      // future is the one thing that would read as fake.
      const loggedAt = atHour(now, day, meal.hour)
      if (loggedAt.getTime() > now.getTime()) continue
      rows.push({
        user: userId,
        loggedAt,
        mealName: meal.name,
        source: 'search',
        tags: [meal.tag],
        items: meal.items.map((item) => ({ ...item, servings: 1 })),
        totalNutrition: totalNutrition(meal.items),
      })
    }
  }
  return rows
}

/** Weigh-ins, trending the way a bulking member's would. */
export function reviewWeightHistory(now: Date = new Date()) {
  const entries: { date: Date; loggedAt: Date; weight: number; unit: 'lbs' }[] = []
  // 28 days, every third day, 173.0 lb → 175.1 lb.
  for (let day = 27; day >= 0; day -= 3) {
    entries.push({
      date: dayMarker(now, day),
      loggedAt: atHour(now, day, 7),
      weight: Math.round((173 + (27 - day) * 0.075) * 10) / 10,
      unit: 'lbs',
    })
  }
  return entries
}

/** A mood a day, so the mindset pillar of the streak is real. */
export function reviewMoodHistory(now: Date = new Date()) {
  const pattern: (1 | 2 | 3 | 4 | 5)[] = [4, 4, 3, 5, 4, 3, 4, 5, 4, 4, 3, 4]
  const entries: { date: Date; loggedAt: Date; mood: 1 | 2 | 3 | 4 | 5 }[] = []
  for (let day = SEED_ACTIVITY_DAYS - 1; day >= 0; day--) {
    entries.push({
      date: dayMarker(now, day),
      loggedAt: atHour(now, day, 7),
      mood: pattern[(SEED_ACTIVITY_DAYS - 1 - day) % pattern.length],
    })
  }
  return entries
}

interface SeedProgram {
  programId: string
  programName: string
  /** Day labels of phase 1, in order. */
  dayLabels: { day: string; title: string }[]
  totalWorkouts: number
}

/**
 * A catalogue program to be part way through. Chosen from the database rather
 * than invented so the program pages a reviewer opens are real ones, and
 * deliberately by a stable sort so the same one is picked every time.
 */
export async function pickSeedProgram(): Promise<SeedProgram | null> {
  const program = await Program.findOne(
    { isCustom: { $ne: true }, 'phases.0.workouts.0': { $exists: true } },
    { program_id: 1, name: 1, phases: 1, duration_weeks: 1, training_days_per_week: 1 },
  )
    .sort({ program_id: 1 })
    .lean<{
      program_id: string
      name: string
      phases?: { workouts?: { day?: string; title?: string }[] }[]
    } | null>()
  if (!program) return null

  const workouts = (program.phases?.[0]?.workouts ?? [])
    .map((w, i) => ({ day: w.day || `Day ${i + 1}`, title: w.title || `Day ${i + 1}` }))
  if (workouts.length === 0) return null

  const totalWorkouts = (program.phases ?? []).reduce(
    (sum, phase) => sum + (phase.workouts?.length ?? 0),
    0,
  )

  return {
    programId: program.program_id,
    programName: program.name,
    dayLabels: workouts,
    totalWorkouts: Math.max(totalWorkouts, workouts.length),
  }
}

/** Completed sessions, one per training day for the last three weeks. */
function reviewWorkoutLogs(program: SeedProgram | null, now: Date) {
  // Monday / Wednesday / Friday, counted back from today in three-day steps so
  // the cadence reads like a real week without needing a calendar.
  const trainingDaysAgo = [1, 3, 5, 8, 10, 12, 15, 17, 19]
  const logs: Record<string, unknown>[] = []

  trainingDaysAgo.forEach((day, index) => {
    const label = program?.dayLabels[index % (program.dayLabels.length || 1)]
    logs.push({
      date: atHour(now, day, 18),
      ...(program
        ? { programId: program.programId, phase: 1, day: label?.day, kind: 'program' }
        : { kind: 'quick', title: 'Upper body', sessionId: `review-session-${day}` }),
      completed: true,
      duration: 52,
      startedAt: atHour(now, day, 18),
      activeSeconds: 52 * 60,
      exercises: [
        {
          name: 'Barbell Bench Press',
          exerciseSlug: 'barbell-bench-press',
          sets: [
            { setNumber: 1, reps: 8, weight: 155, completed: true },
            { setNumber: 2, reps: 8, weight: 165, completed: true },
            { setNumber: 3, reps: 6, weight: 175, completed: true },
          ],
        },
        {
          name: 'Barbell Back Squat',
          exerciseSlug: 'barbell-back-squat',
          sets: [
            { setNumber: 1, reps: 8, weight: 205, completed: true },
            { setNumber: 2, reps: 6, weight: 225, completed: true },
            { setNumber: 3, reps: 5, weight: 235, completed: true },
          ],
        },
      ],
    })
  })

  return logs
}

/** The schedule behind the program in progress: past done, next few ahead. */
function reviewSchedule(userId: Types.ObjectId, program: SeedProgram, now: Date) {
  const scheduledWorkouts = [] as Record<string, unknown>[]
  const past = [19, 17, 15, 12, 10, 8, 5, 3, 1]
  past.forEach((day, index) => {
    const label = program.dayLabels[index % program.dayLabels.length]
    scheduledWorkouts.push({
      date: dayMarker(now, day),
      programId: program.programId,
      phase: 1,
      dayLabel: label.day,
      workoutTitle: label.title,
      status: 'completed',
      completedAt: atHour(now, day, 19),
    })
  })
  ;[1, 3, 5, 8].forEach((inDays, index) => {
    const label = program.dayLabels[(past.length + index) % program.dayLabels.length]
    scheduledWorkouts.push({
      date: dayMarker(now, -inDays),
      programId: program.programId,
      phase: 1,
      dayLabel: label.day,
      workoutTitle: label.title,
      status: 'scheduled',
    })
  })

  return {
    userId,
    programId: program.programId,
    programName: program.programName,
    settings: { trainingDays: [1, 3, 5], startDate: dayMarker(now, 21) },
    scheduledWorkouts,
  }
}

/** Mind: part way through chapter 2, with a Vision written. */
function reviewMindProgress(userId: Types.ObjectId, now: Date) {
  return {
    userId,
    chapter: 2 as const,
    xp: 180,
    xpBank: 640,
    levelXp: 820,
    // CHAPTER PROGRESS, measured in sessions — a head start nobody sat
    // through is exactly what this field legitimately carries (the intake maps
    // an answer to a chapter; see models/MindProgress.ts).
    mainSessionCount: 10,
    // `completedMainSessions` is deliberately NOT seeded. It is the count of
    // sessions a member actually finished, the only counter the mind-sessions
    // allowance may read, and a fixture claiming completions nobody sat
    // through is the defect that field exists to prevent
    // (tests/unit/mind/sessionAllowance.test.ts). The reviewer's first Mind
    // session increments it, the way everybody else's does.
    xpSeeded: true,
    lastMainSessionAt: atHour(now, 1, 7),
    introducedSystems: ['breath', 'vision', 'identity'],
    chapterHistory: [
      { chapter: 1, unlockedAt: daysAgo(now, 30) },
      { chapter: 2, unlockedAt: daysAgo(now, 9) },
    ],
    selfDeclaredChapters: [],
    vision: {
      habits: 'Train three mornings a week and cook on Sundays.',
      mind: 'Ten minutes of breath before the day starts, not after it.',
      body: 'Strong enough to carry everything up three flights in one trip.',
      relationships: 'Call my sister on Wednesdays, no rescheduling.',
      environment: 'Kit by the door the night before. No decisions at 6am.',
      identityStatement: 'I am someone who shows up before they feel like it.',
      completedAt: daysAgo(now, 9),
      updatedAt: daysAgo(now, 9),
      alignmentHistory: [],
    },
  }
}

// ── The write ────────────────────────────────────────────────────────────────

export interface SeedOutcome {
  /** False when the data was fresh enough to leave alone. */
  written: boolean
  /** The program the demo account is part way through, when one was found. */
  programName?: string
}

/**
 * Put the demo account into the state a reviewer should find it in.
 *
 * `force` ignores the freshness check. The sign-in route never passes it, so
 * two devices in one review session see the same data; it is there for an
 * operator re-seeding on purpose.
 *
 * Every delete below is filtered by this userId, and the caller has already
 * checked the row is the flagged demo account.
 */
export async function seedReviewAccount(
  userId: string,
  opts: { now?: Date; force?: boolean } = {},
): Promise<SeedOutcome> {
  const now = opts.now ?? new Date()
  const uid = new Types.ObjectId(userId)

  const user = await User.findById(uid)
  if (!user) throw new Error('review seed: no such user')
  if (user.isReviewAccount !== true) {
    // Belt and braces. The route checks this too; this is the check that
    // cannot be skipped by a future caller.
    throw new Error('review seed: refusing to write to an account that is not the demo account')
  }

  const seededAt = user.reviewSeededAt ? new Date(user.reviewSeededAt).getTime() : 0
  const fresh = Boolean(seededAt) && now.getTime() - seededAt < SEED_MAX_AGE_MS
  // A pending deletion always forces a rewrite, however fresh the data is —
  // see the cancel below. Nothing else would clear it.
  if (!opts.force && fresh && !user.deletion) {
    return { written: false }
  }

  const program = await pickSeedProgram()

  Object.assign(user, reviewUserFields(now))
  user.reviewSeededAt = now
  const hadPendingDeletion = Boolean(user.deletion)
  // validateModifiedOnly: the same rule lib/authBridge.ts follows — a legacy
  // field elsewhere on the row must not make this save throw.
  await user.save({ validateModifiedOnly: true })

  // A reviewer who exercises "Delete account" — which Apple checks BY HAND
  // (Guideline 5.1.1(v)) — leaves the demo row soft-deleted, and the NEXT
  // reviewer would land on the restore screen with no way past it. So a
  // pending deletion on THIS row is cancelled, exactly the way
  // POST /api/me/account/restore cancels one.
  if (hadPendingDeletion) {
    await User.updateOne({ _id: uid }, { $unset: { deletion: '' } })
  }

  await Promise.all([
    MealLog.deleteMany({ user: uid }),
    Schedule.deleteMany({ userId: uid }),
  ])

  await MealLog.insertMany(reviewMealLogs(uid, now))
  if (program) await Schedule.create(reviewSchedule(uid, program, now))

  await UserProgress.findOneAndUpdate(
    { userId: uid },
    {
      $set: {
        userId: uid,
        weightHistory: reviewWeightHistory(now),
        moodHistory: reviewMoodHistory(now),
        moodChangeHistory: [],
        workoutLogs: reviewWorkoutLogs(program, now),
        activePrograms: program
          ? [{
              programId: program.programId,
              programName: program.programName,
              startDate: dayMarker(now, 21),
              currentPhase: 1,
              currentDay: program.dayLabels[0].day,
              completedWorkouts: 9,
              totalWorkouts: program.totalWorkouts,
              lastWorkoutDate: atHour(now, 1, 18),
              status: 'in-progress',
              hasSchedule: true,
            }]
          : [],
        streakDays: SEED_STREAK_DAYS,
        longestStreak: 21,
        lastActivityDate: now,
        streakFreezes: 1,
        milestonesReached: [7],
        totalWorkouts: 34,
        exercisePRs: [],
        dismissedSuggestions: [],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  await MindProgress.findOneAndUpdate(
    { userId: uid },
    { $set: reviewMindProgress(uid, now) },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  return { written: true, programName: program?.programName }
}
