/**
 * Reading side of the widget feed. Gathers the five widgets' worth of data in
 * one round of deliberately CHEAP queries and hands plain values to
 * `buildWidgetFeed` (lib/widgets/feed.ts), which owns every wording decision.
 *
 * Cheap matters here in a way it does not on a page. A widget is polled by the
 * OS on its own schedule, for every member who installs one, forever — so this
 * reads today's local day and this week, never the 52-week journey the Becoming
 * page assembles, and it never writes. `computeGoalProgress` / `computeJourney`
 * would each have been a one-line reuse and both are far too heavy to sit
 * behind a background refresh.
 */

import { Types } from 'mongoose'
import User from '@/models/User'
import UserProgress from '@/models/UserProgress'
import MealLog from '@/models/MealLog'
import DayNutrition from '@/models/DayNutrition'
import NutritionGoal from '@/models/NutritionGoal'
import MindProgress from '@/models/MindProgress'
import MindSession from '@/models/MindSession'
import Schedule from '@/models/Schedule'
import ProgramModel from '@/models/Program'
import { localDayWindowForKey, utcMidnightDateKey, dateKey } from '@/lib/dayWindow'
import { slotDateKey, workoutTitleForDay } from '@/lib/notifications/cronNotify'
import { weekKeyOf } from '@/lib/streaks/pillars'
import {
  CHAPTERS,
  SESSIONS_PER_CHAPTER,
  chapterFromSessions,
  sessionsIntoChapter,
  mainSessionAvailable,
} from '@/lib/mindXP'
import { buildWidgetFeed, type WidgetFeed, type WidgetFeedInput } from '@/lib/widgets/feed'

/**
 * Minutes WEST of UTC for `zone` at `now`, matching Date.getTimezoneOffset().
 *
 * A stored offset is a snapshot that goes wrong the moment daylight saving
 * moves, and a widget refreshes in the background — so the member most likely
 * to see a day boundary land in the wrong place is the one who has not opened
 * the app since the clocks changed. Deriving the offset from the IANA zone
 * fixes that without the caller having to know which of the two it got.
 */
export function offsetFromZone(now: Date, zone: string): number | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
    const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]))
    const asUtc = Date.UTC(
      Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(p.hour) % 24, Number(p.minute), Number(p.second),
    )
    if (!Number.isFinite(asUtc)) return null
    return Math.round((now.getTime() - asUtc) / 60_000)
  } catch {
    return null
  }
}

/**
 * Which offset this snapshot is built in. The request wins when it says — the
 * client knows its own clock at this instant — then the stored zone, then the
 * stored offset, then UTC. ONE offset resolves the day key, the meal-log
 * window and the week boundary, so they cannot disagree with each other.
 */
export function resolveWidgetTzOffset(
  requested: number | null,
  stored: { timezoneOffset?: number; timezone?: string } | null | undefined,
  now: Date,
): number {
  if (requested != null) return requested
  if (stored?.timezone) {
    const fromZone = offsetFromZone(now, stored.timezone)
    if (fromZone != null) return fromZone
  }
  if (Number.isFinite(stored?.timezoneOffset as number)) return stored!.timezoneOffset as number
  return 0
}

type WorkoutLog = { date?: Date | string; completed?: boolean; title?: string; day?: string }
type Slot = {
  date: Date
  programId?: string
  phase?: number
  dayLabel?: string
  workoutTitle?: string
  status?: string
}

/** Sum today's food log + quick-adds into one set of macro totals. */
export function sumMacros(
  logs: Array<{ totalNutrition?: { calories?: number; protein?: number; carbs?: number; fats?: number } }>,
  quickAdds: Array<{ calories?: number; protein?: number; carbs?: number; fats?: number }>,
): { calories: number; protein: number; carbs: number; fats: number; entries: number } {
  const t = { calories: 0, protein: 0, carbs: 0, fats: 0, entries: 0 }
  for (const l of logs) {
    const n = l.totalNutrition
    if (!n) continue
    t.calories += n.calories ?? 0
    t.protein += n.protein ?? 0
    t.carbs += n.carbs ?? 0
    t.fats += n.fats ?? 0
    t.entries += 1
  }
  for (const q of quickAdds) {
    t.calories += q.calories ?? 0
    t.protein += q.protein ?? 0
    t.carbs += q.carbs ?? 0
    t.fats += q.fats ?? 0
    t.entries += 1
  }
  return t
}

/**
 * 1-based week of the member's Becoming, counted from the day they joined.
 * Null when we have no start date to count from — "Week NaN" is worse than
 * "Day one".
 */
export function weeksSince(startedAt: Date | string | null | undefined, todayKey: string, tz: number): number | null {
  if (!startedAt) return null
  const start = new Date(startedAt)
  if (Number.isNaN(start.getTime())) return null
  const startKey = dateKey(start, tz)
  if (startKey > todayKey) return null
  const days = Math.floor((utcMidnightDateKey(todayKey).getTime() - utcMidnightDateKey(startKey).getTime()) / 86_400_000)
  return Math.floor(days / 7) + 1
}

export async function loadWidgetFeed(
  userId: string,
  requestedTz: number | null,
  now: Date = new Date(),
): Promise<WidgetFeed> {
  const uid = new Types.ObjectId(userId)

  // The offset lives on UserProgress, so that document has to land before the
  // day-scoped queries can be built. Everything after it goes out together.
  const progress = await UserProgress.findOne({ userId })
    .select('streakDays longestStreak lastActivityDate workoutLogs timezoneOffset timezone')
    .lean<{
      streakDays?: number
      longestStreak?: number
      lastActivityDate?: Date
      workoutLogs?: WorkoutLog[]
      timezoneOffset?: number
      timezone?: string
    } | null>()

  const tz = resolveWidgetTzOffset(requestedTz, progress, now)
  const todayKey = dateKey(now, tz)
  const { start, end } = localDayWindowForKey(todayKey, tz)

  const [user, mealLogs, dayRow, goal, mind, todaySession, schedules] = await Promise.all([
    User.findById(userId).select('createdAt profile.weeklyAvailability').lean<{
      createdAt?: Date
      profile?: { weeklyAvailability?: number }
    } | null>(),
    MealLog.find({ user: uid, loggedAt: { $gte: start, $lte: end } }, { totalNutrition: 1 }).lean<
      Array<{ totalNutrition?: { calories?: number; protein?: number; carbs?: number; fats?: number } }>
    >(),
    DayNutrition.findOne({ userId: uid, date: utcMidnightDateKey(todayKey) }, { quickAdds: 1 }).lean<{
      quickAdds?: Array<{ calories?: number; protein?: number; carbs?: number; fats?: number }>
    } | null>(),
    NutritionGoal.findOne({ userId }).select('calories protein carbs fats').lean<{
      calories?: number
      protein?: number
      carbs?: number
      fats?: number
    } | null>(),
    MindProgress.findOne({ userId })
      .select('chapter mainSessionCount lastMainSessionAt vision.identityStatement')
      .lean<{
        chapter?: number
        mainSessionCount?: number
        lastMainSessionAt?: Date
        vision?: { identityStatement?: string }
      } | null>(),
    MindSession.findOne({ userId, dateKey: todayKey }).select('_id').lean(),
    Schedule.find({ userId }, { programId: 1, programName: 1, scheduledWorkouts: 1, 'settings.trainingDays': 1 })
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean<Array<{ programId?: string; scheduledWorkouts?: Slot[]; settings?: { trainingDays?: number[] } }>>(),
  ])

  // --- streak -------------------------------------------------------------
  const lastActivityKey = progress?.lastActivityDate ? dateKey(new Date(progress.lastActivityDate), tz) : null

  // --- nutrition ----------------------------------------------------------
  const macros = sumMacros(mealLogs, dayRow?.quickAdds ?? [])
  const positive = (n: number | undefined | null) => (typeof n === 'number' && n > 0 ? n : null)

  // --- mind ---------------------------------------------------------------
  // Same derivation /api/mind/summary uses, and for the same reason: the
  // intake's chapter head start is real progress, so the session count has to
  // be read up to it rather than under it.
  const storedChapter = mind?.chapter ?? 1
  const mainSessionCount = Math.max(mind?.mainSessionCount ?? 0, (storedChapter - 1) * SESSIONS_PER_CHAPTER)
  const chapter = Math.max(storedChapter, chapterFromSessions(mainSessionCount))
  const into = sessionsIntoChapter(mainSessionCount)

  // --- training + becoming ------------------------------------------------
  // A slot date is a day MARKER (00:00Z meaning a calendar day), so it is read
  // with slotDateKey and compared to the member's local day key — never put
  // through the offset, which is what once made the morning push name
  // tomorrow's workout.
  const slots: Slot[] = schedules.flatMap((s) => s.scheduledWorkouts ?? [])
  const todaySlots = slots.filter((s) => slotDateKey(s.date) === todayKey)
  const scheduledToday = todaySlots.find((s) => s.status === 'scheduled') ?? null
  const completedSlotToday = todaySlots.some((s) => s.status === 'completed')
  const restToday = todaySlots.length > 0 && todaySlots.every((s) => s.status === 'rest')

  let title: string | null = null
  if (scheduledToday) {
    // Resolve against the LIVE program: the slot caches its title at generation
    // time, so a coach's edit leaves a stale name behind — and a stale name on
    // a home screen is read as fact.
    const program = scheduledToday.programId
      ? await ProgramModel.findOne({ program_id: scheduledToday.programId })
          .select('phases')
          .lean<{ phases?: unknown[] } | null>()
      : null
    const live = program
      ? workoutTitleForDay((program.phases ?? []) as unknown[], scheduledToday.phase ?? 1, scheduledToday.dayLabel ?? '')
      : null
    title = live || scheduledToday.workoutTitle || scheduledToday.dayLabel || null
  }

  // workoutLogs.date is an INSTANT, so it goes through the offset to find its
  // local day — the opposite of a slot date, one line above.
  const thisWeekKey = weekKeyOf(todayKey)
  let workoutsThisWeek = 0
  let loggedWorkoutToday = false
  for (const log of progress?.workoutLogs ?? []) {
    if (log.completed !== true || !log.date) continue
    const d = new Date(log.date)
    if (Number.isNaN(d.getTime())) continue
    const key = dateKey(d, tz)
    if (key === todayKey) loggedWorkoutToday = true
    if (weekKeyOf(key) === thisWeekKey) workoutsThisWeek += 1
  }

  const trainingDays = schedules.find((s) => (s.settings?.trainingDays ?? []).length > 0)?.settings?.trainingDays
  const weeklyTarget = trainingDays?.length || positive(user?.profile?.weeklyAvailability)

  const input: WidgetFeedInput = {
    todayKey,
    now: now.getTime(),
    streak: {
      current: progress?.streakDays ?? 0,
      longest: progress?.longestStreak ?? progress?.streakDays ?? 0,
      activityToday: lastActivityKey === todayKey,
    },
    nutrition: {
      calories: macros.calories,
      protein: macros.protein,
      carbs: macros.carbs,
      fats: macros.fats,
      targets: {
        calories: positive(goal?.calories),
        protein: positive(goal?.protein),
        carbs: positive(goal?.carbs),
        fats: positive(goal?.fats),
      },
      entries: macros.entries,
    },
    mind: {
      chapter,
      chapterName: CHAPTERS[chapter - 1]?.name ?? null,
      sessionDoneToday: !!todaySession,
      sessionAvailable: mainSessionAvailable(mind?.lastMainSessionAt, now.getTime()),
      sessionsIntoChapter: into.done,
      sessionsPerChapter: into.needed,
    },
    becoming: {
      week: weeksSince(user?.createdAt, todayKey, tz),
      identity: mind?.vision?.identityStatement?.trim() || null,
      chapterName: CHAPTERS[chapter - 1]?.name ?? null,
      workoutsThisWeek,
      weeklyTarget: weeklyTarget ?? null,
    },
    training: {
      title,
      completedToday: completedSlotToday || loggedWorkoutToday,
      restDay: restToday,
    },
  }

  return buildWidgetFeed(input)
}
