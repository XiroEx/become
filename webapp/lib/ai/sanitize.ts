// Client-side guards for AI output. The graph's shared voice/anti-slop prompt
// (Phase 1) is the first line of defense; these are the belt-and-suspenders at
// the render seam so a bad generation degrades gracefully instead of shipping
// slop to the screen.

import type { GuidedStep } from '@/components/mind/system/GuidedFlow'

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
    out.push(step)
  }
  // Need at least 2 steps to be a "flow".
  return out.length >= 2 ? out.slice(0, 8) : null
}

function clampTextLen(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…'
}
