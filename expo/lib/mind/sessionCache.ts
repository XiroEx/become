/**
 * Mind session cache invalidation.
 *
 * A completed workout drops the cached Mind session so the next compose
 * (app open / Mind open) reflects the just-finished workout.
 *
 * Web equivalent: `webapp/lib/mind/sessionCache.ts#invalidateMindSession`.
 * When NP-102 implements native Mind session caching, this clears that cache.
 */
export function invalidateMindSession(): void {
  // Placeholder for NP-102: when native Mind session cache lands, drop it here.
}
