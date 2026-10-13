// Fills in video display fields on quick-session exercises after they load.
//
// `DraftExercise` (lib/quickSession/types.ts) never carries `videoUrl` et al —
// a program gets those denormalized server-side via lib/hydrateExercises.ts
// before the client ever sees the workout (see /api/programs/current-workout),
// but a quick/custom session (builder, generator, or paste/upload import) is
// assembled straight from the local stash and has no equivalent pre-play
// hydration step. Without this, the live/track views fall through to the
// by-name lookup in lib/data/exerciseVideos.ts, which is documented there as
// a legacy fallback that predates the current video system and rarely has
// anything for a modern exercise — so a quick session's exercises looked
// video-less even when the same exercise has one everywhere else.
//
// This calls the same slug-based hydration a program gets, via
// /api/exercises/hydrate, and merges the result back onto the caller's
// exercises by index (the endpoint preserves input order/length).

import type { VideoFramingOverride } from '@/lib/videoFraming'
import type { VideoTrimOverride } from '@/lib/videoTrim'

export interface VideoFields {
  videoUrl?: string
  thumbnailUrl?: string
  videoWidth?: number | null
  videoHeight?: number | null
  videoFraming?: VideoFramingOverride | null
  videoTrim?: VideoTrimOverride | null
}

export interface HydratableExercise extends VideoFields {
  exerciseSlug?: string
  name: string
}

/**
 * Merge hydrated video fields onto each exercise, by index. Only fills a
 * field the exercise doesn't already carry — a per-program admin override
 * (or a value already resolved another way) wins over the catalog lookup.
 */
export function mergeHydratedVideos<T extends HydratableExercise>(
  exercises: T[],
  hydrated: VideoFields[],
): T[] {
  return exercises.map((ex, i) => {
    const h = hydrated[i]
    if (!h) return ex
    return {
      ...ex,
      ...(ex.videoUrl == null && h.videoUrl && { videoUrl: h.videoUrl }),
      ...(ex.thumbnailUrl == null && h.thumbnailUrl && { thumbnailUrl: h.thumbnailUrl }),
      ...(ex.videoWidth == null && h.videoWidth != null && { videoWidth: h.videoWidth }),
      ...(ex.videoHeight == null && h.videoHeight != null && { videoHeight: h.videoHeight }),
      ...(ex.videoFraming == null && h.videoFraming && { videoFraming: h.videoFraming }),
      ...(ex.videoTrim == null && h.videoTrim && { videoTrim: h.videoTrim }),
    }
  })
}

/**
 * Fetches video fields for a quick session's exercises and merges them in.
 * Best-effort: on any failure (no token, network error, non-OK response) it
 * returns the input unchanged so the caller still falls back to the legacy
 * by-name lookup rather than blocking the workout from loading.
 */
export async function hydrateQuickSessionVideos<T extends HydratableExercise>(
  exercises: T[],
  token: string | null,
): Promise<T[]> {
  if (!token || exercises.length === 0) return exercises
  try {
    const res = await fetch('/api/exercises/hydrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        exercises: exercises.map((ex) => ({ exerciseSlug: ex.exerciseSlug, name: ex.name })),
      }),
    })
    if (!res.ok) return exercises
    const data = (await res.json().catch(() => null)) as { exercises?: VideoFields[] } | null
    if (!data?.exercises) return exercises
    return mergeHydratedVideos(exercises, data.exercises)
  } catch {
    return exercises
  }
}
