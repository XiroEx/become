/**
 * Exercise video lookup — legacy fallback cache and video resolution (NP-077 parity).
 *
 * The authoritative video for an exercise is `Exercise.videoUrl`. Callers prefer that.
 * This module exists for legacy rows and name-keyed fallback lookups.
 *
 * Rules:
 *  1. The exercise's own `videoUrl` wins.
 *  2. Dimensions, framing and trim describe one specific FILE, so they are taken
 *     from the legacy row ONLY when that row is the file being played.
 */

import type { VideoFramingOverride } from "@/lib/videoFraming";
import type { VideoTrimOverride } from "@/lib/videoTrim";
import { WEBAPP_BASE_URL } from "@/lib/config";

const RETIRED_STATUS = "retired";

export interface ExerciseVideoDisplay {
  videoUrl: string;
  thumbnailUrl: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  videoFraming: VideoFramingOverride | null;
  videoTrim: VideoTrimOverride | null;
}

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

let videoCache: Map<string, ExerciseVideoDisplay> | null = null;
let cachePromise: Promise<void> | null = null;

interface ApiVideo {
  exerciseName?: string;
  videoUrl?: string;
  thumbnailUrl?: string | null;
  status?: string;
  videoWidth?: number | null;
  videoHeight?: number | null;
  framing?: VideoFramingOverride | null;
  trim?: VideoTrimOverride | null;
}

export async function initializeCache(): Promise<void> {
  if (videoCache) return;
  if (cachePromise) {
    await cachePromise;
    return;
  }

  cachePromise = (async () => {
    try {
      const response = await fetch(`${WEBAPP_BASE_URL}/api/exercise-videos`);
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
      videoCache = new Map();
    }
  })();

  await cachePromise;
}

export function getExerciseVideoDisplay(
  exerciseName: string,
): ExerciseVideoDisplay | null {
  if (!videoCache || !exerciseName) return null;
  return videoCache.get(exerciseName.toLowerCase()) ?? null;
}

export function getExerciseVideoUrl(exerciseName: string): string | null {
  return getExerciseVideoDisplay(exerciseName)?.videoUrl ?? null;
}

export function getExerciseThumbnail(exerciseName: string): string | null {
  return getExerciseVideoDisplay(exerciseName)?.thumbnailUrl ?? null;
}

export async function getExerciseVideoDisplayAsync(
  exerciseName: string,
): Promise<ExerciseVideoDisplay | null> {
  await initializeCache();
  return getExerciseVideoDisplay(exerciseName);
}

export async function getExerciseVideoUrlAsync(
  exerciseName: string,
): Promise<string | null> {
  await initializeCache();
  return getExerciseVideoUrl(exerciseName);
}

export async function getExerciseThumbnailAsync(
  exerciseName: string,
): Promise<string | null> {
  await initializeCache();
  return getExerciseThumbnail(exerciseName);
}

/**
 * Combine an exercise's own video fields with the name-keyed legacy row.
 *
 * 1. Own videoUrl wins when present.
 * 2. Framing, trim, and dimensions follow the file actually played.
 */
export function resolveExerciseVideo(
  own: OwnExerciseVideoFields,
  legacy: ExerciseVideoDisplay | null,
): ResolvedExerciseVideo {
  const ownVideoUrl = own.videoUrl?.trim() || null;
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

export function invalidateExerciseVideoCache(): void {
  videoCache = null;
  cachePromise = null;
}

export function setExerciseVideoCacheForTesting(
  map: Map<string, ExerciseVideoDisplay> | null,
): void {
  videoCache = map;
  cachePromise = null;
}
