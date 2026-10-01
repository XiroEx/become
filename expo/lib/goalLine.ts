import {
  formatWeight,
  formatWeightDelta,
  holdBand,
  type WeightUnit,
} from "@become/core";

/**
 * What the check-in and weight log sheets say about the goal live as the member types.
 * Pure helper mirroring web's DailyCheckInModal.tsx goalLine function.
 */
export function goalLine(
  typedWeight: string,
  targetWeight: number | undefined | null,
  unit: WeightUnit = "lbs",
): string | null {
  if (targetWeight == null || !(targetWeight > 0)) return null;
  const target = `${formatWeight(targetWeight, unit)} ${unit}`;
  const typed = parseFloat(typedWeight);
  if (!(typed > 0)) return `Goal: ${target}`;
  const diff = typed - targetWeight;
  if (Math.abs(diff) <= holdBand(unit)) return `Goal: ${target} — right there`;
  return `Goal: ${target} — ${formatWeightDelta(diff, unit)} ${diff > 0 ? "to go" : "past it"}`;
}
