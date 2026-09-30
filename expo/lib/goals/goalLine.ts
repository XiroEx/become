import {
  formatWeight,
  formatWeightDelta,
  holdBand,
  type WeightUnit,
} from "@become/core";

/**
 * What the weight step says about the goal, live as the member types — the
 * highest-attention moment for it, and previously the one place that said
 * nothing about the goal at all.
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
