// Pure speech-matching for the Mind affirm modalities. Given a target statement
// and whatever the recognizer has heard so far, returns which target words have
// been spoken (for live karaoke highlight) and a forgiving match ratio. No DOM,
// no Web Speech — fully testable in isolation.

/** Lowercase, strip punctuation (keep apostrophes), collapse whitespace → tokens. */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

/** Levenshtein edit distance (small inputs — single words). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = new Array<number>(n + 1)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

/** Two words count as the same: exact; one a prefix of the other (≥3 chars — catches
 * interim/partial recognizer output sooner, e.g. "discip" → "disciplined"); or within
 * edit-distance 1 for longer words (absorbs minor mis-hears / homophones). */
export function wordsClose(a: string, b: string): boolean {
  if (a === b) return true
  const min = Math.min(a.length, b.length)
  if (min >= 3 && (a.startsWith(b) || b.startsWith(a))) return true
  if (a.length < 4 || b.length < 4) return false
  return levenshtein(a, b) <= 1
}

export interface MatchResult {
  /** Aligned to the target words: true where that word has been spoken. */
  matched: boolean[]
  matchedCount: number
  total: number
  /** matchedCount / total (0 when target is empty). */
  ratio: number
}

/** Greedy in-order alignment of the spoken stream against the target. The speaker
 * may skip or insert filler words; each target word matches the next close spoken
 * word at/after the current pointer. */
export function matchSpeech(target: string, spoken: string): MatchResult {
  const t = normalizeWords(target)
  const s = normalizeWords(spoken)
  const matched = new Array<boolean>(t.length).fill(false)
  let si = 0
  for (let ti = 0; ti < t.length; ti++) {
    for (let k = si; k < s.length; k++) {
      if (wordsClose(t[ti], s[k])) {
        matched[ti] = true
        si = k + 1
        break
      }
    }
  }
  const matchedCount = matched.reduce((n, m) => n + (m ? 1 : 0), 0)
  return { matched, matchedCount, total: t.length, ratio: t.length ? matchedCount / t.length : 0 }
}
