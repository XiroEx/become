// The Becoming — the stage, natively (NP-204).
//
// The web's `webapp/components/becoming/journey/JourneyCanvas.tsx`, ported:
// a world of week-cards on a path that always moves forward and, for a
// consistent member, climbs. One camera — x, y, scale and an intro tilt as
// Reanimated shared values — drives everything, and nothing per-frame touches
// React:
//
//   • the LINE (segments, area, gridlines, month ticks, markers) is one Skia
//     canvas the size of the screen, drawing in world coordinates inside a
//     Group whose transform is a derived value of the camera. Stroke widths
//     and marker radii are derived values too, so they read as constant
//     screen pixels at any zoom;
//   • the CARDS are React Native views in a world layer whose transform is
//     the same camera through `useAnimatedStyle`;
//   • the FINGER steers the camera on the UI thread: Gesture Handler's Pan,
//     Pinch and Tap, with the per-frame layout maths as worklets
//     (`lib/becoming/stage.ts`). Only a release reaches JS, to decide where
//     to land.
//
// The layout maths — where a week sits, how a drag projects onto the path,
// where the overview camera lands — is `@become/core`'s copy of the web's
// `lib/becoming/layout.ts`, so a week sits in the same place on both clients.
//
//   intro     a spread of cards under a fog, the current one breathing; the
//             line draws itself; the camera flies in as the fog lifts and the
//             card clicks into place (full once per week, short after; any
//             touch skips it). Reduce Motion: no intro at all.
//   focus     one week centred. Drag and the next (or previous) card follows
//             your intent along the path; let go and it snaps. Buttons do the
//             same in one step.
//   overview  pinch out: cards → tiles → constant-size markers on the line,
//             with the area fill, month ticks, altitude gridlines and the
//             aggregate — a chart of your becoming. Tap a week to fly in.
//
// One step past the live week sits the Horizon.

/* eslint-disable react-hooks/immutability -- Reanimated shared values are
   written through `.value` by contract (there is no setter), on both threads;
   the React Compiler rule reads every such write as mutating a hook's result. */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Text as SkText,
  useFont,
  vec,
  type SkFont,
} from "@shopify/react-native-skia";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight, LocateFixed, Maximize2, Minimize2, X } from "lucide-react-native";
import {
  OVERVIEW_MAX_SCALE,
  OVERVIEW_MIN_SCALE,
  aggregate,
  boundsOf,
  cardSize,
  exitEdge,
  layoutWeeks,
  monthTicks,
  nearestCard,
  neighbourFor,
  overviewCamera,
  peakIndexes,
  type CardPos,
  type CardSize,
} from "@become/core";
import { Text } from "@/components/Text";
import { WeekCard, HorizonCard } from "@/components/becoming/WeekCard";
import { WeekTile } from "@/components/becoming/journey/WeekTile";
import type { JourneyPayload, WeekSnapshot } from "@/lib/becoming/types";
import { journeySignals } from "@/lib/becoming/signals";
import { pillarColor } from "@/lib/becoming/pillarColors";
import { markIntroShown } from "@/lib/becoming/storage";
import {
  AGAINST_PATH_NUDGE,
  CLICK_OVERSHOOT,
  CLICK_SPRING,
  EASE_IN_OUT,
  EASE_OUT,
  FLY_MS,
  HINT_MS,
  INTRO_FLY_MS,
  INTRO_HOLD_MS,
  OVERVIEW_HIT_TOLERANCE,
  SCRUB_FLY_MS,
  SHORT_INTRO_MS,
  SNAP_BACK_MS,
  TAP_SLOP,
  againstPathHint,
  cardEmphasis,
  clampPinchScale,
  commitScrub,
  counterLabel,
  defaultHint,
  graphChromeOpacity,
  hitCard,
  hudOpacity,
  liveTrend,
  markerOpacity,
  markerRadius,
  pinchCamera,
  projectScrub,
  ringRadius,
  rubberBand,
  screenPx,
  segmentDraw,
  sinceLabel,
  startIndexFor,
  thinTicks,
  tileOpacity,
  toWorld,
  type IntroKind,
  type StageMode,
} from "@/lib/becoming/stage";
import { motionDuration, useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { lightHaptic } from "@/lib/feedback/haptics";
import { becomingStageTokens, rgbOf } from "@/lib/theme/tokens";
import { ForcedThemeMode } from "@/lib/theme/useThemeTokens";

// The tick labels and "started" read 12px at any zoom; the face is the app's
// semibold Geist, registered from the bundle like every other face (NP-160).
const TICK_FONT = require("../../../assets/fonts/Geist-SemiBold.ttf");
const TICK_FONT_SIZE = 12;

const INK = becomingStageTokens.ink;
const VIOLET = becomingStageTokens.violet;
const GOLD = becomingStageTokens.gold;
const STAGE_BG = becomingStageTokens.background;
const SKY_VIOLET = becomingStageTokens.skyViolet;
const SKY_EMERALD = becomingStageTokens.skyEmerald;

export interface JourneyStageHandle {
  /** Fly to a week (the details Story screen asks for this). */
  focusOn: (index: number) => void;
  enterOverview: () => void;
  skipIntro: () => void;
}

export interface JourneyStageProps {
  data: JourneyPayload;
  /** Which opening plays — `resolveIntroKind` in lib/becoming/storage decides. */
  introKind: IntroKind;
  onClose: () => void;
  onDetails: (weekIndex: number) => void;
  onNavigate?: (url: string) => void;
  /** Deep link: land on this week (YYYY-MM-DD Sunday key). */
  initialWeekKey?: string | null;
  /** True while a sheet is open over the stage: gestures are ignored. */
  inert?: boolean;
  testID?: string;
}

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dashed: boolean;
  color: string;
}

interface Tick {
  index: number;
  label: string;
  x: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  o: number;
}

/** The web's seeded star field: 90 points, the same every time. */
function starsFor(bounds: ReturnType<typeof boundsOf>): Star[] {
  const out: Star[] = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 90; i++) {
    out.push({
      x: bounds.minX - 600 + rnd() * (bounds.width + 1200),
      y: bounds.minY - 900 + rnd() * (bounds.height + 1800),
      r: 1 + rnd() * 2,
      o: 0.2 + rnd() * 0.6,
    });
  }
  return out;
}

// ── The line: one Skia canvas, drawing in world space ──────────────────────

interface StageCanvasProps {
  vw: number;
  vh: number;
  size: CardSize;
  positions: CardPos[];
  weeks: WeekSnapshot[];
  segments: Segment[];
  ticks: Tick[];
  grid: number[];
  areaPath: string | null;
  areaTop: number;
  baseY: number;
  stars: Star[];
  peaks: Set<number>;
  camX: SharedValue<number>;
  camY: SharedValue<number>;
  camS: SharedValue<number>;
  tilt: SharedValue<number>;
  drawProgress: SharedValue<number>;
  font: SkFont | null;
}

function SolidSegment({
  seg,
  index,
  count,
  strokeWidth,
  drawProgress,
}: {
  seg: Segment;
  index: number;
  count: number;
  strokeWidth: SharedValue<number>;
  drawProgress: SharedValue<number>;
}) {
  // The intro draws the line segment by segment (`segmentDraw`); once drawn,
  // `end` sits at 1 and this is a plain stroke.
  const end = useDerivedValue(() => segmentDraw(drawProgress.value, index, count));
  const path = `M ${seg.x1} ${seg.y1} L ${seg.x2} ${seg.y2}`;
  return (
    <Path path={path} style="stroke" strokeWidth={strokeWidth} strokeCap="round" color={seg.color} opacity={0.85} end={end} />
  );
}

function StageCanvas({
  vw,
  vh,
  size,
  positions,
  weeks,
  segments,
  ticks,
  grid,
  areaPath,
  areaTop,
  baseY,
  stars,
  peaks,
  camX,
  camY,
  camS,
  tilt,
  drawProgress,
  font,
}: StageCanvasProps) {
  // Camera → world transform, about the origin (the same formula as the web's
  // `translate3d(vw/2 - x*s, vh/2 - y*s) scale(s)` with transform-origin 0 0).
  const worldTransform = useDerivedValue(() => [
    { translateX: vw / 2 - camX.value * camS.value },
    { translateY: vh / 2 - camY.value * camS.value },
    { scale: camS.value },
  ]);
  // The intro tilt rotates about the VIEWPORT centre, not the world origin.
  const tiltTransform = useDerivedValue(() => [{ rotate: (tilt.value * Math.PI) / 180 }]);
  // Stars drift at a quarter of the camera: parallax.
  const bgTransform = useDerivedValue(() => [
    { translateX: vw / 2 - camX.value * 0.25 * camS.value },
    { translateY: vh / 2 - camY.value * 0.25 * camS.value },
  ]);
  // World units that read as constant screen px at any zoom.
  const lineW = useDerivedValue(() => screenPx(3, camS.value));
  const hairW = useDerivedValue(() => screenPx(1, camS.value));
  const ringW = useDerivedValue(() => screenPx(2, camS.value));
  const markerR = useDerivedValue(() => markerRadius(camS.value, size.col));
  const markerRing = useDerivedValue(() => ringRadius(camS.value, size.col));
  const chromeOpacity = useDerivedValue(() => graphChromeOpacity(camS.value));
  const markersOpacity = useDerivedValue(() => markerOpacity(camS.value));
  // Tick labels are drawn at 12px and inverse-scaled about their own anchor,
  // which is what the web's `fontSize: 12 / s` amounts to.
  const labelScale = useDerivedValue(() => [{ scale: 1 / camS.value }]);

  const solidCount = segments.filter((s) => !s.dashed).length;
  const horizonPos = positions.find((p) => p.horizon) ?? null;
  const first = positions[0];

  const labelX = (x: number, text: string) => x - (font ? font.getTextWidth(text) / 2 : 0);

  return (
    <Canvas style={{ position: "absolute", left: 0, top: 0, width: vw, height: vh }} pointerEvents="none">
      {/* Ambient sky: the web's two radial washes */}
      <Rect x={0} y={0} width={vw} height={vh}>
        <RadialGradient c={vec(vw / 2, 0)} r={vh * 0.8} colors={[rgbOf(SKY_VIOLET, 0.32), rgbOf(SKY_VIOLET, 0)]} />
      </Rect>
      <Rect x={0} y={0} width={vw} height={vh}>
        <RadialGradient c={vec(vw * 0.8, vh)} r={vh * 0.6} colors={[rgbOf(SKY_EMERALD, 0.16), rgbOf(SKY_EMERALD, 0)]} />
      </Rect>
      <Group transform={bgTransform}>
        {stars.map((s, i) => (
          <Circle key={i} cx={s.x * 0.25} cy={s.y * 0.25} r={s.r} color={rgbOf(INK)} opacity={s.o * 0.5} />
        ))}
      </Group>
      <Group transform={tiltTransform} origin={vec(vw / 2, vh / 2)}>
        <Group transform={worldTransform}>
          {/* Graph chrome: gridlines, the area under the line, the month ticks */}
          <Group opacity={chromeOpacity}>
            {grid.map((y) => (
              <Line
                key={y}
                p1={vec(first ? first.x - size.w : 0, y)}
                p2={vec(horizonPos ? horizonPos.x + size.w : 0, y)}
                strokeWidth={hairW}
                color={rgbOf(INK, 0.07)}
              />
            ))}
            {areaPath && (
              <Path path={areaPath} style="fill">
                <LinearGradient start={vec(0, areaTop)} end={vec(0, baseY)} colors={[rgbOf(VIOLET, 0.22), rgbOf(VIOLET, 0)]} />
              </Path>
            )}
            {ticks.map((t) => (
              <Group key={t.index} transform={labelScale} origin={vec(t.x, baseY)}>
                <SkText
                  x={labelX(t.x, t.label)}
                  y={baseY + 34}
                  text={t.label}
                  font={font}
                  color={rgbOf(INK, 0.45)}
                />
              </Group>
            ))}
            {first && !first.horizon && (
              <Group transform={labelScale} origin={vec(first.x, baseY)}>
                <SkText
                  x={labelX(first.x, "started")}
                  y={baseY + 34 - 1.6 * TICK_FONT_SIZE}
                  text="started"
                  font={font}
                  color={rgbOf(INK, 0.6)}
                />
              </Group>
            )}
          </Group>
          {/* The line, coloured by each week's subject */}
          {segments.map((seg, i) =>
            seg.dashed ? (
              <Path
                key={i}
                path={`M ${seg.x1} ${seg.y1} L ${seg.x2} ${seg.y2}`}
                style="stroke"
                strokeWidth={lineW}
                strokeCap="round"
                color={seg.color}
                opacity={0.85}
              >
                <DashPathEffect intervals={[6, 6]} />
              </Path>
            ) : (
              <SolidSegment
                key={i}
                seg={seg}
                index={segments.slice(0, i).filter((s) => !s.dashed).length}
                count={solidCount}
                strokeWidth={lineW}
                drawProgress={drawProgress}
              />
            ),
          )}
          {/* Markers — constant screen size, coloured by the week's subject */}
          <Group opacity={markersOpacity}>
            {positions.map((p) => {
              if (p.horizon) {
                return (
                  <Circle key="horizon" cx={p.x} cy={p.y} r={markerR} style="stroke" strokeWidth={ringW} color={rgbOf(VIOLET)}>
                    <DashPathEffect intervals={[3, 3]} />
                  </Circle>
                );
              }
              const w = weeks[p.index];
              if (!w) return null;
              const color = pillarColor(w.subject, w.score, 62);
              return (
                <Group key={p.index}>
                  {w.isCurrent && (
                    <Circle cx={p.x} cy={p.y} r={markerRing} style="stroke" strokeWidth={ringW} color={color} opacity={0.6} />
                  )}
                  {peaks.has(p.index) && (
                    <Circle cx={p.x} cy={p.y} r={markerRing} style="stroke" strokeWidth={ringW} color={rgbOf(GOLD)} opacity={0.9} />
                  )}
                  <Circle cx={p.x} cy={p.y} r={markerR} color={color} />
                  <Circle cx={p.x} cy={p.y} r={markerR} style="stroke" strokeWidth={ringW} color={rgbOf(STAGE_BG)} />
                </Group>
              );
            })}
          </Group>
        </Group>
      </Group>
    </Canvas>
  );
}

// ── The stage ──────────────────────────────────────────────────────────────

/** The opening's beats: the title holds, the camera flies, the stage is yours. */
type IntroPhase = "hold" | "fly" | "done";

export const JourneyStage = forwardRef<JourneyStageHandle, JourneyStageProps>(function JourneyStage(
  { data, introKind, onClose, onDetails, onNavigate, initialWeekKey = null, inert = false, testID = "journey-stage" },
  ref,
) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  // The stage is the whole screen, so the window IS its size; `onLayout`
  // corrects it if a parent ever gives it less.
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null);
  const vw = vp?.w ?? window.width;
  const vh = vp?.h ?? window.height;
  const font = useFont(TICK_FONT, TICK_FONT_SIZE);

  const weeks = data.weeks;
  const size = useMemo(() => cardSize(vw, vh), [vw, vh]);
  const positions = useMemo(() => layoutWeeks(weeks, size), [weeks, size]);
  const bounds = useMemo(() => boundsOf(positions, size), [positions, size]);
  const liveIndex = Math.max(0, weeks.length - 1);
  const horizonIndex = weeks.length;
  const startIndex = useMemo(() => startIndexFor(weeks, initialWeekKey), [weeks, initialWeekKey]);

  const plays = introKind !== "none" && weeks.length > 0;
  const [mode, setMode] = useState<StageMode>(plays ? "intro" : "focus");
  const [introPhase, setIntroPhase] = useState<IntroPhase>(!plays ? "done" : introKind === "full" ? "hold" : "fly");
  const [focus, setFocus] = useState(startIndex);
  const [landed, setLanded] = useState<number | null>(plays ? null : startIndex);
  // A fly in progress: which card lands, and when (the beat the card clicks into place).
  const [landing, setLanding] = useState<{ index: number; delay: number } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  // The title shows while the full opening holds — derived, not stored.
  const showTitle = introKind === "full" && mode === "intro" && introPhase === "hold";

  // ── Camera: the world point at the viewport centre, the scale, the intro's tilt and fog ──
  const startPos = positions[startIndex];
  const camX = useSharedValue(startPos?.x ?? 0);
  const camY = useSharedValue(startPos?.y ?? 0);
  const camS = useSharedValue(1);
  const tilt = useSharedValue(0);
  const fog = useSharedValue(plays ? 1 : 0);
  const drawProgress = useSharedValue(plays && introKind === "full" ? 0 : 1);

  // Mirrors of React state for the UI thread — and for the release handlers,
  // which read them instead of stale closures. Shared values are the stage's
  // one kind of mutable box; a `.value` read on the JS thread is just a read.
  const modeSV = useSharedValue<StageMode>(mode);
  const focusSV = useSharedValue(startIndex);
  const positionsSV = useSharedValue<CardPos[]>(positions);
  const vwSV = useSharedValue(vw);
  const vhSV = useSharedValue(vh);
  const inertSV = useSharedValue(inert);
  const reducedSV = useSharedValue(reduced);
  useEffect(() => {
    modeSV.value = mode;
  }, [mode, modeSV]);
  useEffect(() => {
    focusSV.value = focus;
  }, [focus, focusSV]);
  useEffect(() => {
    positionsSV.value = positions;
  }, [positions, positionsSV]);
  useEffect(() => {
    vwSV.value = vw;
    vhSV.value = vh;
  }, [vw, vh, vwSV, vhSV]);
  useEffect(() => {
    inertSV.value = inert;
  }, [inert, inertSV]);
  useEffect(() => {
    reducedSV.value = reduced;
  }, [reduced, reducedSV]);

  const easeOut = useMemo(() => Easing.bezier(EASE_OUT[0], EASE_OUT[1], EASE_OUT[2], EASE_OUT[3]), []);
  const easeInOut = useMemo(() => Easing.bezier(EASE_IN_OUT[0], EASE_IN_OUT[1], EASE_IN_OUT[2], EASE_IN_OUT[3]), []);

  // ── Camera moves ─────────────────────────────────────────────────────────
  const flyTo = useCallback(
    (index: number, opts?: { scale?: number; duration?: number; click?: boolean }) => {
      const p = positions[index];
      if (!p) return;
      const r = reducedSV.value;
      const dur = motionDuration(opts?.duration ?? FLY_MS, r);
      const same = index === focusSV.value;
      setFocus(index);
      cancelAnimation(camX);
      cancelAnimation(camY);
      cancelAnimation(camS);
      camX.value = withTiming(p.x, { duration: dur, easing: easeOut });
      camY.value = withTiming(p.y, { duration: dur, easing: easeOut });
      const s = opts?.scale ?? 1;
      if (opts?.click && !r) {
        // Land a hair large, then spring-settle: a felt "click into place".
        camS.value = withSequence(
          withTiming(s * CLICK_OVERSHOOT, { duration: dur * 0.9, easing: easeOut }),
          withSpring(s, CLICK_SPRING),
        );
      } else {
        camS.value = withTiming(s, { duration: dur, easing: easeOut });
      }
      if (same) return;
      setLanded(null);
      setLanding({ index, delay: Math.max(0, dur - 120) });
      // The web vibrates for 8ms on landing; the phone has a real engine.
      if (!r) lightHaptic();
    },
    [positions, camX, camY, camS, easeOut, focusSV, reducedSV],
  );

  // The landing beat, a hair before the fly ends.
  useEffect(() => {
    if (!landing) return;
    const t = setTimeout(() => setLanded(landing.index), landing.delay);
    return () => clearTimeout(t);
  }, [landing]);

  const enterOverview = useCallback(() => {
    const { s, x, y } = overviewCamera(bounds, positions, vw - 32, vh - 240);
    const dur = motionDuration(800, reducedSV.value);
    cancelAnimation(camX);
    cancelAnimation(camY);
    cancelAnimation(camS);
    camX.value = withTiming(x, { duration: dur, easing: easeOut });
    camY.value = withTiming(y, { duration: dur, easing: easeOut });
    camS.value = withTiming(s, { duration: dur, easing: easeOut });
    setMode("overview");
  }, [bounds, positions, vw, vh, camX, camY, camS, easeOut, reducedSV]);

  const focusOn = useCallback(
    (index: number) => {
      setMode("focus");
      flyTo(index, { click: true });
    },
    [flyTo],
  );

  // Re-centre on resize/rotation (and after the intro hands over) without animation.
  useEffect(() => {
    if (modeSV.value !== "focus") return;
    const p = positions[focusSV.value];
    if (!p) return;
    if (Math.abs(camX.value - p.x) > 0.5 || Math.abs(camY.value - p.y) > 0.5) {
      camX.value = p.x;
      camY.value = p.y;
    }
  }, [positions, camX, camY, modeSV, focusSV]);

  // ── Intro ────────────────────────────────────────────────────────────────
  // Any touch, a request from the screen, or Reduce Motion landing: cut the
  // opening to its end state. The phase effects below clear their own timers
  // when the phase moves on.
  const finishIntro = useCallback(() => {
    if (modeSV.value !== "intro") return;
    setIntroPhase("done");
    const p = positions[startIndex] ?? positions[0];
    const dur = motionDuration(250, reducedSV.value);
    cancelAnimation(camX);
    cancelAnimation(camY);
    cancelAnimation(camS);
    cancelAnimation(tilt);
    cancelAnimation(fog);
    if (p) {
      camX.value = withTiming(p.x, { duration: dur });
      camY.value = withTiming(p.y, { duration: dur });
    }
    camS.value = withTiming(1, { duration: dur });
    tilt.value = withTiming(0, { duration: dur });
    fog.value = withTiming(0, { duration: dur });
    drawProgress.value = 1;
    setFocus(startIndex);
    setMode("focus");
    setLanded(startIndex);
  }, [positions, startIndex, camX, camY, camS, tilt, fog, drawProgress, modeSV, reducedSV]);

  // HOLD (full only): a spread of cards under the fog, tilted 2.5°, the
  // current one breathing, the title up; the line draws itself under the haze.
  useEffect(() => {
    if (introPhase !== "hold") return;
    const cur = positions[startIndex] ?? positions[0];
    if (!cur) return;
    void markIntroShown(data.todayKey);
    const s0 = 0.3;
    camX.value = cur.x - (vw * 0.12) / s0;
    camY.value = cur.y - (vh * 0.06) / s0;
    camS.value = s0;
    tilt.value = 2.5;
    fog.value = 1;
    const drift = { duration: INTRO_HOLD_MS, easing: Easing.inOut(Easing.ease) };
    camX.value = withTiming(cur.x - (vw * 0.04) / s0, drift);
    camS.value = withTiming(s0 * 1.08, drift);
    tilt.value = withTiming(1, drift);
    drawProgress.value = withDelay(250, withTiming(1, { duration: 1550, easing: Easing.out(Easing.ease) }));
    const t = setTimeout(() => setIntroPhase("fly"), INTRO_HOLD_MS);
    return () => clearTimeout(t);
    // The opening is staged once, for the layout it mounted with (the web's
    // intro effect runs once too); a resize mid-opening is re-centred after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introPhase]);

  // FLY: the camera comes in as the fog lifts and the card clicks into place.
  // The short opening is this beat alone, from a 0.7 zoom.
  useEffect(() => {
    if (introPhase !== "fly") return;
    const cur = positions[startIndex] ?? positions[0];
    if (!cur) return;
    let ms: number;
    if (introKind === "short") {
      void markIntroShown(data.todayKey);
      camX.value = cur.x;
      camY.value = cur.y;
      camS.value = 0.7;
      fog.value = 0.7;
      tilt.value = 0;
      camS.value = withTiming(1, { duration: 900, easing: easeOut });
      fog.value = withTiming(0, { duration: 800, easing: easeOut });
      ms = SHORT_INTRO_MS;
    } else {
      camX.value = withTiming(cur.x, { duration: INTRO_FLY_MS, easing: easeOut });
      camY.value = withTiming(cur.y, { duration: INTRO_FLY_MS, easing: easeOut });
      tilt.value = withTiming(0, { duration: INTRO_FLY_MS, easing: easeOut });
      camS.value = withSequence(
        withTiming(CLICK_OVERSHOOT, { duration: INTRO_FLY_MS * 0.9, easing: easeInOut }),
        withSpring(1, CLICK_SPRING),
      );
      fog.value = withDelay(350, withTiming(0, { duration: 1100, easing: easeInOut }));
      ms = INTRO_FLY_MS + 80;
    }
    const t = setTimeout(() => {
      setIntroPhase("done");
      setMode("focus");
      setLanded(startIndex);
      if (introKind === "full") setHint("swipe to move through your weeks · pinch out for the line");
    }, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introPhase]);

  // Reduce Motion lands a tick after the first paint (or is flipped
  // mid-session): an opening that is still playing is cut to its end state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reduce Motion is the OS's answer, delivered after the first paint; the opening already on screen is cut, not re-derived.
    if (reduced && mode === "intro") finishIntro();
  }, [reduced, mode, finishIntro]);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), HINT_MS);
    return () => clearTimeout(t);
  }, [hint]);

  useImperativeHandle(
    ref,
    () => ({
      focusOn: (index: number) => {
        finishIntro();
        focusOn(index);
      },
      enterOverview: () => {
        finishIntro();
        enterOverview();
      },
      skipIntro: finishIntro,
    }),
    [finishIntro, focusOn, enterOverview],
  );

  // ── Releases: what a finger decided, settled on the JS thread ───────────
  // Plain functions, rebuilt with the render they belong to; the gestures
  // below are rebuilt with them, which is how Gesture Handler is meant to be
  // used — it diffs the config and updates the callbacks in place (in a
  // microtask after the render). They read the mode and the focus from the
  // shared-value mirrors, the same place the worklets do, so a release that
  // arrives between a render and that update still answers for the stage as
  // it is, not as it was.
  const onDragRelease = (target: number, progress: number, velocity: number, moved: boolean) => {
    if (modeSV.value === "overview") return;
    const current = focusSV.value;
    // Commit the scrub if it went far or fast enough; else snap back.
    if (target >= 0 && commitScrub(progress, velocity)) {
      flyTo(target, { duration: SCRUB_FLY_MS, click: true });
      return;
    }
    if (moved && target < 0) {
      // Against the path: nothing navigates; say which way the line goes.
      setHint(againstPathHint(exitEdge(positions, current, size.row)));
    }
    flyTo(current, { duration: SNAP_BACK_MS });
  };
  const onPinchRelease = (s: number, x: number, y: number) => {
    if (s >= OVERVIEW_MAX_SCALE) focusOn(nearestCard(positions, x, y));
    else if (modeSV.value !== "overview") enterOverview();
    // Already in overview: keep whatever zoom/pan the fingers left (just clamp).
    else if (s < OVERVIEW_MIN_SCALE) camS.value = withTiming(OVERVIEW_MIN_SCALE, { duration: motionDuration(250, reducedSV.value) });
  };
  const onTapRelease = (x: number, y: number) => {
    if (inertSV.value) return;
    if (modeSV.value === "intro") {
      finishIntro();
      return;
    }
    const cam = { x: camX.value, y: camY.value, s: camS.value };
    const w = toWorld(x, y, cam, vw, vh);
    if (modeSV.value === "overview") {
      const hit = hitCard(positions, w.x, w.y, size.w / 2, size.h / 2, OVERVIEW_HIT_TOLERANCE / cam.s);
      if (hit) focusOn(hit.index);
      return;
    }
    // A neighbouring card comes forward; the focused card does nothing (its own buttons handle themselves).
    const hit = hitCard(positions, w.x, w.y, size.w / 2, size.h / 2);
    if (hit && hit.index !== focusSV.value) flyTo(hit.index, { click: true });
  };

  // ── Gestures: the finger steers the camera on the UI thread ─────────────
  // Per-gesture scratch, on the UI thread.
  const startCamX = useSharedValue(0);
  const startCamY = useSharedValue(0);
  const startCamS = useSharedValue(1);
  const worldMidX = useSharedValue(0);
  const worldMidY = useSharedValue(0);
  const pinching = useSharedValue(false);
  const scrubTargetSV = useSharedValue(-1);
  const scrubProgressSV = useSharedValue(0);
  const moved = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .maxPointers(1)
    .minDistance(TAP_SLOP)
    .withTestId("journey-pan")
    .onBegin(() => {
      "worklet";
      if (inertSV.value) return;
      if (modeSV.value === "intro") {
        runOnJS(finishIntro)();
        return;
      }
      startCamX.value = camX.value;
      startCamY.value = camY.value;
      startCamS.value = camS.value;
      scrubTargetSV.value = -1;
      scrubProgressSV.value = 0;
      moved.value = false;
      cancelAnimation(camX);
      cancelAnimation(camY);
    })
    .onUpdate((e) => {
      "worklet";
      if (inertSV.value || pinching.value || modeSV.value === "intro") return;
      const dx = e.translationX;
      const dy = e.translationY;
      if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) moved.value = true;
      const s = startCamS.value;
      if (modeSV.value === "overview") {
        camX.value = startCamX.value - dx / s;
        camY.value = startCamY.value - dy / s;
        return;
      }
      // Scrub: project the drag onto the segment the finger is moving along and
      // move the camera along that segment (rubber-banded past the ends).
      const pos = positionsSV.value;
      const cur = pos[focusSV.value];
      if (!cur) return;
      const sc = projectScrub(pos, focusSV.value, dx, dy, s);
      if (sc) {
        const tgt = pos[sc.target];
        if (!tgt) return;
        const p = rubberBand(sc.progress);
        camX.value = cur.x + (tgt.x - cur.x) * p;
        camY.value = cur.y + (tgt.y - cur.y) * p;
        scrubTargetSV.value = sc.target;
        scrubProgressSV.value = sc.progress;
      } else {
        // Against the path: a small nudge, springs back on release.
        camX.value = cur.x - (dx * AGAINST_PATH_NUDGE) / s;
        camY.value = cur.y - (dy * AGAINST_PATH_NUDGE) / s;
        scrubTargetSV.value = -1;
      }
    })
    .onEnd((e) => {
      "worklet";
      if (inertSV.value || pinching.value || modeSV.value === "intro") return;
      // px/ms, like the web's `hypot(dx, dy) / dt`.
      const v = Math.hypot(e.velocityX, e.velocityY) / 1000;
      runOnJS(onDragRelease)(scrubTargetSV.value, scrubProgressSV.value, v, moved.value);
    });

  const pinchGesture = Gesture.Pinch()
    .withTestId("journey-pinch")
    .onStart((e) => {
      "worklet";
      if (inertSV.value) return;
      if (modeSV.value === "intro") {
        runOnJS(finishIntro)();
        return;
      }
      pinching.value = true;
      startCamS.value = camS.value;
      const w = toWorld(e.focalX, e.focalY, { x: camX.value, y: camY.value, s: camS.value }, vwSV.value, vhSV.value);
      worldMidX.value = w.x;
      worldMidY.value = w.y;
      cancelAnimation(camX);
      cancelAnimation(camY);
      cancelAnimation(camS);
    })
    .onUpdate((e) => {
      "worklet";
      if (!pinching.value) return;
      const s = clampPinchScale(startCamS.value, e.scale);
      const c = pinchCamera({ x: worldMidX.value, y: worldMidY.value }, e.focalX, e.focalY, s, vwSV.value, vhSV.value);
      camS.value = s;
      camX.value = c.x;
      camY.value = c.y;
    })
    .onEnd(() => {
      "worklet";
      if (!pinching.value) return;
      pinching.value = false;
      runOnJS(onPinchRelease)(camS.value, camX.value, camY.value);
    })
    .onFinalize(() => {
      "worklet";
      pinching.value = false;
    });

  const tapGesture = Gesture.Tap()
    .maxDuration(400)
    .withTestId("journey-tap")
    .onEnd((e, success) => {
      "worklet";
      if (!success) return;
      runOnJS(onTapRelease)(e.x, e.y);
    });

  const gesture = Gesture.Race(tapGesture, Gesture.Simultaneous(panGesture, pinchGesture));

  // ── The world layer (cards) ──────────────────────────────────────────────
  // A full-screen view scaled about its centre, translated so the camera's
  // world point lands at the viewport centre: for a centre origin that is
  // `s * (vw/2 - x)`, the same mapping as the canvas's origin-based matrix.
  const worldStyle = useAnimatedStyle(() => ({
    opacity: tileOpacity(camS.value),
    transform: [
      { translateX: camS.value * (vwSV.value / 2 - camX.value) },
      { translateY: camS.value * (vhSV.value / 2 - camY.value) },
      { scale: camS.value },
    ],
  }));
  const tiltStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.value}deg` }] }));
  const fogStyle = useAnimatedStyle(() => ({ opacity: fog.value }));
  const hudStyle = useAnimatedStyle(() => ({ opacity: hudOpacity(camS.value) }));

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!width || !height) return;
    setVp((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  }, []);

  // ── The line's geometry (world space, recomputed only when the layout does) ──
  const peaks = useMemo(() => peakIndexes(weeks), [weeks]);
  const line = useMemo(() => {
    const weeksPos = positions.filter((p) => !p.horizon);
    const segments: Segment[] = [];
    for (let i = 1; i < positions.length; i++) {
      const a = positions[i - 1]!;
      const b = positions[i]!;
      const wk = weeks[Math.min(i, weeks.length - 1)];
      const dashed = !!b.horizon || !!wk?.gap;
      segments.push({
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        dashed,
        color: b.horizon || !wk ? rgbOf(VIOLET) : pillarColor(wk.subject, wk.score, 62),
      });
    }
    const baseY = positions.length ? Math.max(...positions.map((p) => p.y)) + size.h / 2 + 40 : 0;
    const areaTop = weeksPos.length ? Math.min(...weeksPos.map((p) => p.y)) : 0;
    const areaPath =
      weeksPos.length >= 2
        ? `M ${weeksPos[0]!.x} ${baseY} ` +
          weeksPos.map((p) => `L ${p.x} ${p.y}`).join(" ") +
          ` L ${weeksPos[weeksPos.length - 1]!.x} ${baseY} Z`
        : null;
    const maxAlt = Math.max(0, ...weeks.map((w) => w.altitude));
    const grid: number[] = [];
    for (let k = 0; k <= Math.ceil(maxAlt); k++) grid.push(-k * size.row);
    const ticks: Tick[] = thinTicks(
      monthTicks(weeks).map((t) => ({ ...t, x: positions[t.index]?.x ?? 0 })),
      weeks.length,
    );
    return { segments, baseY, areaTop, areaPath, grid, ticks };
  }, [positions, weeks, size]);
  const stars = useMemo(() => starsFor(bounds), [bounds]);

  // What each card is worth saying, ranked — it takes the whole journey to answer.
  const direction = data.target?.direction ?? null;
  const signals = useMemo(() => journeySignals(weeks, { unit: data.unit, direction }), [weeks, data.unit, direction]);
  const liveActive = useMemo(() => {
    const i = weeks.findIndex((w) => w.isCurrent);
    return i >= 0 ? signals[i]?.active : undefined;
  }, [weeks, signals]);

  const onHorizon = focus === horizonIndex;
  const focusedWeek = weeks[Math.min(focus, weeks.length - 1)];
  const edge = exitEdge(positions, focus, size.row);
  const trend = liveTrend(weeks);
  const counter = counterLabel(mode, focus, weeks.length);
  const fogColor = rgbOf(STAGE_BG, 0.55);
  const chromeFill = rgbOf(INK, 0.1);
  const ink = rgbOf(INK);
  const prevIndex = neighbourFor(positions, focus, "right");
  const nextIndex = neighbourFor(positions, focus, "left");
  const prevDisabled = focus === 0 || prevIndex == null;
  const nextDisabled = focus >= horizonIndex || nextIndex == null;

  return (
    <View
      style={[styles.stage, { backgroundColor: rgbOf(STAGE_BG) }]}
      testID={testID}
      accessibilityLabel="The Becoming"
      // The web exposes `data-mode`; a test reads it the same way here.
      accessibilityValue={{ text: mode }}
    >
      {/* A night sky in BOTH schemes, like the web's (NP-341): the stage's own
          chrome and tiles draw from `becomingStageTokens`, and everything that
          reads `useThemeTokens()` under here — the week cards, the Horizon
          card, their chips and the Details button — gets the dark palette
          whatever the system says, with no per-component literal. */}
      <ForcedThemeMode mode="dark">
        <StageCanvas
          vw={vw}
          vh={vh}
          size={size}
          positions={positions}
          weeks={weeks}
          segments={line.segments}
          ticks={line.ticks}
          grid={line.grid}
          areaPath={line.areaPath}
          areaTop={line.areaTop}
          baseY={line.baseY}
          stars={stars}
          peaks={peaks}
          camX={camX}
          camY={camY}
          camS={camS}
          tilt={tilt}
          drawProgress={drawProgress}
          font={font}
        />

        <GestureDetector gesture={gesture}>
          <View style={StyleSheet.absoluteFill} onLayout={onLayout} testID="journey-gesture-surface">
            <Animated.View style={[StyleSheet.absoluteFill, tiltStyle]} pointerEvents="box-none">
              <Animated.View
                style={[styles.world, { width: vw, height: vh }, worldStyle]}
                pointerEvents="box-none"
                testID="journey-world"
              >
                {positions.map((p, i) => {
                  const em = cardEmphasis(i, focus, mode);
                  const week = weeks[i];
                  const breathing = mode === "intro" && i === startIndex;
                  return (
                    <View
                      key={p.horizon ? "horizon" : (week?.weekKey ?? i)}
                      testID={`journey-card-${i}`}
                      // The focused card's buttons are live; a neighbour's are not
                      // (tapping it brings it forward); in the opening nothing is.
                      pointerEvents={mode !== "intro" && (em.focused || em.compact) ? "box-none" : "none"}
                      style={[
                        styles.slot,
                        {
                          left: p.x - size.w / 2,
                          top: p.y - size.h / 2,
                          width: size.w,
                          // Every card is exactly `cardSize`, the web's box
                          // (NP-342): the slot IS the box, the card fills it
                          // and lays its content out inside it (clipping what
                          // will not fit), so a focused card never ends short
                          // of the line through it, and no card grows past it.
                          height: size.h,
                          opacity: em.opacity,
                          transform: [{ scale: breathing ? 1.03 : em.scale }],
                        },
                      ]}
                    >
                      {p.horizon ? (
                        em.compact ? (
                          <WeekTile horizon width={size.w} height={size.h} />
                        ) : (
                          <HorizonCard
                            identity={data.identity}
                            trend={trend}
                            next={data.next}
                            active={liveActive}
                            onNavigate={onNavigate}
                            width={size.w}
                            height={size.h}
                          />
                        )
                      ) : !week ? null : em.compact ? (
                        <WeekTile week={week} width={size.w} height={size.h} totalWeeks={weeks.length} />
                      ) : (
                        <WeekCard
                          week={week}
                          signals={signals[i] ?? { active: [], highlights: [], nudge: null, hasDeltas: false }}
                          totalWeeks={weeks.length}
                          identity={data.identity}
                          next={week.isCurrent ? data.next : null}
                          isPeak={peaks.has(i)}
                          onDetails={() => onDetails(i)}
                          onNavigate={onNavigate}
                          width={size.w}
                          height={size.h}
                        />
                      )}
                    </View>
                  );
                })}
              </Animated.View>
            </Animated.View>
          </View>
        </GestureDetector>

        {/* The intro's fog: the web's blur has a plain-fog fallback for low-memory
            devices, and that is what the phone gets — same beat, no filter. */}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: fogColor }, fogStyle]} pointerEvents="none" />

        {showTitle && (
          <Animated.View
            entering={reduced ? undefined : FadeIn.duration(700)}
            exiting={reduced ? undefined : FadeOut.duration(500)}
            style={styles.title}
            pointerEvents="none"
            testID="journey-title"
          >
            <Text style={[styles.kicker, { color: rgbOf(INK, 0.6) }]}>The Becoming</Text>
            <Text style={[styles.titleText, { color: ink }]}>Who am I becoming?</Text>
            {data.identity ? (
              <Text style={[styles.identity, { color: rgbOf(INK, 0.75) }]} numberOfLines={3}>
                “{data.identity}”
              </Text>
            ) : null}
          </Animated.View>
        )}

        {mode === "overview" && (
          <Animated.View style={[styles.hud, { top: insets.top + 62 }, hudStyle]} pointerEvents="none" testID="journey-hud">
            {data.identity ? (
              <Text style={[styles.hudIdentity, { color: rgbOf(INK, 0.85) }]} numberOfLines={2}>
                “{data.identity}”
              </Text>
            ) : null}
            <Text style={[styles.hudAggregate, { color: rgbOf(INK, 0.55) }]} testID="journey-aggregate">
              {aggregate(weeks, data.unit)}
              {sinceLabel(data.firstActivity)}
            </Text>
          </Animated.View>
        )}

        {/* Chrome */}
        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="journey-close"
            style={[minTouchTarget, styles.roundButton, { backgroundColor: chromeFill }]}
          >
            <X size={20} color={ink} strokeWidth={1.5} />
          </Pressable>
          <View style={styles.topCenter} pointerEvents="none">
            <Text style={[styles.kickerSmall, { color: rgbOf(INK, 0.55) }]}>The Becoming</Text>
            {mode !== "intro" ? (
              <Text style={[styles.counter, { color: rgbOf(INK, 0.8) }]} testID="journey-counter">
                {counter}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => (mode === "overview" ? focusOn(focus) : enterOverview())}
            accessibilityRole="button"
            accessibilityLabel={mode === "overview" ? "Zoom in" : "Zoom out"}
            testID="journey-zoom"
            style={[minTouchTarget, styles.roundButton, { backgroundColor: chromeFill }]}
          >
            {mode === "overview" ? (
              <Minimize2 size={16} color={ink} strokeWidth={1.5} />
            ) : (
              <Maximize2 size={16} color={ink} strokeWidth={1.5} />
            )}
          </Pressable>
        </View>

        {mode === "focus" && (
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 14 }]} pointerEvents="box-none">
            <Pressable
              onPress={() => {
                if (prevIndex != null) flyTo(prevIndex, { click: true });
              }}
              disabled={prevDisabled}
              accessibilityRole="button"
              accessibilityLabel="Previous week"
              accessibilityState={{ disabled: prevDisabled }}
              testID="journey-prev"
              style={[minTouchTarget, styles.roundButtonLg, { backgroundColor: chromeFill, opacity: prevDisabled ? 0.3 : 1 }]}
            >
              <ChevronLeft size={20} color={ink} strokeWidth={1.5} />
            </Pressable>
            <View style={styles.hintWrap} pointerEvents="none">
              <Text style={[styles.hint, { color: rgbOf(INK, 0.55) }]} testID="journey-hint">
                {hint ?? defaultHint(edge, onHorizon)}
              </Text>
            </View>
            <View style={styles.bottomRight}>
              {focus !== liveIndex ? (
                <Pressable
                  onPress={() => flyTo(liveIndex, { click: true })}
                  accessibilityRole="button"
                  accessibilityLabel="Jump to this week"
                  testID="journey-today"
                  style={[minTouchTarget, styles.roundButtonLg, { backgroundColor: chromeFill }]}
                >
                  <LocateFixed size={20} color={ink} strokeWidth={1.5} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  if (nextIndex != null) flyTo(nextIndex, { click: true });
                }}
                disabled={nextDisabled}
                accessibilityRole="button"
                accessibilityLabel="Next week"
                accessibilityState={{ disabled: nextDisabled }}
                testID="journey-next"
                style={[minTouchTarget, styles.roundButtonLg, { backgroundColor: chromeFill, opacity: nextDisabled ? 0.3 : 1 }]}
              >
                <ChevronRight size={20} color={ink} strokeWidth={1.5} />
              </Pressable>
            </View>
          </View>
        )}
        {mode === "overview" && (
          <View style={[styles.overviewFoot, { paddingBottom: insets.bottom + 16 }]} pointerEvents="none">
            <Text style={[styles.hint, { color: rgbOf(INK, 0.55) }]}>your line · tap a week to open it</Text>
          </View>
        )}

        {/* The live region: what the focused card says, for assistive tech. */}
        <Text style={styles.srOnly} accessibilityLiveRegion="polite" testID="journey-live">
          {mode === "focus" && focusedWeek
            ? onHorizon
              ? "Horizon: who you are becoming"
              : `${focusedWeek.label}: ${focusedWeek.headline}`
            : ""}
        </Text>
        {/* `landed` is the beat the card has clicked into place; the web passes it
            to the card for its own flourish, the native card has none yet. */}
        <View style={styles.srOnly} testID={landed != null ? `journey-landed-${landed}` : "journey-landing"} />
      </ForcedThemeMode>
    </View>
  );
});

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    overflow: "hidden",
  },
  world: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  slot: {
    position: "absolute",
  },
  title: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "36%",
    paddingHorizontal: 32,
    alignItems: "center",
  },
  kicker: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 3.5,
  },
  titleText: {
    marginTop: 8,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -0.8,
    textAlign: "center",
  },
  identity: {
    marginTop: 16,
    maxWidth: 384,
    fontSize: 16,
    fontStyle: "italic",
    textAlign: "center",
  },
  hud: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  hudIdentity: {
    maxWidth: 448,
    fontSize: 15,
    fontStyle: "italic",
    lineHeight: 20,
    textAlign: "center",
  },
  hudAggregate: {
    marginTop: 6,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  topCenter: {
    flex: 1,
    alignItems: "center",
  },
  kickerSmall: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 3,
  },
  counter: {
    fontSize: 12,
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  roundButtonLg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  hintWrap: {
    flex: 1,
    paddingHorizontal: 8,
  },
  hint: {
    fontSize: 11,
    textAlign: "center",
  },
  bottomRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  overviewFoot: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
});

export default JourneyStage;
