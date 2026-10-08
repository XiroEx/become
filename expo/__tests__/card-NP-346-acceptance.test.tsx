// NP-346 — BECOMING STAGE: NO LANDING ANIMATION, NO NEIGHBOUR DIMMING,
// EMPHASIS CHANGES SNAP (native).
//
// Visual + motion review of NP-204 on build 763bc68b (beta, 10/8), the web
// against the S23 and the iOS simulator: four movements the web's stage
// makes that the native one did not.
//
//   1. the LANDING STAGGER — when the camera settles on a card (`landed`) the
//      web fades and slides its content in row by row (opacity 0 → 1, y 12
//      → 0, 60 ms apart, 420 ms each, ease [0.16, 1, 0.3, 1]); native drew
//      it fully throughout;
//   2. NEIGHBOUR DIMMING — brightness(.55) one card from the focus, .4 two
//      away, in focus mode only; native neighbours were full brightness. The
//      card allows an overlay rather than a filter, and that is what this is;
//   3. EMPHASIS TRANSITIONS — opacity / scale / dimming ease over 500 ms on
//      CSS's `ease`; native snapped them;
//   4. the INTRO's BREATHING GLOW on the start card — violet-400/25, a rem
//      past the card, blurred, pulsing.
//
// What this suite proves: each is on the rendered stage with the web's
// numbers (held pure in `lib/becoming/stageMotion.ts`), driven by the
// stage's own `landed` / `focus` state, and every one is skipped under
// Reduce Motion — read at mount or flipped live. The Reanimated mock
// evaluates an animated style at render and runs a timing to its end at
// once, so a test that reads a settled value re-renders first (`settle`);
// what it cannot see — frames — is the device pass.

import fs from "node:fs";
import path from "node:path";
import React from "react";
import { AccessibilityInfo } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, waitFor, within, type RenderResult } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Reanimated from "react-native-reanimated";
import { cardSize, layoutWeeks } from "@become/core";
import { JourneyStage, type JourneyStageHandle, type JourneyStageProps } from "@/components/becoming/journey/JourneyStage";
import { HorizonCard, WeekCard } from "@/components/becoming/WeekCard";
import { EXIT_PULSE_EASING, EXIT_PULSE_LOW, EXIT_PULSE_MS } from "@/lib/becoming/focusedCard";
import { HORIZON_RADIUS } from "@/lib/becoming/horizonCard";
import { PULSE_EASING, PULSE_LOW, PULSE_MS } from "@/lib/becoming/pulse";
import { journeySignals } from "@/lib/becoming/signals";
import { FLY_MS, INTRO_FLY_MS, INTRO_HOLD_MS, cardEmphasis } from "@/lib/becoming/stage";
import {
  BREATHING_SCALE,
  CARD_RADIUS,
  EMPHASIS_EASING,
  EMPHASIS_MS,
  FAR_BRIGHTNESS,
  HORIZON_CARD_ROW,
  INTRO_GLOW_ALPHA,
  INTRO_GLOW_BLUR,
  INTRO_GLOW_INSET,
  INTRO_GLOW_RADIUS,
  LANDING_EASING,
  LANDING_MS,
  LANDING_RISE,
  LANDING_STAGGER_MS,
  NEIGHBOUR_BRIGHTNESS,
  WEEK_CARD_ROW,
  introGlowShadow,
  landingAnimates,
  landingDelay,
  landingProgress,
  neighbourBrightness,
  neighbourDim,
} from "@/lib/becoming/stageMotion";
import { resetIntroSession } from "@/lib/becoming/storage";
import { becomingStageTokens, rgbOf } from "@/lib/theme/tokens";
import { journeyWith, yearOfWeeks } from "../test-support/becomingFixtures";

const EXPO_DIR = path.resolve(__dirname, "..");

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
const HORIZON = WEEKS.length;
const SIGNALS = journeySignals(WEEKS, { unit: JOURNEY.unit, direction: JOURNEY.target?.direction ?? null });
const POSITIONS = layoutWeeks(WEEKS, SIZE);

/** The web's `stagger(i)`, by hand, so the module cannot drift from it. */
const webStagger = (i: number) => ({ delay: 0.06 * i, duration: 0.42, ease: [0.16, 1, 0.3, 1] as const });

type Instance = ReturnType<RenderResult["getByTestId"]>;
type Timing = { duration?: number; easing?: unknown };

/** One flat style object out of RN's nested style arrays. */
function flat(node: { props: { style?: unknown } }): Record<string, unknown> {
  return Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
}

/** A host node's host children, in order, with composite wrappers flattened out. */
function hostKids(node: Instance): Instance[] {
  return node.children.flatMap((c) => (typeof c === "string" ? [] : typeof c.type === "string" ? [c] : hostKids(c)));
}

const translateY = (node: Instance): number | undefined =>
  (flat(node).transform as { translateY?: number }[] | undefined)?.find((t) => "translateY" in t)?.translateY;
const scaleOf = (node: Instance): number | undefined =>
  (flat(node).transform as { scale?: number }[] | undefined)?.find((t) => "scale" in t)?.scale;

const NOOP = { onClose: jest.fn(), onDetails: jest.fn(), onNavigate: jest.fn() };

function stageElement(props: Partial<JourneyStageProps>, ref?: React.Ref<JourneyStageHandle>) {
  return (
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <JourneyStage ref={ref} data={JOURNEY} introKind="none" {...NOOP} {...props} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * The stage, plus `settle()`: the Reanimated mock evaluates `useAnimatedStyle`
 * at render and `withTiming` lands at once, so the render that STARTS a
 * change shows the value before it; one more render shows the value after.
 * (A FRESH element each time — React skips a re-render of the very same one.)
 */
function renderStage(props: Partial<JourneyStageProps> = {}, ref?: React.Ref<JourneyStageHandle>) {
  const u = render(stageElement(props, ref));
  const settle = () => act(() => u.rerender(stageElement(props, ref)));
  return { ...u, settle };
}

/**
 * A bare card, plus the same `settle()`. `WeekCard` is memoised, so the
 * factory is handed a fresh callback each time — the stage's inline
 * `onDetails` does the same there — or the re-render would be skipped.
 */
function renderCard(make: (fresh: { onNavigate: () => void }) => React.ReactElement) {
  const u = render(make({ onNavigate: () => {} }));
  const settle = () => act(() => u.rerender(make({ onNavigate: () => {} })));
  return { ...u, settle };
}

const mode = (u: RenderResult): string => u.getByTestId("journey-stage").props.accessibilityValue.text;
const card = (u: RenderResult, i: number): Instance => u.getByTestId(`week-card-${WEEKS[i]!.weekKey}`);
const slot = (u: RenderResult, i: number): Instance => u.getByTestId(`journey-card-${i}`);
const dimOf = (u: RenderResult, i: number): Instance => within(slot(u, i)).getByTestId("journey-card-dim");

/** The rows a rendered week card has, in the web's order, with their row numbers. */
function weekRows(c: Instance): { row: number; node: Instance }[] {
  const q = (id: string) => within(c).queryByTestId(id);
  const body = within(c).getByTestId("week-card-body");
  const kids = hostKids(body);
  // The nudge's row is the block of the column that holds the button (the button itself is inside it).
  const nudgeRow = kids.find((k, i) => i > 0 && k.props.testID == null && within(k).queryByTestId("week-card-nudge") != null) ?? null;
  const out: { row: number; node: Instance | null }[] = [
    { row: WEEK_CARD_ROW.eyebrow, node: kids[0]! },
    { row: WEEK_CARD_ROW.headline, node: q("week-card-headline") },
    { row: WEEK_CARD_ROW.sub, node: q("week-card-sub") },
    { row: WEEK_CARD_ROW.highlights, node: q("week-card-highlights") },
    { row: WEEK_CARD_ROW.nudge, node: nudgeRow },
    { row: WEEK_CARD_ROW.wins, node: q("week-card-wins") },
    { row: WEEK_CARD_ROW.steps, node: q("week-card-steps") },
    { row: WEEK_CARD_ROW.footer, node: kids[kids.length - 1]! },
  ];
  return out.filter((r): r is { row: number; node: Instance } => r.node != null);
}

/** The Horizon's rows: the eyebrow, the kicker, the identity, "what writes it", the footer line. */
function horizonRows(c: Instance): { row: number; node: Instance }[] {
  const body = within(c).getByTestId("horizon-card-body");
  const kids = hostKids(body);
  const words = hostKids(kids[1]!);
  const out: { row: number; node: Instance | null }[] = [
    { row: HORIZON_CARD_ROW.eyebrow, node: kids[0]! },
    { row: HORIZON_CARD_ROW.kicker, node: words[0]! },
    { row: HORIZON_CARD_ROW.identity, node: within(c).getByTestId("horizon-card-identity") },
    { row: HORIZON_CARD_ROW.writes, node: within(c).queryByTestId("horizon-writes") },
    { row: HORIZON_CARD_ROW.footer, node: within(c).getByText("Written next Sunday from what you do this week.") },
  ];
  return out.filter((r): r is { row: number; node: Instance } => r.node != null);
}

const durations = (spy: jest.SpyInstance): (number | undefined)[] => spy.mock.calls.map((c) => (c[1] as Timing | undefined)?.duration);

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
  jest.useRealTimers();
});

/** The setting flips while the stage is open: the system's listeners fire, and its next answer is the new one. */
const flipReduce = (value: boolean) => {
  reduceRead.mockImplementation(() => Promise.resolve(value));
  act(() => {
    for (const cb of reduceListeners) cb(value);
  });
};

// ─── 1. the landing stagger ─────────────────────────────────────────────────

describe("the landing stagger: a card's content assembles row by row once the camera settles on it", () => {
  it("the numbers are the web's `stagger(i)`: 60 ms apart, 420 ms each, ease [0.16, 1, 0.3, 1], twelve points of rise", () => {
    expect(LANDING_STAGGER_MS).toBe(60);
    expect(LANDING_MS).toBe(420);
    expect(LANDING_EASING).toEqual([0.16, 1, 0.3, 1]);
    expect(LANDING_RISE).toBe(12);
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const web = webStagger(i);
      expect(landingDelay(i)).toBeCloseTo(web.delay * 1000, 6);
      expect(LANDING_MS).toBe(web.duration * 1000);
      expect(LANDING_EASING).toEqual(web.ease);
    }
    // The web's row numbers: eyebrow 0 … identity row 7; the Horizon's eyebrow 0 … footer 4.
    expect(WEEK_CARD_ROW).toEqual({ eyebrow: 0, headline: 1, sub: 2, highlights: 3, nudge: 4, wins: 5, steps: 6, footer: 7 });
    expect(HORIZON_CARD_ROW).toEqual({ eyebrow: 0, kicker: 1, identity: 2, writes: 3, footer: 4 });
  });

  it("the rule: landed shows, not landed hides, no stage or Reduce Motion simply draws — and only the first two animate", () => {
    expect(landingProgress(true, false)).toBe(1);
    expect(landingProgress(false, false)).toBe(0);
    expect(landingProgress(undefined, false)).toBe(1);
    expect(landingProgress(null, false)).toBe(1);
    for (const landed of [true, false, null, undefined]) expect(landingProgress(landed, true)).toBe(1);
    expect(landingAnimates(true, false)).toBe(true);
    expect(landingAnimates(false, false)).toBe(true);
    expect(landingAnimates(undefined, false)).toBe(false);
    expect(landingAnimates(null, false)).toBe(false);
    for (const landed of [true, false, null, undefined]) expect(landingAnimates(landed, true)).toBe(false);
  });

  it("a landed week card brings every row up and in, in the web's order, 60 ms apart, over 420 ms on the web's curve", () => {
    const delay = jest.spyOn(Reanimated, "withDelay");
    const timing = jest.spyOn(Reanimated, "withTiming");
    const bezier = jest.spyOn(Reanimated.Easing, "bezier");
    const u = renderCard((fresh) => (
      <WeekCard {...fresh} week={WEEKS[LIVE]!} signals={SIGNALS[LIVE]!} next={JOURNEY.next} identity={JOURNEY.identity} totalWeeks={WEEKS.length} landed width={SIZE.w} height={SIZE.h} />
    ));
    const rows = weekRows(u.getByTestId(`week-card-${WEEKS[LIVE]!.weekKey}`));
    // The live card ends on the steps, so it banks no wins; its first row is the eyebrow and its last the identity row.
    const numbers = rows.map((r) => r.row);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(numbers[0]).toBe(WEEK_CARD_ROW.eyebrow);
    expect(numbers).toContain(WEEK_CARD_ROW.headline);
    expect(numbers).toContain(WEEK_CARD_ROW.steps);
    expect(numbers[numbers.length - 1]).toBe(WEEK_CARD_ROW.footer);
    expect(numbers).not.toContain(WEEK_CARD_ROW.wins);
    expect(u.queryByTestId("week-card-wins")).toBeNull();
    // One delayed timing per row, in tree order, each the web's `delay: 0.06 * i` — a missing block keeps its number, as on the web.
    expect(delay.mock.calls.map((c) => c[0])).toEqual(rows.map((r) => landingDelay(r.row)));
    expect(delay.mock.calls.map((c) => c[0])).toEqual(numbers.map((n) => n * 60));
    expect(timing).toHaveBeenCalledTimes(rows.length);
    for (const call of timing.mock.calls) {
      expect(call[0]).toBe(1);
      expect((call[1] as Timing).duration).toBe(420);
      expect((call[1] as Timing).easing).toBeDefined();
    }
    expect(bezier).toHaveBeenCalledWith(0.16, 1, 0.3, 1);
    // Like the web's `initial`, the rows start down and clear …
    for (const r of rows) {
      expect(flat(r.node).opacity).toBe(0);
      expect(translateY(r.node)).toBe(12);
    }
    // … and are up and in once the timing lands.
    u.settle();
    for (const r of weekRows(u.getByTestId(`week-card-${WEEKS[LIVE]!.weekKey}`))) {
      expect(flat(r.node).opacity).toBe(1);
      expect(translateY(r.node)).toBe(0);
    }
  });

  it("a finished week with words banks them on row 5; the Horizon staggers its five rows the same way", () => {
    const delay = jest.spyOn(Reanimated, "withDelay");
    const withWins = WEEKS.findIndex((w) => !w.isCurrent && (w.mind?.wins?.length ?? 0) > 0);
    expect(withWins).toBeGreaterThanOrEqual(0);
    const u = render(<WeekCard week={WEEKS[withWins]!} signals={SIGNALS[withWins]!} landed width={SIZE.w} height={SIZE.h} />);
    const rows = weekRows(u.getByTestId(`week-card-${WEEKS[withWins]!.weekKey}`));
    expect(rows.map((r) => r.row)).toContain(WEEK_CARD_ROW.wins);
    expect(delay.mock.calls.map((c) => c[0])).toEqual(rows.map((r) => landingDelay(r.row)));

    delay.mockClear();
    const h = render(<HorizonCard identity={JOURNEY.identity} trend="up" next={JOURNEY.next} landed width={SIZE.w} height={SIZE.h} />);
    const hrows = horizonRows(h.getByTestId("horizon-card"));
    expect(hrows.map((r) => r.row)).toEqual([0, 1, 2, 3, 4]);
    expect(delay.mock.calls.map((c) => c[0])).toEqual([0, 60, 120, 180, 240]);
    // The kicker and the identity are still the direct children of their block (NP-344's layout), animated themselves.
    const block = hostKids(within(h.getByTestId("horizon-card")).getByTestId("horizon-card-body"))[1]!;
    expect(hostKids(block).map((k) => k.props.testID ?? k.props.children)).toEqual(["Who am I becoming?", "horizon-card-identity"]);
  });

  it("a card the stage has not landed on keeps its content down and clear; a card mounted bare simply draws it", () => {
    const delay = jest.spyOn(Reanimated, "withDelay");
    const timing = jest.spyOn(Reanimated, "withTiming");
    const u = renderCard((fresh) => <WeekCard {...fresh} week={WEEKS[LIVE - 1]!} signals={SIGNALS[LIVE - 1]!} landed={false} width={SIZE.w} height={SIZE.h} />);
    u.settle();
    const rows = weekRows(u.getByTestId(`week-card-${WEEKS[LIVE - 1]!.weekKey}`));
    expect(rows.length).toBeGreaterThan(2);
    for (const r of rows) {
      expect(flat(r.node).opacity).toBe(0);
      expect(translateY(r.node)).toBe(12);
    }
    for (const call of timing.mock.calls) expect(call[0]).toBe(0);
    expect(delay).toHaveBeenCalledTimes(rows.length);

    delay.mockClear();
    timing.mockClear();
    const bare = render(<WeekCard week={WEEKS[LIVE - 1]!} signals={SIGNALS[LIVE - 1]!} width={SIZE.w} height={SIZE.h} />);
    for (const r of weekRows(bare.getByTestId(`week-card-${WEEKS[LIVE - 1]!.weekKey}`))) {
      expect(flat(r.node).opacity).toBe(1);
      expect(translateY(r.node)).toBe(0);
    }
    expect(delay).not.toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
  });

  it("on the stage it is driven by `landed`: the focused card assembles a beat before the fly ends, its neighbours stay empty frames, and the focus takes it along", () => {
    jest.useFakeTimers();
    const ref = React.createRef<JourneyStageHandle>();
    const u = renderStage({}, ref);
    // No opening: the live week is landed at mount; its neighbours are not.
    expect(u.getByTestId(`journey-landed-${LIVE}`)).toBeTruthy();
    u.settle();
    for (const r of weekRows(card(u, LIVE))) expect(flat(r.node).opacity).toBe(1);
    for (const i of [LIVE - 1, LIVE - 2]) {
      for (const r of weekRows(card(u, i))) {
        expect(flat(r.node).opacity).toBe(0);
        expect(translateY(r.node)).toBe(12);
      }
    }
    // The sky, the ring and the exit-edge light are not rows: the frame is drawn while the content is down.
    expect(within(card(u, LIVE - 1)).getByTestId("week-card-sky")).toBeTruthy();
    expect(flat(card(u, LIVE - 1)).borderWidth).toBeGreaterThan(0);

    // Fly to week 8: nothing is landed while the camera moves …
    act(() => ref.current!.focusOn(7));
    expect(u.getByTestId("journey-landing")).toBeTruthy();
    u.settle();
    for (const r of weekRows(card(u, 7))) expect(flat(r.node).opacity).toBe(0);
    // … the beat lands 120 ms before the fly ends …
    act(() => {
      jest.advanceTimersByTime(FLY_MS - 120);
    });
    expect(u.getByTestId("journey-landed-7")).toBeTruthy();
    u.settle();
    for (const r of weekRows(card(u, 7))) {
      expect(flat(r.node).opacity).toBe(1);
      expect(translateY(r.node)).toBe(0);
    }
    for (const i of [5, 6, 8, 9]) {
      for (const r of weekRows(card(u, i))) expect(flat(r.node).opacity).toBe(0);
    }

    // The Horizon lands the same way.
    act(() => ref.current!.focusOn(HORIZON));
    act(() => {
      jest.advanceTimersByTime(FLY_MS);
    });
    expect(u.getByTestId(`journey-landed-${HORIZON}`)).toBeTruthy();
    u.settle();
    for (const r of horizonRows(u.getByTestId("horizon-card"))) {
      expect(flat(r.node).opacity).toBe(1);
      expect(translateY(r.node)).toBe(0);
    }
  });

  it("Reduce Motion draws every card's content in full, with no stagger — read at mount, or flipped live", async () => {
    // Flipped live: the neighbours' content comes up at once, no timing.
    const timing = jest.spyOn(Reanimated, "withTiming");
    const cancel = jest.spyOn(Reanimated, "cancelAnimation");
    const ref = React.createRef<JourneyStageHandle>();
    const u = renderStage({}, ref);
    await waitFor(() => expect(reduceRead).toHaveBeenCalled());
    u.settle();
    expect(weekRows(card(u, LIVE - 1)).every((r) => flat(r.node).opacity === 0)).toBe(true);
    expect(reduceListeners.length).toBeGreaterThan(0);
    timing.mockClear();
    cancel.mockClear();
    flipReduce(true);
    expect(cancel).toHaveBeenCalled();
    expect(durations(timing)).not.toContain(LANDING_MS);
    u.settle();
    for (const i of [LIVE, LIVE - 1, LIVE - 2]) {
      for (const r of weekRows(card(u, i))) {
        expect(flat(r.node).opacity).toBe(1);
        expect(translateY(r.node)).toBe(0);
      }
    }
    // A fly under the setting: still no stagger, and the new focus's neighbours are drawn in full too.
    timing.mockClear();
    act(() => ref.current!.focusOn(7));
    await act(async () => {});
    expect(durations(timing)).not.toContain(LANDING_MS);
    u.settle();
    for (const i of [6, 7, 8]) for (const r of weekRows(card(u, i))) expect(flat(r.node).opacity).toBe(1);
    u.unmount();

    // Read as on at mount: the hook's first paint is full motion for a tick,
    // then the answer lands and every row is cut to drawn.
    reduceRead.mockImplementation(() => Promise.resolve(true));
    const v = renderStage();
    await waitFor(() => expect(reduceRead).toHaveBeenCalled());
    await act(async () => {});
    v.settle();
    for (const i of [LIVE, LIVE - 1, LIVE - 2]) for (const r of weekRows(card(v, i))) expect(flat(r.node).opacity).toBe(1);
    timing.mockClear();
    fireEvent.press(v.getByTestId("journey-next"));
    await act(async () => {});
    expect(durations(timing)).not.toContain(LANDING_MS);
    for (const d of durations(timing)) expect(d).toBe(0);
  });
});

// ─── 2. neighbour dimming ────────────────────────────────────────────────────

describe("neighbour dimming: the cards either side of the focus are darkened so the focused week pops", () => {
  it("the numbers are the web's: brightness(.55) one step away, .4 further, none on the focus, in the opening or the overview", () => {
    expect(NEIGHBOUR_BRIGHTNESS).toBe(0.55);
    expect(FAR_BRIGHTNESS).toBe(0.4);
    expect(neighbourBrightness(10, 10, "focus")).toBe(1);
    expect(neighbourBrightness(11, 10, "focus")).toBe(0.55);
    expect(neighbourBrightness(9, 10, "focus")).toBe(0.55);
    expect(neighbourBrightness(12, 10, "focus")).toBe(0.4);
    expect(neighbourBrightness(30, 10, "focus")).toBe(0.4);
    expect(neighbourBrightness(11, 10, "overview")).toBe(1);
    expect(neighbourBrightness(11, 10, "intro")).toBe(1);
    // The overlay draws it: black at 1 − b over an opaque card multiplies every channel by b.
    expect(neighbourDim(10, 10, "focus")).toBe(0);
    expect(neighbourDim(11, 10, "focus")).toBe(0.45);
    expect(neighbourDim(12, 10, "focus")).toBe(0.6);
    expect(neighbourDim(11, 10, "overview")).toBe(0);
    expect(neighbourDim(11, 10, "intro")).toBe(0);
    expect(1 - neighbourDim(11, 10, "focus")).toBeCloseTo(NEIGHBOUR_BRIGHTNESS, 10);
    expect(1 - neighbourDim(12, 10, "focus")).toBeCloseTo(FAR_BRIGHTNESS, 10);
    // The slot's own emphasis is untouched: far cards still fade to .35 and neighbours still scale to .94.
    expect(cardEmphasis(13, 10, "focus")).toEqual({ compact: true, opacity: 0.35, scale: 0.94, focused: false });
  });

  it("every slot carries a black overlay over its card, under the card's corners, that takes no touches", () => {
    const u = renderStage();
    u.settle();
    for (const p of POSITIONS) {
      const kids = hostKids(slot(u, p.index));
      const dim = kids[kids.length - 1]!;
      expect(dim.props.testID).toBe("journey-card-dim");
      expect(dim.props.pointerEvents).toBe("none");
      const s = flat(dim);
      expect(s.position).toBe("absolute");
      expect([s.top, s.left, s.right, s.bottom]).toEqual([0, 0, 0, 0]);
      expect(s.backgroundColor).toBe(rgbOf(becomingStageTokens.shade));
      expect(s.backgroundColor).toBe("rgb(0 0 0)");
      // 28 on the Horizon card, 24 on a week card and a tile — the card's own radius, read off it.
      const under = kids[kids.length - 2]!;
      expect(s.borderRadius).toBe(p.horizon ? HORIZON_RADIUS : CARD_RADIUS);
      expect(flat(under).borderRadius).toBe(s.borderRadius);
    }
  });

  it("is .45 either side of the focus, .6 further out (tiles too), nothing on the focus — and moves with it", () => {
    const ref = React.createRef<JourneyStageHandle>();
    const u = renderStage({}, ref);
    u.settle();
    expect(flat(dimOf(u, LIVE)).opacity).toBe(0);
    expect(flat(dimOf(u, LIVE - 1)).opacity).toBe(0.45);
    expect(flat(dimOf(u, HORIZON)).opacity).toBe(0.45);
    expect(flat(dimOf(u, LIVE - 2)).opacity).toBe(0.6);
    expect(flat(dimOf(u, LIVE - 3)).opacity).toBe(0.6);
    expect(flat(dimOf(u, 0)).opacity).toBe(0.6);
    for (const p of POSITIONS) expect(flat(dimOf(u, p.index)).opacity).toBe(neighbourDim(p.index, LIVE, "focus"));

    act(() => ref.current!.focusOn(7));
    u.settle();
    expect(flat(dimOf(u, 7)).opacity).toBe(0);
    expect(flat(dimOf(u, 6)).opacity).toBe(0.45);
    expect(flat(dimOf(u, 8)).opacity).toBe(0.45);
    expect(flat(dimOf(u, 5)).opacity).toBe(0.6);
    expect(flat(dimOf(u, LIVE)).opacity).toBe(0.6);
  });

  it("the overview lifts it from every card; the opening never applies it", () => {
    const u = renderStage();
    fireEvent.press(u.getByTestId("journey-zoom"));
    expect(mode(u)).toBe("overview");
    u.settle();
    for (const p of POSITIONS) expect(flat(dimOf(u, p.index)).opacity).toBe(0);
    // In the overview the Horizon is a tile, and its overlay follows the tile's corners.
    expect(flat(dimOf(u, HORIZON)).borderRadius).toBe(flat(u.getByTestId("journey-tile-horizon")).borderRadius);

    jest.useFakeTimers();
    const v = renderStage({ introKind: "full" });
    expect(mode(v)).toBe("intro");
    v.settle();
    for (const i of [LIVE, LIVE - 1, LIVE - 2, HORIZON]) expect(flat(dimOf(v, i)).opacity).toBe(0);
  });
});

// ─── 3. emphasis transitions ─────────────────────────────────────────────────

describe("emphasis transitions: opacity, scale and dimming ease between focus states instead of snapping", () => {
  it("the numbers are the web's: 500 ms on CSS's `ease` — cubic-bezier(0.25, 0.1, 0.25, 1), not Reanimated's ease-in", () => {
    expect(EMPHASIS_MS).toBe(500);
    expect(EMPHASIS_EASING).toEqual([0.25, 0.1, 0.25, 1]);
    expect(BREATHING_SCALE).toBe(1.03);
  });

  it("a step to the next card runs the old focus down to .94 and .45 dim, and the new one up, as 500 ms timings", async () => {
    const timing = jest.spyOn(Reanimated, "withTiming");
    const u = renderStage();
    await act(async () => {});
    timing.mockClear();
    fireEvent.press(u.getByTestId("journey-next"));
    const calls = timing.mock.calls.map((c) => [c[0], (c[1] as Timing | undefined)?.duration] as [unknown, number | undefined]);
    // The live week, now one step from the focus: scale .94, dimmed .45. The Horizon, now the focus: scale 1, dim 0.
    expect(calls).toContainEqual([0.94, EMPHASIS_MS]);
    expect(calls).toContainEqual([0.45, EMPHASIS_MS]);
    expect(calls).toContainEqual([1, EMPHASIS_MS]);
    expect(calls).toContainEqual([0, EMPHASIS_MS]);
    // The week two back leaves the full set: it fades to .35 and dims to .6.
    expect(calls).toContainEqual([0.35, EMPHASIS_MS]);
    expect(calls).toContainEqual([0.6, EMPHASIS_MS]);
    for (const call of timing.mock.calls) {
      if ((call[1] as Timing | undefined)?.duration === EMPHASIS_MS) expect((call[1] as Timing).easing).toBeDefined();
    }
    // The camera's own fly is still the web's 850 ms.
    expect(durations(timing)).toContain(FLY_MS);
    // Settled, the slots wear the emphasis they eased to.
    u.settle();
    expect(scaleOf(slot(u, LIVE))).toBe(0.94);
    expect(flat(slot(u, LIVE)).opacity).toBe(1);
    expect(scaleOf(slot(u, HORIZON))).toBe(1);
    expect(flat(slot(u, LIVE - 2)).opacity).toBe(0.35);
    expect(flat(dimOf(u, LIVE - 2)).opacity).toBe(0.6);
  });

  it("Reduce Motion cuts them: every emphasis timing is zero-duration, read at mount or flipped live", async () => {
    const timing = jest.spyOn(Reanimated, "withTiming");
    const u = renderStage();
    await act(async () => {});
    flipReduce(true);
    timing.mockClear();
    fireEvent.press(u.getByTestId("journey-next"));
    expect(timing).toHaveBeenCalled();
    expect(durations(timing)).not.toContain(EMPHASIS_MS);
    for (const d of durations(timing)) expect(d).toBe(0);
    u.settle();
    expect(scaleOf(slot(u, LIVE))).toBe(0.94);
    expect(flat(dimOf(u, LIVE)).opacity).toBe(0.45);
    u.unmount();

    reduceRead.mockImplementation(() => Promise.resolve(true));
    const v = renderStage();
    await waitFor(() => expect(reduceRead).toHaveBeenCalled());
    await act(async () => {});
    timing.mockClear();
    fireEvent.press(v.getByTestId("journey-zoom"));
    expect(mode(v)).toBe("overview");
    expect(durations(timing)).not.toContain(EMPHASIS_MS);
    for (const d of durations(timing)) expect(d).toBe(0);
  });
});

// ─── 4. the intro's breathing glow ───────────────────────────────────────────

describe("the intro's breathing glow on the start card", () => {
  it("the numbers are the web's: -inset-4, rounded-[40px], violet-400/25, blur-2xl, Tailwind's pulse", () => {
    expect(INTRO_GLOW_INSET).toBe(-16);
    expect(INTRO_GLOW_RADIUS).toBe(40);
    expect(INTRO_GLOW_ALPHA).toBe(0.25);
    expect(INTRO_GLOW_BLUR).toBe(40);
    expect(introGlowShadow("x")).toEqual([{ offsetX: 0, offsetY: 0, blurRadius: 40, spreadDistance: 0, color: "x" }]);
    // violet-400 is `#a78bfa`.
    expect(rgbOf(becomingStageTokens.violet, INTRO_GLOW_ALPHA)).toBe("rgba(167, 139, 250, 0.25)");
    // One `animate-pulse`, shared with the exit-edge light: 2 s, to half, on cubic-bezier(0.4, 0, 0.6, 1).
    expect([PULSE_MS, PULSE_LOW, PULSE_EASING]).toEqual([EXIT_PULSE_MS, EXIT_PULSE_LOW, EXIT_PULSE_EASING]);
    expect([PULSE_MS, PULSE_LOW, PULSE_EASING]).toEqual([2000, 0.5, [0.4, 0, 0.6, 1]]);
  });

  it("sits under the start card while the opening plays, scaled 1.03, pulsing, and is gone — the scale eased back — when the stage is yours", () => {
    jest.useFakeTimers();
    const repeat = jest.spyOn(Reanimated, "withRepeat");
    const timing = jest.spyOn(Reanimated, "withTiming");
    const u = renderStage({ introKind: "full" });
    expect(mode(u)).toBe("intro");
    const glows = u.getAllByTestId("journey-intro-glow");
    expect(glows).toHaveLength(1);
    const s = slot(u, LIVE);
    const kids = hostKids(s);
    // Glow, card, overlay — the card sits on the glow.
    expect(kids.map((k) => k.props.testID)).toEqual(["journey-intro-glow", `week-card-${WEEKS[LIVE]!.weekKey}`, "journey-card-dim"]);
    const g = flat(kids[0]!);
    expect(kids[0]!.props.pointerEvents).toBe("none");
    expect(g.position).toBe("absolute");
    expect([g.top, g.left, g.right, g.bottom]).toEqual([-16, -16, -16, -16]);
    expect(g.borderRadius).toBe(40);
    expect(g.backgroundColor).toBe("rgba(167, 139, 250, 0.25)");
    expect(g.boxShadow).toEqual([{ offsetX: 0, offsetY: 0, blurRadius: 40, spreadDistance: 0, color: "rgba(167, 139, 250, 0.25)" }]);
    expect(scaleOf(s)).toBe(BREATHING_SCALE);
    // The pulse: one loop, forever, of the two halves.
    expect(repeat).toHaveBeenCalledWith(expect.anything(), -1, false);
    expect(timing).toHaveBeenCalledWith(0.5, expect.objectContaining({ duration: 1000 }));

    act(() => {
      jest.advanceTimersByTime(INTRO_HOLD_MS + 10);
    });
    // Still the opening (the fly), still glowing.
    expect(mode(u)).toBe("intro");
    expect(u.getByTestId("journey-intro-glow")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(INTRO_FLY_MS + 100);
    });
    expect(mode(u)).toBe("focus");
    expect(u.queryByTestId("journey-intro-glow")).toBeNull();
    u.settle();
    expect(scaleOf(slot(u, LIVE))).toBe(1);
  });

  it("no opening, no glow; and Reduce Motion landing on an opening cuts it, glow and all", async () => {
    const u = renderStage();
    expect(u.queryByTestId("journey-intro-glow")).toBeNull();
    u.unmount();

    reduceRead.mockImplementation(() => Promise.resolve(true));
    jest.useFakeTimers();
    const v = renderStage({ introKind: "full" });
    expect(v.getByTestId("journey-intro-glow")).toBeTruthy();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mode(v)).toBe("focus");
    expect(v.queryByTestId("journey-intro-glow")).toBeNull();
  });
});

// ─── 5. one pulse, and the rule that travels ─────────────────────────────────

describe("housekeeping", () => {
  it("the exit-edge light and the glow share `usePulse`; the stage and the card still ask about Reduce Motion", () => {
    for (const rel of ["components/becoming/WeekCard.tsx", "components/becoming/journey/JourneyStage.tsx"]) {
      const src = fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");
      expect(src).toMatch(/usePulse\(\)/);
      expect(src).not.toMatch(/withRepeat/);
      expect(src).toMatch(/useReducedMotion|motionDuration/);
    }
    const pulse = fs.readFileSync(path.join(EXPO_DIR, "lib/becoming/pulse.ts"), "utf8");
    expect(pulse).toMatch(/useReducedMotion\(\)/);
    expect(pulse).toMatch(/withRepeat\(/);
  });
});
