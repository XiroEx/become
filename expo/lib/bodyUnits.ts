/**
 * Body measurement conversion — re-exported from @become/core (Decision NP-017 / NP-048).
 *
 * Provides the web's conversion maths (lbsToKg, kgToLbs, cmToFtIn, ftInToCm,
 * displayWeight, roundWeight, roundHeightCm), plus useUnits() and formatWeight()
 * for native screens.
 */
export * from "@become/core/bodyUnits";
export { useUnits, formatWeight, type UseUnitsResult } from "@/lib/hooks/useUnits";
