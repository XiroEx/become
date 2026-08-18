// The Becoming journey — server assembly. Gathers every event source once,
// buckets by the member's local day, and hands lib/becoming/weeks the map.

import { Types } from 'mongoose'
import User from '@/models/User'
import UserProgress from '@/models/UserProgress'
import MealLog from '@/models/MealLog'
import DayNutrition from '@/models/DayNutrition'
import NutritionGoal from '@/models/NutritionGoal'
import MindSession from '@/models/MindSession'
import StateLog from '@/models/StateLog'
import MindProgress from '@/models/MindProgress'
import DailyWin from '@/models/DailyWin'
import { localDateKey, dateKey } from '@/lib/dayWindow'
import { shiftDay } from '@/lib/streaks/pillars'
import { buildWeeks, emptyDay, type DayEvents, type WeekSnapshot, type MindState } from '@/lib/becoming/weeks'
import { computeGoalProgress } from '@/lib/goals/progress'
import { kgToUnit, unitToKg } from '@/lib/goals/pace'

export interface JourneyPayload {
  todayKey: string
  identity: string | null
  firstActivity: string | null
  unit: 'lbs' | 'kg'
  target: { weight: number | null; direction: 'lose' | 'maintain' | 'gain' | null; pace: string | null; eta: string | null }
  weeklyTarget: number | null
  weeks: WeekSnapshot[]
  /** For the live card's "what's next". */
  next: { nutrition: { title: string; sub: string; url: string }; training: { title: string; sub: string; url: string } } | null
  becomingScore: number
  chapter: number
}

const MAX_WEEKS = 52

export async function computeJourney(userId: string, tz: number, now = new Date()): Promise<JourneyPayload> {
  const uid = new Types.ObjectId(userId)
  const todayKey = localDateKey(null, tz, now)
  const fromKey = shiftDay(todayKey, -MAX_WEEKS * 7)
  const since = new Date(Date.UTC(Number(fromKey.slice(0, 4)), Number(fromKey.slice(5, 7)) - 1, Number(fromKey.slice(8, 10))) + tz * 60_000)

  const [user, progress, mealLogs, dayRows, ngoal, sessions, states, mind, wins, goals] = await Promise.all([
    User.findById(userId, 'profile createdAt').lean() as Promise<{ profile?: { weightUnit?: 'lbs' | 'kg'; weeklyAvailability?: number }; createdAt?: Date } | null>,
    UserProgress.findOne({ userId }).select('weightHistory workoutLogs exercisePRs moodHistory').lean() as Promise<Record<string, unknown> | null>,
    MealLog.find({ user: uid, loggedAt: { $gte: since } }, { loggedAt: 1, 'totalNutrition.calories': 1, 'totalNutrition.protein': 1 }).lean() as Promise<Array<{ loggedAt: Date; totalNutrition?: { calories?: number; protein?: number } }>>,
    DayNutrition.find({ userId: uid, date: { $gte: since }, 'quickAdds.0': { $exists: true } }, { date: 1, quickAdds: 1 }).lean() as Promise<Array<{ date: Date; quickAdds?: Array<{ calories?: number; protein?: number }> }>>,
    NutritionGoal.findOne({ userId }).select('protein').lean() as Promise<{ protein?: number } | null>,
    MindSession.find({ userId: uid, completedAt: { $gte: since } }, { dateKey: 1 }).lean() as Promise<Array<{ dateKey: string }>>,
    StateLog.find({ userId: uid, timestamp: { $gte: since } }, { timestamp: 1, state: 1 }).lean() as Promise<Array<{ timestamp: Date; state: MindState }>>,
    MindProgress.findOne({ userId }).select('vision chapterHistory xpBank chapter').lean() as Promise<{ vision?: { identityStatement?: string }; chapterHistory?: Array<{ chapter: number; unlockedAt: Date }>; xpBank?: number; chapter?: number } | null>,
    DailyWin.find({ userId: uid, date: { $gte: since } }, { date: 1, win: 1 }).lean() as Promise<Array<{ date: Date; win: string }>>,
    computeGoalProgress(userId, tz, now).catch(() => null),
  ])
  const unit = user?.profile?.weightUnit === 'kg' ? 'kg' : 'lbs'
  const proteinGoal = ngoal?.protein && ngoal.protein > 0 ? ngoal.protein : null

  const days = new Map<string, DayEvents>()
  const day = (k: string) => { let d = days.get(k); if (!d) { d = emptyDay(); days.set(k, d) } return d }

  // Workouts (completed) + PRs
  type WLog = { date: Date | string; completed?: boolean; title?: string; day?: string }
  for (const l of ((progress?.workoutLogs as WLog[] | undefined) ?? [])) {
    if (l.completed !== true) continue
    const dt = new Date(l.date); if (dt < since) continue
    day(dateKey(dt, tz)).workouts.push(l.title || l.day || 'Workout')
  }
  type PR = { exerciseName: string; maxE1RM?: { e1rm?: number; date?: Date } | null }
  for (const p of ((progress?.exercisePRs as PR[] | undefined) ?? [])) {
    if (!p.maxE1RM?.date || !(p.maxE1RM.e1rm && p.maxE1RM.e1rm > 0)) continue
    const dt = new Date(p.maxE1RM.date); if (dt < since) continue
    if (p.maxE1RM.e1rm > 1200) continue // typo, not a lift
    day(dateKey(dt, tz)).prs.push({ name: p.exerciseName, e1RM: Math.round(p.maxE1RM.e1rm) })
  }
  // Food
  const nut = new Map<string, { cal: number; pro: number; n: number }>()
  for (const m of mealLogs) { const k = dateKey(new Date(m.loggedAt), tz); const r = nut.get(k) ?? { cal: 0, pro: 0, n: 0 }; r.cal += m.totalNutrition?.calories ?? 0; r.pro += m.totalNutrition?.protein ?? 0; r.n += 1; nut.set(k, r) }
  for (const r of dayRows) { const k = dateKey(new Date(r.date), 0); const x = nut.get(k) ?? { cal: 0, pro: 0, n: 0 }; for (const q of r.quickAdds ?? []) { x.cal += q.calories ?? 0; x.pro += q.protein ?? 0; x.n += 1 } nut.set(k, x) }
  for (const [k, r] of nut) { const d = day(k); d.foodLogged = r.n > 0; d.calories = r.cal || null; d.proteinHit = proteinGoal ? r.pro >= proteinGoal : null }
  // Mind
  for (const s of sessions) if (s.dateKey && s.dateKey >= fromKey) day(s.dateKey).mindSession = true
  for (const s of states) day(dateKey(new Date(s.timestamp), tz)).states.push(s.state)
  type Mood = { date: Date | string; mood: number }
  for (const m of ((progress?.moodHistory as Mood[] | undefined) ?? [])) { const dt = new Date(m.date); if (dt < since) continue; day(dateKey(dt, 0)).mood = m.mood }
  for (const w of wins) day(dateKey(new Date(w.date), 0)).wins.push(w.win)
  // chapterHistory[0] is the PLACEMENT (where onboarding started them), not an
  // earned unlock — only later entries that go UP are "Chapter N opened".
  const hist = [...(mind?.chapterHistory ?? [])].sort((a, b) => new Date(a.unlockedAt).getTime() - new Date(b.unlockedAt).getTime())
  for (let i = 1; i < hist.length; i++) {
    const c = hist[i]; if (!c.unlockedAt || c.chapter <= hist[i - 1].chapter) continue
    const dt = new Date(c.unlockedAt); if (dt < since) continue
    const d = day(dateKey(dt, tz)); d.chapterUnlocked = Math.max(d.chapterUnlocked ?? 0, c.chapter)
  }
  // Weight (member unit)
  type WH = { date: Date | string; weight: number; unit?: 'lbs' | 'kg' }
  for (const e of ((progress?.weightHistory as WH[] | undefined) ?? [])) {
    const dt = new Date(e.date); if (dt < since || !(e.weight > 0)) continue
    day(dateKey(dt, 0)).weight = Math.round(kgToUnit(unitToKg(e.weight, e.unit ?? unit), unit) * 10) / 10
  }

  // Fill the range so empty weeks exist between the first activity and today.
  const keys = [...days.keys()].sort()
  const first = keys[0]
  if (first) for (let k = first; k <= todayKey; k = shiftDay(k, 1)) if (!days.has(k)) days.set(k, emptyDay())

  const weeklyTarget = user?.profile?.weeklyAvailability ?? null
  const n = goals?.nutrition ?? null
  const weeks = buildWeeks({
    days, todayKey, weeklyTarget,
    logTarget: n?.adherence?.logTarget ?? 5, proteinTarget: n?.adherence?.proteinTarget ?? 5,
    targetWeight: n?.target.weight ?? null, weightUnit: unit, direction: n?.direction ?? null,
    identity: mind?.vision?.identityStatement?.trim() || null, maxWeeks: MAX_WEEKS,
  })

  return {
    todayKey,
    identity: mind?.vision?.identityStatement?.trim() || null,
    firstActivity: first ?? null,
    unit,
    target: {
      weight: n?.target.weight ? Math.round(n.target.weight) : null,
      direction: n?.direction ?? null,
      pace: n?.target.pacePerWeek ? `${n.target.pacePerWeek} ${unit === 'kg' ? 'kg' : 'lb'}/wk` : null,
      eta: n?.pace?.eta ?? null,
    },
    weeklyTarget,
    weeks,
    next: goals ? { nutrition: goals.nutrition.suggestion, training: goals.training.suggestion } : null,
    becomingScore: mind?.xpBank ?? 0,
    chapter: mind?.chapter ?? 1,
  }
}
