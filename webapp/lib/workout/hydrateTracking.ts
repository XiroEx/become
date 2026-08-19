// Server-side: what does this exercise ask you to log?
//
// The endpoints that rebuild a session from a saved log (session, logs,
// planned) have to answer that question for every exercise in it. Logs written
// from now on carry the answer in `prescription.trackingType`; older ones do
// not, and the old code guessed 'reps' — a value that exists nowhere else in
// the app, so the Track view dropped the weight column and the Live view showed
// no inputs at all.
//
// So: prescription first, then the exercise catalog by slug, then whatever the
// logged sets themselves imply.

import Exercise from '@/models/Exercise'
import { inferTracking, normalizeTracking, type TrackingType } from './tracking'

/** trackingType per slug, for the slugs that exist in the catalog. */
export async function trackingBySlug(slugs: Array<string | undefined>): Promise<Record<string, string>> {
  const wanted = [...new Set(slugs.filter((s): s is string => !!s))]
  if (wanted.length === 0) return {}
  try {
    const docs = await Exercise.find({ slug: { $in: wanted } })
      .select('slug trackingType')
      .lean<Array<{ slug: string; trackingType?: string }>>()
    const out: Record<string, string> = {}
    for (const d of docs) if (d.slug && d.trackingType) out[d.slug] = d.trackingType
    return out
  } catch {
    // A catalog lookup that fails must not take the whole session with it.
    return {}
  }
}

interface LoggedLike {
  exerciseSlug?: string
  sets?: Array<{ reps?: number | null; weight?: number | null; duration?: number | null }>
  prescription?: { trackingType?: string }
}

/** The tracking type to hand back for one logged exercise. */
export function trackingFor(ex: LoggedLike, bySlug: Record<string, string>): TrackingType {
  if (ex.prescription?.trackingType) return normalizeTracking(ex.prescription.trackingType)
  return inferTracking(ex.sets, ex.exerciseSlug ? bySlug[ex.exerciseSlug] : undefined)
}
