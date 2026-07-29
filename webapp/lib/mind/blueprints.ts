// SESSION SHAPE — how a main session is assembled.
//
// A session is TWO halves, owned by two different things:
//
//   OPENING = f(check-in state)   lib/mind/openings.ts
//   BODY    = f(50-session path)  lib/mind/bodies.ts
//
//   [state-check] → OPENING(regulate) → BODY(core) → BODY(close)
//
// WHY. Previously one "blueprint" owned all three beats and was chosen purely by
// state. Two things fell out of that:
//
//   1. The 50-session path never reached the session's structure. It was a hint in
//      the AI prompt and a line in the intro — nothing enforced that the beats
//      served it. The intro could say "Session 12 — Name the identity" over three
//      beats about something else.
//   2. Checking in differently mid-session rebuilt EVERY beat from authored
//      fallback copy, discarding the path theme and every word the AI had
//      personalized.
//
// Splitting them fixes both. Realigning swaps only the opening, so the path body
// and its personalized copy survive untouched: recognise the feeling, then carry
// on with the path. That is the intended behaviour, and now it is the structural
// one.
//
// Pure + client-safe.

import { openingFor, type StateOpening } from './openings'
import { bodyFor, shapeForSeed, type PathBody } from './bodies'
import { breathOnCooldown, resolveSlot, slotMove, type SessionSlot } from './slots'
import type { MindState } from '@/lib/mindContent'
import type { Move, SessionContext } from './moves'

export { slotMove, resolveSlot, breathOnCooldown, BREATH_COOLDOWN_MS } from './slots'
export type { SessionSlot, SlotRole, SlotContent } from './slots'
export { STATE_OPENINGS, NEUTRAL_OPENING, openingFor } from './openings'
export { PATH_BODIES } from './bodies'

export interface SessionShape {
  opening: StateOpening
  body: PathBody
  /** The theme this session serves — the path focus, or null when off-path. */
  focus: string | null
  /** regulate → core → close, resolved for today (cooldown + modality rotation). */
  slots: SessionSlot[]
  /** Per-session finish line, from the body: it describes the work they did. */
  doneText: string
  /** Diagnostic id, e.g. "open-one-point/commit". */
  id: string
}

/** The regulate slot for this opening, honouring the breath cooldown. */
function regulateSlot(opening: StateOpening, onCooldown: boolean): SessionSlot {
  return opening.slot.kind === 'breath' && onCooldown ? opening.alt : opening.slot
}

/**
 * Today's session shape: the opening the check-in calls for, joined to the body
 * today's path session calls for.
 */
export function sessionShape(ctx: SessionContext, state?: MindState | null): SessionShape {
  const opening = openingFor(state !== undefined ? state : ctx.recentState)
  const shape = ctx.pathFocus?.shape ?? shapeForSeed(ctx)
  const { body, core } = bodyFor(shape, ctx)
  const onCooldown = breathOnCooldown(ctx)

  const slots = [regulateSlot(opening, onCooldown), core, body.close]
    .map((s) => resolveSlot(s, ctx))

  return {
    opening,
    body,
    focus: ctx.pathFocus?.focus ?? null,
    slots,
    doneText: body.doneText,
    id: `${opening.id}/${body.shape}`,
  }
}

/** The moves for a shape (without the leading state-check). */
export function shapeMoves(shape: SessionShape, ctx: SessionContext): Move[] {
  const moves = shape.slots.map((s) => slotMove(s, ctx))
  // A positive live check-in swaps the regulate breath for the opening's
  // alternative rather than forcing calm on someone who came in hot.
  if (moves[0]?.kind === 'breath') moves[0].altPositive = slotMove(shape.opening.alt, ctx)
  return moves
}

/**
 * Rebuild the OPENING around the state the user just reported, keeping the path
 * body exactly as it is.
 *
 * The session is composed before it is played (and the AI plan is cached up to
 * 8h), so `ctx.recentState` is whatever they felt LAST time. This is what makes
 * answering "low energy" actually change the session — while leaving today's
 * curriculum, and the copy already personalized into it, alone.
 *
 * Returns null when today's answer lands on the same opening (nothing to do).
 */
export function realignOpening(
  currentOpeningId: string | undefined,
  liveState: MindState,
  ctx: SessionContext,
): { opening: StateOpening; move: Move } | null {
  const opening = openingFor(liveState)
  if (opening.id === currentOpeningId) return null
  const slot = regulateSlot(opening, breathOnCooldown(ctx))
  const move = slotMove(resolveSlot(slot, ctx), ctx)
  if (move.kind === 'breath') move.altPositive = slotMove(opening.alt, ctx)
  return { opening, move }
}
