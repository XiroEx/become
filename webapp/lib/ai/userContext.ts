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
import User from '@/models/User'
import UserProgress from '@/models/UserProgress'
import Schedule from '@/models/Schedule'
import MindProgress from '@/models/MindProgress'
import Mission from '@/models/Mission'
import IdentityProfile from '@/models/IdentityProfile'
import DailyWin from '@/models/DailyWin'
import MealLog from '@/models/MealLog'
import DayNutrition from '@/models/DayNutrition'
import NutritionGoal from '@/models/NutritionGoal'

const DAY = 86_400_000

export interface UserContext {
  profile?: {
    goal?: string
    experience?: string
    age?: number
    sex?: string
    heightCm?: number
    currentWeightKg?: number
    targetWeightKg?: number
    injuries?: string
    equipment?: string[]
  }
  /** Most recent logged scale weight (lbs), independent of the profile figure. */
  latestWeight?: { lbs: number; daysAgo: number }
  streak?: { current: number; longest: number }
  lastWorkout?: { title: string; daysAgo: number }
  workoutsLast7Days?: number
  mood?: { avg7: number; entries7: number }
  /** Today's dashboard mood check-in (1–5), when there is one. This is the
   *  member telling us how they feel RIGHT NOW — the Mind session composer
   *  should open from it rather than the 7-day average. */
  moodToday?: { value: number; label: string; hoursAgo: number }
  /** The member's plan (lib/goals): where they stand against their own targets. */
  goals?: { nutrition?: string; training?: string }
  program?: { name: string; phase?: number; day?: string }
  /** Schedule adherence for the active program — so the AI knows when the user
   *  is behind (missed / overdue) and what their next session actually is. */
  schedule?: {
    completed: number
    missed: number
    /** Past-dated workouts still marked 'scheduled' (silently behind). */
    overdue: number
    nextWorkout?: { title: string; dayLabel?: string; inDays: number }
  }
  nutritionToday?: { calories: number; protein: number; goalCalories?: number; goalProtein?: number; daysAgo: number }
  identityStatement?: string
  futureSelf?: string
  /** The Vision powerhouse — the user's future self across life domains. */
  visionDomains?: { habits?: string; mind?: string; body?: string; relationships?: string; environment?: string }
  mission?: { purpose?: string; whyItMatters?: string; dailyAction?: string }
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
/**
 * Day-key helpers. Become stores two kinds of date: real INSTANTS (loggedAt,
 * completedAt) and day MARKERS pegged to 00:00Z that mean a calendar day. They
 * must never be compared to each other directly — that is how "today" becomes
 * "overdue" and "tomorrow" becomes "today".
 */

/** The calendar day a MARKER refers to. Read the UTC date part, nothing else. */
function slotDayKey(value: unknown): string | null {
  if (typeof value === 'string') return value.slice(0, 10) || null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const t = typeof value === 'number' ? value : Date.parse(String(value ?? ''))
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString().slice(0, 10) : null
}

/** The calendar day an INSTANT falls on for this member. */
function userDayKey(atMs: number, tzOffsetMinutes: number | undefined): string {
  const offset = Number.isFinite(tzOffsetMinutes as number) ? (tzOffsetMinutes as number) : 0
  return new Date(atMs - offset * 60 * 1000).toISOString().slice(0, 10)
}

/** Whole days from one key to another. Both are plain dates, so no DST skew. */
function daysBetweenKeys(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00.000Z`)
  const b = Date.parse(`${to}T00:00:00.000Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / DAY))
}

export async function assembleUserContext(userId: string): Promise<UserContext> {
  const now = Date.now()
  const ctx: UserContext = { summaryText: '' }
  if (!userId) return ctx

  try {
    await dbConnect()
  } catch {
    return ctx
  }

  const [user, progress, mind, mission, identity, wins, nutGoal, nutLog, schedules] = await Promise.all([
    User.findById(userId).lean<Record<string, unknown>>().catch(() => null),
    UserProgress.findOne({ userId }).lean<Record<string, unknown>>().catch(() => null),
    MindProgress.findOne({ userId }).lean<Record<string, unknown>>().catch(() => null),
    Mission.findOne({ userId }).lean<Record<string, unknown>>().catch(() => null),
    IdentityProfile.findOne({ userId }).lean<Record<string, unknown>>().catch(() => null),
    DailyWin.find({ userId }).sort({ date: -1 }).limit(3).lean<Array<Record<string, unknown>>>().catch(() => []),
    NutritionGoal.findOne({ userId }).lean<Record<string, unknown>>().catch(() => null),
    MealLog.findOne({ user: userId }).sort({ loggedAt: -1 }).lean<Record<string, unknown>>().catch(() => null),
    Schedule.find({ userId }).lean<Array<Record<string, unknown>>>().catch(() => []),
  ])

  // Profile (physical stats + goal) — what a coach needs to tailor advice.
  const prof = user?.profile as Record<string, unknown> | undefined
  if (prof) {
    const p: NonNullable<UserContext['profile']> = {}
    if (prof.fitnessGoal) p.goal = String(prof.fitnessGoal)
    if (prof.experienceLevel) p.experience = String(prof.experienceLevel)
    if (typeof prof.age === 'number') p.age = prof.age
    if (prof.biologicalSex) p.sex = String(prof.biologicalSex)
    if (typeof prof.heightCm === 'number') p.heightCm = prof.heightCm
    if (typeof prof.currentWeightKg === 'number') p.currentWeightKg = prof.currentWeightKg
    if (typeof prof.targetWeightKg === 'number') p.targetWeightKg = prof.targetWeightKg
    if (prof.injuryNotes) p.injuries = String(prof.injuryNotes)
    if (Array.isArray(prof.equipmentAccess) && prof.equipmentAccess.length) p.equipment = (prof.equipmentAccess as unknown[]).map(String)
    if (Object.keys(p).length) ctx.profile = p
  }

  // Latest logged scale weight (lbs) — often fresher than the profile figure.
  const weightHist = Array.isArray(progress?.weightHistory) ? (progress!.weightHistory as Array<Record<string, unknown>>) : []
  if (weightHist.length) {
    const last = weightHist[weightHist.length - 1]
    const ago = daysAgo(last?.date as Date, now)
    if (typeof last?.weight === 'number' && ago !== undefined) ctx.latestWeight = { lbs: Math.round(last.weight as number), daysAgo: ago }
  }

  // Streak
  if (progress && typeof progress.streakDays === 'number') {
    ctx.streak = { current: progress.streakDays as number, longest: (progress.longestStreak as number) ?? 0 }
  }

  // Workouts: last completed + count in last 7 days
  const tzOffset = typeof progress?.timezoneOffset === 'number' ? progress.timezoneOffset as number : undefined

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
  // Today's check-in specifically. moodHistory rows are UTC-midnight day
  // markers; the moment it was tapped is the last matching change entry.
  const todayMarker = moodHist.find((m) => daysAgo(m.date as Date, now) === 0 && typeof m.mood === 'number')
  if (todayMarker) {
    const value = todayMarker.mood as number
    const changes = Array.isArray(progress?.moodChangeHistory) ? (progress!.moodChangeHistory as Array<Record<string, unknown>>) : []
    const lastChange = [...changes].reverse().find((c) => daysAgo(c.date as Date, now) === 0)
    const at = lastChange?.timestamp ? new Date(lastChange.timestamp as Date).getTime() : now
    const labels: Record<number, string> = { 1: 'Bad', 2: 'Not great', 3: 'Okay', 4: 'Pretty good', 5: 'Great' }
    ctx.moodToday = { value, label: labels[value] ?? String(value), hoursAgo: Math.max(0, Math.round((now - at) / 3_600_000)) }
  }

  // The plan: pace / ETA / adherence for nutrition, week + consistency for
  // training, and each pillar's "work on next". Best effort — never blocks.
  try {
    const { computeGoalProgress } = await import('@/lib/goals/progress')
    const gp = await computeGoalProgress(userId, 0)
    const n = gp.nutrition, t = gp.training
    const goals: { nutrition?: string; training?: string } = {}
    if (n.target.weight) {
      const bits = [`target ${Math.round(n.target.weight)} ${n.unit}${n.direction ? ` (${n.direction})` : ''}`]
      if (n.now.weight != null) bits.push(`now ${Math.round(n.now.weight)}`)
      if (n.pace) bits.push(n.pace.status === 'behind' ? `behind pace by ${(n.pace.behindByKg / 0.45359237).toFixed(1)} lb` : n.pace.status === 'ahead' ? 'ahead of pace' : n.pace.status === 'on' ? `on pace, ${n.pace.eta}` : n.pace.status)
      if (n.adherence) bits.push(`logged ${n.adherence.logDays}/7 days${n.adherence.proteinJudged ? `, protein hit ${n.adherence.proteinDays}/7` : ''}`)
      bits.push(`next: ${n.suggestion.title}`)
      goals.nutrition = bits.join('; ')
    }
    if (t.target.daysPerWeek) {
      goals.training = `${t.thisWeek.done}/${t.target.daysPerWeek} this week${t.thisWeek.weekLost ? ' (week off track)' : ''}${t.avgLast4 != null ? `, avg ${t.avgLast4}/wk last 4` : ''}; next: ${t.suggestion.title}`
    }
    if (goals.nutrition || goals.training) ctx.goals = goals
  } catch { /* optional */ }

  // Active program: the one the user has actually STARTED and is most recently
  // active in. We must exclude programs whose startDate is in the future (e.g.
  // one scheduled to begin next month): a future startDate sorts above a current
  // program's last-workout date, so the not-yet-started program was getting
  // picked as "active" — making the AI talk about "Day 1 of the 30-Day Shred"
  // (unstarted) instead of the program the user is mid-way through (and missing
  // workouts on).
  const programs = Array.isArray(progress?.activePrograms) ? (progress!.activePrograms as Array<Record<string, unknown>>) : []
  const ms = (d: unknown): number => {
    const t = d ? new Date(d as Date).getTime() : 0
    return Number.isFinite(t) ? t : 0
  }
  // Activity recency = most recent workout, or the start date once it has
  // actually arrived (future start dates don't count toward "recency").
  const activityTime = (p: Record<string, unknown>): number => {
    const st = ms(p.startDate)
    return Math.max(ms(p.lastWorkoutDate), st <= now ? st : 0)
  }
  const active = programs
    .filter((p) => p.status === 'in-progress' || p.status === 'active')
    // Drop programs that haven't started yet (future startDate, no activity).
    .filter((p) => ms(p.lastWorkoutDate) > 0 || ms(p.startDate) === 0 || ms(p.startDate) <= now)
    .sort((a, b) => activityTime(b) - activityTime(a))[0]
  if (active) ctx.program = { name: (active.programName as string) || 'your program', phase: active.currentPhase as number, day: active.currentDay as string }

  // Schedule adherence for the active program. THIS is how the AI knows the user
  // is behind (missed / overdue sessions) instead of cheerily acting like every
  // day is Day 1. Match the schedule to the active program by id, then name.
  if (active && Array.isArray(schedules) && schedules.length) {
    const aId = active.programId != null ? String(active.programId) : ''
    const aName = (active.programName as string) || ''
    const sched =
      schedules.find((s) => aId && String(s.programId) === aId) ||
      schedules.find((s) => aName && s.programName === aName) ||
      undefined
    const workouts = Array.isArray(sched?.scheduledWorkouts)
      ? (sched!.scheduledWorkouts as Array<Record<string, unknown>>)
      : []
    if (workouts.length) {
      let completed = 0
      let missed = 0
      let overdue = 0
      let next: { title: string; dayLabel?: string; inDays: number } | undefined

      // Compare CALENDAR DAYS, not instants.
      //
      // A slot's date is a day marker pegged to 00:00Z — it means "Aug 12", not
      // a moment. Comparing it to `now` made today's workout look PAST from
      // 00:00Z onward, so it was counted as overdue and skipped; then tomorrow's
      // marker, being under 12h away for the second half of the day, rounded to
      // inDays 0 and was announced as "today".
      //
      // That is how the Mind coach told a member training Legs to go hit their
      // "Chest and Back workout today" on 2026-08-12. Unlike the notification
      // version of this bug, this one is not confined to timezones behind UTC —
      // the rounding flips for everyone once it is past midday UTC.
      const todayKey = userDayKey(now, tzOffset)
      for (const w of workouts) {
        const status = String(w.status ?? '')
        const key = slotDayKey(w.date)
        if (status === 'completed') completed++
        else if (status === 'missed') missed++
        else if (status === 'scheduled' && key) {
          if (key < todayKey) {
            // Past-dated but never completed/marked — the user is silently behind.
            overdue++
          } else {
            const inDays = daysBetweenKeys(todayKey, key)
            if (!next || inDays < next.inDays) {
              next = { title: (w.workoutTitle as string) || 'your next workout', dayLabel: w.dayLabel as string, inDays }
            }
          }
        }
      }
      ctx.schedule = { completed, missed, overdue, ...(next ? { nextWorkout: next } : {}) }
    }
  }

  // Nutrition: most recent logged day vs goals. Totals are computed from
  // MealLog (the canonical food log) + that day's quickAdds — `nutLog` here is
  // the user's most recent MealLog, which anchors the day we summarize.
  if (nutLog && nutLog.loggedAt) {
    const d = new Date(nutLog.loggedAt as Date)
    const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1)
    const [dayLogs, extras] = await Promise.all([
      MealLog.find({ user: userId, loggedAt: { $gte: dayStart, $lte: dayEnd } })
        .lean<Array<Record<string, unknown>>>().catch(() => []),
      DayNutrition.findOne({ userId, date: dayStart })
        .lean<Record<string, unknown>>().catch(() => null),
    ])
    let calories = 0
    let protein = 0
    for (const l of dayLogs) {
      const n = (l.totalNutrition as Record<string, number>) || {}
      calories += n.calories || 0
      protein += n.protein || 0
    }
    const quickAdds = (extras?.quickAdds as Array<Record<string, number>>) || []
    for (const qa of quickAdds) {
      calories += qa.calories || 0
      protein += qa.protein || 0
    }
    ctx.nutritionToday = {
      calories: Math.round(calories),
      protein: Math.round(protein),
      goalCalories: nutGoal ? (nutGoal.calories as number) : undefined,
      goalProtein: nutGoal ? (nutGoal.protein as number) : undefined,
      daysAgo: daysAgo(dayStart, now) ?? 0,
    }
  }

  // Mind identity / mission / vision
  if (mind) {
    ctx.mindChapter = mind.chapter as number
    const vision = mind.vision as Record<string, unknown> | undefined
    if (vision?.identityStatement) ctx.identityStatement = vision.identityStatement as string
    // Vision is the powerhouse — the future self across every domain. Carry the
    // domains so every Mind segment can reason from where the user is headed.
    if (vision) {
      const dom: NonNullable<UserContext['visionDomains']> = {}
      for (const k of ['habits', 'mind', 'body', 'relationships', 'environment'] as const) {
        const v = vision[k]
        if (typeof v === 'string' && v.trim()) dom[k] = v.trim()
      }
      if (Object.keys(dom).length) ctx.visionDomains = dom
    }
  }
  if (identity?.futureSelf) ctx.futureSelf = identity.futureSelf as string
  if (mission) ctx.mission = { purpose: mission.purpose as string, whyItMatters: mission.whyItMatters as string, dailyAction: mission.dailyAction as string }
  if (wins?.length) ctx.recentWins = wins.map((w) => w.win as string).filter(Boolean)

  ctx.summaryText = renderSummary(ctx)
  return ctx
}

/** Compact plain-text rendering (no markdown) for prompt injection. */
function renderSummary(c: UserContext): string {
  const lines: string[] = []
  if (c.profile) {
    const p = c.profile
    const bits: string[] = []
    if (p.age) bits.push(`${p.age}yo`)
    if (p.sex) bits.push(p.sex)
    if (p.heightCm) bits.push(`${p.heightCm}cm`)
    if (p.currentWeightKg) bits.push(`${p.currentWeightKg}kg${p.targetWeightKg ? ` (goal ${p.targetWeightKg}kg)` : ''}`)
    if (p.experience) bits.push(p.experience)
    if (p.goal) bits.push(`goal: ${p.goal}`)
    if (bits.length) lines.push(`Profile: ${bits.join(', ')}.`)
    if (p.injuries) lines.push(`Injuries/notes: ${p.injuries}.`)
    if (p.equipment?.length) lines.push(`Equipment: ${p.equipment.join(', ')}.`)
  }
  if (c.latestWeight) lines.push(`Latest logged weight: ${c.latestWeight.lbs} lbs (${c.latestWeight.daysAgo === 0 ? 'today' : `${c.latestWeight.daysAgo}d ago`}).`)
  if (c.streak) lines.push(`Streak: ${c.streak.current} day${c.streak.current === 1 ? '' : 's'} (best ${c.streak.longest}).`)
  if (c.lastWorkout) lines.push(`Last workout: ${c.lastWorkout.title}, ${c.lastWorkout.daysAgo === 0 ? 'today' : `${c.lastWorkout.daysAgo}d ago`}.`)
  if (typeof c.workoutsLast7Days === 'number') lines.push(`Workouts in last 7 days: ${c.workoutsLast7Days}.`)
  if (c.moodToday) lines.push(`Mood check-in TODAY: ${c.moodToday.label} (${c.moodToday.value}/5), ${c.moodToday.hoursAgo === 0 ? 'within the hour' : `${c.moodToday.hoursAgo}h ago`}. Open from this — acknowledge it before anything else.`)
  if (c.mood) lines.push(`Mood (7-day avg): ${c.mood.avg7}/5 over ${c.mood.entries7} check-in${c.mood.entries7 === 1 ? '' : 's'}.`)
  if (c.goals?.nutrition) lines.push(`Nutrition plan: ${c.goals.nutrition}.`)
  if (c.goals?.training) lines.push(`Training plan: ${c.goals.training}.`)
  if (c.program) lines.push(`Program: ${c.program.name}${c.program.phase ? `, phase ${c.program.phase}` : ''}${c.program.day ? `, ${c.program.day}` : ''}.`)
  if (c.schedule) {
    const s = c.schedule
    const behind = s.missed + s.overdue
    const bits = [`${s.completed} done`, `${s.missed} missed`]
    if (s.overdue) bits.push(`${s.overdue} overdue`)
    let line = `Schedule: ${bits.join(', ')}.`
    // State it as a fact, not an instruction. The old imperative ("acknowledge it
    // and help them restart") bled into the mind-session composer and made every
    // move fixate on the workout backlog. Each consumer decides what to do with it.
    if (behind > 0) line += ` User is ${behind} session${behind === 1 ? '' : 's'} behind on this program.`
    if (s.nextWorkout) {
      const when = s.nextWorkout.inDays === 0 ? 'today' : s.nextWorkout.inDays === 1 ? 'tomorrow' : `in ${s.nextWorkout.inDays}d`
      line += ` Next: ${s.nextWorkout.dayLabel ? `${s.nextWorkout.dayLabel} — ` : ''}${s.nextWorkout.title} (${when}).`
    }
    lines.push(line)
  }
  if (c.nutritionToday) {
    const n = c.nutritionToday
    const when = n.daysAgo === 0 ? 'today' : `${n.daysAgo}d ago`
    lines.push(`Nutrition (${when}): ${n.calories} kcal${n.goalCalories ? `/${n.goalCalories}` : ''}, ${n.protein}g protein${n.goalProtein ? `/${n.goalProtein}g` : ''}.`)
  }
  // Mission + Vision are the fuel — surface them prominently so every Mind
  // segment's AI reasons from the user's actual purpose and future self.
  if (c.mission?.purpose) lines.push(`Their mission / purpose: "${c.mission.purpose}".`)
  if (c.mission?.whyItMatters) lines.push(`Why it matters to them: ${c.mission.whyItMatters}.`)
  if (c.identityStatement) lines.push(`Identity statement: "${c.identityStatement}".`)
  else if (c.futureSelf) lines.push(`Future self they're becoming: ${c.futureSelf}.`)
  if (c.visionDomains) {
    const d = c.visionDomains
    const parts = [
      d.body && `body: ${d.body}`, d.mind && `mind: ${d.mind}`, d.habits && `habits: ${d.habits}`,
      d.relationships && `relationships: ${d.relationships}`, d.environment && `environment: ${d.environment}`,
    ].filter(Boolean)
    if (parts.length) lines.push(`Their vision (future self across life) — ${parts.join('; ')}.`)
  }
  if (c.mission?.dailyAction) lines.push(`Their daily forward move: ${c.mission.dailyAction}.`)
  if (c.recentWins?.length) lines.push(`Recent wins: ${c.recentWins.join('; ')}.`)
  return lines.join('\n')
}
