// The slot primitive shared by state openings and path bodies.
//
// A slot is one beat of a session: which scene renders it, what that beat is FOR
// (the brief, handed to the AI), and authored copy so the beat runs perfectly with
// zero AI. Kept in its own module so openings.ts and bodies.ts can both use it
// without importing each other.

import { buildMove } from './moveBuilders'
import type { Move, MoveKind, SessionContext } from './moves'

export type SlotRole = 'regulate' | 'core' | 'close'

/** Copy a slot may author over the deterministic builder's output. */
export interface SlotContent {
  title?: string
  subtitle?: string
  statement?: string
  prompt?: string
  options?: { label: string; response?: string }[]
}

export interface SessionSlot {
  kind: MoveKind
  role: SlotRole
  /** Composer-facing: what this beat is FOR. Handed to the AI, never rendered. */
  brief: string
  /** Authored copy layered over buildMove(kind) — the zero-AI version of the beat.
   *  Deliberately omits `statement` on affirm slots so the user's OWN identity
   *  statement still comes through. */
  content?: SlotContent
  /** Other modalities that serve this same brief, rotated by seed so a repeated
   *  shape doesn't feel identical. Only used where the payload is interchangeable
   *  (the recite-the-statement family) — never where authored options belong to
   *  one specific question. A rotated kind drops the authored copy, since that
   *  copy was written for `kind`. */
  alternates?: MoveKind[]
}

/** Merge authored slot copy over the deterministic builder, skipping undefined
 *  keys so the builder's personalization (the user's own statement, their mission
 *  action) survives wherever the slot stayed quiet. */
export function slotMove(slot: SessionSlot, ctx: SessionContext): Move {
  const base = buildMove(slot.kind, ctx)
  const c = slot.content
  if (!c) return base
  return {
    ...base,
    ...(c.title !== undefined && { title: c.title }),
    ...(c.subtitle !== undefined && { subtitle: c.subtitle }),
    ...(c.statement !== undefined && { statement: c.statement }),
    ...(c.prompt !== undefined && { prompt: c.prompt }),
    ...(c.options !== undefined && { options: c.options }),
  }
}

/** Which modality this slot runs today. Rotating the close beat across the
 *  recite-the-statement family stops a repeated shape feeling like the same
 *  session twice. */
export function resolveSlot(slot: SessionSlot, ctx: SessionContext): SessionSlot {
  if (!slot.alternates || slot.alternates.length === 0) return slot
  const seed = Math.abs(ctx.seed ?? ctx.dayOfYear)
  const options = [slot.kind, ...slot.alternates]
  const avoid = new Set(ctx.recentKinds ?? [])
  const fresh = options.filter((k) => !avoid.has(k))
  const pool = fresh.length > 0 ? fresh : options
  const kind = pool[seed % pool.length]
  if (kind === slot.kind) return slot
  return { kind, role: slot.role, brief: slot.brief }
}

/** Breath is spaced out: once done it goes on cooldown so back-to-back sessions
 *  in the same few hours don't repeat the same breathing. */
export const BREATH_COOLDOWN_MS = 4 * 60 * 60 * 1000 // ~4h

export function breathOnCooldown(ctx: SessionContext, cooldownMs: number = BREATH_COOLDOWN_MS): boolean {
  const now = ctx.now ?? 0
  return ctx.lastBreathAt != null && now > 0 && now - ctx.lastBreathAt < cooldownMs
}
