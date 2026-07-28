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
import { stripMarkdown, clampTitle } from '@/lib/ai/sanitize'
import { SEGMENT_LABELS } from './recommendSegment'
import { buildMove } from './moveBuilders'
import { pickBlueprint, regulateSlot, slotMove, type SessionSlot } from './blueprints'
import {
  OPTION_KINDS,
  canClose,
  isDownState,
  restates,
  validateCompose,
  validateOptions,
  validatePrompt,
  validateStatement,
  validateSubtitle,
  validateTitle,
} from './validateMove'
import type { Move, MoveKind, MindSessionPlan, SessionContext } from './moves'

const VALID_KINDS: MoveKind[] = [
  'state-check', 'breath', 'identity', 'win', 'challenge', 'mission', 'vision',
  'antisabotage', 'social', 'mirror', 'choice', 'type', 'speak', 'assemble',
  'compose', 'acknowledge', 'interrogative', 'contrast',
]

// Registers. An AI move may fill a slot when it shares the slot's register — so
// the model can still vary the modality (a slot asking for `mirror` accepts
// `speak`; a slot asking for `choice` accepts `interrogative`) without being able
// to swap the session's INTENT out from under the blueprint.
const REGISTERS: MoveKind[][] = [
  ['identity', 'mirror', 'type', 'speak', 'compose', 'assemble'], // recite / affirm
  ['choice', 'interrogative', 'contrast'],                        // reflect
  ['acknowledge'],                                                // meet the feeling
  ['win'],                                                        // evidence
  ['mission', 'challenge'],                                       // commit to action
  ['vision'],                                                     // see it forward
  ['antisabotage', 'social'],                                     // defense / environment
  ['breath', 'state-check'],                                      // structural
]

function sameRegister(a: MoveKind, b: MoveKind): boolean {
  if (a === b) return true
  return REGISTERS.some((r) => r.includes(a) && r.includes(b))
}

// Fixed-UI kinds resolved at play time — the model never authors these.
const STRUCTURAL_KINDS: MoveKind[] = ['breath', 'state-check', 'assemble']

interface AiMove {
  id?: string
  kind?: string
  title?: string
  subtitle?: string
  statement?: string
  prompt?: string
  protocolId?: string
  options?: unknown
  compose?: unknown
  xp?: number
}

interface AiPlan {
  intro?: { title?: string; subtitle?: string }
  moves?: AiMove[]
  rewardXp?: number
  cta?: { system?: unknown; reason?: unknown }
}

/** Validate the AI's next-segment CTA → {system, reason}. */
function validateCta(v: unknown): { system: string; reason: string } | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const system = typeof o.system === 'string' ? o.system.trim() : ''
  const reason = typeof o.reason === 'string' ? stripMarkdown(o.reason).trim() : ''
  if (!system || !reason || !(system in SEGMENT_LABELS)) return undefined
  return { system, reason: clampTitle(reason, 30) }
}

/**
 * Fill one blueprint slot with an AI move, field by field. The authored move is
 * the floor: anything the AI gets wrong simply does not replace it. Returns the
 * move plus whether the AI contributed anything at all.
 */
function fillSlot(
  slot: SessionSlot,
  ai: AiMove | undefined,
  ctx: SessionContext,
): { move: Move; usedAi: boolean } {
  const authored = slotMove(slot, ctx)
  if (!ai) return { move: authored, usedAi: false }

  const kind = slot.kind
  // Structural scenes own their own UI — never let generated copy near them.
  if (STRUCTURAL_KINDS.includes(kind)) return { move: authored, usedAi: false }

  const title = validateTitle(ai.title)
  const subtitle = validateSubtitle(ai.subtitle)

  // Question + options must come from ONE source. An AI question over authored
  // options (or the reverse) is how "No wrong answer." ended up under a
  // personalized question it was never written for.
  if (OPTION_KINDS.includes(kind)) {
    const options = validateOptions(ai.options)
    if (!title || !options) return { move: authored, usedAi: false }
    return {
      move: { ...authored, title, subtitle: subtitle ?? authored.subtitle, options },
      usedAi: true,
    }
  }

  if (kind === 'compose') {
    const compose = validateCompose(ai.compose)
    if (!title || !compose) return { move: authored, usedAi: false }
    return {
      move: { ...authored, title, subtitle: subtitle ?? authored.subtitle, compose },
      usedAi: true,
    }
  }

  // Self-contained content kinds. Each field stands or falls on its own here,
  // because they are independent: a good title with an unsayable statement should
  // keep the title and drop the statement back to the authored/personalized one.
  const statement = validateStatement(ai.statement, kind)
  const prompt = validatePrompt(ai.prompt)
  const usedAi = !!(title || subtitle || statement || prompt)
  return {
    move: {
      ...authored,
      ...(title && { title }),
      ...(subtitle && { subtitle }),
      ...(statement && { statement }),
      ...(prompt && { prompt }),
    },
    usedAi,
  }
}

/**
 * Compose today's session: authored blueprint for the shape, AI for the copy.
 * Returns null on any whole-plan failure so the caller renders the deterministic
 * session instead.
 */
export async function composeSessionAI(ctx: SessionContext): Promise<MindSessionPlan | null> {
  // Pick the shape BEFORE asking for copy, and tell the model what each beat is
  // for. The model is writing into a session someone else designed — it should
  // know the brief, the same way the arsenal's flow generator is told which
  // system and topic it is writing for.
  const bp = pickBlueprint(ctx)
  const onCooldown =
    ctx.lastBreathAt != null &&
    (ctx.now ?? 0) > 0 &&
    (ctx.now ?? 0) - ctx.lastBreathAt < BREATH_COOLDOWN_MS

  // The authored shape for today. regulate honours the breath cooldown; core and
  // close come straight off the blueprint.
  const slots: SessionSlot[] = [
    regulateSlot(bp, onCooldown),
    ...bp.slots.filter((s) => s.role !== 'regulate'),
  ]

  let plan: AiPlan | null = null
  try {
    // Silent: background pre-composition, kept OUT of the global activity
    // indicator so it doesn't toast "Composing your session…" on every open.
    const r = await runAiTask(
      '/api/ai/mind/session',
      {
        context: ctx,
        blueprint: {
          id: bp.id,
          title: bp.title,
          subtitle: bp.subtitle,
          slots: slots.map((s) => ({ kind: s.kind, role: s.role, brief: s.brief })),
        },
      },
      { silent: true },
    )
    if (!r.ok || !r.result || typeof r.result !== 'object') return null
    plan = r.result as AiPlan
  } catch {
    return null
  }

  // Candidate AI moves, cleaned of anything that can't fill a slot at all.
  const candidates = (Array.isArray(plan.moves) ? plan.moves : []).filter((m) => {
    const k = m?.kind as MoveKind
    if (!k || !VALID_KINDS.includes(k)) return false
    if (STRUCTURAL_KINDS.includes(k)) return false
    // The acknowledge register only makes sense when they came in down. This is
    // the rule the deterministic composer has always had; the AI path never did.
    if (k === 'acknowledge' && !isDownState(ctx.recentState)) return false
    return true
  })

  const taken = new Set<number>()
  const moves: Move[] = []
  let aiFilled = 0

  for (const slot of slots) {
    // Prefer an exact kind match, then anything in the same register.
    let pick = candidates.findIndex((m, i) => !taken.has(i) && (m.kind as MoveKind) === slot.kind)
    if (pick < 0) {
      pick = candidates.findIndex((m, i) => !taken.has(i) && sameRegister(m.kind as MoveKind, slot.kind))
    }
    // A closing slot never accepts a register that leaves the user lower than
    // they arrived.
    if (pick >= 0 && slot.role === 'close' && !canClose(candidates[pick].kind as MoveKind)) pick = -1
    if (pick >= 0) taken.add(pick)

    const { move, usedAi } = fillSlot(slot, pick >= 0 ? candidates[pick] : undefined, ctx)

    // Drop a beat that just says the previous beat again, and re-fill the slot
    // from the authored copy instead of losing it.
    const prev = moves[moves.length - 1]
    if (usedAi && prev && beatsOverlap(prev, move)) {
      moves.push(slotMove(slot, ctx))
      continue
    }

    if (usedAi) aiFilled++
    moves.push(move)
  }

  // Fail loudly. If the model contributed nothing usable, this is not an AI
  // session — say so and let the caller render the deterministic one rather than
  // shipping a "personalized" session that is entirely fallback copy.
  if (aiFilled === 0) return null

  // Keep the regulate beat's live swap: a check-in of 'locked_in' at play time
  // turns a breath into the blueprint's alternative rather than forcing calm on
  // someone who came in hot.
  if (moves[0]?.kind === 'breath') {
    moves[0] = { ...moves[0], altPositive: slotMove(bp.regulateAlt, ctx) }
  }

  // Always open on a check-in (grounds the session + grants state XP).
  moves.unshift(buildMove('state-check', ctx))

  return {
    intro: {
      title: validateTitle(plan.intro?.title) ?? bp.title,
      subtitle: validateSubtitle(plan.intro?.subtitle) ?? bp.subtitle,
    },
    moves,
    rewardXp: 15,
    doneText: bp.doneText,
    blueprintId: bp.id,
    ...(validateCta(plan.cta) ? { cta: validateCta(plan.cta) } : {}),
  }
}

// Mirrors the deterministic composer's spacing rule.
const BREATH_COOLDOWN_MS = 4 * 60 * 60 * 1000

/** Does this beat just restate the previous one? Compares whatever text each
 *  beat actually puts on screen. */
function beatsOverlap(a: Move, b: Move): boolean {
  const text = (m: Move) => [m.title, m.statement, m.prompt].filter(Boolean).join(' ')
  return restates(text(a), text(b))
}
