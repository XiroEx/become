/**
 * Plain-language naming for the strength metric.
 *
 * The app used to print the bare abbreviation "e1RM" next to a number, with no
 * unit and no explanation. It is standard jargon among lifters and completely
 * opaque to everyone else — a member reasonably read "Barbell Curl 133" as a
 * claim about the weight they had lifted (they had done 100), and concluded
 * the app was broken. It was not: 133 is the estimate of what they could lift
 * for a single rep, from 100 × 10.
 *
 * So the number stays and the word goes. Everything member-facing calls it an
 * "estimated max", and every surface that shows one can explain itself.
 *
 * Single source of truth on purpose: the label appeared in three components
 * with three different capitalisations before this existed.
 */

/** Full label. Use where there is room for two words. */
export const EST_MAX_LABEL = 'Estimated max'

/** Tight spaces — table headers, chips, footnotes. */
export const EST_MAX_LABEL_SHORT = 'Est. max'

/**
 * The one-line definition. Deliberately avoids "one-rep max" as the *leading*
 * phrase: someone who does not already know the term learns nothing from it.
 * Lead with what it means, then name it for people who do know.
 */
export const EST_MAX_BLURB =
  'The most you could lift once, estimated from your best set. You never have to actually test a true max to move this number.'

/**
 * The longer explanation, for the "what is this?" sheet. Kept as sentences
 * rather than one blob so the sheet can space them out.
 */
export const EST_MAX_EXPLAINER: string[] = [
  'Your estimated max is what the app thinks you could lift for a single all-out rep, worked out from the best set you actually did.',
  'It uses the reps too, not just the weight. 100 lbs for 10 reps and 100 lbs for 3 reps are very different days, and only the first one says your max is around 133.',
  'It is an estimate, not a test. It is most accurate in the 3 to 10 rep range and drifts optimistic on very high-rep sets.',
  'Lifters call this a one-rep max, or 1RM. The "estimated" part just means it was calculated, not attempted.',
]

/** How the number itself is produced, for the same sheet. */
export const EST_MAX_FORMULA_NOTE =
  'Weight × (1 + reps ÷ 30) — the Epley formula, one of the standard estimates used in strength training.'

/**
 * Worked example. Uses the exact numbers from the member report that prompted
 * this, because a concrete case lands where a formula does not.
 */
export const EST_MAX_EXAMPLE = {
  input: '100 lbs × 10 reps',
  output: '133',
  sentence: 'A best set of 100 lbs for 10 reps gives an estimated max of 133 lbs.',
}
