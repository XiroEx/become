/**
 * Pure math for the filmstrip trim UI (`VideoFilmstripTrimmer`).
 *
 * Frame extraction and pointer handling need the DOM, so they live in the
 * component. This file is everything that doesn't: where to sample the
 * source video for thumbnails, and how a dragged handle clamps against the
 * other handle and the min clip length. Kept separate so it's testable in
 * plain Node, same pattern as `videoTrim.ts`.
 */

/**
 * Evenly spaced sample times across [0, duration], one per filmstrip tile,
 * centered within each tile's slice rather than at its leading edge (so the
 * first thumbnail isn't always frame zero and the last isn't cut off at
 * end-of-file, where some decoders never fire `seeked`).
 */
export function filmstripFrameTimes(duration: number, count: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || count <= 0) return [];
  const safeEnd = Math.max(0, duration - 0.05);
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = ((i + 0.5) / count) * duration;
    times.push(Math.min(t, safeEnd));
  }
  return times;
}

/** Time (seconds) → position along the strip, as a 0-100 percentage. */
export function timeToPercent(time: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(100, Math.max(0, (time / duration) * 100));
}

/**
 * Clamp a dragged start handle: never past the left edge, never closer than
 * `minDuration` to the current end (the end handle does not move — the drag
 * itself just stops short, matching how the iOS Photos trimmer behaves).
 */
export function clampTrimStart(
  nextStart: number,
  end: number,
  duration: number,
  minDuration: number
): number {
  const upperBound = Math.max(0, Math.min(duration, end) - minDuration);
  return Math.min(Math.max(0, nextStart), upperBound);
}

/** Mirror of `clampTrimStart` for the end handle. */
export function clampTrimEnd(
  nextEnd: number,
  start: number,
  duration: number,
  minDuration: number
): number {
  const lowerBound = Math.min(duration, Math.max(0, start) + minDuration);
  return Math.max(Math.min(nextEnd, duration), lowerBound);
}
