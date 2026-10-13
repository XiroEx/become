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
//
// What this module resolves is the whole DISPLAY record, not just a URL. An
// `exercise_videos` row mirrors the admin's framing and trim (see the PATCH in
// app/api/exercises/[slug]/trim/route.ts), so a video reached through this
// fallback has in/out points just like one read off the Exercise. Returning
// only the URL is what made those clips play full-length: the admin trimmed
// the video, and the surface that resolved it by name knew nothing about it.

import type { VideoFramingOverride } from '@/lib/videoFraming';
import type { VideoTrimOverride } from '@/lib/videoTrim';

// Videos an admin has explicitly taken off an exercise are excluded from the
// cache — see the `retired` status on models/ExerciseVideo.ts.
const RETIRED_STATUS = 'retired';

/**
 * Everything a player needs for one legacy-resolved video. Field names match
 * the props on `<FramedVideo>` / the hydrated Exercise so a call site can
 * spread one over the other without translating.
 */
export interface ExerciseVideoDisplay {
  videoUrl: string;
  thumbnailUrl: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  videoFraming: VideoFramingOverride | null;
  videoTrim: VideoTrimOverride | null;
}

let videoCache: Map<string, ExerciseVideoDisplay> | null = null;
let cachePromise: Promise<void> | null = null;

interface ApiVideo {
  exerciseName?: string;
  videoUrl?: string;
  thumbnailUrl?: string | null;
  isPlaceholder?: boolean;
  status?: string;
  videoWidth?: number | null;
  videoHeight?: number | null;
  // The stored names are `framing` / `trim` — the Exercise-side names carry a
  // `video` prefix. Translated once, here, rather than at every call site.
  framing?: VideoFramingOverride | null;
  trim?: VideoTrimOverride | null;
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
            videoWidth: video.videoWidth ?? null,
            videoHeight: video.videoHeight ?? null,
            videoFraming: video.framing ?? null,
            videoTrim: video.trim ?? null,
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
  return getExerciseVideoDisplay(exerciseName)?.videoUrl ?? null;
}

/** Thumbnail for an exercise, or `null` when we have none. */
export function getExerciseThumbnail(exerciseName: string): string | null {
  return getExerciseVideoDisplay(exerciseName)?.thumbnailUrl ?? null;
}

/**
 * The full display record — URL plus the dimensions, framing and trim stored
 * alongside it. Prefer this over `getExerciseVideoUrl` anywhere the result is
 * handed to a player: dropping the trim here is what made an admin-trimmed
 * clip play end to end.
 */
export function getExerciseVideoDisplay(exerciseName: string): ExerciseVideoDisplay | null {
  if (!videoCache || !exerciseName) return null;
  return videoCache.get(exerciseName.toLowerCase()) ?? null;
}

export async function getExerciseVideoUrlAsync(exerciseName: string): Promise<string | null> {
  await initializeCache();
  return getExerciseVideoUrl(exerciseName);
}

export async function getExerciseThumbnailAsync(exerciseName: string): Promise<string | null> {
  await initializeCache();
  return getExerciseThumbnail(exerciseName);
}

export async function getExerciseVideoDisplayAsync(
  exerciseName: string
): Promise<ExerciseVideoDisplay | null> {
  await initializeCache();
  return getExerciseVideoDisplay(exerciseName);
}

/** The video fields denormalized onto an exercise by lib/hydrateExercises.ts. */
export interface OwnExerciseVideoFields {
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoFraming?: VideoFramingOverride | null;
  videoTrim?: VideoTrimOverride | null;
}

export interface ResolvedExerciseVideo {
  videoUrl: string | null;
  thumbnailUrl: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  videoFraming: VideoFramingOverride | null;
  videoTrim: VideoTrimOverride | null;
}

/**
 * Combine an exercise's own video fields with the name-keyed legacy row, and
 * hand a player everything it needs. Every surface that shows a demo goes
 * through this, because both of its rules are easy to get wrong separately:
 *
 *  1. The exercise's own `videoUrl` wins. Consulting the name cache first is
 *     what let a video an admin had removed keep playing.
 *  2. Dimensions, framing and trim describe one specific FILE, so they are
 *     taken from the legacy row ONLY when that row is the file being played.
 *     An in/out window applied to different footage cuts the clip at the wrong
 *     place, or — for a file shorter than the stored out-point — seeks past
 *     the end. (`resolveTrim` clamps that once the duration is known, but the
 *     window was never that video's to begin with.)
 *
 * Note which way the fallback runs for the display fields: an explicit `null`
 * from the exercise falls THROUGH to the legacy row. That is what a swapped-in
 * exercise looks like — the swap nulls the programmed exercise's video fields
 * so the replacement resolves by name, trim included.
 */
export function resolveExerciseVideo(
  own: OwnExerciseVideoFields,
  legacy: ExerciseVideoDisplay | null
): ResolvedExerciseVideo {
  const ownVideoUrl = own.videoUrl?.trim() || null;
  // The row the played file actually came from — see rule 2.
  const source = ownVideoUrl ? null : legacy;

  return {
    videoUrl: ownVideoUrl ?? legacy?.videoUrl ?? null,
    thumbnailUrl: own.thumbnailUrl?.trim() || legacy?.thumbnailUrl || null,
    videoWidth: own.videoWidth ?? source?.videoWidth ?? null,
    videoHeight: own.videoHeight ?? source?.videoHeight ?? null,
    videoFraming: own.videoFraming ?? source?.videoFraming ?? null,
    videoTrim: own.videoTrim ?? source?.videoTrim ?? null,
  };
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
