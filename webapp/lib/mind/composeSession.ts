// Deterministic MoveEngine — composes today's Mind session from the user's
// context + the existing content library. This is the Phase-1 engine; the
// generative-AI engine (endgame) will implement the same MoveEngine interface
// and can replace this wholesale without touching the player or scenes.
//
// Pure + client-safe. Phase 1 arc: state-check → breath (resolved from the
// chosen state at play time) → identity affirmation. As more chapters unlock,
// this composer grows (discipline, vision, wins, …); the shape stays the same.

import {
  IDENTITY_POOL,
  type Move,
  type MindSessionPlan,
  type MoveEngine,
  type SessionContext,
} from './moves'

const INTROS = [
  { title: 'Reset', subtitle: 'A few focused minutes. One move at a time.' },
  { title: "Let's lock in", subtitle: 'Clear the noise. Become who you said you would.' },
  { title: 'Show up', subtitle: 'The work is small. The compounding is not.' },
]

export class DeterministicMoveEngine implements MoveEngine {
  composeSession(ctx: SessionContext): MindSessionPlan {
    const seed = ctx.dayOfYear
    const intro = INTROS[seed % INTROS.length]

    const moves: Move[] = []

    // 1. Always open by checking in — it grounds the session and (server-side)
    //    grants its own XP via /api/mind/state.
    moves.push({
      id: 'state-check',
      kind: 'state-check',
      title: 'Where are you right now?',
      subtitle: 'One honest tap.',
      xp: 10,
    })

    // 2. Breathe — protocol resolves from the live state-check answer ('auto').
    moves.push({
      id: 'breath',
      kind: 'breath',
      title: 'Breathe',
      subtitle: 'Follow the circle.',
      protocolId: 'auto',
      xp: 5,
    })

    // 3. Affirm who you're becoming — personalized to the user's vision identity
    //    statement when present, else the rotating pool.
    const statement =
      ctx.identityStatement && ctx.identityStatement.trim().length > 0
        ? ctx.identityStatement.trim()
        : IDENTITY_POOL[seed % IDENTITY_POOL.length]
    moves.push({
      id: 'identity',
      kind: 'identity',
      title: 'Affirm it',
      subtitle: 'Hold to lock it in.',
      statement,
      xp: 5,
    })

    return { intro, moves, rewardXp: 15 }
  }
}

export const deterministicEngine = new DeterministicMoveEngine()

/** Convenience wrapper. */
export function composeSession(ctx: SessionContext): MindSessionPlan {
  return deterministicEngine.composeSession(ctx)
}
