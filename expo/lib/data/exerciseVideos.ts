import type { VideoFramingOverride } from "@/lib/videoFraming";
import type { VideoTrimOverride } from "@/lib/videoTrim";
import { WEBAPP_BASE_URL } from "@/lib/config";

const RETIRED_STATUS = "retired";

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
  framing?: VideoFramingOverride | null;
  trim?: VideoTrimOverride | null;
}

export async function initializeCache(
  baseUrl: string = WEBAPP_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (videoCache) return;
  if (cachePromise) {
    await cachePromise;
    return;
  }

  cachePromise = (async () => {
    try {
      const url = `${baseUrl.replace(/\/$/, "")}/api/exercise-videos`;
      const response = await fetchImpl(url);
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
      } else {
        videoCache = new Map();
      }
    } catch {
      videoCache = new Map(); // Empty cache on error — callers render the empty state.
    }
  })();

  await cachePromise;
}

export function resetVideoCacheForTests(): void {
  videoCache = null;
  cachePromise = null;
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
export function getExerciseVideoDisplay(
  exerciseName: string,
): ExerciseVideoDisplay | null {
  if (!videoCache || !exerciseName) return null;
  return videoCache.get(exerciseName.toLowerCase()) ?? null;
}

export async function getExerciseVideoUrlAsync(
  exerciseName: string,
  baseUrl: string = WEBAPP_BASE_URL,
): Promise<string | null> {
  await initializeCache(baseUrl);
  return getExerciseVideoUrl(exerciseName);
}

export async function getExerciseThumbnailAsync(
  exerciseName: string,
  baseUrl: string = WEBAPP_BASE_URL,
): Promise<string | null> {
  await initializeCache(baseUrl);
  return getExerciseThumbnail(exerciseName);
}

export async function getExerciseVideoDisplayAsync(
  exerciseName: string,
  baseUrl: string = WEBAPP_BASE_URL,
): Promise<ExerciseVideoDisplay | null> {
  await initializeCache(baseUrl);
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
  legacy: ExerciseVideoDisplay | null,
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
