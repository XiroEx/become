/**
 * Pull one JSON object out of a model's reply.
 *
 * The naive version of this is `slice(indexOf('{'), lastIndexOf('}') + 1)`, and
 * it fails on the exact case that killed a real verification run: the model
 * emitted perfectly valid JSON and then a stray `"}` after it. `lastIndexOf`
 * anchors on the trailing junk, so the slice spans past the end of the object
 * and parses as nothing. A correct verdict — conflicted, 0.6, with reasoning —
 * was discarded as `unparseable_model_output`, the flag was left open, and
 * nobody found out until someone read the run state by hand.
 *
 * Scanning braces from the first `{` and stopping at the one that closes it
 * gets the object and ignores whatever follows. Quote- and escape-aware,
 * because a `}` inside a string is not a closing brace.
 */

export interface ParsedJson<T> {
  ok: boolean
  value?: T
  /** Present when parsing failed — the raw text, capped, for the error record. */
  raw?: string
}

/** Strip the code fence models add despite being told not to. */
function stripFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
}

/**
 * Index just past the object that starts at `from`, or -1 if it never closes.
 * Depth counting has to ignore braces inside strings, and a `\"` inside a
 * string does not end it.
 */
function endOfObject(text: string, from: number): number {
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = from; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }

    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Parse the first complete JSON object in `text`.
 *
 * Order matters: try the whole string first, so a clean reply costs one parse
 * and stays byte-exact. Only fall back to scanning when that fails.
 */
export function parseModelJson<T = unknown>(text: unknown): ParsedJson<T> {
  if (text && typeof text === 'object') return { ok: true, value: text as T }
  if (typeof text !== 'string' || !text.trim()) return { ok: false, raw: '' }

  const t = stripFence(text)

  try {
    return { ok: true, value: JSON.parse(t) as T }
  } catch {
    // Fall through — trailing or leading noise is the common case.
  }

  const start = t.indexOf('{')
  if (start !== -1) {
    const end = endOfObject(t, start)
    if (end !== -1) {
      try {
        return { ok: true, value: JSON.parse(t.slice(start, end + 1)) as T }
      } catch {
        // A truncated or malformed object. Nothing left to try.
      }
    }
  }

  return { ok: false, raw: t.slice(0, 500) }
}
