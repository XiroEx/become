/**
 * THE APP'S MOTION VOCABULARY — the web's numbers, one place.
 *
 * The web animates throughout (framer-motion in ~120 files): PageTransition
 * fades every screen up 20pt over 400ms; sheets spring up from y=40; the
 * avatar dropdown pops from scale 0.95; toasts rise 8pt; tiles crossfade on a
 * 220ms ease-out; progress fills ease over 500ms. This module is those
 * numbers, pure, so every native surface animates the same way and a test can
 * hold them to the web's without rendering.
 *
 * Every helper takes the Reduce Motion answer (`useReducedMotion`) and keeps
 * the end state while dropping the travel: a duration becomes 0, a slide
 * becomes a cut, a spring becomes a cut. Nothing here reads the setting
 * itself — the component asks the hook and passes the answer in, so the
 * values stay testable and the rule in `__tests__/reducedMotion.test.tsx`
 * (a file that animates asks whether it should) keeps holding.
 *
 * Keep it simple and alive (Jon's 6a9f8979): one fade, one rise, one spring.
 * A new animation that is not the web's is a new vocabulary word — add it
 * here with the web file it ports, not inline at the call site.
 */

import type { EasingFunction } from "react-native-reanimated";

/** PageTransition: `initial={{ opacity: 0, y: 20 }}`. */
export const SCREEN_ENTER_DISTANCE = 20;
/** PageTransition: `transition={{ duration: 0.4 }}`. */
export const SCREEN_ENTER_MS = 400;

/** Sheets: `initial={{ y: 40, opacity: 0 }}` (ProgramNudgeModal, FoodLogSheet). */
export const SHEET_ENTER_DISTANCE = 40;
/** Sheets: `transition={{ type: "spring", damping: 28, stiffness: 300 }}`. */
export const SHEET_SPRING = { damping: 28, stiffness: 300 } as const;

/** Avatar dropdown: `initial={{ opacity: 0, scale: 0.95, y: -4 }}` (ProfileMenu). */
export const MENU_ENTER_DISTANCE = -4;
export const MENU_ENTER_SCALE = 0.95;
/** Avatar dropdown: `transition={{ duration: 0.15 }}`. */
export const MENU_ENTER_MS = 150;

/** Toasts: `initial={{ opacity: 0, y: 8 }}` (`components/ui/Toast.tsx`). */
export const TOAST_ENTER_DISTANCE = 8;
/** Toasts: `transition={{ duration: 0.2, ease: 'easeOut' }}`. */
export const TOAST_MS = 200;

/** Tiles: `transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}` (StreakTile). */
export const TILE_CROSSFADE_MS = 220;
export const TILE_CROSSFADE_EASING: readonly [number, number, number, number] = [
  0.22, 1, 0.36, 1,
];

/** Progress fills: `transition-all duration-500` (StreakTile's bar). */
export const PROGRESS_FILL_MS = 500;

/** Banners: `initial={{ opacity: 0, y: -6 }}` (MoodGatewayBanner). */
export const BANNER_ENTER_DISTANCE = -6;
/** Banners: `transition={{ duration: 0.22, ease: 'easeOut' }}`. */
export const BANNER_MS = 220;

/** Streak celebration: `initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }}`. */
export const CELEBRATION_POP_MS = 500;
export const CELEBRATION_POP_PEAK = 1.3;

/** The Becoming door: `becoming-door-pulse 2.4s ease-in-out infinite`. */
export const DOOR_PULSE_MS = 2400;
/** The Becoming door's calm nudge: `becoming-door-nudge 3.2s ease-in-out infinite`. */
export const DOOR_NUDGE_MS = 3200;
/** The weekly-report highlight: `settings-highlight-pulse 1s ease-in-out 3`. */
export const HIGHLIGHT_PULSE_MS = 1000;
export const HIGHLIGHT_PULSE_COUNT = 3;

/**
 * A duration, or zero when motion is reduced. Zero rather than "skip the
 * animation": the end STATE still has to be applied, or the thing being
 * animated never arrives.
 */
export function motionMs(ms: number, reduced: boolean): number {
  return reduced ? 0 : ms;
}

/**
 * Whether a travel runs at all. Under Reduce Motion every enter is a cut:
 * the content draws in place at full opacity instead of rising/fading in.
 */
export function enterTravels(reduced: boolean): boolean {
  return !reduced;
}

export type { EasingFunction };
