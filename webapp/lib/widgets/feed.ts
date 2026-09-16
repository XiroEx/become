/**
 * The widget feed — one glanceable snapshot of a member's day, shaped for an
 * OS home-screen / lock-screen widget rather than for a page.
 *
 * A widget is not a small web page. It is drawn by the OS on a timeline, with
 * no network at paint time, no JS, and a few hundred milliseconds of budget —
 * so it cannot hold business logic. Everything it needs to DRAW is therefore
 * pre-formatted here, on the server: the big number is a string, the caption is
 * a string, and the only numbers that cross the wire are the 0..1 fractions a
 * ring or bar needs. A renderer that has to decide what "at risk" means, or how
 * to pluralise "day", is a renderer that will disagree with the app.
 *
 * This module is PURE on purpose — `buildWidgetFeed` takes plain data and
 * returns plain data, so every wording and threshold below is unit-testable
 * without a database. `lib/widgets/load.ts` does the reading.
 *
 * The five widgets are the ones asked for by name: streak, nutrition (macros),
 * mind (today's session), becoming (progress), and today's training.
 */

export type WidgetKey = 'streak' | 'nutrition' | 'mind' | 'becoming' | 'training'

/**
 * Widget states, in the vocabulary a renderer actually needs: whether to draw
 * the surface lit (`done`), nudging (`todo`), warning (`at-risk`), or resting
 * (`none` — nothing set up yet, so say so rather than showing a hollow zero).
 */
export type WidgetState = 'none' | 'todo' | 'done' | 'at-risk'

/** One macro ring/bar. `pct` is null when the member has no target for it. */
export interface WidgetRing {
  key: 'calories' | 'protein' | 'carbs' | 'fats'
  label: string
  value: number
  target: number | null
  pct: number | null
  unit: string
}

export interface BecomeWidget {
  key: WidgetKey
  /** Widget-gallery name, and the small header a medium widget draws. */
  title: string
  /** The one big thing. Already a string — could be "12", "Rest day", "Ready". */
  headline: string
  /** Small trailing unit for the headline, e.g. "days". Null when there isn't one. */
  headlineUnit: string | null
  /** One short line under the headline. Never empty. */
  caption: string
  state: WidgetState
  /** 0..1 for a ring or bar. Null when this widget has nothing to fill. */
  progress: number | null
  /** Only the nutrition widget fills this; everything else ships an empty list. */
  rings: WidgetRing[]
  /** In-app path a tap opens. Relative — the client joins it to its own origin. */
  deepLink: string
}

export interface WidgetFeed {
  /** Epoch ms the snapshot was built. A widget draws this as "updated 3m ago". */
  generatedAt: number
  /** The member's LOCAL day this snapshot describes (YYYY-MM-DD). */
  todayKey: string
  /**
   * How long the snapshot stays good for. A widget timeline asks for the next
   * refresh rather than polling blind, and the server is the only side that
   * knows how fast this data moves.
   */
  refreshAfterSeconds: number
  widgets: BecomeWidget[]
}

export interface WidgetFeedInput {
  todayKey: string
  now: number
  streak: {
    current: number
    longest: number
    /** Did anything count toward the streak on the member's local today? */
    activityToday: boolean
  }
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fats: number
    targets: {
      calories: number | null
      protein: number | null
      carbs: number | null
      fats: number | null
    }
    /** How many things were logged today — 0 means "nothing yet", not "0 cal". */
    entries: number
  }
  mind: {
    chapter: number
    chapterName: string | null
    sessionDoneToday: boolean
    /** False while the between-sessions cooldown is still running. */
    sessionAvailable: boolean
    sessionsIntoChapter: number
    sessionsPerChapter: number
  }
  becoming: {
    /** 1-based week of the member's Becoming. Null before anything started. */
    week: number | null
    identity: string | null
    chapterName: string | null
    workoutsThisWeek: number
    weeklyTarget: number | null
  }
  training: {
    /** Today's session title, when there is one scheduled or in progress. */
    title: string | null
    /** Already done today. */
    completedToday: boolean
    /** Today is a scheduled rest day (as opposed to nothing scheduled at all). */
    restDay: boolean
  }
}

/** How long a widget snapshot is good for. */
export const WIDGET_REFRESH_SECONDS = 900 // 15 minutes

/** Streak milestones a widget's ring fills toward. Mirrors lib/streakConstants. */
const MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365]

function num(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/** Clamp to 0..1. Rings overfill visually at the renderer's discretion, not here. */
function fraction(value: number, target: number | null): number | null {
  if (target == null || target <= 0) return null
  return Math.max(0, Math.min(1, value / target))
}

function ring(
  key: WidgetRing['key'],
  label: string,
  value: number,
  target: number | null,
  unit: string,
): WidgetRing {
  return {
    key,
    label,
    value: Math.round(value),
    target: target == null ? null : Math.round(target),
    pct: fraction(value, target),
    unit,
  }
}

function buildStreak(input: WidgetFeedInput): BecomeWidget {
  const { current, longest, activityToday } = input.streak
  const nextMilestone = MILESTONES.find((m) => m > current) ?? null

  // A zero streak and a live-but-unlogged streak are different situations and
  // the widget is the only place a member sees either. Saying "keep it alive"
  // to someone who has never logged is nagging about nothing.
  let state: WidgetState
  let caption: string
  if (current === 0 && !activityToday) {
    state = 'none'
    caption = 'Log anything today to start'
  } else if (activityToday) {
    state = 'done'
    caption = nextMilestone
      ? `${nextMilestone - current} ${plural(nextMilestone - current, 'day')} to ${nextMilestone}`
      : `Longest: ${longest}`
  } else {
    state = 'at-risk'
    caption = 'Nothing logged yet today'
  }

  return {
    key: 'streak',
    title: 'Streak',
    headline: num(current),
    headlineUnit: plural(current, 'day'),
    caption,
    state,
    progress: nextMilestone ? fraction(current, nextMilestone) : 1,
    rings: [],
    deepLink: '/dashboard/streaks',
  }
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`
}

function buildNutrition(input: WidgetFeedInput): BecomeWidget {
  const { calories, protein, carbs, fats, targets, entries } = input.nutrition

  const rings = [
    ring('calories', 'Cal', calories, targets.calories, 'cal'),
    ring('protein', 'Protein', protein, targets.protein, 'g'),
    ring('carbs', 'Carbs', carbs, targets.carbs, 'g'),
    ring('fats', 'Fat', fats, targets.fats, 'g'),
  ]

  // The headline is calories LEFT, not calories eaten: a member glancing at
  // their home screen mid-afternoon is deciding what to eat next, and "820
  // left" answers that where "1,180 eaten" makes them do the subtraction.
  const remaining = targets.calories == null ? null : Math.round(targets.calories - calories)
  const headline = remaining == null ? num(calories) : num(Math.abs(remaining))
  const headlineUnit = remaining == null ? 'cal' : remaining < 0 ? 'cal over' : 'cal left'

  const macroLine = [
    macroPart('P', protein, targets.protein),
    macroPart('C', carbs, targets.carbs),
    macroPart('F', fats, targets.fats),
  ].join(' · ')

  return {
    key: 'nutrition',
    title: 'Nutrition',
    headline,
    headlineUnit,
    caption: entries === 0 ? 'Nothing logged yet today' : macroLine,
    state: entries === 0 ? 'todo' : 'done',
    progress: fraction(calories, targets.calories),
    rings,
    deepLink: '/dashboard/nutrition',
  }
}

function macroPart(label: string, value: number, target: number | null): string {
  return target == null ? `${label} ${num(value)}g` : `${label} ${num(value)}/${num(target)}g`
}

function buildMind(input: WidgetFeedInput): BecomeWidget {
  const { chapter, chapterName, sessionDoneToday, sessionAvailable, sessionsIntoChapter, sessionsPerChapter } =
    input.mind

  let headline: string
  let state: WidgetState
  if (sessionDoneToday) {
    headline = 'Done'
    state = 'done'
  } else if (sessionAvailable) {
    headline = 'Ready'
    state = 'todo'
  } else {
    // The cooldown between main sessions is a real product rule; a widget that
    // said "Ready" through it would send the member into a locked screen.
    headline = 'Resting'
    state = 'none'
  }

  const chapterLabel = chapterName ? `Chapter ${chapter} · ${chapterName}` : `Chapter ${chapter}`

  return {
    key: 'mind',
    title: 'Mind',
    headline,
    headlineUnit: null,
    caption: `${chapterLabel} · ${sessionsIntoChapter}/${sessionsPerChapter}`,
    state,
    progress: fraction(sessionsIntoChapter, sessionsPerChapter),
    rings: [],
    deepLink: '/dashboard/mind',
  }
}

function buildBecoming(input: WidgetFeedInput): BecomeWidget {
  const { week, identity, chapterName, workoutsThisWeek, weeklyTarget } = input.becoming

  const headline = week == null ? 'Day one' : `Week ${week}`

  // The identity statement is the member's own words about who they are
  // becoming, so it outranks any metric we could print in its place. It is
  // long-form prose, though, and a widget line is not — hence the trim.
  const trainingLine =
    weeklyTarget == null
      ? `${workoutsThisWeek} ${plural(workoutsThisWeek, 'session')} this week`
      : `${workoutsThisWeek} of ${weeklyTarget} this week`
  const caption = identity ? truncate(identity, 64) : chapterName ? `${chapterName} · ${trainingLine}` : trainingLine

  return {
    key: 'becoming',
    title: 'Becoming',
    headline,
    headlineUnit: null,
    caption,
    state: week == null ? 'none' : weeklyTarget != null && workoutsThisWeek >= weeklyTarget ? 'done' : 'todo',
    progress: fraction(workoutsThisWeek, weeklyTarget),
    rings: [],
    deepLink: '/dashboard/mind/becoming',
  }
}

function truncate(s: string, max: number): string {
  const clean = s.trim().replace(/\s+/g, ' ')
  if (clean.length <= max) return clean
  // Cut on a word boundary — a widget line ending mid-word reads as a bug.
  const cut = clean.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

function buildTraining(input: WidgetFeedInput): BecomeWidget {
  const { title, completedToday, restDay } = input.training

  if (completedToday) {
    return {
      key: 'training',
      title: 'Training',
      headline: 'Complete',
      headlineUnit: null,
      caption: title ?? 'Session logged today',
      state: 'done',
      progress: 1,
      rings: [],
      deepLink: '/dashboard/workout',
    }
  }

  if (restDay) {
    return {
      key: 'training',
      title: 'Training',
      headline: 'Rest day',
      headlineUnit: null,
      caption: 'Nothing scheduled — recover',
      state: 'none',
      progress: null,
      rings: [],
      deepLink: '/dashboard/workout',
    }
  }

  if (!title) {
    return {
      key: 'training',
      title: 'Training',
      headline: 'Open',
      headlineUnit: null,
      caption: 'No session scheduled today',
      state: 'none',
      progress: null,
      rings: [],
      deepLink: '/dashboard/workout',
    }
  }

  return {
    key: 'training',
    title: 'Training',
    headline: truncate(title, 28),
    headlineUnit: null,
    caption: 'Tap to start',
    state: 'todo',
    progress: 0,
    rings: [],
    deepLink: '/dashboard/workout',
  }
}

/**
 * Build the whole feed. Order is the order a widget gallery lists them in, and
 * it is deliberate: streak and nutrition are the two a member checks without
 * opening anything.
 */
export function buildWidgetFeed(input: WidgetFeedInput): WidgetFeed {
  return {
    generatedAt: input.now,
    todayKey: input.todayKey,
    refreshAfterSeconds: WIDGET_REFRESH_SECONDS,
    widgets: [
      buildStreak(input),
      buildNutrition(input),
      buildMind(input),
      buildBecoming(input),
      buildTraining(input),
    ],
  }
}
