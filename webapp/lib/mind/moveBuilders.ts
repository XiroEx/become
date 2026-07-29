// Per-kind Move builders — the deterministic floor under every session.
//
// Extracted out of composeSession.ts so the blueprint layer (blueprints.ts) can
// build a slot's authored move without importing the composer that consumes it.
// Pure + client-safe.
//
// Every builder returns a move that is VALID FOR ITS SCENE with no AI involved.
// That is the contract the blueprints and the AI engine both lean on: whatever
// generated copy fails validation, this is what renders instead.

import {
  IDENTITY_POOL,
  type Move,
  type MoveKind,
  type SessionContext,
} from './moves'
import { CHOICE_POOL, WIN_PROMPTS, COMPOSE_TEMPLATES, ACKNOWLEDGE_POOL, INTERROGATIVE_POOL } from './library'

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

// A SHORT affirmation for the say-it / type-it modalities: MirrorScene
// speech-matches at 0.6, SpeakScene at 0.85, and TypeScene makes you type every
// word. A long mission paragraph in any of them is a dead end, not just clumsy
// copy. Use the user's own line only when it is genuinely short; otherwise fall
// back to a concise pool line.
const MAX_SHORT_WORDS = 9
export function shortStatement(ctx: SessionContext): string {
  const sd = ctx.seed ?? ctx.dayOfYear
  const own = ctx.identityStatement?.trim()
  if (own && own.split(/\s+/).filter(Boolean).length <= MAX_SHORT_WORDS) return own
  return IDENTITY_POOL[sd % IDENTITY_POOL.length]
}

function typeMove(ctx: SessionContext): Move {
  return { id: 'type', kind: 'type', title: 'Type it', subtitle: 'Write it out, word for word.', statement: shortStatement(ctx), xp: 5 }
}

function speakMove(ctx: SessionContext): Move {
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

// Acknowledge + self-compassion — validate the hard feeling instead of denying it.
function acknowledgeMove(ctx: SessionContext): Move {
  const item = ACKNOWLEDGE_POOL[(ctx.seed ?? ctx.dayOfYear) % ACKNOWLEDGE_POOL.length]
  return { id: 'acknowledge', kind: 'acknowledge', title: item.q, subtitle: 'No need to spin it.', options: item.options, xp: 5 }
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

/** Build a single move of the given kind. */
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
