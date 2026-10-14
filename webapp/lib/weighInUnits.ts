// ---------------------------------------------------------------------------
// Reading a STORED WEIGH-IN in the unit the member reads today.
//
// Three weight conventions live in this repo and this file is about exactly
// one of them:
//
//   1. `IWeightEntry` (models/UserProgress.ts) — the raw number the member
//      typed plus the unit they typed it in (`weight` + optional `unit`).
//      THIS FILE.
//   2. `profile.currentWeightKg` / `targetWeightKg` / `heightCm` — canonical
//      metric, converted for display through `@become/core`'s bodyUnits
//      (displayWeight / toKg).
//   3. `UserProgress.height` — inches, and the only input to the imperial BMI
//      formula in lib/data/userProgress.ts.
//
// NOTHING HERE WRITES. George's DECIDED comment on NP-209 forbids a migration
// of stored weights, and it still applies: this is display arithmetic, run at
// render time, on the way out. A stored number is never converted in place,
// normalised or backfilled.
//
// The rule — the same one lib/goals/ensure.ts#weightSeriesKg already uses, and
// the same grandfather rule NP-209 gave lifting loads:
//
//   • an entry's OWN `unit` wins (a 95 kg weigh-in stays 95 kg even if the
//     member later switches to pounds);
//   • an entry with NO unit (logged before the field existed) is read in the
//     member's current display unit — grandfathered, never converted;
//   • the member's display unit is `profile.weightUnit ?? 'lbs'`, read at
//     display time, never defaulted into the database.
//
// Same-unit reads return the stored number UNTOUCHED — no kg→lbs→kg
// round-trip, so the only numbers that move are the genuinely mixed-unit ones
// (a member who logged in pounds, switched to kilograms, and kept logging).
// ---------------------------------------------------------------------------

import { kgToLbs, lbsToKg, roundWeight, type WeightUnit } from '@become/core'

/** The shape every weigh-in reader needs: the raw number and its own unit. */
export interface StoredWeighIn {
  weight: number
  /** Absent on every entry logged before the field existed. */
  unit?: WeightUnit | string | null
}

/** A `unit` field off the database, narrowed. Anything else is "absent". */
function readUnit(unit: WeightUnit | string | null | undefined): WeightUnit | undefined {
  return unit === 'kg' || unit === 'lbs' ? unit : undefined
}

/** `profile.weightUnit ?? 'lbs'` — the one place the house default is spelled. */
export function memberDisplayUnit(weightUnit: WeightUnit | string | null | undefined): WeightUnit {
  return readUnit(weightUnit) ?? 'lbs'
}

/**
 * Which unit this stored weigh-in is really in: its own, or — when it carries
 * none — the member's display unit, grandfathered.
 */
export function weighInUnit(entry: StoredWeighIn, displayUnit: WeightUnit): WeightUnit {
  return readUnit(entry.unit) ?? displayUnit
}

/** Exact conversion between the two member-facing weight units. */
export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value
  return to === 'kg' ? lbsToKg(value) : kgToLbs(value)
}

/**
 * The stored weigh-in as a number to RENDER in `displayUnit`.
 *
 * Rounded to 0.1 only when a conversion actually happened — an untouched
 * number keeps whatever precision the member typed, exactly as it does today.
 */
export function weighInValue(entry: StoredWeighIn, displayUnit: WeightUnit): number {
  const from = weighInUnit(entry, displayUnit)
  if (from === displayUnit) return entry.weight
  return roundWeight(convertWeight(entry.weight, from, displayUnit))
}

/**
 * The stored weigh-in in POUNDS, for the one piece of arithmetic that is
 * imperial by definition: BMI = weight(lb) × 703 / height(in)².
 *
 * The formula itself is correct and stays as it is (calculateBMI); what was
 * wrong was feeding it a number that might be kilograms, which made a kg
 * member's BMI read ~45% of the real figure. This is that conversion, at the
 * edge, on the way into the formula — not a change to anything stored.
 */
export function weighInPounds(entry: StoredWeighIn, displayUnit: WeightUnit): number {
  const from = weighInUnit(entry, displayUnit)
  return from === 'lbs' ? entry.weight : kgToLbs(entry.weight)
}

/**
 * The journey recap's weight-change stat.
 *
 * `startLbs` / `endLbs` / `change` keep their historical meaning — ALWAYS
 * pounds, which is what their names say and what the native app and
 * `ProgramJourneyWeightChangeSchema` already read. The member-unit trio is
 * additive and is what the web recap renders, computed from each entry's own
 * unit rather than by converting the pounds back (which would round twice and
 * disagree with the number the member logged).
 */
export function journeyWeightChange(
  startEntry: StoredWeighIn,
  endEntry: StoredWeighIn,
  displayUnit: WeightUnit,
): {
  startLbs: number
  endLbs: number
  change: number
  unit: WeightUnit
  startInUnit: number
  endInUnit: number
  changeInUnit: number
} {
  const startLbs = roundWeight(weighInPounds(startEntry, displayUnit))
  const endLbs = roundWeight(weighInPounds(endEntry, displayUnit))
  const startInUnit = roundWeight(weighInValue(startEntry, displayUnit))
  const endInUnit = roundWeight(weighInValue(endEntry, displayUnit))
  return {
    startLbs,
    endLbs,
    change: roundWeight(endLbs - startLbs),
    unit: displayUnit,
    startInUnit,
    endInUnit,
    changeInUnit: roundWeight(endInUnit - startInUnit),
  }
}
