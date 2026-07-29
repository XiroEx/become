// PATH BODIES — the part of the session the 50-session curriculum owns.
//
//   OPENING = f(state)  ← lib/mind/openings.ts
//   BODY    = f(path)   ← this file
//
// Every path session (lib/mind/sessionPath.ts) is tagged with a `shape`. The shape
// decides the core + close move kinds, so today's focus finally reaches the
// session's STRUCTURE instead of being a hint the AI could ignore. The focus text
// and directive still drive the copy, written by the AI into these slots.
//
// Because the body belongs to the path and not the state, checking in differently
// mid-session swaps only the opening. The path theme — and the personalized copy
// already written into it — survives.
//
// Pure + client-safe.

import type { PathShape } from './sessionPath'
import type { SessionSlot } from './slots'
import type { MoveKind, SessionContext } from './moves'

export interface PathBody {
  shape: PathShape
  /** Per-shape finish line — what the user actually just did. */
  doneText: string
  /** Lowest chapter whose unlocked systems can render this shape. */
  minChapter: number
  core: SessionSlot
  close: SessionSlot
  /** Used when the core kind isn't unlocked yet — always chapter-1 safe. */
  coreFallback: SessionSlot
}

const CLOSE_ALTS: MoveKind[] = ['mirror', 'speak', 'type', 'compose']

/** A generic close: the line they carry out of today's focus. The AI rewrites the
 *  copy per session; the authored version is the floor. */
function closeSlot(brief: string): SessionSlot {
  return {
    kind: 'identity',
    role: 'close',
    brief,
    alternates: CLOSE_ALTS,
    content: { title: 'This is what that makes you', subtitle: 'Hold to lock it in.' },
  }
}

const REFLECT_FALLBACK: SessionSlot = {
  kind: 'choice',
  role: 'core',
  brief: "Reflect on today's focus with a question that has genuinely different answers.",
}

export const PATH_BODIES: Record<PathShape, PathBody> = {
  reflect: {
    shape: 'reflect',
    doneText: 'You looked at it straight.',
    minChapter: 1,
    core: {
      kind: 'choice',
      role: 'core',
      brief: "Ask the question today's focus is really asking. Options must be genuinely different positions, not three ways of agreeing.",
      alternates: ['interrogative'],
    },
    close: closeSlot("Collapse today's reflection into the one line they carry out."),
    coreFallback: REFLECT_FALLBACK,
  },

  evidence: {
    shape: 'evidence',
    doneText: 'That is who you are now.',
    minChapter: 1,
    core: {
      kind: 'win',
      role: 'core',
      brief: "Get a REAL, specific thing they did, tied to today's focus. Evidence beats affirmation.",
      content: { title: 'Name one thing you actually did', subtitle: 'Small is fine. Real is the requirement.' },
    },
    close: closeSlot('Turn the evidence into identity — they are not doing a thing, they are becoming someone.'),
    coreFallback: REFLECT_FALLBACK,
  },

  commit: {
    shape: 'commit',
    doneText: 'Decided. Now go.',
    minChapter: 1,
    core: {
      kind: 'mission',
      role: 'core',
      brief: "Get ONE concrete action out of them for today's focus. The prompt is the NUDGE that helps them name it; the user writes the move. Never write it for them.",
      alternates: ['challenge'],
    },
    close: closeSlot('Tie the commitment back to who making it makes them.'),
    coreFallback: REFLECT_FALLBACK,
  },

  envision: {
    shape: 'envision',
    doneText: 'Coming into focus.',
    minChapter: 2,
    core: {
      kind: 'vision',
      role: 'core',
      brief: "Put them inside one specific scene from today's focus. Sensory and concrete, never abstract.",
      content: { title: 'See it', subtitle: 'One scene. Make it specific.' },
    },
    close: closeSlot('Collapse the vision into the line that makes it theirs today.'),
    coreFallback: REFLECT_FALLBACK,
  },

  defend: {
    shape: 'defend',
    doneText: "Caught. That's the skill.",
    minChapter: 4,
    core: {
      kind: 'antisabotage',
      role: 'core',
      brief: "Name the pattern today's focus is about, in their own history, and the interrupt for it.",
      alternates: ['contrast'],
    },
    close: closeSlot('Close on the identity that no longer runs that pattern.'),
    coreFallback: REFLECT_FALLBACK,
  },

  connect: {
    shape: 'connect',
    doneText: "That's how circles change.",
    minChapter: 5,
    core: {
      kind: 'social',
      role: 'core',
      brief: "Turn today's focus into one concrete move involving a real person in their life.",
      alternates: ['choice'],
    },
    close: closeSlot('Close on who they are becoming to the people around them.'),
    coreFallback: REFLECT_FALLBACK,
  },
}

/** The body for today's path shape, with the core swapped for a chapter-safe
 *  fallback when the shape's core system isn't unlocked yet. */
export function bodyFor(shape: PathShape, ctx: SessionContext): { body: PathBody; core: SessionSlot } {
  const body = PATH_BODIES[shape]
  const core = ctx.chapter >= body.minChapter ? body.core : body.coreFallback
  return { body, core }
}

/** Off-path (after session 50, or before any path data): rotate the shapes the
 *  user's chapter can actually render. */
export function shapeForSeed(ctx: SessionContext): PathShape {
  const eligible = (Object.keys(PATH_BODIES) as PathShape[])
    .filter((k) => PATH_BODIES[k].minChapter <= ctx.chapter)
  const pool = eligible.length > 0 ? eligible : (['reflect'] as PathShape[])
  return pool[Math.abs(ctx.seed ?? ctx.dayOfYear) % pool.length]
}
