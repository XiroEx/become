/**
 * The Becoming stage — the maths a finger needs per frame, and the small pure
 * rules around it (NP-204).
 *
 * The LAYOUT — where a week sits, where the Horizon sits, how a drag projects
 * onto the path, where the overview camera lands — is `@become/core`'s copy
 * of `webapp/lib/becoming/layout.ts`, so a week sits in the same place on both
 * clients. The stage reads that copy for everything it does on the JS thread.
 *
 * But a Reanimated worklet may only call other worklets, and a function
 * imported from `@become/core` is plain JS: call it from a gesture callback
 * and the phone throws ("Tried to synchronously call a non-worklet function
 * on the UI thread"). The two pieces of layout maths a drag needs on EVERY
 * FRAME — the scrub projection and the nearest card — are therefore repeated
 * here with the `'worklet'` directive, and `__tests__/becomingStageMath.test.ts`
 * drives them against the core copy over a fixture table so this file cannot
 * drift from the layout either. Everything else below is the web stage's
 * constants and inline rules (`JourneyCanvas.tsx`), named so they can be
 * tested without a canvas.
 */

import {
  OVERVIEW_MIN_SCALE,
  TILE_FADE_SCALE,
  TILE_FULL_SCALE,
  type CardPos,
} from "@become/core";

// ── The web stage's constants ───────────────────────────────────────────────

/** Pinch-in ceiling: the web clamps `camS` to `Math.min(1.6, …)`. */
export const MAX_SCALE = 1.6;
/** `FLY.duration` on the web, in ms. */
export const FLY_MS = 850;
/** A committed scrub lands faster than a button press. */
export const SCRUB_FLY_MS = 550;
/** A snap back after a drag that did not commit. */
export const SNAP_BACK_MS = 350;
export const INTRO_FLY_MS = 1500;
export const INTRO_HOLD_MS = 1900;
/** The short opening: a 0.7 → 1 zoom as the fog lifts. */
export const SHORT_INTRO_MS = 950;
/** The web's `EASE_OUT` cubic-bezier. */
export const EASE_OUT: readonly [number, number, number, number] = [0.22, 1, 0.36, 1];
/** The intro's fly-in easing (`[0.65, 0, 0.35, 1]` on the web). */
export const EASE_IN_OUT: readonly [number, number, number, number] = [0.65, 0, 0.35, 1];
/** The "click into place": land 1.5% large, then spring-settle. */
export const CLICK_OVERSHOOT = 1.015;
export const CLICK_SPRING = { stiffness: 180, damping: 22 } as const;
/** How far along the segment a drag has to go to commit (0..1). */
export const SCRUB_COMMIT_PROGRESS = 0.35;
/** A flick commits sooner — above this speed (px/ms) and past this progress. */
export const SCRUB_FLICK_VELOCITY = 0.55;
export const SCRUB_FLICK_MIN_PROGRESS = 0.08;
/** Past either end of the segment the camera follows at a quarter of the drag. */
export const RUBBER_BAND = 0.25;
/** Against the path the camera nudges, and springs back on release. */
export const AGAINST_PATH_NUDGE = 0.15;
/** A drag shorter than this is a tap. */
export const TAP_SLOP = 5;
/** The overview's tap tolerance around a marker, in screen px. */
export const OVERVIEW_HIT_TOLERANCE = 28;
/** Cards further than this many steps from the focus render as tiles. */
export const COMPACT_DISTANCE = 2;
/** Long histories label every other month, or the ticks collide at far zoom. */
export const TICK_THINNING_WEEKS = 26;
/** How long a hint stays on screen. */
export const HINT_MS = 3200;

export type IntroKind = "full" | "short" | "none";
export type StageMode = "intro" | "focus" | "overview";

export interface Camera {
  x: number;
  y: number;
  s: number;
}

// ── Worklets: what runs on the UI thread, per frame ─────────────────────────

export function clamp(v: number, lo: number, hi: number): number {
  "worklet";
  return Math.max(lo, Math.min(hi, v));
}

/**
 * The web's `scrubTarget`, as a worklet. Projects a drag onto the forward
 * and backward segments and picks the one the finger is moving along; the
 * progress may run past 0..1 (the caller rubber-bands it). MUST answer
 * exactly as `@become/core`'s `scrubTarget` — the test holds it to that.
 */
export function projectScrub(
  pos: CardPos[],
  current: number,
  dx: number,
  dy: number,
  scale: number,
): { target: number; progress: number } | null {
  "worklet";
  const cur = pos[current];
  if (!cur) return null;
  const cands: { target: number; ux: number; uy: number; len: number }[] = [];
  for (const t of [current + 1, current - 1]) {
    const p = pos[t];
    if (!p) continue;
    const vx = p.x - cur.x,
      vy = p.y - cur.y;
    const len = Math.hypot(vx, vy) || 1;
    cands.push({ target: t, ux: vx / len, uy: vy / len, len });
  }
  if (!cands.length) return null;
  // Finger drags the world: moving the finger left means the camera moves right (toward +x).
  const wx = -dx / scale,
    wy = -dy / scale;
  let best: { target: number; progress: number; score: number } | null = null;
  for (const c of cands) {
    const along = wx * c.ux + wy * c.uy;
    if (!best || along > best.score) best = { target: c.target, progress: along / c.len, score: along };
  }
  // The web returns `best` whole (its `score` included); so does this, so the
  // two answers compare deep-equal.
  return best && best.score > 0 ? best : null;
}

/** The web's `nearestCard`, as a worklet (the index of the closest card). */
export function nearestIndex(pos: CardPos[], x: number, y: number): number {
  "worklet";
  let best = 0,
    bd = Infinity;
  for (const p of pos) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = p.index;
    }
  }
  return best;
}

/** Progress past either end of the segment moves the camera at a quarter rate. */
export function rubberBand(progress: number): number {
  "worklet";
  return progress > 1 ? 1 + (progress - 1) * RUBBER_BAND : progress < 0 ? progress * RUBBER_BAND : progress;
}

/** A screen point as a world point, for this camera and viewport. */
export function toWorld(sx: number, sy: number, cam: Camera, vw: number, vh: number): { x: number; y: number } {
  "worklet";
  return { x: cam.x + (sx - vw / 2) / cam.s, y: cam.y + (sy - vh / 2) / cam.s };
}

/** Where the camera sits so the world point under the fingers stays under them at scale `s`. */
export function pinchCamera(
  worldMid: { x: number; y: number },
  focalX: number,
  focalY: number,
  s: number,
  vw: number,
  vh: number,
): { x: number; y: number } {
  "worklet";
  return { x: worldMid.x - (focalX - vw / 2) / s, y: worldMid.y - (focalY - vh / 2) / s };
}

/** The pinch scale, clamped to the stage's range. */
export function clampPinchScale(startScale: number, pinch: number): number {
  "worklet";
  return clamp(startScale * pinch, OVERVIEW_MIN_SCALE, MAX_SCALE);
}

/** Does a released drag land on its target, or snap back? `velocity` is px/ms. */
export function commitScrub(progress: number, velocity: number): boolean {
  "worklet";
  return progress >= SCRUB_COMMIT_PROGRESS || (velocity > SCRUB_FLICK_VELOCITY && progress > SCRUB_FLICK_MIN_PROGRESS);
}

/** Cards fade to markers between TILE_FADE_SCALE and TILE_FULL_SCALE. */
export function tileOpacity(s: number): number {
  "worklet";
  return clamp((s - TILE_FADE_SCALE) / (TILE_FULL_SCALE - TILE_FADE_SCALE), 0, 1);
}

export function markerOpacity(s: number): number {
  "worklet";
  return 1 - tileOpacity(s);
}

/** Gridlines, ticks and the area fill appear as the stage becomes a graph. */
export function graphChromeOpacity(s: number): number {
  "worklet";
  return 1 - clamp((s - 0.35) / 0.15, 0, 1);
}

/** The overview HUD (identity + aggregate). */
export function hudOpacity(s: number): number {
  "worklet";
  return 1 - clamp((s - 0.3) / 0.2, 0, 1);
}

/** A marker reads 6.5 screen px at any zoom, capped by the column so tiles never overlap it. */
export function markerRadius(s: number, col: number): number {
  "worklet";
  return Math.min(6.5 / s, col * 0.42);
}

export function ringRadius(s: number, col: number): number {
  "worklet";
  return Math.min(12 / s, col * 0.48);
}

/** World units that read as `px` on screen at scale `s`. */
export function screenPx(px: number, s: number): number {
  "worklet";
  return px / s;
}

/** The first card whose box (grown to at least `tol` world units) contains the point. */
export function hitCard(
  pos: CardPos[],
  wx: number,
  wy: number,
  halfW: number,
  halfH: number,
  tol = 0,
): CardPos | null {
  "worklet";
  const hw = Math.max(halfW, tol),
    hh = Math.max(halfH, tol);
  for (const p of pos) {
    if (Math.abs(wx - p.x) <= hw && Math.abs(wy - p.y) <= hh) return p;
  }
  return null;
}

/**
 * The intro draws the line segment by segment: segment `i` of `n` goes from
 * nothing to drawn while the overall progress crosses its own slice.
 */
export function segmentDraw(progress: number, i: number, n: number): number {
  "worklet";
  if (n <= 0) return 1;
  return clamp(progress * n - i, 0, 1);
}

// ── Pure rules (JS thread) ──────────────────────────────────────────────────

/** The Sunday key of the week `todayKey` falls in — the web's `weekKeyOfToday`. */
export function weekKeyOfToday(todayKey: string): string {
  const [y, m, d] = todayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  return dt.toISOString().slice(0, 10);
}

/**
 * Which opening plays. Reduce Motion skips it outright; a deep link gets the
 * short one; so does a member who already saw the full opening this week; a
 * second open in the same app session gets none. The web keeps the same
 * three flags in sessionStorage / localStorage.
 */
export function introKindFor(input: {
  reduced: boolean;
  initialWeekKey: string | null | undefined;
  openedThisSession: boolean;
  seenThisWeek: boolean;
}): IntroKind {
  if (input.reduced) return "none";
  if (input.initialWeekKey) return "short";
  if (input.openedThisSession) return "none";
  if (input.seenThisWeek) return "short";
  return "full";
}

/** Where the stage opens: the deep-linked week (a gap card covers its span), else the live week. */
export function startIndexFor(
  weeks: { weekKey: string; gap?: { fromKey: string; toKey: string } }[],
  initialWeekKey: string | null | undefined,
): number {
  const live = Math.max(0, weeks.length - 1);
  if (!initialWeekKey) return live;
  const i = weeks.findIndex(
    (w) => w.weekKey === initialWeekKey || (!!w.gap && w.gap.fromKey <= initialWeekKey && initialWeekKey <= w.gap.toKey),
  );
  return i >= 0 ? i : live;
}

/** Every other month once the history is long enough that labels collide at far zoom. */
export function thinTicks<T>(ticks: T[], weekCount: number): T[] {
  return weekCount > TICK_THINNING_WEEKS ? ticks.filter((_, i) => i % 2 === 0) : ticks;
}

/** The counter under the kicker. */
export function counterLabel(mode: StageMode, focus: number, weekCount: number): string {
  if (mode === "intro") return "";
  if (mode === "overview") return `${weekCount} weeks`;
  if (focus >= weekCount) return "Horizon";
  return `Week ${focus + 1} of ${weekCount}`;
}

/** The hint under the focused card when nothing else is being said. */
export function defaultHint(edge: "up" | "right" | "down" | null, onHorizon: boolean): string {
  if (onHorizon) return "written next Sunday · pinch out for the line";
  if (!edge) return "pinch out to see the line";
  const move = edge === "up" ? "pull down" : edge === "down" ? "push up" : "swipe left";
  const next = edge === "up" ? "climbs" : edge === "down" ? "dips" : "holds";
  return `${move} · next week ${next}`;
}

/** What to say after a drag that went against the path. */
export function againstPathHint(edge: "up" | "right" | "down" | null): string {
  if (edge === "up") return "the line goes up from here · pull down";
  if (edge === "down") return "this week dips · push up";
  if (edge === "right") return "the line goes on from here · drag left";
  return "written next Sunday";
}

/** How a card renders given its distance from the focus and the mode. */
export function cardEmphasis(
  index: number,
  focus: number,
  mode: StageMode,
): { compact: boolean; opacity: number; scale: number; focused: boolean } {
  const d = Math.abs(index - focus);
  const inOverview = mode === "overview";
  return {
    compact: inOverview || d > COMPACT_DISTANCE,
    opacity: inOverview ? 1 : d <= COMPACT_DISTANCE ? 1 : 0.35,
    scale: inOverview ? 1 : d === 0 ? 1 : 0.94,
    focused: mode === "focus" && d === 0,
  };
}

/** Where the live week is trending, for the Horizon card. */
export function liveTrend(weeks: { daysElapsed: number; step: string }[]): "up" | "flat" | "down" {
  const live = weeks[weeks.length - 1];
  if (!live || live.daysElapsed < 2) return "flat";
  return live.step === "up" ? "up" : live.step === "down" ? "down" : "flat";
}

/** The overview HUD's "since" suffix. */
export function sinceLabel(firstActivity: string | null | undefined): string {
  if (!firstActivity) return "";
  const d = new Date(`${firstActivity}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return ` · since ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
}
