// AI MoveEngine — the SECOND implementation of the MoveEngine seam (the first is
// the deterministic composer in composeSession.ts). It asks the become-ai graph
// (mind.composeSession, structured) to FULLY compose today's session — selection,
// order, titles, AND the kind-specific payload (choice/acknowledge/interrogative
// options, compose templates, statements, prompts) — so each move is a coherent
// unit authored together (no more AI-title-over-deterministic-options mismatch).
//
// Guard rail: every AI move is VALIDATED per kind. If a move is malformed for its
// kind (e.g. a choice with <2 options, a compose with no template), that single
// move falls back to the deterministic builder — never a half-AI/half-deterministic
// Frankenstein. Structural/UI kinds (breath, state-check) stay deterministic. All
// text is markdown-stripped. Whole-plan failure → null → caller uses deterministic.
//
// composeSession() in the MoveEngine interface is synchronous; the AI call is not.
// So this is exposed as an async helper the play flow awaits (with a loading
// state), NOT as a drop-in sync MoveEngine.

import { buildMove } from './composeSession'
import { runAiTask } from '@/lib/ai/runClient'
import { stripMarkdown, clampWords } from '@/lib/ai/sanitize'
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

// Kinds whose scene is fixed UI / resolved at play time — keep deterministic.
const STRUCTURAL_KINDS: MoveKind[] = ['breath', 'state-check', 'assemble']
// Kinds that present a question + answer options (must be authored together).
const OPTION_KINDS: MoveKind[] = ['choice', 'acknowledge', 'interrogative']

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
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}
/** Plain-text-clean a free field (strip markdown). */
function clean(v: unknown): string | undefined {
  const s = str(v)
  if (!s) return undefined
  const c = stripMarkdown(s)
  return c || undefined
}
/** Title: cleaned + clamped to a sane length (questions can be long; runaway isn't). */
function cleanTitle(v: unknown): string | undefined {
  const c = clean(v)
  return c ? clampWords(c, 16) : undefined
}

/** Validate AI options → 2–5 {label, response?} (coherent answer set). */
function validateOptions(v: unknown): { label: string; response?: string }[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: { label: string; response?: string }[] = []
  for (const it of v) {
    if (typeof it === 'string') {
      const l = clean(it)
      if (l) out.push({ label: l })
    } else if (it && typeof it === 'object') {
      const o = it as Record<string, unknown>
      const l = clean(o.label)
      if (!l) continue
      const r = clean(o.response)
      out.push(r ? { label: l, response: r } : { label: l })
    }
    if (out.length >= 5) break
  }
  return out.length >= 2 ? out : undefined
}

/** Validate AI compose payload → {template with {n} blanks, blanks[][]}. */
function validateCompose(v: unknown): { template: string; blanks: string[][] } | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const template = str(o.template)
  if (!template || !/\{\d+\}/.test(template)) return undefined
  if (!Array.isArray(o.blanks)) return undefined
  const blanks: string[][] = []
  for (const b of o.blanks) {
    if (!Array.isArray(b)) return undefined
    const words = b.filter((w): w is string => typeof w === 'string' && w.trim().length > 0).map((w) => w.trim())
    if (words.length < 1) return undefined
    blanks.push(words)
  }
  return blanks.length >= 1 ? { template, blanks } : undefined
}

/**
 * Build a Move from an AI move, fully using the AI's authored content when it's
 * coherent for the kind, and falling back to the deterministic builder per-move
 * when it isn't. Never mixes an AI title with deterministic options (or vice
 * versa) for question+option moves — that pairing must come from one source.
 */
function hydrate(ai: AiMove, ctx: SessionContext): Move | null {
  const kind = ai.kind as MoveKind
  if (!VALID_KINDS.includes(kind)) return null
  const base = buildMove(kind, ctx)

  // Fixed-UI / resolved-at-play-time kinds stay deterministic.
  if (STRUCTURAL_KINDS.includes(kind)) return base

  const title = cleanTitle(ai.title)
  const subtitle = clean(ai.subtitle)

  // Question + options: use the AI pair only if BOTH a title and valid options
  // are present; otherwise the whole deterministic move (coherent by construction).
  if (OPTION_KINDS.includes(kind)) {
    const options = validateOptions(ai.options)
    if (title && options) {
      return { ...base, title, subtitle: subtitle ?? base.subtitle, options }
    }
    return base
  }

  // Fill-in-the-blank: AI template + blanks, paired with its title.
  if (kind === 'compose') {
    const compose = validateCompose(ai.compose)
    if (title && compose) {
      return { ...base, title, subtitle: subtitle ?? base.subtitle, compose }
    }
    return base
  }

  // Self-contained content kinds — AI owns the copy fields.
  return {
    ...base,
    title: title ?? base.title,
    subtitle: subtitle ?? base.subtitle,
    statement: clean(ai.statement) ?? base.statement,
    prompt: clean(ai.prompt) ?? base.prompt,
  }
}

/**
 * Compose today's session via the AI engine. Returns a fully-valid MindSessionPlan
 * or null on any failure (caller uses the deterministic composeSession(ctx)).
 */
export async function composeSessionAI(ctx: SessionContext): Promise<MindSessionPlan | null> {
  let plan: AiPlan | null = null
  try {
    // Silent: background pre-composition, kept OUT of the global activity
    // indicator so it doesn't toast "Composing your session…" on every open.
    const r = await runAiTask('/api/ai/mind/session', { context: ctx }, { silent: true })
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
      title: cleanTitle(plan.intro?.title) ?? 'Your session',
      subtitle: clean(plan.intro?.subtitle) ?? 'Built around where you are today.',
    },
    moves,
    rewardXp: 15,
  }
}
