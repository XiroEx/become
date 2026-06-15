// AI MoveEngine — the SECOND implementation of the MoveEngine seam (the first is
// the deterministic composer in composeSession.ts). It asks the become-ai graph
// (mind.composeSession, structured) to sequence + personalize today's session,
// then maps each AI-proposed move onto a STRUCTURALLY-VALID Move via buildMove():
// the AI personalizes copy/ordering/selection, while the rich payloads it can't
// reliably emit (choice options, compose templates, breath protocols, altPositive)
// always come from the deterministic builders. Any failure → null, and the caller
// falls back to the deterministic plan, so the player never breaks.
//
// composeSession() in the MoveEngine interface is synchronous; the AI call is not.
// So this is exposed as an async helper the play flow awaits (with a loading
// state), NOT as a drop-in sync MoveEngine.

import { buildMove } from './composeSession'
import { runAiTask } from '@/lib/ai/runClient'
import {
  AFFIRM_STATEMENT_KINDS,
  type Move,
  type MoveKind,
  type MindSessionPlan,
  type SessionContext,
} from './moves'

const VALID_KINDS: MoveKind[] = [
  'state-check', 'breath', 'identity', 'win', 'challenge', 'mission', 'vision',
  'antisabotage', 'social', 'mirror', 'choice', 'type', 'speak', 'assemble',
  'compose', 'acknowledge', 'interrogative', 'contrast',
]

interface AiMove {
  id?: string
  kind?: string
  title?: string
  subtitle?: string
  statement?: string
  prompt?: string
  protocolId?: string
  xp?: number
}

interface AiPlan {
  intro?: { title?: string; subtitle?: string }
  moves?: AiMove[]
  rewardXp?: number
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** Map one AI move onto a valid Move, anchored by the deterministic builder. */
function hydrate(ai: AiMove, ctx: SessionContext): Move | null {
  const kind = ai.kind as MoveKind
  if (!VALID_KINDS.includes(kind)) return null
  const base = buildMove(kind, ctx)
  // The AI's job is SELECTING + SEQUENCING moves and personalizing the genuinely
  // free-text, self-contained fields — the affirmation `statement` and the
  // reflection `prompt`. It must NOT touch `title`/`subtitle`: those are crafted,
  // on-brand, and (for choice/acknowledge/interrogative/compose moves) paired with
  // deterministic options the model can't see — overriding the title there
  // produced incoherent "question doesn't match its answers" slop. Keep them.
  return {
    ...base,
    statement: str(ai.statement) ?? base.statement,
    prompt: str(ai.prompt) ?? base.prompt,
  }
}

/**
 * Compose today's session via the AI engine. Returns a fully-valid MindSessionPlan
 * or null on any failure (caller uses the deterministic composeSession(ctx)).
 */
export async function composeSessionAI(ctx: SessionContext): Promise<MindSessionPlan | null> {
  let plan: AiPlan | null = null
  try {
    const r = await runAiTask('/api/ai/mind/session', { context: ctx })
    if (!r.ok || !r.result || typeof r.result !== 'object') return null
    plan = r.result as AiPlan
  } catch {
    return null
  }

  const aiMoves = Array.isArray(plan.moves) ? plan.moves : []
  const moves: Move[] = []
  const seen = new Set<string>()
  let affirmUsed = false
  for (const am of aiMoves) {
    const m = hydrate(am, ctx)
    if (!m) continue
    if (seen.has(m.kind)) continue // no duplicate modalities in one session
    // At most one "recite the statement" modality per session.
    const isAffirm = AFFIRM_STATEMENT_KINDS.includes(m.kind)
    if (isAffirm && affirmUsed) continue
    if (isAffirm) affirmUsed = true
    seen.add(m.kind)
    moves.push(m)
  }

  // Sanity floor: a real session needs a few beats. Anything thinner means the
  // model drifted — bail to the deterministic composer.
  if (moves.length < 3) return null

  // Always open on a check-in (grounds the session + grants state XP) even if the
  // AI forgot it.
  if (moves[0].kind !== 'state-check') {
    moves.unshift(buildMove('state-check', ctx))
  }

  return {
    intro: {
      title: str(plan.intro?.title) ?? 'Your session',
      subtitle: str(plan.intro?.subtitle) ?? 'Built around where you are today.',
    },
    moves,
    rewardXp: 15,
  }
}
