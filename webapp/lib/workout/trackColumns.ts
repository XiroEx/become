// How wide each box gets in the Track view's 12-column set grid.
//
// The grid is `grid-cols-12`, and every column the row renders has to fit
// inside those 12 — CSS grid does not clamp an overflow, it wraps it onto a
// second implicit row. Cardio is where that bit: a time+distance exercise
// rendered set(2) + time(6) + distance(2) + speed(2) + done(2) = 16, so the
// speed box and the Done tick dropped onto a line of their own and one set
// took up two rows on a phone. Nothing was broken, it just looked broken.
//
// The time box is the one with slack in it — 6 of 12 for a two-digit number —
// so it is the one that gives ground when an exercise tracks distance and
// speed as well. When time is the ONLY thing tracked (a plank, a held
// stretch) there is nothing to make room for and it keeps its full width.
//
// Everything lives here rather than inline in the JSX so the widths are
// stated once for the header row and the set rows (they have to agree, or
// the labels stop lining up over their boxes) and so the "must sum to 12"
// rule is something a test can actually assert.

import { normalizeTracking, tracksSpeed } from './tracking'

/** Column widths, in 12ths. A `0` means that box is not rendered at all. */
export interface TrackColumnSpans {
  /** The set/round number. */
  set: number
  /** Load. reps_weight only. */
  weight: number
  /** The main typed value: reps for counted work, time for timed work. */
  main: number
  /** Distance or floors. time_distance only. */
  distance: number
  /** Speed in mph. time_distance and intervals. */
  speed: number
  /** The Done tick (and the skip button that shares its cell). */
  done: number
}

const SET_SPAN = 2
const WEIGHT_SPAN = 3
const DISTANCE_SPAN = 2
const SPEED_SPAN = 2

/** Total columns in the Track view set grid (`grid-cols-12`). */
export const TRACK_GRID_COLUMNS = 12

/**
 * The width of every box in one set row, for a given tracking type.
 *
 * `main` is whatever is left over once the fixed columns have taken their
 * share, which is what keeps the row at exactly 12 no matter which optional
 * boxes an exercise asks for.
 */
export function trackColumnSpans(trackingType?: string | null): TrackColumnSpans {
  const t = normalizeTracking(trackingType)
  const isNone = t === 'none'

  const weight = t === 'reps_weight' ? WEIGHT_SPAN : 0
  const distance = t === 'time_distance' ? DISTANCE_SPAN : 0
  const speed = tracksSpeed(t) ? SPEED_SPAN : 0

  // Nothing to type → the tick gets the whole row. Otherwise the tick keeps
  // its comfortable 4, but shrinks to 2 when cardio's extra boxes need the
  // room (it is a 32px button in a cell that was twice that wide).
  const done = isNone ? 10 : distance || speed ? 2 : 4

  const main = isNone ? 0 : TRACK_GRID_COLUMNS - SET_SPAN - weight - distance - speed - done

  return { set: SET_SPAN, weight, main, distance, speed, done }
}

// Tailwind scans source text for class names, so the spans have to appear as
// whole literal strings somewhere — `col-span-${n}` would never be generated.
const COL_SPAN: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  7: 'col-span-7',
  8: 'col-span-8',
  9: 'col-span-9',
  10: 'col-span-10',
  11: 'col-span-11',
  12: 'col-span-12',
}

/** A span in 12ths → the Tailwind class for it. */
export function colSpan(span: number): string {
  return COL_SPAN[span] ?? 'col-span-1'
}
