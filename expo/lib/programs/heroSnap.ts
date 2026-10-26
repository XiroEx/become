/**
 * The web's ONE hero snap, `useHeroSnap` in
 * `webapp/app/dashboard/workout/[programId]/ProgramDetailClient.tsx`, as a pure
 * decision so native and its test cannot disagree about it.
 *
 * Only inside the hero does anything snap: scrolling DOWN past 25% of the
 * hero's height (and not yet past the hero) finishes the job and scrolls the
 * cover fully away; scrolling UP back into the hero past the same mirrored
 * line returns to the very top. Anywhere else — the whole list below the
 * hero — the answer is `null` and the scroll is the platform's own, smooth,
 * with no stops. A paging `snapToOffsets` is NOT this: it decelerates every
 * fling and settles the list on its offsets, which is what read as "multiple
 * thresholds".
 *
 * @param y        where the scroll came to rest
 * @param startY   where the drag began (gives the direction)
 * @param heroH    the hero's laid-out height
 * @returns        the offset to scroll to, or null to leave it alone
 */
export const HERO_SNAP_THRESHOLD = 0.25;

export function heroSnapTarget(
  y: number,
  startY: number,
  heroH: number,
): number | null {
  if (!(heroH > 0)) return null;
  const threshold = heroH * HERO_SNAP_THRESHOLD;
  if (y > startY && y > threshold && y < heroH) return heroH;
  if (y < startY && y < heroH - threshold && y > 0) return 0;
  return null;
}
