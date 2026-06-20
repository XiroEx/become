// Shared food name-matching primitives.
//
// `stemMatch` was duplicated verbatim in the food-search ranking
// (app/api/nutrition/foods/route.ts) and the vision reconcile
// (app/api/nutrition/foods/match/route.ts). Centralizing it removes the drift
// risk between search ranking and reconciliation. The reconcile-specific
// helpers (words/STOP/PREP/contentWords/coverage) live here too since they're
// the canonical "does this name identify that food" toolkit; the search route
// keeps its own coverage/relevance scoring (count-based, brand-aware) which is
// intentionally different.

/** Stem match: share a common prefix of up to 5 chars (handles plurals/conjugations). */
export function stemMatch(qw: string, nw: string): boolean {
  const len = Math.min(qw.length, nw.length, 5)
  if (len < 3) return qw === nw
  return qw.slice(0, len) === nw.slice(0, len)
}

/** Tokenize a string into lowercase words, splitting on whitespace, commas, parens. */
export function words(s: string): string[] {
  return (s || '').toLowerCase().split(/[\s,()]+/).filter(Boolean)
}

// Words that don't carry identity — dropped before requiring full coverage so
// "grilled chicken breast" still matches a DB "Chicken Breast".
export const STOP = new Set(['of', 'with', 'and', 'the', 'a', 'an', 'in', 'on', 'or', 'to'])
export const PREP = new Set([
  'grilled', 'baked', 'roasted', 'fried', 'steamed', 'boiled', 'cooked', 'raw',
  'fresh', 'sauteed', 'sautéed', 'seared', 'scrambled', 'poached', 'mashed',
  'sliced', 'diced', 'chopped', 'grated', 'toasted', 'smoked', 'plain', 'whole',
  'organic', 'homemade',
])

/** Identity-bearing words of a name (stop + prep words removed). */
export function contentWords(name: string): string[] {
  return words(name).filter((w) => !STOP.has(w) && !PREP.has(w))
}

/** Fraction of `queryWords` covered by `candWords` (stem-aware). */
export function coverage(queryWords: string[], candWords: string[]): number {
  if (queryWords.length === 0) return 0
  const covered = queryWords.filter((qw) => candWords.some((cw) => stemMatch(qw, cw))).length
  return covered / queryWords.length
}
