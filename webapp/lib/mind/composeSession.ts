// Deterministic MoveEngine — composes today's Mind session from the user's
// context + the existing content library. This is the Phase-1 engine; the
// generative-AI engine (endgame) will implement the same MoveEngine interface
// and can replace this wholesale without touching the player or scenes.
//
// Pure + client-safe. Phase 1 arc: state-check → breath (resolved from the
// chosen state at play time) → identity affirmation. As more chapters unlock,
// this composer grows (discipline, vision, wins, …); the shape stays the same.

import {
  AFFIRM_STATEMENT_KINDS,
  IDENTITY_POOL,
  type Move,
  type MindSessionPlan,
  type MoveEngine,
  type MoveKind,
  type SessionContext,
} from './moves'
import { INTROS, CHOICE_POOL, WIN_PROMPTS, COMPOSE_TEMPLATES, ACKNOWLEDGE_POOL, INTERROGATIVE_POOL } from './library'

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
  // Spoken out loud at a mirror — keep it to a punchy line, never a long
  // paragraph (use shortStatement, same as the other say/recite modalities).
  return { id: 'mirror', kind: 'mirror', title: 'Mirror', subtitle: 'Look at yourself. Say it.', statement: shortStatement(ctx), xp: 5 }
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
  // Live speech detection recites this out loud — keep it short, not a paragraph.
  return { id: 'speak', kind: 'speak', title: 'Say it out loud', subtitle: 'Say it like you mean it.', statement: shortStatement(ctx), xp: 5 }
}

function assembleMove(ctx: SessionContext): Move {
  return { id: 'assemble', kind: 'assemble', title: 'Build it', subtitle: 'Tap the words in order.', statement: shortStatement(ctx), xp: 5 }
}

// Fill-in-the-blank affirmation — a mostly-written line, you choose positive
// words for the blanks. No wrong answers; each pick just makes it yours.
function composeMove(ctx: SessionContext): Move {
  const t = COMPOSE_TEMPLATES[(ctx.seed ?? ctx.dayOfYear) % COMPOSE_TEMPLATES.length]
  return { id: 'compose', kind: 'compose', title: 'Fill it in', subtitle: 'Choose the words that fit you.', compose: t, xp: 5 }
}

// Multiple-choice reflections come from the central library (CHOICE_POOL).
function choiceMove(ctx: SessionContext): Move {
  const item = CHOICE_POOL[(ctx.seed ?? ctx.dayOfYear) % CHOICE_POOL.length]
  return { id: 'choice', kind: 'choice', title: item.q, subtitle: 'No wrong answer.', options: item.options, xp: 5 }
}

// ─── Non-affirm registers (choice-shaped → reuse the Choice scene) ─────────────

// Acknowledge + self-compassion — validate the hard feeling instead of denying it.
function acknowledgeMove(ctx: SessionContext): Move {
  const item = ACKNOWLEDGE_POOL[(ctx.seed ?? ctx.dayOfYear) % ACKNOWLEDGE_POOL.length]
  return { id: 'acknowledge', kind: 'acknowledge', title: item.q, subtitle: 'Honest is allowed.', options: item.options, xp: 5 }
}

// Interrogative self-talk — ask, don't declare ("Will you?").
function interrogativeMove(ctx: SessionContext): Move {
  const item = INTERROGATIVE_POOL[(ctx.seed ?? ctx.dayOfYear) % INTERROGATIVE_POOL.length]
  return { id: 'interrogative', kind: 'interrogative', title: item.q, subtitle: 'Answer for today.', options: item.options, xp: 5 }
}

// Mental contrasting (WOOP-lite) — the scene sources its obstacle/plan pools.
function contrastMove(ctx: SessionContext): Move {
  return { id: 'contrast', kind: 'contrast', title: 'See it, then plan', subtitle: 'Outcome + the obstacle.', statement: ctx.identityStatement?.trim() || undefined, xp: 5 }
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
    case 'compose': return composeMove(ctx)
    case 'acknowledge': return acknowledgeMove(ctx)
    case 'interrogative': return interrogativeMove(ctx)
    case 'contrast': return contrastMove(ctx)
    default: return stateCheckMove()
  }
}

// Breath is spaced out: once it's been done, it goes on cooldown so back-to-back
// sessions within the same few hours don't repeat the same breathing. Spaced
// sessions (first of the day, a midday one, one in the evening) can include it
// again.
const BREATH_COOLDOWN_MS = 4 * 60 * 60 * 1000 // ~4h

// Pick the seed-rotated entry from a pool, skipping any kind already used this
// session — so a session never shows the same modality twice. When `avoid` is
// given (last session's kinds), prefer kinds not in it; fall back when that
// would leave nothing, so avoidance never empties a slot.
function pickUnused(
  pool: MoveKind[],
  seed: number,
  used: Set<MoveKind>,
  avoid?: Set<string>,
): MoveKind | undefined {
  const avail = pool.filter((k) => !used.has(k))
  if (avail.length === 0) return undefined
  if (avoid && avoid.size > 0) {
    const fresh = avail.filter((k) => !avoid.has(k))
    if (fresh.length > 0) return fresh[seed % fresh.length]
  }
  return avail[seed % avail.length]
}

// Mark a kind used — and when it belongs to the affirm-statement family, reserve
// the WHOLE family, so one session can never recite the same statement in two
// different mediums (mirror + speak + type back-to-back).
function markUsed(kind: MoveKind, used: Set<MoveKind>): void {
  used.add(kind)
  if (AFFIRM_STATEMENT_KINDS.includes(kind)) {
    for (const k of AFFIRM_STATEMENT_KINDS) used.add(k)
  }
}

export class DeterministicMoveEngine implements MoveEngine {
  composeSession(ctx: SessionContext): MindSessionPlan {
    const seed = ctx.seed ?? ctx.dayOfYear
    const intro = INTROS[seed % INTROS.length]
    const used = new Set<MoveKind>()
    const avoid = new Set<string>(ctx.recentKinds ?? []) // last session's kinds
    const moves: Move[] = []

    // Register design: the session has exactly ONE slot per register —
    //   open (state-check) → regulate (breath/amplify) → core (work) → close
    //   (the single affirm-statement beat). The affirm-statement family
    //   (identity/mirror/type/speak/compose/assemble) lives ONLY in the close
    //   slot; amplify + core draw from other registers. markUsed() reserves the
    //   whole family once one member is placed, as a structural guarantee.

    // 1. Open by checking in (grounds the session, grants XP via /api/mind/state).
    moves.push(stateCheckMove())
    used.add('state-check')

    // 2. Regulate beat:
    //  • If breath was done recently → ground/amplify with a non-breath beat
    //    instead (no repetitive breathing).
    //  • Otherwise → a realignment breath carrying an amplify alternative the
    //    player swaps in when the live check-in is positive ('locked_in').
    // The amplify kind is RESERVED in `used` either way, so even when the player
    // swaps it in at runtime it can never collide with the core/close beat.
    // No affirm-family kinds here — the close slot owns that register.
    const amplifyPool: MoveKind[] = ['win', 'vision', 'choice']
    const amplifyKind = pickUnused(amplifyPool, seed, used, avoid) ?? 'win'
    const amplify = buildMove(amplifyKind, ctx)
    const now = ctx.now ?? 0
    const onCooldown = ctx.lastBreathAt != null && now > 0 && now - ctx.lastBreathAt < BREATH_COOLDOWN_MS
    if (onCooldown) {
      moves.push(amplify)
    } else {
      const breath = breathMove()
      breath.altPositive = amplify
      moves.push(breath)
      used.add('breath')
    }
    markUsed(amplifyKind, used)

    // 3. Core beat. Tone follows the most recent check-in: a NEGATIVE/off state
    // gets the non-affirm registers (acknowledge + self-compassion, ask-don't-
    // declare, mental contrasting) rather than forced positivity. A positive/
    // unknown state gets the evidence/action/reflection registers. No affirm-
    // family kinds — reciting the statement is the close slot's job, and having
    // it here too meant saying the same phrase twice (or three times) a session.
    const down = ctx.recentState === 'stressed' || ctx.recentState === 'distracted' || ctx.recentState === 'low_energy'
    const corePool: MoveKind[] = []
    if (down) {
      corePool.push('acknowledge', 'interrogative') // validate + reflective self-talk
      if (ctx.chapter >= 2) corePool.push('contrast', 'choice')
    } else {
      if (ctx.chapter >= 3) corePool.push('challenge') // discipline
      if (ctx.chapter >= 2) corePool.push('win') // self-image: evidence
      if (ctx.chapter >= 2) corePool.push('vision') // foundation: see it
      if (ctx.chapter >= 2) corePool.push('choice', 'interrogative', 'contrast') // reflection registers
      if (ctx.chapter >= 2 && ctx.missionAction?.trim()) corePool.push('mission')
      if (ctx.chapter >= 4) corePool.push('antisabotage') // defense: pattern interrupt
      if (ctx.chapter >= 5) corePool.push('social') // architect: environment
    }
    const coreKind = pickUnused(corePool, seed, used, avoid)
    if (coreKind) {
      moves.push(buildMove(coreKind, ctx))
      markUsed(coreKind, used)
    }

    // 4. Close on THE identity-reinforcing beat — the session's single affirm-
    // statement move. Rotate the MODALITY, avoiding last session's closer when
    // possible, so visits feel different (affirm / mirror / type / say / fill-in).
    const closePool: MoveKind[] = ['identity']
    if (ctx.chapter >= 2) closePool.push('mirror', 'type', 'speak', 'compose')
    const closeKind = pickUnused(closePool, seed + 1, used, avoid) ?? 'identity'
    moves.push(buildMove(closeKind, ctx))
    markUsed(closeKind, used)

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
