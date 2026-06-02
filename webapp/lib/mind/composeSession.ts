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
  type MoveKind,
  type SessionContext,
} from './moves'

const INTROS = [
  { title: 'Reset', subtitle: 'A few focused minutes. One move at a time.' },
  { title: "Let's lock in", subtitle: 'Clear the noise. Become who you said you would.' },
  { title: 'Show up', subtitle: 'The work is small. The compounding is not.' },
]

// ─── Move builders (so the daily composer + the Arsenal single-move launcher
//     produce identical, consistent moves) ──────────────────────────────────

function stateCheckMove(): Move {
  return { id: 'state-check', kind: 'state-check', title: 'Where are you right now?', subtitle: 'One honest tap.', xp: 10 }
}

function breathMove(): Move {
  return { id: 'breath', kind: 'breath', title: 'Breathe', subtitle: 'Follow the circle.', protocolId: 'auto', xp: 5 }
}

function identityMove(ctx: SessionContext): Move {
  const statement =
    ctx.identityStatement && ctx.identityStatement.trim().length > 0
      ? ctx.identityStatement.trim()
      : IDENTITY_POOL[ctx.dayOfYear % IDENTITY_POOL.length]
  return { id: 'identity', kind: 'identity', title: 'Affirm it', subtitle: 'Hold to lock it in.', statement, xp: 5 }
}

function winMove(): Move {
  return { id: 'win', kind: 'win', title: 'Bank a win', subtitle: 'Name one thing you did.', prompt: "What's one win from today — big or small?", xp: 5 }
}

function challengeMove(): Move {
  // The scene fetches today's actual challenge text from /api/mind/discipline.
  return { id: 'challenge', kind: 'challenge', title: "Today's discipline", subtitle: 'One hard thing. Do it anyway.', xp: 20 }
}

function missionMove(ctx: SessionContext): Move {
  return {
    id: 'mission',
    kind: 'mission',
    title: 'Lock in',
    subtitle: 'Your one move today.',
    prompt: ctx.missionAction?.trim() || undefined,
    xp: 5,
  }
}

/** Build a single move of the given kind (used by the Arsenal launcher). */
export function buildMove(kind: MoveKind, ctx: SessionContext): Move {
  switch (kind) {
    case 'breath': return breathMove()
    case 'identity': return identityMove(ctx)
    case 'win': return winMove()
    case 'challenge': return challengeMove()
    case 'mission': return missionMove(ctx)
    default: return stateCheckMove()
  }
}

export class DeterministicMoveEngine implements MoveEngine {
  composeSession(ctx: SessionContext): MindSessionPlan {
    const seed = ctx.dayOfYear
    const intro = INTROS[seed % INTROS.length]

    // Anchors: always open by checking in (grounds the session, grants XP via
    // /api/mind/state) and breathe.
    const moves: Move[] = [stateCheckMove(), breathMove()]

    // A rotating "core" move drawn from what the user's chapter has unlocked, so
    // the daily session varies day-to-day and grows as they progress. As more
    // systems gain scenes (vision/anti-sabotage/social), add them to this pool.
    const corePool: MoveKind[] = []
    if (ctx.chapter >= 3) corePool.push('challenge') // discipline
    if (ctx.chapter >= 2) corePool.push('win') // self-image: evidence
    if (ctx.chapter >= 2 && ctx.missionAction?.trim()) corePool.push('mission')

    if (corePool.length > 0) {
      moves.push(buildMove(corePool[seed % corePool.length], ctx))
    }

    // Always close on identity — the strongest reinforcement beat.
    moves.push(identityMove(ctx))

    return { intro, moves, rewardXp: 15 }
  }
}

export const deterministicEngine = new DeterministicMoveEngine()

/** Convenience wrapper. */
export function composeSession(ctx: SessionContext): MindSessionPlan {
  return deterministicEngine.composeSession(ctx)
}

// ─── Arsenal single-move launcher ─────────────────────────────────────────────

// Which unlocked systems can be played as a standalone one-move session today.
// Systems not listed (vision, anti-sabotage, social) still have no scene yet and
// fall back to their existing section page.
const SYSTEM_TO_MOVE: Partial<Record<string, MoveKind>> = {
  'state-shift': 'breath',
  'self-image': 'identity',
  discipline: 'challenge',
  mission: 'mission',
}

/** True if tapping this Arsenal system should launch an interactive session. */
export function systemHasScene(systemId: string): boolean {
  return systemId in SYSTEM_TO_MOVE
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
