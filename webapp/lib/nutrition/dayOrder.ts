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
import { minutesOfDay, sortMinutesForTag, anchorMinutesForTag, orderIndexForTag } from '@/lib/nutrition/mealSchedule'

/** Minimal shape this module needs from a meal log. */
export interface OrderableLog {
  _id: string
  loggedAt: string | Date
  tags?: string[]
  /**
   * Logged for a DAY with no time. Its clock reading is meaningless — someone up
   * at 1am filing food for the day just ended would otherwise sort to the top of
   * that day. Position comes from the tag's anchor instead.
   */
  untimed?: boolean
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
  /** True when this sitting carries no clock time — placed by tag anchor. */
  untimed: boolean
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
  // An untimed log sorts by its tag's ANCHOR, not by the clock it happened to be
  // entered at. Resolving it here means the walk below and the final sort both
  // see one comparable number, whatever its source.
  const entries: { tag: string; at: number; log: L; untimed: boolean }[] = []
  for (const log of logs) {
    for (const tag of tagsOf(log)) {
      const untimed = Boolean(log.untimed)
      const at = untimed
        ? anchorMinutesForTag(windows, tag) * 60_000
        : timeOf(log)
      entries.push({ tag, at, log, untimed })
    }
  }
  // Stable within the same instant so two foods logged in one action keep the
  // order they were saved in.
  entries.sort((a, b) => a.at - b.at)

  const occurrences: Occurrence<L, P>[] = []
  let run: { tag: string; at: number; logs: L[]; untimed: boolean } | null = null
  const flush = (r: NonNullable<typeof run>) => {
    occurrences.push({
      key: `log:${r.tag}:${r.logs[0]?._id ?? r.at}`,
      tag: r.tag,
      // An untimed run was anchored in minutes above; a timed one is a real
      // instant that has to come back down to minutes-of-day.
      sortMinutes: r.untimed ? Math.round(r.at / 60_000) : minutesOfDay(new Date(r.at)),
      logs: r.logs,
      plans: [],
      planned: false,
      untimed: r.untimed,
    })
  }
  for (const e of entries) {
    // A timed and an untimed sitting of the same tag are different sittings:
    // merging them would hide that one has a real clock reading and one does not.
    if (run && run.tag === e.tag && run.untimed === e.untimed) {
      // Same tag as the previous entry in time order — same sitting.
      if (!run.logs.some(l => l._id === e.log._id)) run.logs.push(e.log)
      continue
    }
    if (run) flush(run)
    run = { tag: e.tag, at: e.at, logs: [e.log], untimed: e.untimed }
  }
  if (run) flush(run)

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
        untimed: false,
      })
    }
  }

  // Ties go to what actually happened: a logged meal outranks a plan pencilled
  // in for the same minute.
  // Ties are real and common: several unscheduled tags share one anchor by
  // design. The member's own meal order is what separates them, which is exactly
  // what the ordering screen is for. Falling back to index length keeps unlisted
  // tags after listed ones rather than jumping to the front.
  const orderIdx = (tag: string) => {
    const i = orderIndexForTag(windows, tag)
    return i >= 0 ? i : windows.length + 1
  }
  occurrences.sort((a, b) => {
    if (a.sortMinutes !== b.sortMinutes) return a.sortMinutes - b.sortMinutes
    const ia = orderIdx(a.tag), ib = orderIdx(b.tag)
    if (ia !== ib) return ia - ib
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
