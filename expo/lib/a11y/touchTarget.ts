/**
 * THE 44-POINT RULE.
 *
 * Apple's Human Interface Guidelines put the minimum hit target at 44 x 44
 * POINTS (Material says 48 dp, which 44 pt on a phone satisfies in practice for
 * our controls because the slop is symmetric); anything smaller is a control a
 * thumb — or a shaking hand, or a VoiceOver "activate" double tap aimed at the
 * element's frame — misses. A control can look as small as the design wants,
 * but the thing that RESPONDS to a touch may not.
 *
 * Two ways to hold the rule, and they are not interchangeable:
 *
 * - `minTouchTarget` grows the VIEW. Use it when growing is invisible — a
 *   padded icon button, a list row, an option in a questionnaire.
 * - `hitSlopToMinTarget(width, height)` grows only the TOUCHABLE AREA around a
 *   view whose size is the design (the switch track is 48 x 28 and has to stay
 *   48 x 28, so it takes 8 points of vertical slop instead).
 *
 * `__tests__/accessibility.test.tsx` walks the v1 screens and fails on an
 * interactive element that has neither.
 */

/** iOS HIG minimum hit target, in points. */
export const MIN_TOUCH_TARGET = 44;

export interface MinTouchTargetStyle {
  minWidth: number;
  minHeight: number;
}

/**
 * Style that makes a view at least 44 x 44. Frozen because it is shared by
 * every caller — React Native copies styles when it flattens them, so sharing
 * one object is fine as long as nobody edits it.
 */
export const minTouchTarget: MinTouchTargetStyle = Object.freeze({
  minWidth: MIN_TOUCH_TARGET,
  minHeight: MIN_TOUCH_TARGET,
});

export interface HitSlop {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The slop a view of `width` x `height` needs so the area that responds to a
 * touch is at least 44 x 44. Already-big-enough axes get 0 (never a negative
 * slop, which would SHRINK the target).
 */
export function hitSlopToMinTarget(width: number, height: number): HitSlop {
  const horizontal = Math.max(0, Math.ceil((MIN_TOUCH_TARGET - width) / 2));
  const vertical = Math.max(0, Math.ceil((MIN_TOUCH_TARGET - height) / 2));
  return {
    top: vertical,
    bottom: vertical,
    left: horizontal,
    right: horizontal,
  };
}
