// Exercise video lookup — LEGACY FALLBACK ONLY.
//
// The authoritative video for an exercise is `Exercise.videoUrl`, which
// `lib/hydrateExercises.ts` denormalizes onto every exercise the API returns.
// Callers must prefer that. This module exists for the rows that predate the
// denormalization: exercises whose video was only ever written to the
// `exercise_videos` collection by a seed script, and program entries so old
// they carry a name but no `exerciseSlug` to resolve against.
//
// Two behaviours were deliberately removed here:
//
//   1. Substring matching. The old cache lookup fell back to
//      `lowerName.includes(key) || key.includes(lowerName)`, so "Bench Press"
//      happily matched the stored video for "Incline Bench Press" and showed
//      users a demo of a different exercise.
//   2. Hash-bucketed placeholders. When nothing matched it returned
//      `/placeholder.mp4` or `/placeholder2.mp4` picked by a hash of the name,
//      so an exercise with no video still rendered a video. Combined with (1)
//      this is why removing a video in the admin looked like it "didn't save":
//      something always played.
//
// Both now resolve to `null`, and callers render an explicit empty state.

// Videos an admin has explicitly taken off an exercise are excluded from the
// cache — see the `retired` status on models/ExerciseVideo.ts.
const RETIRED_STATUS = 'retired';

interface CachedVideo {
  videoUrl: string;
  thumbnailUrl: string | null;
  isPlaceholder: boolean;
}

let videoCache: Map<string, CachedVideo> | null = null;
let cachePromise: Promise<void> | null = null;

interface ApiVideo {
  exerciseName?: string;
  videoUrl?: string;
  thumbnailUrl?: string | null;
  isPlaceholder?: boolean;
  status?: string;
}

async function initializeCache(): Promise<void> {
  if (videoCache) return;
  if (cachePromise) {
    await cachePromise;
    return;
  }

  cachePromise = (async () => {
    try {
      const response = await fetch('/api/exercise-videos');
      if (response.ok) {
        const data = (await response.json()) as { videos?: ApiVideo[] };
        videoCache = new Map();
        for (const video of data.videos || []) {
          if (!video.exerciseName || !video.videoUrl) continue;
          if (video.status === RETIRED_STATUS) continue;
          videoCache.set(video.exerciseName.toLowerCase(), {
            videoUrl: video.videoUrl,
            thumbnailUrl: video.thumbnailUrl || null,
            isPlaceholder: video.isPlaceholder ?? true,
          });
        }
      }
    } catch {
      videoCache = new Map(); // Empty cache on error — callers render the empty state.
    }
  })();

  await cachePromise;
}

/**
 * Exact (case-insensitive) name match only. Returns `null` when there is no
 * video for this exercise — callers must handle that rather than falling back
 * to a placeholder clip.
 */
export function getExerciseVideoUrl(exerciseName: string): string | null {
  if (!videoCache || !exerciseName) return null;
  return videoCache.get(exerciseName.toLowerCase())?.videoUrl ?? null;
}

/** Thumbnail for an exercise, or `null` when we have none. */
export function getExerciseThumbnail(exerciseName: string): string | null {
  if (!videoCache || !exerciseName) return null;
  return videoCache.get(exerciseName.toLowerCase())?.thumbnailUrl ?? null;
}

export async function getExerciseVideoUrlAsync(exerciseName: string): Promise<string | null> {
  await initializeCache();
  return getExerciseVideoUrl(exerciseName);
}

export async function getExerciseThumbnailAsync(exerciseName: string): Promise<string | null> {
  await initializeCache();
  return getExerciseThumbnail(exerciseName);
}

/**
 * Drop the cache so the next lookup refetches. Called after an admin changes a
 * video, otherwise the removed clip stays visible for the rest of the session.
 */
export function invalidateExerciseVideoCache(): void {
  videoCache = null;
  cachePromise = null;
}

// Warm the cache on module load (non-blocking).
if (typeof window !== 'undefined') {
  initializeCache().catch(() => {});
}
