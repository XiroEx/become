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
/** Timed sheet fallback duration (`duration: 0.28`). */
export const SHEET_MS = 280;

/** Modal pop (`ProtocolUnlock`, `GoalAchievedModal`): `scale: 0.96 -> 1`, `duration: 0.22`. */
export const MODAL_INITIAL_SCALE = 0.96;
export const MODAL_MS = 220;

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
/** Web's standard cubic-bezier `[0.22, 1, 0.36, 1]` ease-out curve. */
export const EASE_OUT_EXPO = TILE_CROSSFADE_EASING;

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
/** `becoming-door-pulse` outer ring spread (0 -> 8px). */
export const DOOR_PULSE_SPREAD = 8;
/** `becoming-door-pulse` starting alpha (0.55 -> 0). */
export const DOOR_PULSE_PEAK_ALPHA = 0.55;
/** The Becoming door's calm nudge: `becoming-door-nudge 3.2s ease-in-out infinite`. */
export const DOOR_NUDGE_MS = 3200;
/** `becoming-door-nudge` outer ring spread (0 -> 5px). */
export const DOOR_NUDGE_SPREAD = 5;
/** `becoming-door-nudge` peak ring alpha (`0.16`). */
export const DOOR_NUDGE_PEAK_ALPHA = 0.16;
/** `becoming-door-nudge` card opacity trough (`0%, 100% { opacity: 0.96 }`). */
export const DOOR_NUDGE_MIN_OPACITY = 0.96;

/** The weekly-report highlight: `settings-highlight-pulse 1s ease-in-out 3`. */
export const HIGHLIGHT_PULSE_MS = 1000;
export const HIGHLIGHT_PULSE_COUNT = 3;

/** Stagger step between consecutive sections/tiles (`PageTransition`, `TileGrid`). */
export const SECTION_STAGGER_MS = 60;
/** PageTransition child stagger (`staggerChildren: 0.1`). */
export const PAGE_STAGGER_MS = 100;

/**
 * SmartRotatingTile (`webapp/components/dashboard/SmartRotatingTile.tsx`):
 * `x: { type: "spring", stiffness: 320, damping: 34 }, opacity: { duration: 0.18 }`.
 */
export const SMART_TILE_SPRING = { stiffness: 320, damping: 34 } as const;
export const SMART_TILE_FADE_MS = 180;
export const SMART_TILE_SLIDE_DISTANCE = 48;
export const SMART_TILE_SWIPE_DISTANCE = 48;
export const SMART_TILE_MANUAL_PAUSE_MS = 12000;

/**
 * StreakTile (`webapp/components/dashboard/StreakTile.tsx`):
 * `initial={{ opacity: 0, x: dir * 18 }}`, `duration: 0.22, ease: [0.22, 1, 0.36, 1]`.
 */
export const STREAK_SLIDE_DISTANCE = 18;
export const STREAK_SWIPE_DISTANCE = 28;

/**
 * ResumeWorkoutButton (`webapp/components/ResumeWorkoutButton.tsx`):
 * `initial={{ opacity: 0, y: -8, scale: 0.96 }}`, spring `stiffness: 320, damping: 22`,
 * shine `duration: 2.4, ease: "easeInOut", repeatDelay: 1.6`.
 */
export const RESUME_ENTER_Y = -8;
export const RESUME_ENTER_SCALE = 0.96;
export const RESUME_ENTER_SPRING = { stiffness: 320, damping: 22 } as const;
export const RESUME_SHINE_MS = 2400;
export const RESUME_SHINE_DELAY_MS = 1600;

/**
 * BecomingDetails (`webapp/components/becoming/BecomingDetails.tsx`):
 * Modal `initial={{ y: 24, opacity: 0 }}`, `duration: 0.28, ease: [0.22, 1, 0.36, 1]`;
 * Tab pill `layoutId="becoming-tab-pill"`, spring `stiffness: 400, damping: 34`;
 * Tab content `x: tabDir * 40`, `duration: 0.26, ease: [0.22, 1, 0.36, 1]`.
 */
export const BECOMING_MODAL_ENTER_Y = 24;
export const BECOMING_MODAL_MS = 280;
export const BECOMING_TAB_PILL_SPRING = { stiffness: 400, damping: 34 } as const;
export const BECOMING_TAB_SLIDE_DISTANCE = 40;
export const BECOMING_TAB_SLIDE_MS = 260;

/**
 * Tailwind `animate-ping`:
 * `75%, 100% { transform: scale(2); opacity: 0; }`, `1s cubic-bezier(0, 0, 0.2, 1) infinite`.
 */
export const PING_MS = 1000;
export const PING_MAX_SCALE = 2;
export const PING_START_OPACITY = 0.75;

/**
 * Tailwind `animate-pulse`:
 * `50% { opacity: 0.5 }`, `2s cubic-bezier(0.4, 0, 0.6, 1) infinite`.
 */
export const PULSE_MS = 2000;
export const PULSE_MIN_OPACITY = 0.5;

/**
 * Press feedback (`active:scale-[0.99]`, `whileTap={{ scale: 0.98 }}`).
 */
export const CARD_PRESS_SCALE = 0.99;
export const BUTTON_PRESS_SCALE = 0.98;
export const PRESS_SPRING = { stiffness: 500, damping: 28 } as const;

/** Segmented control / toggle springs (`WorkoutViewToggle`, `SegmentedControl`, `Toggle`). */
export const SEGMENT_SPRING = { stiffness: 420, damping: 32 } as const;
export const TOGGLE_SPRING = { stiffness: 500, damping: 30 } as const;

/** Accordion / collapsible section (`ExerciseAccordion`, `TagSection`, `SystemDashboard`). */
export const ACCORDION_MS = 220;

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
