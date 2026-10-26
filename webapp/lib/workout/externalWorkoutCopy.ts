/**
 * The words the web calendar prints for a tracked workout done outside Become
 * (card 6adf69c7). Client-safe: no model imports.
 *
 * It is labelled an EXTRA activity on purpose. Jon's rule is that it ticks off
 * the day without completing the program session beside it, so the calendar
 * must never draw it in the program's completed colour or with a status badge
 * that reads as one.
 */

export interface ExternalWorkoutForCopy {
  activityName: string
  durationMin: number
  distanceKm?: number
  energyKcal?: number
  originApp?: string
}

const KM_PER_MILE = 1.609344

/** "Tracked by Whoop · 45 min · 2.1 mi · 180 kcal". Distance follows the member's unit system. */
export function externalWorkoutDetail(w: ExternalWorkoutForCopy, unit: 'lbs' | 'kg'): string {
  const parts: string[] = [w.originApp ? `Tracked by ${w.originApp}` : 'Tracked workout']
  if (w.durationMin > 0) parts.push(`${Math.round(w.durationMin)} min`)
  if (w.distanceKm != null && w.distanceKm > 0) {
    parts.push(unit === 'kg'
      ? `${(Math.round(w.distanceKm * 10) / 10).toFixed(1)} km`
      : `${(Math.round((w.distanceKm / KM_PER_MILE) * 10) / 10).toFixed(1)} mi`)
  }
  if (w.energyKcal != null && w.energyKcal > 0) parts.push(`${Math.round(w.energyKcal)} kcal`)
  return parts.join(' · ')
}

/** The legend / badge word, shared so the two cannot drift. */
export const EXTERNAL_WORKOUT_LABEL = 'Extra activity'
