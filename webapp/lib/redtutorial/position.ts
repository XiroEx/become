/**
 * Pure tooltip-positioning math: pick a side, flip when there's no room,
 * clamp inside the viewport so nothing ever bleeds off-screen.
 */

import type { Rect } from './dom';
import type { TutorialPlacement } from './types';

export interface Size {
  width: number;
  height: number;
}

export interface ComputedPosition {
  top: number;
  left: number;
  placement: Exclude<TutorialPlacement, 'auto'>;
  /** Arrow position along the tooltip's edge (px from tooltip's top-left). */
  arrowTop: number;
  arrowLeft: number;
}

const SIDES: Exclude<TutorialPlacement, 'auto'>[] = ['bottom', 'top', 'right', 'left'];

function spaceFor(
  side: Exclude<TutorialPlacement, 'auto'>,
  target: Rect,
  viewport: Size
): number {
  switch (side) {
    case 'top':
      return target.top;
    case 'bottom':
      return viewport.height - (target.top + target.height);
    case 'left':
      return target.left;
    case 'right':
      return viewport.width - (target.left + target.width);
  }
}

function fits(
  side: Exclude<TutorialPlacement, 'auto'>,
  target: Rect,
  tooltip: Size,
  viewport: Size,
  gap: number
): boolean {
  const space = spaceFor(side, target, viewport);
  const needed = (side === 'top' || side === 'bottom' ? tooltip.height : tooltip.width) + gap;
  return space >= needed;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), Math.max(min, max));

/**
 * Compute a fixed-position (viewport-relative) placement for the tooltip.
 *
 * @param target   spotlight rect (already padded), viewport coordinates
 * @param tooltip  measured tooltip size
 * @param viewport viewport size
 * @param preferred requested placement ('auto' = best fit)
 * @param gap      distance between spotlight and tooltip (default 12)
 * @param margin   minimum distance from viewport edges (default 12)
 */
export function computePosition(
  target: Rect,
  tooltip: Size,
  viewport: Size,
  preferred: TutorialPlacement = 'auto',
  gap = 12,
  margin = 12
): ComputedPosition {
  // Choose the side: preferred if it fits, else the first side that fits,
  // else the side with the most space.
  let placement: Exclude<TutorialPlacement, 'auto'>;
  if (preferred !== 'auto' && fits(preferred, target, tooltip, viewport, gap)) {
    placement = preferred;
  } else {
    const ordered =
      preferred !== 'auto'
        ? [preferred, ...SIDES.filter((s) => s !== preferred)]
        : SIDES;
    placement =
      ordered.find((s) => fits(s, target, tooltip, viewport, gap)) ??
      ordered.reduce((best, s) =>
        spaceFor(s, target, viewport) > spaceFor(best, target, viewport) ? s : best
      );
  }

  const targetCx = target.left + target.width / 2;
  const targetCy = target.top + target.height / 2;

  let top: number;
  let left: number;
  switch (placement) {
    case 'bottom':
      top = target.top + target.height + gap;
      left = targetCx - tooltip.width / 2;
      break;
    case 'top':
      top = target.top - tooltip.height - gap;
      left = targetCx - tooltip.width / 2;
      break;
    case 'right':
      top = targetCy - tooltip.height / 2;
      left = target.left + target.width + gap;
      break;
    case 'left':
      top = targetCy - tooltip.height / 2;
      left = target.left - tooltip.width - gap;
      break;
  }

  // Clamp fully inside the viewport (margin from each edge).
  left = clamp(left, margin, viewport.width - tooltip.width - margin);
  top = clamp(top, margin, viewport.height - tooltip.height - margin);

  // Arrow points at the target center, clamped to the tooltip's edge.
  const arrowInset = 14;
  const arrowLeft = clamp(targetCx - left, arrowInset, tooltip.width - arrowInset);
  const arrowTop = clamp(targetCy - top, arrowInset, tooltip.height - arrowInset);

  return { top, left, placement, arrowTop, arrowLeft };
}

/** Centered position for target-less "modal" steps. */
export function centerPosition(tooltip: Size, viewport: Size, margin = 12): {
  top: number;
  left: number;
} {
  return {
    top: clamp((viewport.height - tooltip.height) / 2, margin, Math.max(margin, viewport.height - tooltip.height - margin)),
    left: clamp((viewport.width - tooltip.width) / 2, margin, Math.max(margin, viewport.width - tooltip.width - margin)),
  };
}
