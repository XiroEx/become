// After a main session, point the user at ONE arsenal segment to go deeper on —
// chosen from how they checked in and what the session actually leaned on. This
// is the "do some training, then here's your next move" bridge from the main
// session into the rebuilt arsenal. Deterministic + client-safe.

import type { MindState } from '@/lib/mindContent'

export const SEGMENT_LABELS: Record<string, string> = {
  'state-shift': 'State Shift',
  'vision': 'Vision',
  'self-image': 'Self-Image',
  'mission': 'Mission',
  'discipline': 'Discipline',
  'anti-sabotage': 'Anti-Sabotage',
  'social': 'Social',
}

const NEGATIVE: MindState[] = ['stressed', 'distracted', 'low_energy']

export interface SegmentRec {
  systemId: string
  label: string
  reason: string
}

/**
 * Recommend the segment to go do next, given the session's live check-in state,
 * the move kinds it contained, and which systems are unlocked. Falls back to the
 * strongest available growth segment so there's always a concrete next step.
 */
export function recommendSegment(opts: {
  state?: MindState | null
  moveKinds?: string[]
  unlocked?: string[]
}): SegmentRec {
  const unlocked = opts.unlocked && opts.unlocked.length ? opts.unlocked : Object.keys(SEGMENT_LABELS)
  const has = (s: string) => unlocked.includes(s)
  const kinds = new Set(opts.moveKinds ?? [])
  const rec = (systemId: string, reason: string): SegmentRec => ({ systemId, label: SEGMENT_LABELS[systemId] ?? systemId, reason })

  // 1. Came in off → regulate first, then everything else lands better.
  if (opts.state && NEGATIVE.includes(opts.state) && has('state-shift')) {
    return rec('state-shift', 'You came in a little off — reset your state and come back sharper.')
  }

  // 2. Route from what today's session actually leaned on.
  if (kinds.has('challenge') && has('discipline')) return rec('discipline', 'You touched the hard thing — go make it a non-negotiable.')
  if (kinds.has('antisabotage') && has('anti-sabotage')) return rec('anti-sabotage', 'A pattern showed up — go name it before it runs you.')
  if (kinds.has('social') && has('social')) return rec('social', 'Your environment shapes you — go strengthen your circle.')
  if (kinds.has('vision') && has('vision')) return rec('vision', 'You saw it — go make the future you sharper.')
  if (kinds.has('mission') && has('mission')) return rec('mission', 'You locked into your why — go move it forward.')
  if ((kinds.has('win') || kinds.has('identity')) && has('self-image')) return rec('self-image', 'You’re building the new you — go bank the evidence.')

  // 3. Fallback: the strongest available growth segment.
  for (const s of ['mission', 'vision', 'discipline', 'self-image', 'anti-sabotage', 'social', 'state-shift']) {
    if (has(s)) return rec(s, 'Keep the momentum — take it into your arsenal.')
  }
  return rec('state-shift', 'Keep the momentum — take it into your arsenal.')
}
