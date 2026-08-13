/**
 * Turn a day's logs and plans into ORDERED OCCURRENCES.
 *
 * The old model was one section per TAG, rendered in a fixed order: the four
 * default tags in a canonical sequence, then every custom tag ALPHABETICALLY.
 * Two consequences, both wrong:
 *
 *   1. Eat breakfast, a snack, lunch, then another snack, and you got ONE snack
 *      section holding both snacks — with lunch rendered above it. The day no
 *      longer read in the order it happened, and the two snacks were pooled as
 *      though they were one sitting.
 *   2. A "Bed" meal planned for 11pm sorted ABOVE a "Before Work" meal already
 *      eaten at 8pm, because "bed" < "before work" alphabetically. Nothing to do
 *      with planned-vs-logged; it was the alphabet.
 *
 * So the unit of the day view is no longer the tag, it is the OCCURRENCE: one
 * contiguous sitting of one tag. Snack at 10am and snack at 3pm are two
 * occurrences and render as two sections, in their real positions.
 *
 * What splits an occurrence: another tag happening in between. That is the
 * entire rule. Sort every (log, tag) pair by time, walk the list, and start a
 * new occurrence whenever the tag differs from the previous entry.
 *
 * Deliberately NOT a time-gap threshold. Two snacks four hours apart with
 * nothing logged between them stay one occurrence, and that is the right answer:
 * no other eating happened between them, so there is no ordering information to
 * preserve, and a gap constant would be an arbitrary number that splits some
 * days and not others for reasons no member could predict.
 */

import type { TagWindow } from '@/lib/nutrition/mealSchedule'
import { minutesOfDay, sortMinutesForTag } from '@/lib/nutrition/mealSchedule'

/** Minimal shape this module needs from a meal log. */
export interface OrderableLog {
  _id: string
  loggedAt: string | Date
  tags?: string[]
}

/** Minimal shape this module needs from a meal plan. */
export interface OrderablePlan {
  _id: string
  tag: string
  status?: string
}

export interface Occurrence<L extends OrderableLog, P extends OrderablePlan> {
  /** Stable render key. Distinct per occurrence, so two snack sections differ. */
  key: string
  tag: string
  /** Minutes from local midnight used to position this section. */
  sortMinutes: number
  /** Logs in this sitting, in time order. Empty for a planned occurrence. */
  logs: L[]
  /** Plans in this sitting. Empty for a logged occurrence. */
  plans: P[]
  /** True when nothing here has been eaten yet. */
  planned: boolean
}

/** A log with no tags at all still has to appear somewhere. */
const UNTAGGED_FALLBACK = 'snack'

function tagsOf(log: OrderableLog): string[] {
  const tags = (log.tags ?? []).map(t => String(t).toLowerCase()).filter(Boolean)
  return tags.length > 0 ? tags : [UNTAGGED_FALLBACK]
}

function timeOf(log: OrderableLog): number {
  const d = typeof log.loggedAt === 'string' ? new Date(log.loggedAt) : log.loggedAt
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : 0
}

/**
 * Build the ordered day.
 *
 * `windows` positions PLANNED occurrences, which carry a date but no moment.
 * Logged occurrences use the real time of their first log and ignore the
 * schedule entirely — what actually happened outranks what was supposed to.
 * That is what fixes the Bed-above-Before-Work case even though "Before Work"
 * has no window at all.
 */
export function buildDayOccurrences<L extends OrderableLog, P extends OrderablePlan>(
  logs: L[],
  plans: P[],
  windows: TagWindow[] = [],
  opts: { includePlans?: boolean } = {},
): Occurrence<L, P>[] {
  // ── Logged occurrences ────────────────────────────────────────────────────
  // One entry per (log, tag) pair: a log tagged both "lunch" and "post-workout"
  // legitimately appears under both, exactly as it did before.
  const entries: { tag: string; at: number; log: L }[] = []
  for (const log of logs) {
    const at = timeOf(log)
    for (const tag of tagsOf(log)) entries.push({ tag, at, log })
  }
  // Stable within the same instant so two foods logged in one action keep the
  // order they were saved in.
  entries.sort((a, b) => a.at - b.at)

  const occurrences: Occurrence<L, P>[] = []
  let run: { tag: string; at: number; logs: L[] } | null = null
  for (const e of entries) {
    if (run && run.tag === e.tag) {
      // Same tag as the previous entry in time order — same sitting.
      if (!run.logs.some(l => l._id === e.log._id)) run.logs.push(e.log)
      continue
    }
    if (run) {
      occurrences.push({
        key: `log:${run.tag}:${run.logs[0]?._id ?? run.at}`,
        tag: run.tag,
        sortMinutes: minutesOfDay(new Date(run.at)),
        logs: run.logs,
        plans: [],
        planned: false,
      })
    }
    run = { tag: e.tag, at: e.at, logs: [e.log] }
  }
  if (run) {
    occurrences.push({
      key: `log:${run.tag}:${run.logs[0]?._id ?? run.at}`,
      tag: run.tag,
      sortMinutes: minutesOfDay(new Date(run.at)),
      logs: run.logs,
      plans: [],
      planned: false,
    })
  }

  // ── Planned occurrences ───────────────────────────────────────────────────
  // Each active plan is its own section, positioned by its tag's window start
  // (or the app-wide table). Plans never merge into a logged occurrence: eaten
  // and not-yet-eaten are different states and pooling them would hide which is
  // which.
  if (opts.includePlans !== false) {
    for (const plan of plans) {
      if (plan.status && plan.status !== 'active') continue
      const tag = String(plan.tag).toLowerCase()
      occurrences.push({
        key: `plan:${plan._id}`,
        tag,
        sortMinutes: sortMinutesForTag(windows, tag),
        logs: [],
        plans: [plan],
        planned: true,
      })
    }
  }

  // Ties go to what actually happened: a logged meal outranks a plan pencilled
  // in for the same minute.
  occurrences.sort((a, b) => {
    if (a.sortMinutes !== b.sortMinutes) return a.sortMinutes - b.sortMinutes
    if (a.planned !== b.planned) return a.planned ? 1 : -1
    return 0
  })
  return occurrences
}

/**
 * Tags to offer as empty, addable sections — the default tags a member has not
 * used yet today. Occurrence ordering only describes what EXISTS; this keeps the
 * "add a breakfast" affordance available on an empty day.
 */
export function unusedTags(occurrences: Occurrence<OrderableLog, OrderablePlan>[], defaults: string[]): string[] {
  const used = new Set(occurrences.map(o => o.tag))
  return defaults.filter(t => !used.has(t.toLowerCase()))
}
