// Deterministic "3 suggested actions" picker — the instant fallback the smart
// tile shows while the AI version (mind.suggestActions) loads, and the safety net
// if the AI drifts. Picks protocols across DIFFERENT categories, led by the user's
// current state, rotated by a seed for variety. Client-safe.

import type { MindState } from '@/lib/mindContent'
import { CATALOG_BY_SYSTEM, SEGMENT_STYLE, type SuggestedAction } from './suggestedProtocols'

const NEGATIVE: MindState[] = ['stressed', 'distracted', 'low_energy']

const REASON: Record<string, string> = {
  'state-shift': 'You came in a little scattered — reset your state first.',
  'self-image': 'Bank a rep as the person you’re becoming.',
  'mission': 'Reconnect to why you’re doing this.',
  'vision': 'Sharpen where you’re headed.',
  'social': 'Your circle shapes you — go tend to it.',
  'discipline': 'Make the hard thing a non-negotiable.',
  'anti-sabotage': 'Catch the pattern before it runs you.',
}

export function suggestActions(opts: {
  state?: MindState | null
  unlocked?: string[]
  seed?: number
}): SuggestedAction[] {
  const unlocked = opts.unlocked?.length ? opts.unlocked : Object.keys(SEGMENT_STYLE)
  const seed = Math.max(0, Math.floor(opts.seed ?? 0))
  const negative = !!(opts.state && NEGATIVE.includes(opts.state))

  // Base order, rotated by seed for run-to-run variety.
  let order = ['self-image', 'mission', 'discipline', 'vision', 'anti-sabotage', 'social', 'state-shift']
  const rot = order.length ? seed % order.length : 0
  order = [...order.slice(rot), ...order.slice(0, rot)]
  // When they came in off, always lead with a state reset.
  if (negative) order = ['state-shift', ...order.filter((s) => s !== 'state-shift')]

  const picks: SuggestedAction[] = []
  const usedKeys = new Set<string>()
  const take = (sys: string) => {
    // Only the first protocol of a tool is GUARANTEED unlocked (the in-tool
    // progression opens 1 + reps). The client doesn't know per-tool reps, so the
    // deterministic picker never suggests deeper entries — the AI path (which
    // filters candidates server-side by real rep counts) provides the variety.
    const pool = (CATALOG_BY_SYSTEM[sys] ?? []).filter((p) => p.idx === 0)
    if (!pool.length) return
    for (let i = 0; i < pool.length; i++) {
      const p = pool[(seed + i) % pool.length]
      const key = `${sys}:${p.id}`
      if (usedKeys.has(key)) continue
      usedKeys.add(key)
      picks.push({ ...p, reason: REASON[sys] ?? 'A strong next move for you.' })
      return
    }
  }

  // Pass 1: one protocol per distinct unlocked system.
  for (const sys of order) {
    if (picks.length >= 3) break
    if (unlocked.includes(sys)) take(sys)
  }
  // Pass 2: if too few systems are unlocked, fill with more from the ones that are.
  for (const sys of order) {
    if (picks.length >= 3) break
    if (unlocked.includes(sys)) take(sys)
  }
  return picks.slice(0, 3)
}
