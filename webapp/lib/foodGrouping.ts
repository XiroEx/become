// ---------------------------------------------------------------------------
// foodGrouping — derive a coarse grouping key from a food name so future
// variant-merging passes can cluster the same conceptual food (Eggs, Chicken
// Breast, Tea) across prep variants ("scrambled", "raw", "iced").
//
// This file is intentionally conservative — it does NOT auto-merge anything.
// The Food schema stores `groupKey` so a later targeted pass can decide what
// to consolidate. The risk of over-merging ("apple sauce" → "apple") is
// higher than the cost of leaving a few obvious dupes for a human to merge.
// ---------------------------------------------------------------------------

/**
 * Words/phrases that, when they appear ALONE as a leading token (or as
 * comma-separated qualifiers), get stripped — they describe prep state or
 * temperature, not the food itself.
 *
 *   "Cooked Chicken Breast"     → "Chicken Breast"
 *   "Tea, hot, herbal"          → "Tea"
 *   "Iced Coffee"               → "Coffee"
 *
 * Order matters when stripping leading words — strip multi-word phrases
 * before single words (e.g. "with skin" before "with").
 */
const LEADING_PREP_WORDS = [
  'cooked', 'raw', 'hot', 'iced', 'cold', 'warm',
  'fresh', 'dried', 'frozen', 'canned',
  'boiled', 'roasted', 'baked', 'grilled', 'fried', 'steamed', 'sauteed',
  'broiled', 'poached', 'scrambled',
  'organic', 'natural', 'unsweetened', 'sweetened', 'plain',
]

/**
 * Trailing comma qualifiers that get sliced off entirely.
 *
 *   "Chicken Breast, raw, with skin"  →  "Chicken Breast"
 *   "Apples, raw"                     →  "Apples"
 */
const TRAILING_QUALIFIER_PATTERN =
  /,\s*(raw|cooked|boiled|roasted|baked|grilled|fried|steamed|sauteed|broiled|poached|shelled|peeled|whole|fresh|dried|canned|frozen|with skin|without skin|with salt|without salt|unsweetened|sweetened|enriched|unenriched|fortified|hot|cold|iced|warm|herbal|brewed|prepared|drained|undrained|in water|in oil|in syrup|cooked from frozen).*$/i

/**
 * Compute a coarse `groupKey` from a food name. Conservative defaults:
 *  - Lowercase.
 *  - Strip diacritics.
 *  - Drop trailing comma-qualifiers ("raw", "cooked", "with skin", etc.).
 *  - Drop leading prep words ("Cooked", "Raw", "Hot", "Iced", etc.).
 *  - Reduce to alphanumeric + single spaces.
 *  - Cap at two words. Most foods cluster meaningfully on the first 1-2 nouns
 *    ("chicken breast", "ground beef", "tea") and going wider risks pulling
 *    in modifiers we should have stripped. Single-word names ("Tea") collapse
 *    to a single word; two-word ("Chicken Breast") survive intact.
 *
 * Returns an empty string when nothing meaningful remains — caller should
 * leave `groupKey` undefined in that case.
 */
export function baseGroupKey(name: string): string {
  if (!name) return ''

  // 1. Strip diacritics + lowercase
  let work = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

  // 2. Drop trailing comma-qualifiers
  work = work.replace(TRAILING_QUALIFIER_PATTERN, '').trim()

  // 3. Drop leading prep words
  // Loop because "iced cold tea" should drop both "iced" and "cold".
  let changed = true
  while (changed) {
    changed = false
    for (const word of LEADING_PREP_WORDS) {
      const re = new RegExp(`^${word}\\s+`, 'i')
      if (re.test(work)) {
        work = work.replace(re, '').trim()
        changed = true
      }
    }
  }

  // 4. Strip parens content ("Tea (Camellia sinensis)" → "Tea")
  work = work.replace(/\([^)]*\)/g, '').trim()

  // 5. Reduce to alphanumeric + spaces
  work = work
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!work) return ''

  // 6. Take at most two words (the first noun + optional descriptor like
  // "breast", "thigh", "milk")
  const words = work.split(/\s+/).slice(0, 2)
  return words.join(' ')
}
