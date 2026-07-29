// Deterministic MoveEngine — composes today's Mind session from the user's
// context. This is the zero-AI floor: whatever the AI engine cannot deliver, this
// renders instead, and it has to be good on its own.
//
// HOW IT WORKS NOW. It no longer assembles a session move-by-move out of separate
// pools (which is why beats used to sit next to each other having never been
// written to). It picks an AUTHORED BLUEPRINT (lib/mind/blueprints.ts) — a whole
// session written as one unit, chosen from the user's check-in — and renders its
// slots. Same model the arsenal uses for its protocol flows, which is the reason
// those read better than this did.
//
// Pure + client-safe. The arsenal's single-move and themed-session launchers live
// at the bottom and are unchanged.

import {
  AFFIRM_STATEMENT_KINDS,
  type Move,
  type MindSessionPlan,
  type MoveEngine,
  type MoveKind,
  type SessionContext,
} from './moves'
import { buildMove } from './moveBuilders'
import { pickBlueprint, blueprintMoves, breathOnCooldown } from './blueprints'

// Re-exported so existing importers (the admin Mind lab, the AI engine) keep
// working after the builders moved to their own module.
export { buildMove } from './moveBuilders'
export { BREATH_COOLDOWN_MS } from './blueprints'

export class DeterministicMoveEngine implements MoveEngine {
  composeSession(ctx: SessionContext): MindSessionPlan {
    const bp = pickBlueprint(ctx)

    // Open by checking in (grounds the session, grants XP via /api/mind/state),
    // then the blueprint's authored regulate → core → close.
    const moves: Move[] = [
      buildMove('state-check', ctx),
      ...blueprintMoves(bp, ctx, breathOnCooldown(ctx)),
    ]

    // On the 50-session directed path, the session's prescribed focus IS the
    // intro — the theme the whole session serves. (The directive text is
    // composer-facing; never surface it to the user.)
    const intro = ctx.pathFocus
      ? { title: ctx.pathFocus.focus, subtitle: `Session ${ctx.pathFocus.n} of 50 on your path.` }
      : { title: bp.title, subtitle: bp.subtitle }

    return { intro, moves, rewardXp: 15, doneText: bp.doneText, blueprintId: bp.id }
  }
}

export const deterministicEngine = new DeterministicMoveEngine()

/** Convenience wrapper. */
export function composeSession(ctx: SessionContext): MindSessionPlan {
  return deterministicEngine.composeSession(ctx)
}

// ─── Arsenal single-move launcher ─────────────────────────────────────────────

// Which unlocked systems can be played as a standalone one-move session today.
const SYSTEM_TO_MOVE: Partial<Record<string, MoveKind>> = {
  'state-shift': 'breath',
  'self-image': 'identity',
  discipline: 'challenge',
  mission: 'mission',
  vision: 'vision',
  'anti-sabotage': 'antisabotage',
  social: 'social',
}

/**
 * A one-move session for an Arsenal tool. Returns null for systems without a
 * scene yet (caller links to the section page instead).
 */
export function singleMovePlan(systemId: string, ctx: SessionContext): MindSessionPlan | null {
  const kind = SYSTEM_TO_MOVE[systemId]
  if (!kind) return null
  return {
    intro: { title: 'One move', subtitle: 'A focused rep — whenever you need it.' },
    moves: [buildMove(kind, ctx)],
    rewardXp: 0, // standalone reps don't grant the daily ritual XP
  }
}

// ─── Focused (themed) sessions — the "More" destination ───────────────────────
//
// Each unlocked system can be played as a SHORT, DYNAMIC session: a fixed core
// move for the theme + a couple extras sampled (and rotated by seed) from a
// relevant pool — different every time, Duolingo-replay style, while staying
// on-theme.

const THEME_CONFIG: Record<string, { title: string; subtitle: string; core: MoveKind; pool: MoveKind[] }> = {
  'state-shift':   { title: 'Reset',       subtitle: 'Drop the stress, find your center.',     core: 'breath',       pool: ['state-check', 'identity', 'mirror', 'choice', 'speak'] },
  'self-image':    { title: 'Identity',    subtitle: "Reinforce who you're becoming.",         core: 'identity',     pool: ['mirror', 'type', 'speak', 'compose', 'choice', 'win'] },
  vision:          { title: 'Vision',      subtitle: 'See it. Become it.',                      core: 'vision',       pool: ['identity', 'mirror', 'type', 'speak', 'win', 'choice'] },
  mission:         { title: 'Mission',     subtitle: 'Lock into your why.',                     core: 'mission',      pool: ['identity', 'type', 'win', 'choice'] },
  discipline:      { title: 'Discipline',  subtitle: 'Do the hard thing.',                      core: 'challenge',    pool: ['identity', 'choice', 'compose', 'win'] },
  'anti-sabotage': { title: 'Defense',     subtitle: 'Catch the pattern before it runs you.',   core: 'antisabotage', pool: ['choice', 'identity', 'mirror', 'type'] },
  social:          { title: 'Environment', subtitle: 'Engineer your circle.',                   core: 'social',       pool: ['identity', 'win', 'choice', 'speak'] },
}

/** True if a system can be played as a focused session (all 7 now can). */
export function systemHasScene(systemId: string): boolean {
  return systemId in THEME_CONFIG
}

/**
 * A short, varied, on-theme session for an Arsenal tile. Returns null for an
 * unknown system. Standalone reps grant no daily ritual XP (rewardXp 0), but
 * their moves still hit their own endpoints (state / discipline / wins).
 */
export function composeThemedSession(systemId: string, ctx: SessionContext): MindSessionPlan | null {
  const cfg = THEME_CONFIG[systemId]
  if (!cfg) return null
  const seed = ctx.seed ?? ctx.dayOfYear
  // Rotate the pool by seed, take 2 distinct extras → a 3-move set that varies.
  // At most ONE affirm-statement modality per session (core counts) — otherwise
  // a theme like Identity recites the same phrase in 2-3 different mediums.
  let affirmUsed = AFFIRM_STATEMENT_KINDS.includes(cfg.core)
  const rotated = cfg.pool.map((_, i) => cfg.pool[(i + seed) % cfg.pool.length])
  const extras: MoveKind[] = []
  for (const k of rotated) {
    if (extras.length >= 2) break
    if (k === cfg.core || extras.includes(k)) continue
    const isAffirm = AFFIRM_STATEMENT_KINDS.includes(k)
    if (isAffirm && affirmUsed) continue
    if (isAffirm) affirmUsed = true
    extras.push(k)
  }
  const kinds: MoveKind[] = [cfg.core, ...extras]
  return {
    intro: { title: cfg.title, subtitle: cfg.subtitle },
    moves: kinds.map((k) => buildMove(k, ctx)),
    rewardXp: 0,
  }
}
