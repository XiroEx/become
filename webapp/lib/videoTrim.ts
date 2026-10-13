/**
 * Non-destructive video trim.
 *
 * The runtime image has no ffmpeg, so "fix the length of the video" is done at
 * playback rather than by re-encoding: we persist in/out points in seconds and
 * every `<FramedVideo>` seeks to `start` and loops back once it passes `end`.
 *
 * The upside over a real cut is that it is reversible — the original bytes stay
 * in the bucket, so a bad in/out point is an edit, not a re-upload. The
 * downside is bandwidth: viewers still download the whole file. For the short
 * demo clips this app stores that trade is clearly worth it.
 *
 * No DOM access — pure inputs → resolved values, so the API route can validate
 * with the same code the player renders with.
 */

export interface VideoTrimOverride {
  start?: number | null;
  end?: number | null;
}

export interface ResolvedTrim {
  /** Seconds to seek to when (re)starting playback. Always finite, >= 0. */
  start: number;
  /**
   * Seconds at which to loop back to `start`, or `null` for "play to the end
   * of the file". Always > `start` when non-null.
   */
  end: number | null;
  /** True when neither bound is set — i.e. play the file as-is. */
  isFullLength: boolean;
}

/**
 * The shortest clip we allow. Below this the video reads as a stutter rather
 * than a demo, and a fat-fingered slider drag can otherwise produce a 0.1s
 * loop that looks like a broken player.
 */
export const MIN_TRIM_DURATION = 0.5;

/**
 * Resolve trim bounds against the video's real duration.
 *
 * `duration` is optional because the player calls this before `loadedmetadata`
 * fires. Without it we cannot clamp the upper bound, so we trust the stored
 * values and let the clamp happen on the next render once duration arrives.
 */
export function resolveTrim(
  input: { videoTrim?: VideoTrimOverride | null } | null | undefined,
  duration?: number | null
): ResolvedTrim {
  const trim = input?.videoTrim ?? null;
  const hasDuration = typeof duration === 'number' && Number.isFinite(duration) && duration > 0;
  const upperBound = hasDuration ? (duration as number) : Number.POSITIVE_INFINITY;

  let start = isFiniteNumber(trim?.start) ? Math.max(0, trim!.start as number) : 0;
  let end = isFiniteNumber(trim?.end) ? Math.max(0, trim!.end as number) : null;

  // Clamp against the real duration. A trim saved before a video was replaced
  // can easily point past the end of the new file; without this the player
  // would seek past the end and stall on a black frame.
  if (start >= upperBound) start = 0;
  if (end !== null && end > upperBound) end = hasDuration ? (upperBound as number) : end;

  // An inverted or degenerate range is treated as "no end bound" rather than
  // rejected, so bad stored data degrades to a playable video.
  if (end !== null && end - start < MIN_TRIM_DURATION) end = null;

  // An end bound at (or past) the real duration is the same as no bound —
  // normalising here keeps `isFullLength` honest for the "Auto" badge.
  if (end !== null && hasDuration && end >= (duration as number) - 0.01 && start === 0) {
    end = null;
  }

  return {
    start,
    end,
    isFullLength: start === 0 && end === null,
  };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** `72.4` → `1:12.4`. Used by the admin trim editor and nowhere else yet. */
export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.0';
  const mins = Math.floor(seconds / 60);
  const secs = seconds - mins * 60;
  return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
}

/**
 * Decide whether a change in trim bounds should force the player to a new
 * timestamp, and where.
 *
 * The ordinary rule ("seek only when the playhead has drifted outside the
 * window") silently does nothing when a drag lands inside the *previous*
 * window — which a drag does about as often as not. In the admin trim
 * editor that reads as "the preview doesn't reflect the scrubber": nudge the
 * end handle earlier while playback happens to already be before the new
 * end, and nothing visibly happens. This forces a seek on every bounds
 * change instead, landing on whichever boundary just moved so trimming the
 * tail is visible too, not just the in-point.
 *
 * Returns `null` when neither bound changed — the caller should fall back to
 * the ordinary in-range check.
 */
export function forcedPreviewSeekTarget(
  prevTrim: { start: number; end: number | null } | null,
  nextTrim: { start: number; end: number | null }
): number | null {
  const startChanged = !prevTrim || prevTrim.start !== nextTrim.start;
  const endChanged = !prevTrim || prevTrim.end !== nextTrim.end;
  if (!startChanged && !endChanged) return null;
  if (endChanged && !startChanged && nextTrim.end !== null) {
    return Math.max(nextTrim.start, nextTrim.end - 0.4);
  }
  return nextTrim.start;
}
