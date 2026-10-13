// AI MoveEngine — the SECOND implementation of the MoveEngine seam (the first is
// the deterministic composer in composeSession.ts).
//
// WHAT CHANGED, AND WHY. This engine used to let the model compose the whole
// session: which moves, what order, the titles AND the payload. Validation was
// structural only (kind in the enum, >=3 moves, no duplicates), so anything that
// was structurally legal shipped — including beats that restated each other, a
// grounding "how heavy is today?" as the CLOSER, and second-person paragraphs in
// front of scenes that speech-match the line word for word.
//
// Now the AI does the job the arsenal gives it: it writes COPY INTO A CONTAINER
// SOMEONE AUTHORED. A blueprint (lib/mind/blueprints.ts) fixes the session's
// shape — regulate → core → close, chosen deterministically from the user's
// check-in — and each AI move is CONFORMED onto a slot:
//
//   • kind must be register-compatible with the slot it fills
//   • every content field is validated per kind (lib/mind/validateMove.ts)
//   • a field that fails falls back to the blueprint's authored copy
//   • a beat that restates the previous one is dropped
//   • acknowledge is gated on a down check-in and can never close
//
// Failure is LOUD, not partial: if the model fills none of the slots, the whole
// plan is rejected (null) and the caller renders the deterministic blueprint
// session. No more half-AI/half-authored Frankenstein moves.

import { runAiTask } from '@/lib/ai/runClient'
import { sessionShape, type SessionSlot } from './blueprints'
import { conformSession } from './conformSession'
import type { MindSessionPlan, SessionContext } from './moves'

export { conformSession, conformAiSession, type AiMove, type AiPlan } from './conformSession'

/**
 * Compose today's session: authored blueprint for the shape, AI for the copy.
 * Returns null on any whole-plan failure so the caller renders the deterministic
 * session instead.
 */
export async function composeSessionAI(ctx: SessionContext): Promise<MindSessionPlan | null> {
  // Pick the shape BEFORE asking for copy, and tell the model both halves: the
  // STATE it is opening for, and the PATH theme the body must serve. The model is
  // writing into a session someone else designed — it should know the brief, the
  // same way the arsenal's flow generator is told its system and topic.
  const shape = sessionShape(ctx)
  const slots: SessionSlot[] = shape.slots

  try {
    // Silent: background pre-composition, kept OUT of the global activity
    // indicator so it doesn't toast "Composing your session…" on every open.
    const r = await runAiTask(
      '/api/ai/mind/session',
      {
        context: ctx,
        blueprint: {
          id: shape.id,
          // The opening the check-in called for.
          opening: { id: shape.opening.id, title: shape.opening.title, subtitle: shape.opening.subtitle },
          // The theme the body must serve — today's path session.
          focus: shape.focus,
          shape: shape.body.shape,
          // Which part of the person today works — mindset is not only mental.
          dimension: ctx.pathFocus?.dimension ?? null,
          directive: ctx.pathFocus?.directive ?? null,
          feeling: ctx.recentFeeling ?? null,
          slots: slots.map((s) => ({ kind: s.kind, role: s.role, brief: s.brief })),
        },
      },
      { silent: true },
    )
    if (!r.ok || !r.result || typeof r.result !== 'object') return null
    return conformSession(r.result, ctx, shape)
  } catch {
    return null
  }
}
