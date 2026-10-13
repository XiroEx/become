/**
 * Body measurement conversion — the SINGLE source of truth.
 *
 * Every screen that turns a member's typed weight or height into the kg/cm the
 * Mifflin-St Jeor equation needs must convert through here.
 *
 * Before this existed there were four separate copies of these helpers with
 * three different rounding behaviours: onboarding rounded lbs→kg to 0.1 kg, the
 * nutrition goals page multiplied by a raw 0.453592 and didn't round at all,
 * and settings had its own pair. The same 210 lb member therefore saw 2,910 cal
 * on the onboarding preview and 2,909 cal on the goals page. The gap is tiny,
 * but a member comparing two screens has no way to know which one to trust, and
 * "which number is real?" is fatal to a coaching app.
 *
 * The rule: CONVERT EXACTLY, ROUND ONLY FOR DISPLAY. Rounding at conversion
 * time bakes an error into the stored profile that every later calculation
 * inherits; rounding at render time affects nothing downstream.
 *
 * (Not in lib/units.ts — that module is the food/serving unit system.)
 */

export type WeightUnit = 'lbs' | 'kg'

export const LBS_PER_KG = 2.20462
export const CM_PER_INCH = 2.54

// ── Weight ───────────────────────────────────────────────────────────────────

/** Exact. Round with roundWeight() only when displaying. */
export function lbsToKg(lbs: number): number {
  return lbs / LBS_PER_KG
}

/** Exact. Round with roundWeight() only when displaying. */
export function kgToLbs(kg: number): number {
  return kg * LBS_PER_KG
}

/** Normalise a weight the member typed (in their display unit) to kg. */
export function toKg(weight: number, unit: WeightUnit = 'lbs'): number {
  return unit === 'kg' ? weight : lbsToKg(weight)
}

/** Convert a stored kg weight back into the member's display unit. */
export function fromKg(kg: number, unit: WeightUnit = 'lbs'): number {
  return unit === 'kg' ? kg : kgToLbs(kg)
}

/**
 * Display rounding for weight. 0.1 lb/kg is finer than any bathroom scale and
 * keeps the input field readable; whole numbers would hide a real 0.4 lb week.
 */
export function roundWeight(value: number): number {
  return Math.round(value * 10) / 10
}

/** Stored kg → a number ready to render in the member's unit. */
export function displayWeight(kg: number, unit: WeightUnit = 'lbs'): number {
  return roundWeight(fromKg(kg, unit))
}

// ── Height ───────────────────────────────────────────────────────────────────

/**
 * Exact. 6'0" is 182.88 cm, not 183 — and at 6.25 cal per cm in Mifflin-St Jeor
 * that rounding was worth a couple of calories a day on its own.
 */
export function ftInToCm(ft: number, inches: number): number {
  return (ft * 12 + inches) * CM_PER_INCH
}

export function cmToFtIn(cm: number): { ft: number; inches: number } {
  // Round to the nearest inch FIRST, then split — otherwise 71.6 in renders as
  // 5'12" instead of 6'0".
  const rounded = Math.round(cm / CM_PER_INCH)
  return { ft: Math.floor(rounded / 12), inches: rounded % 12 }
}

/** Display rounding for height in cm — whole cm is the sane granularity. */
export function roundHeightCm(cm: number): number {
  return Math.round(cm)
}
