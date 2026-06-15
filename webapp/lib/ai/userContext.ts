// Assemble a compact, per-user context summary for the AI layer.
//
// This is the SHARED core of the AI-context architecture:
//   • pushed into the graph `context` on every AI call (the cheap baseline), and
//   • served by GET /api/ai/context, and
//   • later exposed as the `become_get_context` MCP tool.
// One assembler, three consumers — no duplicate work.
//
// Server-only: queries Mongo directly, scoped strictly to the passed userId.
// Defensive: every section is independently guarded so one missing doc never
// blanks the whole summary. Output is plain text (no markdown) + a structured
// object. Keep it SHORT — this rides in the prompt on every call.

import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import MindProgress from '@/models/MindProgress'
import Mission from '@/models/Mission'
import IdentityProfile from '@/models/IdentityProfile'
import DailyWin from '@/models/DailyWin'
import NutritionLog from '@/models/NutritionLog'
import NutritionGoal from '@/models/NutritionGoal'

const DAY = 86_400_000

export interface UserContext {
  streak?: { current: number; longest: number }
  lastWorkout?: { title: string; daysAgo: number }
  workoutsLast7Days?: number
  mood?: { avg7: number; entries7: number }
  program?: { name: string; phase?: number; day?: string }
  nutritionToday?: { calories: number; protein: number; goalCalories?: number; goalProtein?: number; daysAgo: number }
  identityStatement?: string
  futureSelf?: string
  mission?: { purpose?: string; dailyAction?: string }
  mindChapter?: number
  recentWins?: string[]
  /** A compact plain-text rendering for direct prompt injection. */
  summaryText: string
}

function daysAgo(d: Date | string | undefined, now: number): number | undefined {
  if (!d) return undefined
  const t = new Date(d).getTime()
  if (!Number.isFinite(t)) return undefined
  return Math.max(0, Math.round((now - t) / DAY))
}

/**
 * Build the user-context summary. Never throws — returns at least an empty
 * summary so callers can always proceed.
 */
export async function assembleUserContext(userId: string): Promise<UserContext> {
  const now = Date.now()
  const ctx: UserContext = { summaryText: '' }
  if (!userId) return ctx

  try {
    await dbConnect()
  } catch {
    return ctx
  }

  const [progress, mind, mission, identity, wins, nutGoal, nutLog] = await Promise.all([
    UserProgress.findOne({ userId }).lean<Record<string, unknown>>().catch(() => null),
    MindProgress.findOne({ userId }).lean<Record<string, unknown>>().catch(() => null),
    Mission.findOne({ userId }).lean<Record<string, unknown>>().catch(() => null),
    IdentityProfile.findOne({ userId }).lean<Record<string, unknown>>().catch(() => null),
    DailyWin.find({ userId }).sort({ date: -1 }).limit(3).lean<Array<Record<string, unknown>>>().catch(() => []),
    NutritionGoal.findOne({ userId }).lean<Record<string, unknown>>().catch(() => null),
    NutritionLog.findOne({ userId }).sort({ date: -1 }).lean<Record<string, unknown>>().catch(() => null),
  ])

  // Streak
  if (progress && typeof progress.streakDays === 'number') {
    ctx.streak = { current: progress.streakDays as number, longest: (progress.longestStreak as number) ?? 0 }
  }

  // Workouts: last completed + count in last 7 days
  const logs = Array.isArray(progress?.workoutLogs) ? (progress!.workoutLogs as Array<Record<string, unknown>>) : []
  if (logs.length) {
    const completed = logs.filter((l) => l.completed !== false && l.date)
    const last = completed[completed.length - 1] ?? logs[logs.length - 1]
    const ago = daysAgo(last?.date as Date, now)
    if (last && ago !== undefined) ctx.lastWorkout = { title: (last.title as string) || 'a workout', daysAgo: ago }
    ctx.workoutsLast7Days = logs.filter((l) => {
      const a = daysAgo(l.date as Date, now)
      return a !== undefined && a <= 7 && l.completed !== false
    }).length
  }

  // Mood: 7-day average
  const moodHist = Array.isArray(progress?.moodHistory) ? (progress!.moodHistory as Array<Record<string, unknown>>) : []
  const recentMoods = moodHist.filter((m) => { const a = daysAgo(m.date as Date, now); return a !== undefined && a <= 7 && typeof m.mood === 'number' })
  if (recentMoods.length) {
    const avg = recentMoods.reduce((s, m) => s + (m.mood as number), 0) / recentMoods.length
    ctx.mood = { avg7: Math.round(avg * 10) / 10, entries7: recentMoods.length }
  }

  // Active program (most recent in-progress)
  const programs = Array.isArray(progress?.activePrograms) ? (progress!.activePrograms as Array<Record<string, unknown>>) : []
  const active = programs
    .filter((p) => p.status === 'in-progress' || p.status === 'active')
    .sort((a, b) => new Date((b.lastWorkoutDate as Date) || (b.startDate as Date) || 0).getTime() - new Date((a.lastWorkoutDate as Date) || (a.startDate as Date) || 0).getTime())[0]
  if (active) ctx.program = { name: (active.programName as string) || 'your program', phase: active.currentPhase as number, day: active.currentDay as string }

  // Nutrition: most recent logged day vs goals
  if (nutLog && nutLog.dailyTotals) {
    const t = nutLog.dailyTotals as Record<string, number>
    ctx.nutritionToday = {
      calories: Math.round(t.calories ?? 0),
      protein: Math.round(t.protein ?? 0),
      goalCalories: nutGoal ? (nutGoal.calories as number) : undefined,
      goalProtein: nutGoal ? (nutGoal.protein as number) : undefined,
      daysAgo: daysAgo(nutLog.date as Date, now) ?? 0,
    }
  }

  // Mind identity / mission / vision
  if (mind) {
    ctx.mindChapter = mind.chapter as number
    const vision = mind.vision as Record<string, unknown> | undefined
    if (vision?.identityStatement) ctx.identityStatement = vision.identityStatement as string
  }
  if (identity?.futureSelf) ctx.futureSelf = identity.futureSelf as string
  if (mission) ctx.mission = { purpose: mission.purpose as string, dailyAction: mission.dailyAction as string }
  if (wins?.length) ctx.recentWins = wins.map((w) => w.win as string).filter(Boolean)

  ctx.summaryText = renderSummary(ctx)
  return ctx
}

/** Compact plain-text rendering (no markdown) for prompt injection. */
function renderSummary(c: UserContext): string {
  const lines: string[] = []
  if (c.streak) lines.push(`Streak: ${c.streak.current} day${c.streak.current === 1 ? '' : 's'} (best ${c.streak.longest}).`)
  if (c.lastWorkout) lines.push(`Last workout: ${c.lastWorkout.title}, ${c.lastWorkout.daysAgo === 0 ? 'today' : `${c.lastWorkout.daysAgo}d ago`}.`)
  if (typeof c.workoutsLast7Days === 'number') lines.push(`Workouts in last 7 days: ${c.workoutsLast7Days}.`)
  if (c.mood) lines.push(`Mood (7-day avg): ${c.mood.avg7}/5 over ${c.mood.entries7} check-in${c.mood.entries7 === 1 ? '' : 's'}.`)
  if (c.program) lines.push(`Program: ${c.program.name}${c.program.phase ? `, phase ${c.program.phase}` : ''}${c.program.day ? `, ${c.program.day}` : ''}.`)
  if (c.nutritionToday) {
    const n = c.nutritionToday
    const when = n.daysAgo === 0 ? 'today' : `${n.daysAgo}d ago`
    lines.push(`Nutrition (${when}): ${n.calories} kcal${n.goalCalories ? `/${n.goalCalories}` : ''}, ${n.protein}g protein${n.goalProtein ? `/${n.goalProtein}g` : ''}.`)
  }
  if (c.identityStatement) lines.push(`Identity statement: "${c.identityStatement}".`)
  else if (c.futureSelf) lines.push(`Future self: ${c.futureSelf}.`)
  if (c.mission?.dailyAction) lines.push(`Today's commitment: ${c.mission.dailyAction}.`)
  if (c.recentWins?.length) lines.push(`Recent wins: ${c.recentWins.join('; ')}.`)
  return lines.join('\n')
}
