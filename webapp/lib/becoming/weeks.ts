/**
 * The Becoming, week by week — pure.
 *
 * A "Becoming" is one week (Sunday-start) of a member's life in the app,
 * scored for consistency across the three pillars, placed on a path that
 * always moves forward and, for a consistent member, trends up. Given the raw
 * events bucketed by day key (all in the member's local zone), this produces
 * the ordered list of week snapshots with:
 *
 *   • score      0–100 consistency for the week
 *   • step       'up' | 'flat' | 'down' — how the path moves INTO this week
 *   • altitude   cumulative height (never drops much; floors at 0)
 *   • headline / sub — the story line, from data, deterministic
 *
 * "New one weekly on Sundays": the current week is live (partial), earlier
 * weeks are frozen by construction because their events cannot change.
 */

import { weekKeyOf, shiftDay, weekdayOf } from '@/lib/streaks/pillars'

export type MindState = 'stressed' | 'distracted' | 'low_energy' | 'locked_in'

export interface DayEvents {
  /** Completed workouts that day (titles/day labels). */
  workouts: string[]
  /** PRs set that day. */
  prs: Array<{ name: string; e1RM: number }>
  foodLogged: boolean
  proteinHit: boolean | null
  calories: number | null
  mindSession: boolean
  mood: number | null
  states: MindState[]
  wins: string[]
  /** Weight in the member's unit, if weighed that day. */
  weight: number | null
  chapterUnlocked: number | null
}

export interface WeekInput {
  /** Every day key with any event, plus the empty days between — the caller passes a full range. */
  days: Map<string, DayEvents>
  todayKey: string
  /** Workouts per week the member committed to (null = unknown). */
  weeklyTarget: number | null
  /** Adherence targets. */
  logTarget: number
  proteinTarget: number
  /** Nutrition target for the story ("3 lbs to go"). */
  targetWeight: number | null
  weightUnit: 'lbs' | 'kg'
  direction: 'lose' | 'maintain' | 'gain' | null
  identity: string | null
  /** Optional cap on how many weeks back to render. */
  maxWeeks?: number
}

export type Subject = 'training' | 'fuel' | 'mind' | 'all' | 'empty'

export interface DayProof {
  key: string
  workout: boolean
  food: boolean
  mind: boolean
  /** Future day on the live week. */
  future: boolean
}

export interface WeekSnapshot {
  index: number
  weekKey: string
  /** Sunday..Saturday labels for the UI. */
  label: string
  isCurrent: boolean
  isFirst: boolean
  daysElapsed: number
  score: number
  step: 'up' | 'flat' | 'down' | 'start'
  altitude: number
  /** What the week was mostly about — colours the tile. */
  subject: Subject
  /** Sun..Sat, what happened each day. */
  days: DayProof[]
  /** A collapsed run of empty weeks: how many, and the span. */
  gap?: { weeks: number; fromKey: string; toKey: string }
  mind: { sessions: number; moodDays: number; dominant: MindState | null; wins: string[]; chapterUnlocked: number | null }
  nutrition: { logDays: number; proteinDays: number; avgCalories: number | null; weightStart: number | null; weightEnd: number | null; delta: number | null }
  training: { workouts: number; target: number | null; hit: boolean; prs: Array<{ name: string; e1RM: number }>; prCount: number }
  headline: string
  sub: string
  /** Short chips for the overview / graph tooltip. */
  tags: string[]
}

export const STEP_UP = 1
export const STEP_FLAT = 0.25
export const STEP_DOWN = -0.5
/** The path never falls more than this below your best — it stagnates, it does not dive. */
export const FLOOR_BELOW_PEAK = 1.5
export const SCORE_UP = 60
export const SCORE_FLAT = 30
/** Runs of at least this many empty weeks collapse into one "away" card. */
export const GAP_MIN_WEEKS = 3

const STATE_WORD: Record<MindState, string> = {
  stressed: 'stressed', distracted: 'distracted', low_energy: 'low on energy', locked_in: 'locked in',
}

export function emptyDay(): DayEvents {
  return { workouts: [], prs: [], foodLogged: false, proteinHit: null, calories: null, mindSession: false, mood: null, states: [], wins: [], weight: null, chapterUnlocked: null }
}

/** Every day key in [from, to]. */
function range(from: string, to: string): string[] {
  const out: string[] = []
  for (let k = from; k <= to; k = shiftDay(k, 1)) out.push(k)
  return out
}

/** "Jul 12" for a day key. */
function monthDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function fmtWeekLabel(weekKey: string): string {
  const [y, m, d] = weekKey.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d))
  const end = new Date(start.getTime() + 6 * 86_400_000)
  const mo = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${mo(start)} ${start.getUTCDate()}–${end.getUTCDate()}`
    : `${mo(start)} ${start.getUTCDate()} – ${mo(end)} ${end.getUTCDate()}`
}

/**
 * Weekly consistency 0–100. Training is against the member's own target
 * (or 3/wk when unknown), nutrition and mind against days. Partial current
 * weeks are scored on days elapsed so Monday is not "a bad week".
 */
export function weekScore(w: { workouts: number; target: number | null; logDays: number; mindDays: number }, daysElapsed: number): number {
  const d = Math.max(1, Math.min(7, daysElapsed))
  const target = w.target && w.target > 0 ? w.target : 3
  const expectedWorkouts = Math.max(0.5, target * (d / 7))
  const training = Math.min(1, w.workouts / expectedWorkouts)
  const nutrition = Math.min(1, w.logDays / d)
  const mind = Math.min(1, w.mindDays / d)
  return Math.round((training * 0.4 + nutrition * 0.3 + mind * 0.3) * 100)
}

export function stepFor(score: number): 'up' | 'flat' | 'down' {
  if (score >= SCORE_UP) return 'up'
  if (score >= SCORE_FLAT) return 'flat'
  return 'down'
}

/** What the week was mostly about. "all" when every pillar showed up properly. */
export function subjectFor(w: { workouts: number; target: number | null; logDays: number; mindDays: number; sessions: number }, daysElapsed: number): Subject {
  const d = Math.max(1, Math.min(7, daysElapsed))
  const target = w.target && w.target > 0 ? w.target : 3
  const t = Math.min(1, w.workouts / Math.max(0.5, target * (d / 7)))
  const f = Math.min(1, w.logDays / d)
  const m = Math.min(1, w.mindDays / d)
  if (t + f + m < 0.15) return 'empty'
  if (t >= 0.6 && f >= 0.6 && m >= 0.6) return 'all'
  const best = Math.max(t, f, m)
  if (best === t) return 'training'
  if (best === f) return 'fuel'
  return 'mind'
}

function dominantState(states: MindState[]): MindState | null {
  if (!states.length) return null
  const c = new Map<MindState, number>()
  for (const s of states) c.set(s, (c.get(s) ?? 0) + 1)
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

/** The sentence for the week — deterministic from data, never generic when there is something to say. */
export function storyFor(w: Omit<WeekSnapshot, 'headline' | 'sub' | 'tags'>, input: Pick<WeekInput, 'weightUnit' | 'direction' | 'targetWeight'>): { headline: string; sub: string; tags: string[] } {
  const tags: string[] = []
  const t = w.training, n = w.nutrition, m = w.mind
  const unit = input.weightUnit
  const delta = n.delta
  const wantsDown = input.direction === 'lose'
  const wantsUp = input.direction === 'gain'
  const scaleMoved = delta != null && Math.abs(delta) >= (unit === 'kg' ? 0.4 : 1)
  const scaleRightWay = scaleMoved && ((wantsDown && (delta as number) < 0) || (wantsUp && (delta as number) > 0))
  const scaleWrongWay = scaleMoved && ((wantsDown && (delta as number) > 0) || (wantsUp && (delta as number) < 0))

  if (t.workouts) tags.push(`${t.workouts}${t.target ? `/${t.target}` : ''} workouts`)
  if (t.prCount) tags.push(`${t.prCount} PR${t.prCount === 1 ? '' : 's'}`)
  if (n.logDays) tags.push(`${n.logDays}/7 logged`)
  if (m.sessions) tags.push(`${m.sessions} session${m.sessions === 1 ? '' : 's'}`)
  if (scaleMoved) tags.push(`${(delta as number) > 0 ? '+' : ''}${(delta as number).toFixed(1)} ${unit}`)
  if (m.chapterUnlocked) tags.push(`Ch ${m.chapterUnlocked}`)

  const nothingSubstantive = t.workouts === 0 && n.logDays === 0 && m.sessions === 0 && t.prCount === 0
  // The live week: still being written, never "away".
  if (w.isCurrent && nothingSubstantive) {
    if (w.daysElapsed <= 1) return { headline: 'A new week of becoming', sub: 'Blank so far. What you do in the next six days is what this card will say.', tags }
    const checked = m.moodDays ? ` You have checked in ${m.moodDays} day${m.moodDays === 1 ? '' : 's'}.` : ''
    return { headline: 'Still being written', sub: `Day ${w.daysElapsed} of 7.${checked} A workout, a meal or a session puts the first real line on this card.`, tags }
  }
  if (w.isFirst && !w.isCurrent) {
    return { headline: 'Where it started', sub: `Your first week. ${t.workouts ? `${t.workouts} workout${t.workouts === 1 ? '' : 's'}` : 'No workouts yet'}${n.logDays ? `, food logged ${n.logDays} day${n.logDays === 1 ? '' : 's'}` : ''}. Everything since is measured from here.`, tags }
  }
  if (m.chapterUnlocked && m.chapterUnlocked > 1) {
    return { headline: `Chapter ${m.chapterUnlocked} opened`, sub: `The week your mind work earned the next chapter${t.hit ? ' — and the training week hit its target too' : ''}.`, tags }
  }
  if (t.prCount >= 2) {
    return { headline: `${t.prCount} personal records`, sub: `${t.prs.slice(0, 3).map(p => p.name).join(', ')}${t.prCount > 3 ? ` and ${t.prCount - 3} more` : ''}. The strongest week on paper so far.`, tags }
  }
  if (t.hit && n.logDays >= 5 && m.sessions >= 3) {
    return { headline: 'The whole system, working', sub: `Training hit ${t.workouts}/${t.target}, food logged ${n.logDays} days, ${m.sessions} mind sessions. This is what a full week looks like.`, tags }
  }
  if (scaleRightWay) {
    return { headline: 'The scale moved', sub: `${(delta as number) > 0 ? '+' : ''}${(delta as number).toFixed(1)} ${unit} this week, the way you wanted${t.hit ? ', with the training week hit' : ''}.`, tags }
  }
  if (t.hit) {
    return { headline: `${t.workouts} of ${t.target}. Week hit.`, sub: n.logDays >= 5 ? `And ${n.logDays} days of food logged behind it.` : n.logDays > 0 ? `Food logged ${n.logDays} of 7 — the training carried this one.` : 'Training carried this week; the logging did not show up.', tags }
  }
  if (t.prCount === 1) {
    return { headline: `New best: ${t.prs[0].name}`, sub: `e1RM ${t.prs[0].e1RM}. One lift moved the week.`, tags }
  }
  if (m.sessions >= 4 && t.workouts === 0) {
    return { headline: 'The mind kept showing up', sub: `${m.sessions} sessions and no training — the body is next.`, tags }
  }
  if (n.logDays >= 6 && t.workouts === 0) {
    return { headline: 'Logged everything, lifted nothing', sub: `${n.logDays} days of food, no workouts. Honest, and it counts.`, tags }
  }
  if (scaleWrongWay) {
    return { headline: 'The scale pushed back', sub: `${(delta as number) > 0 ? '+' : ''}${(delta as number).toFixed(1)} ${unit} — ${n.logDays >= 5 ? 'and you logged, so it is data, not a mystery' : 'with thin logging, hard to say why'}.`, tags }
  }
  if (t.workouts > 0 || n.logDays > 0 || m.sessions > 0) {
    const bits = []
    if (t.workouts) bits.push(`${t.workouts} workout${t.workouts === 1 ? '' : 's'}${t.target ? ` of ${t.target}` : ''}`)
    if (n.logDays) bits.push(`${n.logDays} day${n.logDays === 1 ? '' : 's'} logged`)
    if (m.sessions) bits.push(`${m.sessions} mind session${m.sessions === 1 ? '' : 's'}`)
    const dom = m.dominant ? ` Mostly ${STATE_WORD[m.dominant]}.` : ''
    return { headline: w.step === 'down' ? 'A quieter week' : 'Kept it moving', sub: `${bits.join(', ')}.${dom}`, tags }
  }
  // Quiet weeks that still left a trace: check-ins, a weigh-in, a banked win.
  if (m.wins.length) {
    return { headline: `${m.wins.length === 1 ? 'A win, banked' : `${m.wins.length} wins, banked`}`, sub: `No training or food logged, but you wrote it down: “${m.wins[0].slice(0, 80)}${m.wins[0].length > 80 ? '…' : ''}”`, tags }
  }
  if (m.moodDays) {
    const dom = m.dominant ? `, mostly ${STATE_WORD[m.dominant]}` : ''
    return { headline: `Checked in ${m.moodDays} day${m.moodDays === 1 ? '' : 's'}`, sub: `No training or food logged this week${dom}. Showing up to say how you feel still counts.`, tags }
  }
  if (n.delta != null) {
    return { headline: 'Weighed in, that was it', sub: `${n.weightEnd} ${unit} on the scale${n.delta !== 0 ? ` (${n.delta > 0 ? '+' : ''}${n.delta})` : ''}. Nothing else logged. The path holds.`, tags }
  }
  return { headline: 'A week away', sub: 'Nothing logged. The path holds; it just does not climb.', tags }
}

export function buildWeeks(input: WeekInput): WeekSnapshot[] {
  const keys = [...input.days.keys()].sort()
  if (!keys.length) return []
  const firstKey = keys[0]
  const firstWeek = weekKeyOf(firstKey)
  const thisWeek = weekKeyOf(input.todayKey)
  // Weeks from first activity through this week (bounded).
  const weekKeys: string[] = []
  for (let wk = firstWeek; wk <= thisWeek; wk = shiftDay(wk, 7)) weekKeys.push(wk)
  const capped = input.maxWeeks && weekKeys.length > input.maxWeeks ? weekKeys.slice(-input.maxWeeks) : weekKeys

  let altitude = 0
  let peak = 0
  let lastStep: WeekSnapshot['step'] = 'start'
  const out: WeekSnapshot[] = []
  capped.forEach((wk, i) => {
    const isCurrent = wk === thisWeek
    const end = isCurrent ? input.todayKey : shiftDay(wk, 6)
    const daysElapsed = isCurrent ? weekdayOf(input.todayKey) + 1 : 7
    const days = range(wk, end).map(k => input.days.get(k) ?? emptyDay())

    let workouts = 0, logDays = 0, proteinDays = 0, sessions = 0, moodDays = 0
    let calSum = 0, calDays = 0
    const prs: Array<{ name: string; e1RM: number }> = []
    const states: MindState[] = []
    const wins: string[] = []
    let weightStart: number | null = null, weightEnd: number | null = null
    let chapterUnlocked: number | null = null
    for (const d of days) {
      workouts += d.workouts.length
      prs.push(...d.prs)
      if (d.foodLogged) logDays += 1
      if (d.proteinHit) proteinDays += 1
      if (d.calories != null && d.calories > 0) { calSum += d.calories; calDays += 1 }
      if (d.mindSession) sessions += 1
      if (d.mood != null) moodDays += 1
      states.push(...d.states)
      wins.push(...d.wins)
      if (d.weight != null) { if (weightStart == null) weightStart = d.weight; weightEnd = d.weight }
      if (d.chapterUnlocked && (!chapterUnlocked || d.chapterUnlocked > chapterUnlocked)) chapterUnlocked = d.chapterUnlocked
    }
    const mindDays = new Set<number>()
    days.forEach((d, idx) => { if (d.mindSession || d.mood != null || d.states.length) mindDays.add(idx) })

    const score = weekScore({ workouts, target: input.weeklyTarget, logDays, mindDays: mindDays.size }, daysElapsed)
    let step: WeekSnapshot['step'] = i === 0 && capped.length === weekKeys.length ? 'start' : stepFor(score)
    // The hard-week override: showing up on a week you mostly felt stressed or
    // low on energy, and still hitting the training target, IS the story — it climbs.
    const dom = dominantState(states)
    if (step !== 'start' && (dom === 'stressed' || dom === 'low_energy') && input.weeklyTarget && workouts >= input.weeklyTarget) step = 'up'
    // Only FROZEN weeks move the path; the live week previews from where the last one left it.
    if (i > 0 && !isCurrent) {
      const delta = step === 'up' ? STEP_UP : step === 'flat' ? STEP_FLAT : STEP_DOWN
      // A dip is clamped to the floor (never more than FLOOR_BELOW_PEAK under your best) and to 0.
      // A dip that the floor stops renders as a hold — the path stagnates, it does not dive.
      const floor = Math.max(0, peak - FLOOR_BELOW_PEAK)
      // Two dips never touch: a dip straight after a dip is a hold. The worst
      // stretch sags; it never falls.
      const effective = step === 'down' && lastStep === 'down' ? 0 : delta
      const next = Math.max(floor, altitude + effective)
      if (step === 'down' && next >= altitude) step = 'flat'
      altitude = next
      peak = Math.max(peak, altitude)
      lastStep = step
    }
    const target = input.weeklyTarget
    const hit = !!target && workouts >= target
    const proof: DayProof[] = Array.from({ length: 7 }, (_, di) => {
      const key = shiftDay(wk, di)
      const d = input.days.get(key)
      const future = isCurrent && di >= daysElapsed
      return { key, workout: !!d && d.workouts.length > 0, food: !!d?.foodLogged, mind: !!d && (d.mindSession || d.mood != null || d.states.length > 0), future }
    })
    // "Where it started" is only the TRUE first week; under a cap the first kept week is just a week.
    const isFirst = i === 0 && capped.length === weekKeys.length
    const base = {
      index: i, weekKey: wk, label: fmtWeekLabel(wk), isCurrent, isFirst, daysElapsed, score, step, altitude,
      subject: subjectFor({ workouts, target, logDays, mindDays: mindDays.size, sessions }, daysElapsed),
      days: proof,
      mind: { sessions, moodDays, dominant: dominantState(states), wins: wins.slice(0, 5), chapterUnlocked },
      nutrition: {
        logDays, proteinDays,
        avgCalories: calDays ? Math.round(calSum / calDays) : null,
        weightStart, weightEnd,
        delta: weightStart != null && weightEnd != null && weightStart !== weightEnd ? Math.round((weightEnd - weightStart) * 10) / 10 : (weightStart != null && weightEnd != null ? 0 : null),
      },
      training: { workouts, target, hit, prs: prs.slice(0, 5), prCount: prs.length },
    }
    const story = storyFor(base, input)
    out.push({ ...base, ...story })
  })
  return collapseGaps(out)
}

/** Is this frozen week empty of anything a member did? */
export function isEmptyWeek(w: WeekSnapshot): boolean {
  return !w.isCurrent && !w.isFirst && w.training.workouts === 0 && w.nutrition.logDays === 0 && w.mind.sessions === 0 && w.mind.moodDays === 0 && w.mind.wins.length === 0 && w.training.prs.length === 0 && w.nutrition.delta == null
}

/**
 * Runs of GAP_MIN_WEEKS+ empty weeks collapse into ONE "away" card, so a
 * member who drifted for two months swipes once through it rather than eight
 * times through nothing. Altitude is whatever the run ended at; indexes are
 * re-numbered so the path stays a simple sequence.
 */
export function collapseGaps(weeks: WeekSnapshot[]): WeekSnapshot[] {
  const out: WeekSnapshot[] = []
  let i = 0
  while (i < weeks.length) {
    if (isEmptyWeek(weeks[i])) {
      let j = i
      while (j < weeks.length && isEmptyWeek(weeks[j])) j++
      const run = weeks.slice(i, j)
      if (run.length >= GAP_MIN_WEEKS) {
        const last = run[run.length - 1]
        const first = run[0]
        out.push({
          ...last,
          weekKey: first.weekKey,
          label: `${monthDay(first.weekKey)} – ${monthDay(shiftDay(last.weekKey, 6))}`,
          step: 'flat',
          subject: 'empty',
          headline: `Away for ${run.length} weeks`,
          sub: 'Nothing logged. The path held its ground and waited.',
          tags: [`${run.length} weeks`],
          gap: { weeks: run.length, fromKey: first.weekKey, toKey: last.weekKey },
        })
        i = j
        continue
      }
      for (const w of run) out.push(w)
      i = j
      continue
    }
    out.push(weeks[i]); i++
  }
  return out.map((w, idx) => ({ ...w, index: idx }))
}
