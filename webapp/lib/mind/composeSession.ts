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
import { INTROS, CHOICE_POOL, WIN_PROMPTS } from './library'

// ─── Move builders (so the daily composer + the Arsenal single-move launcher
//     produce identical, consistent moves) ──────────────────────────────────

function stateCheckMove(): Move {
  return { id: 'state-check', kind: 'state-check', title: 'Where are you right now?', subtitle: 'One honest tap.', xp: 10 }
}

function breathMove(): Move {
  return { id: 'breath', kind: 'breath', title: 'Breathe', subtitle: 'Follow the circle.', protocolId: 'auto', xp: 5 }
}

function identityMove(ctx: SessionContext): Move {
  const sd = ctx.seed ?? ctx.dayOfYear
  const statement =
    ctx.identityStatement && ctx.identityStatement.trim().length > 0
      ? ctx.identityStatement.trim()
      : IDENTITY_POOL[sd % IDENTITY_POOL.length]
  return { id: 'identity', kind: 'identity', title: 'Affirm it', subtitle: 'Hold to lock it in.', statement, xp: 5 }
}

function winMove(ctx: SessionContext): Move {
  const prompt = WIN_PROMPTS[(ctx.seed ?? ctx.dayOfYear) % WIN_PROMPTS.length]
  return { id: 'win', kind: 'win', title: 'Bank a win', subtitle: 'Name one thing you did.', prompt, xp: 5 }
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

function visionMove(ctx: SessionContext): Move {
  return {
    id: 'vision',
    kind: 'vision',
    title: 'See it',
    subtitle: 'Lock in your vision.',
    statement: ctx.identityStatement?.trim() || undefined,
    xp: 5,
  }
}

function antisabotageMove(): Move {
  return { id: 'antisabotage', kind: 'antisabotage', title: 'Pattern check', subtitle: 'Catch it before it runs you.', xp: 5 }
}

function socialMove(): Move {
  return { id: 'social', kind: 'social', title: 'Accountability', subtitle: 'Pull someone into your progress.', xp: 5 }
}

function mirrorMove(ctx: SessionContext): Move {
  const sd = ctx.seed ?? ctx.dayOfYear
  const statement =
    ctx.identityStatement && ctx.identityStatement.trim().length > 0
      ? ctx.identityStatement.trim()
      : IDENTITY_POOL[sd % IDENTITY_POOL.length]
  return { id: 'mirror', kind: 'mirror', title: 'Mirror', subtitle: 'Look at yourself. Say it.', statement, xp: 5 }
}

// Resolve the statement these identity-flavored modalities reinforce.
function resolveStatement(ctx: SessionContext): string {
  const sd = ctx.seed ?? ctx.dayOfYear
  return ctx.identityStatement && ctx.identityStatement.trim().length > 0
    ? ctx.identityStatement.trim()
    : IDENTITY_POOL[sd % IDENTITY_POOL.length]
}

// A SHORT affirmation for the "reconstruct it" modalities (Build it / Type it):
// reassembling or typing a long mission/vision paragraph is overwhelming and full
// of confusing duplicate words (multiple "I", "and", "my"…). Use the user's own
// line only when it's genuinely short; otherwise fall back to a concise pool line.
const MAX_SHORT_WORDS = 9
function shortStatement(ctx: SessionContext): string {
  const sd = ctx.seed ?? ctx.dayOfYear
  const own = ctx.identityStatement?.trim()
  if (own && own.split(/\s+/).filter(Boolean).length <= MAX_SHORT_WORDS) return own
  return IDENTITY_POOL[sd % IDENTITY_POOL.length]
}

function typeMove(ctx: SessionContext): Move {
  return { id: 'type', kind: 'type', title: 'Type it', subtitle: 'Write it out, word for word.', statement: shortStatement(ctx), xp: 5 }
}

function speakMove(ctx: SessionContext): Move {
  return { id: 'speak', kind: 'speak', title: 'Say it out loud', subtitle: 'Hold to record. Hear yourself.', statement: resolveStatement(ctx), xp: 5 }
}

function assembleMove(ctx: SessionContext): Move {
  return { id: 'assemble', kind: 'assemble', title: 'Build it', subtitle: 'Tap the words in order.', statement: shortStatement(ctx), xp: 5 }
}

// Multiple-choice reflections come from the central library (CHOICE_POOL).
function choiceMove(ctx: SessionContext): Move {
  const item = CHOICE_POOL[(ctx.seed ?? ctx.dayOfYear) % CHOICE_POOL.length]
  return { id: 'choice', kind: 'choice', title: item.q, subtitle: 'No wrong answer.', options: item.options, xp: 5 }
}

/** Build a single move of the given kind (used by the Arsenal launcher). */
export function buildMove(kind: MoveKind, ctx: SessionContext): Move {
  switch (kind) {
    case 'breath': return breathMove()
    case 'identity': return identityMove(ctx)
    case 'win': return winMove(ctx)
    case 'challenge': return challengeMove()
    case 'mission': return missionMove(ctx)
    case 'vision': return visionMove(ctx)
    case 'antisabotage': return antisabotageMove()
    case 'social': return socialMove()
    case 'mirror': return mirrorMove(ctx)
    case 'choice': return choiceMove(ctx)
    case 'type': return typeMove(ctx)
    case 'speak': return speakMove(ctx)
    case 'assemble': return assembleMove(ctx)
    default: return stateCheckMove()
  }
}

export class DeterministicMoveEngine implements MoveEngine {
  composeSession(ctx: SessionContext): MindSessionPlan {
    const seed = ctx.seed ?? ctx.dayOfYear
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
    if (ctx.chapter >= 2) corePool.push('vision') // foundation: see it
    if (ctx.chapter >= 2) corePool.push('type', 'speak', 'assemble') // self-image: active reinforcement modalities
    if (ctx.chapter >= 2 && ctx.missionAction?.trim()) corePool.push('mission')
    if (ctx.chapter >= 4) corePool.push('antisabotage') // defense: pattern interrupt
    if (ctx.chapter >= 5) corePool.push('social') // architect: environment

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
// on-theme. Not "click one item" — a real little session.

const THEME_CONFIG: Record<string, { title: string; subtitle: string; core: MoveKind; pool: MoveKind[] }> = {
  'state-shift':   { title: 'Reset',       subtitle: 'Drop the stress, find your center.',     core: 'breath',       pool: ['state-check', 'identity', 'mirror', 'choice', 'speak'] },
  'self-image':    { title: 'Identity',    subtitle: "Reinforce who you're becoming.",         core: 'identity',     pool: ['mirror', 'type', 'speak', 'assemble', 'choice', 'win'] },
  vision:          { title: 'Vision',      subtitle: 'See it. Become it.',                      core: 'vision',       pool: ['identity', 'mirror', 'type', 'speak', 'win', 'choice'] },
  mission:         { title: 'Mission',     subtitle: 'Lock into your why.',                     core: 'mission',      pool: ['identity', 'type', 'win', 'choice'] },
  discipline:      { title: 'Discipline',  subtitle: 'Do the hard thing.',                      core: 'challenge',    pool: ['identity', 'choice', 'assemble', 'win'] },
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
  const rotated = cfg.pool.map((_, i) => cfg.pool[(i + seed) % cfg.pool.length])
  const extras: MoveKind[] = []
  for (const k of rotated) {
    if (extras.length >= 2) break
    if (k !== cfg.core && !extras.includes(k)) extras.push(k)
  }
  const kinds: MoveKind[] = [cfg.core, ...extras]
  return {
    intro: { title: cfg.title, subtitle: cfg.subtitle },
    moves: kinds.map((k) => buildMove(k, ctx)),
    rewardXp: 0,
  }
}
