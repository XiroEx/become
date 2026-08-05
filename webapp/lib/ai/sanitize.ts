// Client-side guards for AI output. The graph's shared voice/anti-slop prompt
// (Phase 1) is the first line of defense; these are the belt-and-suspenders at
// the render seam so a bad generation degrades gracefully instead of shipping
// slop to the screen.

import type { GuidedStep } from '@/components/mind/system/GuidedFlow'

/** Strip markdown formatting to plain text. Chat + scenes render plain text, so
 *  stray bold/italic/header/code markers would otherwise show up literally. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')             // fenced code blocks
    .replace(/`([^`]+)`/g, '$1')                // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')       // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')    // links → link text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')         // headers
    .replace(/^\s{0,3}>\s?/gm, '')              // blockquotes
    .replace(/\*\*([^*]+)\*\*/g, '$1')          // **bold**
    .replace(/__([^_]+)__/g, '$1')              // __bold__
    .replace(/\*([^*\n]+)\*/g, '$1')            // *italic*
    .replace(/(?<=\s|^)_([^_\n]+)_(?=\s|$|[.,!?])/g, '$1') // _italic_
    .replace(/^\s*[-*+]\s+/gm, '')              // bullet markers
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** Chat/scene-ready cleanup: drop AI disclaimers + markdown. */
export function cleanReply(text: string): string {
  return stripMarkdown(stripAiLeakage(text))
}

/** Strip any leaked "as an AI / language model" disclaimer phrasing. */
export function stripAiLeakage(text: string): string {
  return text
    .replace(/\b(as an? (AI|language model|assistant)[^.!?]*[.!?])/gi, '')
    .replace(/\bI('?m| am) (just )?an? (AI|language model|assistant)\b[^.!?]*[.!?]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Collapse a model "title" that came back in Title Case into a clean line. */
export function clampWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/)
  return words.length <= max ? text.trim() : words.slice(0, max).join(' ')
}

/**
 * Clamp a title/question to a sane length WITHOUT chopping mid-sentence. Real
 * coaching questions run long (20+ words) and must render WHOLE — a hard word
 * cap was cutting them dead ("…how do you approach getting back on track when"
 * with nothing after it). Only a genuine runaway gets trimmed: back to its last
 * complete sentence when one exists, else hard-capped with an ellipsis so it
 * always reads as a finished thought, never a severed one.
 */
export function clampTitle(text: string, maxWords = 34): string {
  const t = text.trim()
  const words = t.split(/\s+/)
  if (words.length <= maxWords) return t
  const cut = words.slice(0, maxWords).join(' ')
  // Prefer to end on the last complete sentence within the cut.
  const lastEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '))
  if (lastEnd > cut.length * 0.5) return cut.slice(0, lastEnd + 1).trim()
  return cut.replace(/[\s,;:—-]+$/, '') + '…'
}

/** Drop surrounding quotes a model sometimes wraps a single line in. */
export function stripQuotes(text: string): string {
  return text.trim().replace(/^["“'']+|["”'']+$/g, '').trim()
}

/**
 * Validate + clean an AI-generated guided flow. Returns usable steps, or null if
 * the shape is too broken to render (caller falls back to its static flow).
 */
export function validateGuidedSteps(raw: unknown): GuidedStep[] | null {
  if (!Array.isArray(raw)) return null
  const out: GuidedStep[] = []
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue
    const o = s as Record<string, unknown>
    const title = typeof o.title === 'string' ? o.title.trim() : ''
    if (!title) continue // a step with no title is unrenderable — skip it

    const step: GuidedStep = { title: clampTextLen(title, 120) }
    if (typeof o.body === 'string' && o.body.trim()) step.body = clampTextLen(o.body.trim(), 400)
    if (typeof o.inputPrompt === 'string' && o.inputPrompt.trim()) step.inputPrompt = clampTextLen(o.inputPrompt.trim(), 160)
    if (typeof o.placeholder === 'string' && o.placeholder.trim()) step.placeholder = clampTextLen(o.placeholder.trim(), 120)

    // choices: keep only 2–4 non-empty string options.
    if (Array.isArray(o.choices)) {
      const choices = o.choices.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).map((c) => clampTextLen(c.trim(), 80)).slice(0, 4)
      if (choices.length >= 2) step.choices = choices
    }
    // scale: require min/max + both labels.
    if (o.scale && typeof o.scale === 'object') {
      const sc = o.scale as Record<string, unknown>
      if (typeof sc.min === 'number' && typeof sc.max === 'number' && sc.max > sc.min
        && typeof sc.minLabel === 'string' && typeof sc.maxLabel === 'string') {
        step.scale = { min: sc.min, max: sc.max, minLabel: sc.minLabel.trim(), maxLabel: sc.maxLabel.trim() }
      }
    }
    ensureStepAsks(step)
    out.push(step)
  }
  // Need at least 2 steps to be a "flow".
  return out.length >= 2 ? out.slice(0, 8) : null
}

/** Does this line actually pose a question? */
function isQuestion(s: string): boolean {
  return /\?["'”’)\]]*\s*$/.test(s.trim())
}

/**
 * Pull the trailing question out of a paragraph, e.g.
 * "You said you'd lead. What does that cost you today?" → the second sentence.
 */
export function trailingQuestion(body: string): string | null {
  const m = body.trim().match(/([^.!?]+\?)["'”’)\]]*\s*$/)
  if (!m) return null
  const q = m[1].trim()
  // Guard against a stray "?" or a two-word fragment being promoted.
  return q.split(/\s+/).length >= 3 ? q : null
}

/**
 * A typed-answer step has to ASK the member something.
 *
 * The model reliably sets `inputPrompt`, but often writes it as a directive
 * while putting the real question in `body` — or writes both as declarations.
 * Combined with `inputPrompt` never having been rendered, that produced screens
 * that stated something at the member and showed a bare text box. Where the body
 * ends in a question, promote that question to be the ask so the screen reads as
 * a question rather than a pronouncement.
 */
export function ensureStepAsks(step: GuidedStep): GuidedStep {
  if (!step.inputPrompt) return step

  if (!isQuestion(step.inputPrompt)) {
    const fromBody = step.body ? trailingQuestion(step.body) : null
    if (fromBody) step.inputPrompt = fromBody
  }

  // The ask now owns the question, so the body must not also end on one — the
  // model routinely writes the question in both places, and with the ask finally
  // rendered that would stutter the same request twice in slightly different
  // words. Strip the body's trailing question and leave it as pure setup.
  if (isQuestion(step.inputPrompt) && step.body) {
    const dupe = trailingQuestion(step.body)
    if (dupe) {
      const setup = step.body.slice(0, step.body.lastIndexOf(dupe)).trim()
      if (setup) step.body = setup
      else delete step.body // the body was only the question — the ask carries it
    }
  }

  return step
}

function clampTextLen(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…'
}
