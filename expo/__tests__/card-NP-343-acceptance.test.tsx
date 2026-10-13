// NP-343 — BECOMING STAGE: THE FOCUSED CARD IS MISSING THE WEB'S SPARKLINE,
// EXIT-EDGE LIGHT AND IDENTITY WHISPER (native).
//
// Visual + motion review of NP-204 on build 763bc68b (beta, 10/8), the web
// against the S23 and the iOS simulator: three pieces of the web's focused
// card were not on the native card.
//
//   1. the SPARKLINE top-right of the eyebrow — the whole path in miniature,
//      this week's dot in the week's colour — which on the web is a button,
//      "See your whole line", that zooms out to the overview;
//   2. the EXIT-EDGE LIGHT — a pulsing 3 px bar in the week's colour on the
//      edge that faces the next card (top on a climb, bottom on a dip, right
//      on a hold), with the web's glow; still under Reduce Motion;
//   3. the IDENTITY WHISPER — `Becoming: <identity>` in serif italic at 12 px
//      and 45% white, where native read the quoted identity in sans.
//
// What this suite proves: the sparkline and the edge light are on the
// focused card and on no other (its neighbours, the Horizon, a card mounted
// bare), and move with the focus; the whisper reads as the web's on every
// full card; the numbers are the web's, read off the rendered tree and held
// by `lib/becoming/focusedCard.ts`; the sparkline's tap reaches the stage's
// own `enterOverview`; the pulse is Tailwind's `animate-pulse` and Reduce
// Motion — read at mount or flipped live — holds the bar still at full.

import React from "react";
import { AccessibilityInfo } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, waitFor, within, type RenderResult } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { colorScheme } from "nativewind";
import * as Reanimated from "react-native-reanimated";
import { Circle, Polyline } from "react-native-svg";
import { cardSize, exitEdge, layoutWeeks } from "@become/core";
import { JourneyStage, type JourneyStageHandle } from "@/components/becoming/journey/JourneyStage";
import { WeekCard } from "@/components/becoming/WeekCard";
import {
  EXIT_EDGE_INSET,
  EXIT_EDGE_RADIUS,
  EXIT_EDGE_THICKNESS,
  EXIT_GLOW_ALPHA,
  EXIT_GLOW_BLUR,
  EXIT_GLOW_LIGHTNESS,
  EXIT_GLOW_SPREAD,
  EXIT_PULSE_EASING,
  EXIT_PULSE_LOW,
  EXIT_PULSE_MS,
  SPARK_DOT_R,
  SPARK_H,
  SPARK_LINE_ALPHA,
  SPARK_PADDING,
  SPARK_STROKE_WIDTH,
  SPARK_W,
  TONE_LIGHTNESS,
  WHISPER_ALPHA,
  WHISPER_FONT_FAMILY,
  WHISPER_FONT_SIZE,
  exitEdgeGlow,
  exitEdgePlacement,
  exitEdgeShadow,
  focusTone,
  identityWhisper,
  sparklinePoints,
} from "@/lib/becoming/focusedCard";
import { PILLAR, pillarColor } from "@/lib/becoming/pillarColors";
import { journeySignals } from "@/lib/becoming/signals";
import { resetIntroSession } from "@/lib/becoming/storage";
import type { WeekSnapshot } from "@/lib/becoming/types";
import { becomingStageTokens, resolveToken, rgbOf, type ThemeMode } from "@/lib/theme/tokens";
import { journeyWith, yearOfWeeks } from "../test-support/becomingFixtures";

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};
// jest-expo's window: what `useWindowDimensions` answers, so what the stage lays out for.
const WINDOW = { width: 750, height: 1334 };
const SIZE = cardSize(WINDOW.width, WINDOW.height);

const WEEKS = yearOfWeeks(52);
const JOURNEY = journeyWith(WEEKS);
const LIVE = WEEKS.length - 1;
const SIGNALS = journeySignals(WEEKS, { unit: JOURNEY.unit, direction: JOURNEY.target?.direction ?? null });
const POSITIONS = layoutWeeks(WEEKS, SIZE);
const ALTITUDES = WEEKS.map((w) => w.altitude);

const SPARK_LABEL = "See your whole line";

type Instance = ReturnType<RenderResult["getByTestId"]>;

/** One flat style object out of RN's nested style arrays. */
function flat(node: { props: { style?: unknown } }): Record<string, unknown> {
  return Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
}

/** A host node's host children, in order, with composite wrappers flattened out. */
function hostKids(node: Instance): Instance[] {
  return node.children.flatMap((c) => (typeof c === "string" ? [] : typeof c.type === "string" ? [c] : hostKids(c)));
}

function setSystemScheme(mode: ThemeMode): void {
  act(() => {
    colorScheme.set(mode);
  });
}

function renderStage(ref?: React.Ref<JourneyStageHandle>): RenderResult {
  return render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <JourneyStage
          ref={ref}
          data={JOURNEY}
          introKind="none"
          onClose={jest.fn()}
          onDetails={jest.fn()}
          onNavigate={jest.fn()}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );
}

const mode = (u: RenderResult): string => u.getByTestId("journey-stage").props.accessibilityValue.text;
const card = (u: RenderResult, i: number): Instance => u.getByTestId(`week-card-${WEEKS[i]!.weekKey}`);

/** The web's sparkline expression, by hand, so the module cannot drift from it. */
function webSparkline(altitudes: number[], at: number): { points: string; cx: number; cy: number } {
  const W = 56;
  const H = 22;
  const max = Math.max(1, ...altitudes);
  const n = Math.max(1, altitudes.length - 1);
  const points = altitudes.map((a, i) => `${(i / n) * W},${H - 3 - (a / max) * (H - 6)}`).join(" ");
  return { points, cx: (at / n) * W, cy: H - 3 - ((altitudes[at] ?? 0) / max) * (H - 6) };
}

/** A week whose NEXT card lies past the given edge, so the stage lights that edge when it is focused. */
function weekWithExit(edge: "up" | "right" | "down"): number {
  const i = WEEKS.findIndex((_, n) => exitEdge(POSITIONS, n, SIZE.row) === edge);
  if (i < 0) throw new Error(`fixture has no week whose next card is ${edge}`);
  return i;
}

let reduceRead: jest.SpyInstance;
let reduceSub: jest.SpyInstance;
let reduceListeners: ((value: boolean) => void)[];
beforeEach(async () => {
  await AsyncStorage.clear();
  resetIntroSession();
  reduceListeners = [];
  reduceRead = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(() => Promise.resolve(false));
  reduceSub = jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((event: string, cb: (value: boolean) => void) => {
    if (event === "reduceMotionChanged") reduceListeners.push(cb);
    return { remove: () => {} };
  }) as never);
});
afterEach(() => {
  reduceRead.mockRestore();
  reduceSub.mockRestore();
  jest.restoreAllMocks();
  setSystemScheme("dark");
});

// ─── 1. the sparkline ────────────────────────────────────────────────────────

describe("the sparkline: the whole path in miniature, on the focused card only", () => {
  it("the focused card has it as a button; its neighbours and the Horizon do not; and it follows the focus", () => {
    const ref = React.createRef<JourneyStageHandle>();
    const u = renderStage(ref);
    const spark = within(card(u, LIVE)).getByLabelText(SPARK_LABEL);
    expect(spark.props.accessibilityRole).toBe("button");
    expect(spark.props.testID).toBe("week-card-spark");
    for (const i of [LIVE - 1, LIVE - 2]) expect(within(card(u, i)).queryByLabelText(SPARK_LABEL)).toBeNull();
    expect(within(u.getByTestId("horizon-card")).queryByLabelText(SPARK_LABEL)).toBeNull();

    act(() => ref.current!.focusOn(7));
    expect(within(card(u, 7)).getByLabelText(SPARK_LABEL)).toBeTruthy();
    for (const i of [5, 6, 8, 9]) expect(within(card(u, i)).queryByLabelText(SPARK_LABEL)).toBeNull();
  });

  it("draws every week's altitude on the web's 56 × 22 line at 35% white, with THIS week's dot in the week's colour", () => {
    const ref = React.createRef<JourneyStageHandle>();
    const u = renderStage(ref);
    for (const i of [LIVE, 7]) {
      if (i !== LIVE) act(() => ref.current!.focusOn(i));
      const week = WEEKS[i]!;
      const spark = within(card(u, i)).getByTestId("week-card-spark");
      const line = within(spark).UNSAFE_getByType(Polyline);
      const dot = within(spark).UNSAFE_getByType(Circle);
      const web = webSparkline(ALTITUDES, i);
      expect(line.props.points).toBe(web.points);
      expect(line.props).toEqual(expect.objectContaining({ fill: "none", strokeWidth: 1.5, strokeLinejoin: "round" }));
      // `rgba(255,255,255,0.35)` on the web; the stage's ink at the same alpha here.
      expect(line.props.stroke).toBe(rgbOf(becomingStageTokens.ink, 0.35));
      expect(line.props.stroke).toBe("rgba(255, 255, 255, 0.35)");
      expect(dot.props).toEqual(expect.objectContaining({ cx: web.cx, cy: web.cy, r: 2.6, fill: pillarColor(week.subject, week.score, 62) }));
    }
    // The dot moves along the line with the focus: two weeks, two places.
    expect(webSparkline(ALTITUDES, LIVE).cx).not.toBe(webSparkline(ALTITUDES, 7).cx);
    // Fifty-two weeks, fifty-two points, left to right across the full width.
    const pts = webSparkline(ALTITUDES, LIVE).points.split(" ");
    expect(pts).toHaveLength(WEEKS.length);
    expect(pts[0]!.startsWith("0,")).toBe(true);
    expect(pts[pts.length - 1]!.startsWith("56,")).toBe(true);
  });

  it("tapping it zooms out to the overview — the stage's own enterOverview", () => {
    const u = renderStage();
    expect(mode(u)).toBe("focus");
    fireEvent.press(within(card(u, LIVE)).getByTestId("week-card-spark"));
    expect(mode(u)).toBe("overview");
    // In the overview the cards are tiles; the sparkline (and the card) are gone.
    expect(u.queryByTestId("week-card-spark")).toBeNull();
  });

  it("is the web's p-1 button around the drawing, held to the 44-point rule with slop, not by growing", () => {
    const u = renderStage();
    const spark = within(card(u, LIVE)).getByTestId("week-card-spark");
    expect(flat(spark).padding).toBe(4);
    expect(flat(spark).minWidth).toBeUndefined();
    // 64 × 30 drawn: 7 points of vertical slop (ceil((44 − 30) / 2)), none horizontally.
    expect(spark.props.hitSlop).toEqual({ top: 7, bottom: 7, left: 0, right: 0 });
  });

  it("a card given the path but not focused draws none; one mounted bare draws none", () => {
    const week = WEEKS[LIVE - 1]!;
    const u = render(
      <WeekCard week={week} signals={SIGNALS[LIVE - 1]!} spark={{ altitudes: ALTITUDES, at: LIVE - 1 }} width={SIZE.w} height={SIZE.h} />,
    );
    expect(u.queryByTestId("week-card-spark")).toBeNull();
    const v = render(<WeekCard week={week} signals={SIGNALS[LIVE - 1]!} />);
    expect(v.queryByTestId("week-card-spark")).toBeNull();
    const onSparkline = jest.fn();
    const w = render(
      <WeekCard week={week} signals={SIGNALS[LIVE - 1]!} focused spark={{ altitudes: ALTITUDES, at: LIVE - 1 }} onSparkline={onSparkline} />,
    );
    fireEvent.press(w.getByTestId("week-card-spark"));
    expect(onSparkline).toHaveBeenCalledTimes(1);
  });
});

// ─── 2. the exit-edge light ──────────────────────────────────────────────────

describe("the exit-edge light: the edge that faces the next card, on the focused card only", () => {
  it("sits along the top when the next week climbs, the bottom when it dips, down the right edge when it holds", () => {
    const ref = React.createRef<JourneyStageHandle>();
    const u = renderStage(ref);
    const cases: ["up" | "right" | "down", Record<string, number | undefined>][] = [
      ["up", { top: 0, left: 40, right: 40, height: 3, bottom: undefined, width: undefined }],
      ["down", { bottom: 0, left: 40, right: 40, height: 3, top: undefined, width: undefined }],
      ["right", { right: 0, top: 40, bottom: 40, width: 3, left: undefined, height: undefined }],
    ];
    for (const [edge, placement] of cases) {
      const i = weekWithExit(edge);
      act(() => ref.current!.focusOn(i));
      const light = within(card(u, i)).getByTestId("week-card-exit");
      const s = flat(light);
      for (const [k, v] of Object.entries(placement)) expect([edge, k, s[k]]).toEqual([edge, k, v]);
      expect(s.position).toBe("absolute");
      expect(s.borderRadius).toBe(3);
      expect(light.props.pointerEvents).toBe("none");
    }
  });

  it("is the week's colour, with the web's glow — 0 0 18px 4px at 60% — as a real box shadow on both platforms", () => {
    const ref = React.createRef<JourneyStageHandle>();
    const u = renderStage(ref);
    for (const i of [LIVE, weekWithExit("up"), weekWithExit("down")]) {
      act(() => ref.current!.focusOn(i));
      const week = WEEKS[i]!;
      const s = flat(within(card(u, i)).getByTestId("week-card-exit"));
      expect(s.backgroundColor).toBe(pillarColor(week.subject, week.score, 62));
      expect(s.boxShadow).toEqual([
        { offsetX: 0, offsetY: 0, blurRadius: 18, spreadDistance: 4, color: pillarColor(week.subject, week.score, 60, 0.6) },
      ]);
    }
  });

  it("the live week lights the edge that faces the Horizon; neighbours, the Horizon and a bare card have none; focus moves it", () => {
    const ref = React.createRef<JourneyStageHandle>();
    const u = renderStage(ref);
    const liveEdge = exitEdge(POSITIONS, LIVE, SIZE.row);
    expect(liveEdge).not.toBeNull();
    expect(flat(within(card(u, LIVE)).getByTestId("week-card-exit"))).toEqual(expect.objectContaining(exitEdgePlacement(liveEdge!)));
    for (const i of [LIVE - 1, LIVE - 2]) expect(within(card(u, i)).queryByTestId("week-card-exit")).toBeNull();
    expect(within(u.getByTestId("horizon-card")).queryByTestId("week-card-exit")).toBeNull();

    act(() => ref.current!.focusOn(7));
    expect(within(card(u, 7)).getByTestId("week-card-exit")).toBeTruthy();
    for (const i of [5, 6, 8, 9]) expect(within(card(u, i)).queryByTestId("week-card-exit")).toBeNull();

    const week = WEEKS[LIVE - 1]!;
    const bare = render(<WeekCard week={week} signals={SIGNALS[LIVE - 1]!} exitEdge="up" width={SIZE.w} height={SIZE.h} />);
    expect(bare.queryByTestId("week-card-exit")).toBeNull();
    const lit = render(<WeekCard week={week} signals={SIGNALS[LIVE - 1]!} exitEdge="up" focused width={SIZE.w} height={SIZE.h} />);
    expect(lit.getByTestId("week-card-exit")).toBeTruthy();
  });

  it("is drawn under the content, over the sky — sky, light, body, in that order in the shell", () => {
    const u = renderStage();
    const order = hostKids(card(u, LIVE)).map((k) => k.props.testID as string | undefined);
    expect(order).toEqual(["week-card-sky", "week-card-exit", "week-card-body"]);
  });

  it("pulses like Tailwind's animate-pulse — 1 → ½ → 1 over 2 s, forever — and Reduce Motion, read at mount or flipped live, holds it still at full", async () => {
    const withRepeat = jest.spyOn(Reanimated, "withRepeat");
    const withTiming = jest.spyOn(Reanimated, "withTiming");
    const cancel = jest.spyOn(Reanimated, "cancelAnimation");

    // Full motion: one loop, forever, of the two halves.
    const u = renderStage();
    await waitFor(() => expect(reduceRead).toHaveBeenCalled());
    expect(withRepeat).toHaveBeenCalledWith(expect.anything(), -1, false);
    expect(withTiming).toHaveBeenCalledWith(0.5, expect.objectContaining({ duration: 1000 }));
    expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 1000 }));
    const loopsBefore = withRepeat.mock.calls.length;

    // The setting flips while the stage is open: the pulse is cancelled, and
    // the bar is left at full — no new loop is started.
    expect(reduceListeners.length).toBeGreaterThan(0);
    act(() => {
      for (const cb of reduceListeners) cb(true);
    });
    expect(cancel).toHaveBeenCalled();
    const lastLoop = Math.max(...withRepeat.mock.invocationCallOrder);
    const lastCancel = Math.max(...cancel.mock.invocationCallOrder);
    expect(lastCancel).toBeGreaterThan(lastLoop);
    expect(withRepeat.mock.calls.length).toBe(loopsBefore);
    const pulse = cancel.mock.calls[cancel.mock.calls.length - 1]![0] as { value: number };
    expect(pulse.value).toBe(1);
    expect(flat(within(card(u, LIVE)).getByTestId("week-card-exit")).opacity).toBe(1);

    // Flipped back: the pulse resumes.
    act(() => {
      for (const cb of reduceListeners) cb(false);
    });
    expect(withRepeat.mock.calls.length).toBeGreaterThan(loopsBefore);
    u.unmount();

    // Read as ON at mount: the hook's first paint is full motion for a tick,
    // then the answer lands and the pulse is cancelled, never restarted.
    reduceRead.mockImplementation(() => Promise.resolve(true));
    withRepeat.mockClear();
    cancel.mockClear();
    renderStage();
    await waitFor(() => expect(cancel).toHaveBeenCalled());
    const loops = withRepeat.mock.calls.length;
    expect(loops).toBeLessThanOrEqual(1);
    await act(async () => {});
    expect(withRepeat.mock.calls.length).toBe(loops);
    expect(Math.max(...cancel.mock.invocationCallOrder)).toBeGreaterThan(loops ? Math.max(...withRepeat.mock.invocationCallOrder) : 0);
  });
});

// ─── 3. the identity whisper ─────────────────────────────────────────────────

describe("the identity whisper", () => {
  it("reads `Becoming: <identity>` in serif italic at 12 px and 45% white — on the focused card and, as on the web, every full card", () => {
    const u = renderStage();
    for (const i of [LIVE, LIVE - 1, LIVE - 2]) {
      const t = within(card(u, i)).getByTestId("week-card-identity");
      expect(t.props.children).toBe(`Becoming: ${JOURNEY.identity}`);
      const s = flat(t);
      expect(s.fontSize).toBe(12);
      expect(s.fontStyle).toBe("italic");
      expect(s.fontFamily).toBe(WHISPER_FONT_FAMILY);
      expect(s.color).toBe(rgbOf(becomingStageTokens.ink, 0.45));
      expect(s.color).toBe("rgba(255, 255, 255, 0.45)");
      expect(t.props.numberOfLines).toBe(1);
      // The old native line — the identity in quotes, sans — is gone.
      expect(within(card(u, i)).queryByText(`“${JOURNEY.identity}”`)).toBeNull();
    }
    // A serif on both platforms: Georgia (the web's stack's first real face) on iOS, the system serif on Android.
    expect(WHISPER_FONT_FAMILY).toMatch(/^(Georgia|serif)$/);
  });

  it("names the subject when nothing has been written, as on the web; the week's own words win over the journey's", () => {
    const week = WEEKS[LIVE - 1]!;
    const none = render(<WeekCard week={week} signals={SIGNALS[LIVE - 1]!} identity={null} width={SIZE.w} height={SIZE.h} />);
    expect(none.getByTestId("week-card-identity").props.children).toBe(PILLAR[week.subject].name);
    expect(PILLAR[week.subject].name).toMatch(/week|system/);

    const own: WeekSnapshot = { ...week, identity: "Calm under load" };
    const theirs = render(<WeekCard week={own} signals={SIGNALS[LIVE - 1]!} identity="Someone else" width={SIZE.w} height={SIZE.h} />);
    expect(theirs.getByTestId("week-card-identity").props.children).toBe("Becoming: Calm under load");

    const journeys = render(<WeekCard week={week} signals={SIGNALS[LIVE - 1]!} identity="Someone else" width={SIZE.w} height={SIZE.h} />);
    expect(journeys.getByTestId("week-card-identity").props.children).toBe("Becoming: Someone else");
  });

  it("is 45% white on the stage whatever the system scheme says; a card mounted bare under the light scheme keeps the system's muted ink", () => {
    setSystemScheme("light");
    const u = renderStage();
    expect(flat(within(card(u, LIVE)).getByTestId("week-card-identity")).color).toBe(rgbOf(becomingStageTokens.ink, 0.45));
    const bare = render(<WeekCard week={WEEKS[LIVE - 1]!} signals={SIGNALS[LIVE - 1]!} identity="x" />);
    const s = flat(bare.getByTestId("week-card-identity"));
    expect(s.color).toBe(resolveToken("muted-foreground", "light"));
    expect(s.color).not.toBe(rgbOf(becomingStageTokens.ink, 0.45));
    // The face and the size do not depend on the scheme.
    expect(s.fontFamily).toBe(WHISPER_FONT_FAMILY);
    expect(s.fontStyle).toBe("italic");
  });
});

// ─── 4. the numbers are the web's ────────────────────────────────────────────

describe("the numbers are the web's (lib/becoming/focusedCard.ts)", () => {
  it("sparklinePoints is the web's expression: x over the index, y over the highest altitude (never under 1), 3 px clear top and bottom", () => {
    expect(SPARK_W).toBe(56);
    expect(SPARK_H).toBe(22);
    expect(SPARK_STROKE_WIDTH).toBe(1.5);
    expect(SPARK_LINE_ALPHA).toBe(0.35);
    expect(SPARK_DOT_R).toBe(2.6);
    expect(SPARK_PADDING).toBe(4);
    for (const [alts, at] of [
      [[0, 1, 2, 2.25], 3],
      [[0, 1, 2, 2.25], 1],
      [[0, 0.25, 0.5], 0],
      [[0], 0],
      [[], 0],
      [ALTITUDES, LIVE],
      [ALTITUDES, 0],
    ] as [number[], number][]) {
      expect(sparklinePoints(alts, at)).toEqual(webSparkline(alts, at));
    }
    // By hand: four weeks to 2.25 — the last point is top-right (56, 3), the first bottom-left (0, 19).
    const g = sparklinePoints([0, 1, 2, 2.25], 3);
    expect(g.points.split(" ")[0]).toBe("0,19");
    expect(g.points.split(" ")[3]).toBe("56,3");
    expect(g.cx).toBe(56);
    expect(g.cy).toBe(3);
    // A flat start (every altitude 0) draws along the bottom and divides by 1, not 0.
    expect(sparklinePoints([0, 0, 0], 2)).toEqual({ points: "0,19 28,19 56,19", cx: 56, cy: 19 });
    // A dot asked for past the end sits on the baseline, never NaN.
    expect(sparklinePoints([0, 1], 5).cy).toBe(19);
  });

  it("the edge light: inset-x-10 / inset-y-10, 3 px, radius 3, the glow 0 0 18px 4px at 60% in the hue at 60% lightness, the bar at 62%", () => {
    expect(EXIT_EDGE_THICKNESS).toBe(3);
    expect(EXIT_EDGE_INSET).toBe(40);
    expect(EXIT_EDGE_RADIUS).toBe(3);
    expect(EXIT_GLOW_BLUR).toBe(18);
    expect(EXIT_GLOW_SPREAD).toBe(4);
    expect(EXIT_GLOW_LIGHTNESS).toBe(60);
    expect(EXIT_GLOW_ALPHA).toBe(0.6);
    expect(TONE_LIGHTNESS).toBe(62);
    expect(exitEdgePlacement("up")).toEqual({ top: 0, left: 40, right: 40, height: 3 });
    expect(exitEdgePlacement("down")).toEqual({ bottom: 0, left: 40, right: 40, height: 3 });
    expect(exitEdgePlacement("right")).toEqual({ right: 0, top: 40, bottom: 40, width: 3 });
    expect(focusTone("training", 72)).toBe(pillarColor("training", 72, 62));
    expect(exitEdgeGlow("fuel", 40)).toBe(pillarColor("fuel", 40, 60, 0.6));
    expect(exitEdgeShadow("mind", 80)).toEqual([{ offsetX: 0, offsetY: 0, blurRadius: 18, spreadDistance: 4, color: pillarColor("mind", 80, 60, 0.6) }]);
    // The glow is translucent and the bar is not.
    expect(exitEdgeGlow("mind", 80)).toMatch(/^hsla\(/);
    expect(focusTone("mind", 80)).toMatch(/^hsl\(/);
  });

  it("the pulse is Tailwind's: 2 s, to half, on cubic-bezier(0.4, 0, 0.6, 1)", () => {
    expect(EXIT_PULSE_MS).toBe(2000);
    expect(EXIT_PULSE_LOW).toBe(0.5);
    expect(EXIT_PULSE_EASING).toEqual([0.4, 0, 0.6, 1]);
  });

  it("the whisper: 12 px, 45%, `Becoming: …` or the subject's name", () => {
    expect(WHISPER_FONT_SIZE).toBe(12);
    expect(WHISPER_ALPHA).toBe(0.45);
    expect(identityWhisper("Someone who shows up", "training")).toBe("Becoming: Someone who shows up");
    expect(identityWhisper(null, "training")).toBe("a training week");
    expect(identityWhisper(undefined, "fuel")).toBe("a fuel week");
    expect(identityWhisper("", "mind")).toBe("a mind week");
    expect(identityWhisper(null, "all")).toBe("the whole system");
    expect(identityWhisper(null, "empty")).toBe("a quiet week");
  });
});
