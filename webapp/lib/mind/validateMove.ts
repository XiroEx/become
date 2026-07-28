// Per-kind CONTENT validation for AI-authored moves — the main session's
// equivalent of validateGuidedSteps() in lib/ai/sanitize.ts.
//
// The old AI engine validated STRUCTURE only (is the kind in the enum, are there
// enough moves, no duplicates) and then rendered whatever copy came back. That is
// how a 56-word second-person paragraph ended up in front of the mirror scene,
// which asks you to say the line out loud and speech-matches ~85% of it.
//
// These are the belt-and-suspenders at the render seam. Everything here FAILS
// CLOSED: a field that does not pass is dropped, and the blueprint's authored copy
// is used instead. Nothing half-valid reaches a scene.

import { stripMarkdown, clampTitle, stripQuotes } from '@/lib/ai/sanitize'
import type { MindState } from '@/lib/mindContent'
import type { MoveKind } from './moves'

/** Kinds whose statement the user has to SAY or TYPE, word for word.
 *  MirrorScene speech-matches at 0.6, SpeakScene at 0.85, TypeScene requires the
 *  whole line typed. A paragraph here is not a copy problem, it is a dead end. */
export const SPOKEN_KINDS: MoveKind[] = ['mirror', 'speak', 'type', 'assemble']

/** Kinds that present the statement to read and hold, not to recite. These can
 *  breathe a little longer (IdentityScene reveals word by word). */
export const HELD_KINDS: MoveKind[] = ['identity', 'vision', 'contrast']

/** Hard word caps. The deterministic composer has always capped spoken lines at
 *  9 words (shortStatement); 14 gives the AI a little room without breaking the
 *  scenes that have to match every word. */
export const MAX_SPOKEN_WORDS = 14
export const MAX_HELD_WORDS = 60

/** Question + options kinds — the title IS the question. */
export const OPTION_KINDS: MoveKind[] = ['choice', 'acknowledge', 'interrogative']

/** The "meet the hard feeling" register. Asking someone how heavy today is right
 *  after they checked in locked in reads as the app not listening — the
 *  deterministic composer has always gated this on a down state, and now the AI
 *  path does too. */
export const SOOTHE_KINDS: MoveKind[] = ['acknowledge']

const DOWN_STATES: MindState[] = ['stressed', 'distracted', 'low_energy']

/** True when the check-in justifies the acknowledge/self-compassion register. */
export function isDownState(state: MindState | null | undefined): boolean {
  return !!state && DOWN_STATES.includes(state)
}

/** A kind that must never CLOSE a session. Both of these are grounding beats that
 *  open a session; landing on one leaves the user lower than they arrived. */
export function canClose(kind: MoveKind): boolean {
  return !SOOTHE_KINDS.includes(kind)
}

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Is this statement something a person can actually say into a mirror?
 *
 * Requires FIRST PERSON. The composer prompt used to ask for a "punchy
 * second-person statement" for the say-aloud kinds, so the model wrote
 * "You said, 'I help people that are in need...'" and nested the user's own
 * mission inside it. Second person is correct for coach commentary and wrong for
 * anything the user recites about themselves.
 */
export function isSayable(raw: string): boolean {
  const t = stripQuotes(raw).trim()
  if (!t) return false
  // A quote mark surviving stripQuotes means it is quoting something INSIDE the
  // line — an echo, not an affirmation.
  if (/["“”]/.test(t)) return false
  // Second-person address: the model talking to them, not them talking.
  if (/\byou(r|rs|rself|'re|'ve|'ll)?\b/i.test(t)) return false
  // Must open in first person.
  return /^(i\b|i'|my\b|today i\b|every day i\b)/i.test(t)
}

/** Clean + length-check a statement for its kind. Returns null when unusable. */
export function validateStatement(raw: unknown, kind: MoveKind): string | null {
  if (typeof raw !== 'string') return null
  const s = stripMarkdown(raw).trim()
  if (!s) return null

  if (SPOKEN_KINDS.includes(kind)) {
    const t = stripQuotes(s).trim()
    if (!isSayable(t)) return null
    if (words(t) > MAX_SPOKEN_WORDS) return null
    return t
  }
  if (HELD_KINDS.includes(kind)) {
    const t = stripQuotes(s).trim()
    // vision/contrast are scene-framing, not recitation, so only identity needs
    // the first-person rule — it is the one the user affirms as themselves.
    if (kind === 'identity' && !isSayable(t)) return null
    if (words(t) > MAX_HELD_WORDS) return null
    return t
  }
  return s
}

/** 2–4 options, each with a real label. Mirrors validateGuidedSteps' choice rule
 *  (the old move validator allowed 5 and never clamped a label's length). */
export function validateOptions(raw: unknown): { label: string; response?: string }[] | null {
  if (!Array.isArray(raw)) return null
  const out: { label: string; response?: string }[] = []
  for (const it of raw) {
    if (out.length >= 4) break
    if (typeof it === 'string') {
      const l = clampLen(stripMarkdown(it).trim(), 80)
      if (l) out.push({ label: l })
      continue
    }
    if (!it || typeof it !== 'object') continue
    const o = it as Record<string, unknown>
    const label = typeof o.label === 'string' ? clampLen(stripMarkdown(o.label).trim(), 80) : ''
    if (!label) continue
    const response = typeof o.response === 'string' ? clampLen(stripMarkdown(o.response).trim(), 240) : ''
    out.push(response ? { label, response } : { label })
  }
  return out.length >= 2 ? out : null
}

/** Fill-in-the-blank payload: a template with {n} blanks + a word list per blank. */
export function validateCompose(raw: unknown): { template: string; blanks: string[][] } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const template = typeof o.template === 'string' ? o.template.trim() : ''
  if (!template || !/\{\d+\}/.test(template)) return null
  if (!Array.isArray(o.blanks)) return null
  const blanks: string[][] = []
  for (const b of o.blanks) {
    if (!Array.isArray(b)) return null
    const w = b.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
    if (w.length < 1) return null
    blanks.push(w)
  }
  // Every {n} in the template needs a matching blank list, or the scene renders a
  // sentence with a hole in it.
  const refs = new Set(Array.from(template.matchAll(/\{(\d+)\}/g), (m) => Number(m[1])))
  for (const r of refs) if (!blanks[r]) return null
  return blanks.length >= 1 ? { template, blanks } : null
}

/** Title = the headline (and, for option kinds, the question itself). */
export function validateTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = stripMarkdown(raw).trim()
  if (!t) return null
  return clampTitle(clampLen(t, 200), 30)
}

export function validateSubtitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = stripMarkdown(raw).trim()
  return t ? clampLen(t, 120) : null
}

export function validatePrompt(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = stripMarkdown(raw).trim()
  return t ? clampLen(t, 200) : null
}

/**
 * Two consecutive beats restating each other is the single most common way an
 * AI-composed session reads badly ("...starts with genuine interest in who they
 * are." followed by "When you give someone your genuine, undivided interest,
 * what shifts?"). Compare the content words of two lines; over half shared means
 * the second beat is not advancing the session.
 */
export function restates(a: string, b: string): boolean {
  // Compare against how the previous beat ENDED as well as against all of it.
  // In practice a restating beat picks up the closing clause of the one before
  // ("...starts with genuine interest in who they are." → "When you give someone
  // your genuine, undivided interest, what shifts?"), and that signal is drowned
  // out when a long paragraph is scored as a whole.
  return overlaps(lastSentence(a), b) || overlaps(a, b)
}

function overlaps(a: string, b: string): boolean {
  const A = contentWords(a)
  const B = contentWords(b)
  if (A.size < 3 || B.size < 3) return false
  let shared = 0
  for (const w of B) if (A.has(w)) shared++
  const ratio = shared / Math.min(A.size, B.size)
  // Two shared distinctive words across two short beats is already a repeat;
  // past half the smaller beat it is one regardless of the count.
  return (shared >= 2 && ratio >= 0.35) || ratio > 0.5
}

function contentWords(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  )
}

function lastSentence(s: string): string {
  const parts = s.split(/[.!?]+/).map((p) => p.trim()).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : s
}

const STOPWORDS = new Set([
  'that', 'this', 'with', 'what', 'when', 'your', 'from', 'have', 'they', 'them',
  'then', 'than', 'into', 'about', 'would', 'could', 'there', 'their', 'been',
  'were', 'will', 'just', 'like', 'more', 'most', 'some', 'only', 'over', 'much',
  'even', 'also', 'because', 'which', 'while', 'does', 'doing', 'done',
])

function clampLen(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…'
}
