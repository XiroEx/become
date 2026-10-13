/**
 * ONE UNIT FOR WEIGHT, AND IT IS POUNDS — because that is what the rest of the
 * app and the server speak (`weight_lbs`, `POST /api/weight`).
 *
 * Both platform health stores speak kilograms: HealthKit's `HKUnit.gramUnit`
 * family and Health Connect's `Mass` record (`{ value, unit: "kilograms" }`,
 * read back as `MassResult.inKilograms`). Every conversion in either direction
 * lives here so a read and a write can never disagree about the factor — a
 * mismatch would show up as a weigh-in that drifts a little every time it makes
 * a round trip.
 */

/** Pounds per kilogram, to the precision the platforms themselves use. */
export const LBS_PER_KG = 2.2046226218;

export function kgToLbs(valueKg: number): number {
  return valueKg * LBS_PER_KG;
}

export function lbsToKg(valueLbs: number): number {
  return valueLbs / LBS_PER_KG;
}
