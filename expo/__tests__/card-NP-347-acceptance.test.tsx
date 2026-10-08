/* eslint-disable import/first */
// NP-347 — BECOMING STAGE (iOS): THE FULL OPENING IS NEVER SEEN; THE STAGE
// APPEARS ALREADY LANDED.
//
// Review of NP-204 on build 763bc68b (beta, 10/8), the iOS simulator: on the
// first open of the week the stage slid in already focused on the live week,
// and ~0.5 s later the bottom line read "swipe to move through your weeks ·
// pinch out for the line" — the hint set only when the FULL opening
// finishes. So the hold and the fly (title, fog, 0.3× spread, tilt, the line
// drawing itself, the click into place) had run, and had never been on
// screen. The S23 and the web play it. The cause: a native-stack push mounts
// the route BEFORE the slide, the opening was clocked by `setTimeout`s from
// mount, and on iOS the main thread stays busy mounting fifty card views and
// the Skia surface long enough for both beats to elapse behind the transition.
//
// What this suite proves:
//   • `useScreenShown` answers false until the navigator's `transitionEnd`
//     with `closing: false`, ignores the closing one, latches, falls back
//     after a bounded wait, and works with no navigator at all;
//   • the stage mounts in the opening's FIRST FRAME (the spread under the
//     fog, tilted, the line undrawn) and its first beat waits for BOTH the
//     screen being shown and its canvas laying out — in either order — with
//     no timer running and no weekly flag written meanwhile;
//   • once on screen the full opening plays whole (title → fly → focus and
//     the hint), the short one too, and the flag lands when the beat starts;
//   • a touch during the wait cuts an opening that never started and writes
//     nothing; Reduce Motion landing then cuts it too; no opening never waits;
//   • the screen asks at its OWN mount and hands the answer to the stage, so
//     a push that ended before the journey arrived still counts.
//
// What it cannot prove is the hold and the fly being SEEN: that is the
// device pass, on the simulator and on a real iPhone.

const mockBack = jest.fn();
const mockNavListeners: ((e: { data?: { closing?: boolean } }) => void)[] = [];
// The navigator the screen asks (`useScreenShown`): ONE object, like the real
// one (its identity is what the hook subscribes against); a test emits
// `transitionEnd` itself.
const mockNavigation = {
  addListener: (event: string, handler: (e: { data?: { closing?: boolean } }) => void) => {
    if (event === "transitionEnd") mockNavListeners.push(handler);
    return () => {
      const i = mockNavListeners.indexOf(handler);
      if (i >= 0) mockNavListeners.splice(i, 1);
    };
  },
};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
  useNavigation: () => mockNavigation,
}));
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({ user: { id: "member-1" }, token: "test-jwt", loading: false, isAuthed: true }),
}));
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import fs from "node:fs";
import path from "node:path";
import React from "react";
import { AccessibilityInfo, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, waitFor, within, type RenderResult } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView, State, type TapGesture } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { apiFetch } from "@become/api-client";
import { cardSize, layoutWeeks } from "@become/core";
import { JourneyStage, type JourneyStageProps } from "@/components/becoming/journey/JourneyStage";
import {
  INTRO_FLY_MS,
  INTRO_HOLD_MS,
  INTRO_SPREAD_SCALE,
  INTRO_TILT_DEG,
  SHORT_INTRO_FOG,
  SHORT_INTRO_MS,
  SHORT_INTRO_SCALE,
  openingPose,
  weekKeyOfToday,
} from "@/lib/becoming/stage";
import { resetIntroSession, resolveIntroKind } from "@/lib/becoming/storage";
import { SCREEN_SHOWN_FALLBACK_MS, useScreenShown, type ShownNavigator } from "@/lib/navigation/useScreenShown";
import BecomingScreen from "../app/(app)/becoming";
import { journeyWith, yearOfWeeks } from "../test-support/becomingFixtures";
/* eslint-enable import/first */

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
const POSITIONS = layoutWeeks(WEEKS, SIZE);
/** The weekly flag `markIntroShown` writes and `resolveIntroKind` reads as "seen this week". */
const INTRO_FLAG = `becoming.intro.v2.${weekKeyOfToday(JOURNEY.todayKey)}`;
const FULL_HINT = "swipe to move through your weeks · pinch out for the line";

type Instance = ReturnType<RenderResult["getByTestId"]>;

/** One flat style object out of RN's nested style arrays. */
function flat(node: { props: { style?: unknown } }): Record<string, unknown> {
  return Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
}
const transformOf = (node: Instance, key: string): unknown =>
  (flat(node).transform as Record<string, unknown>[] | undefined)?.find((t) => key in t)?.[key];

type Reduce = { restore: () => void };
function mockReduceMotion(initial: boolean): Reduce {
  const read = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(() => Promise.resolve(initial));
  const sub = jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(() => ({ remove: () => {} }) as never);
  return {
    restore: () => {
      read.mockRestore();
      sub.mockRestore();
    },
  };
}

const NOOP = { onClose: jest.fn(), onDetails: jest.fn(), onNavigate: jest.fn() };

function stageElement(props: Partial<JourneyStageProps>) {
  return (
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <JourneyStage data={JOURNEY} introKind="none" {...NOOP} {...props} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** The stage, plus `setProps(next)`: the same element with some props changed — `shown`, as the screen flips it. */
function renderStage(props: Partial<JourneyStageProps> = {}) {
  const u = render(stageElement(props));
  const setProps = (next: Partial<JourneyStageProps>) => act(() => u.rerender(stageElement({ ...props, ...next })));
  return { ...u, setProps };
}

const mode = (u: RenderResult) => u.getByTestId("journey-stage").props.accessibilityValue.text as string;
/** What the opening is doing: the stage says so in a hidden view, like `journey-landed-*`. */
const phase = (u: RenderResult): string => {
  for (const p of ["waiting", "hold", "fly", "done"]) if (u.queryByTestId(`journey-intro-${p}`)) return p;
  return "?";
};

const LAYOUT = { nativeEvent: { layout: { x: 0, y: 0, width: WINDOW.width, height: WINDOW.height } } };
/** The Skia canvas has laid out — the stage's own signal. RNTL lays nothing out, so the prop is called as the native view would. */
function layoutCanvas(u: RenderResult) {
  act(() => {
    u.getByTestId("skia-Canvas").props.onLayout(LAYOUT);
  });
}
/** The gesture surface, laid out in the same commit as the canvas, reports the same beat. */
function layoutSurface(u: RenderResult) {
  act(() => {
    u.getByTestId("journey-gesture-surface").props.onLayout(LAYOUT);
  });
}
/** The navigator's `transitionEnd`, as native-stack emits it, to whoever subscribed through expo-router. */
function emitTransitionEnd(closing = false) {
  act(() => {
    mockNavListeners.forEach((h) => h({ data: { closing } }));
  });
}
/** A touch on the stage, through Gesture Handler's own tap. */
function tapAt(x: number, y: number) {
  act(() => {
    fireGestureHandler<TapGesture>(getByGestureTestId("journey-tap"), [
      { state: State.BEGAN, x, y },
      { state: State.ACTIVE, x, y },
      { state: State.END, x, y },
    ]);
  });
}
/** Let the storage writes (promises, no timers — a few hops deep) settle without touching the fake clock. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });

let reduce: Reduce;
beforeEach(async () => {
  await AsyncStorage.clear();
  resetIntroSession();
  mockNavListeners.length = 0;
  reduce = mockReduceMotion(false);
});
afterEach(() => {
  reduce.restore();
  jest.useRealTimers();
});

// ─── 1. the screen's half: useScreenShown ─────────────────────────────────────

function Probe({ navigation, fallbackMs }: { navigation?: ShownNavigator | null; fallbackMs?: number }) {
  const shown = useScreenShown({ navigation, fallbackMs });
  return <View testID={shown ? "probe-shown" : "probe-waiting"} />;
}

function fakeNavigator() {
  const handlers: ((e: { data?: { closing?: boolean } }) => void)[] = [];
  const nav: ShownNavigator = {
    addListener: (_event, handler) => {
      handlers.push(handler);
      return () => {
        const i = handlers.indexOf(handler);
        if (i >= 0) handlers.splice(i, 1);
      };
    },
  };
  const emit = (closing: boolean) =>
    act(() => {
      handlers.forEach((h) => h({ data: { closing } }));
    });
  return { nav, handlers, emit };
}

describe("useScreenShown: the screen is on screen once the navigator says its push has ended", () => {
  it("is false at mount, ignores the CLOSING transition, flips on `transitionEnd` (closing: false) and latches", () => {
    jest.useFakeTimers();
    const n = fakeNavigator();
    const u = render(<Probe navigation={n.nav} />);
    expect(u.getByTestId("probe-waiting")).toBeTruthy();
    expect(n.handlers).toHaveLength(1);
    n.emit(true);
    expect(u.getByTestId("probe-waiting")).toBeTruthy();
    n.emit(false);
    expect(u.getByTestId("probe-shown")).toBeTruthy();
    // Latched: the listener and the fallback are gone, and nothing flips it back.
    expect(n.handlers).toHaveLength(0);
    act(() => {
      jest.advanceTimersByTime(SCREEN_SHOWN_FALLBACK_MS * 2);
    });
    expect(u.getByTestId("probe-shown")).toBeTruthy();
  });

  it("falls back after a bounded wait when the event never comes — long enough for any push, short enough not to hold a silent host", () => {
    // A push is ~350 ms on both platforms (`screenAnimation.ts`); the simulator can be slower.
    expect(SCREEN_SHOWN_FALLBACK_MS).toBeGreaterThanOrEqual(1000);
    expect(SCREEN_SHOWN_FALLBACK_MS).toBeLessThanOrEqual(2000);
    jest.useFakeTimers();
    const n = fakeNavigator();
    const u = render(<Probe navigation={n.nav} />);
    act(() => {
      jest.advanceTimersByTime(SCREEN_SHOWN_FALLBACK_MS - 1);
    });
    expect(u.getByTestId("probe-waiting")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(u.getByTestId("probe-shown")).toBeTruthy();
    expect(n.handlers).toHaveLength(0);
  });

  it("with no navigator at all (jest, a screen outside a native stack) only the fallback applies, and the fallback is tunable", () => {
    jest.useFakeTimers();
    const u = render(<Probe navigation={null} fallbackMs={300} />);
    expect(u.getByTestId("probe-waiting")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(u.getByTestId("probe-shown")).toBeTruthy();
  });

  it("by default it is expo-router's navigator that is asked", () => {
    jest.useFakeTimers();
    const u = render(<Probe />);
    expect(mockNavListeners).toHaveLength(1);
    expect(u.getByTestId("probe-waiting")).toBeTruthy();
    emitTransitionEnd(false);
    expect(u.getByTestId("probe-shown")).toBeTruthy();
    expect(mockNavListeners).toHaveLength(0);
  });
});

// ─── 2. the stage's half: the opening waits for both signals ──────────────────

describe("the full opening waits for the stage to be on screen, in its first frame, with nothing clocked", () => {
  it("mounts in the opening's first frame — the spread under the fog, tilted, the line undrawn, no title — and lets the clock run out without moving", async () => {
    jest.useFakeTimers();
    const u = renderStage({ introKind: "full", shown: false });
    expect(mode(u)).toBe("intro");
    expect(phase(u)).toBe("waiting");
    expect(u.queryByTestId("journey-title")).toBeNull();
    expect(u.queryByTestId("journey-counter")).toBeNull();

    // The camera sits where the hold begins: 0.3× over the start card, offset as the web's `s0` pose, tilted 2.5°, under full fog.
    const pose = openingPose("full", POSITIONS[LIVE], WINDOW.width, WINDOW.height);
    expect(pose.s).toBe(INTRO_SPREAD_SCALE);
    const world = u.getByTestId("journey-world");
    expect(transformOf(world, "scale")).toBeCloseTo(INTRO_SPREAD_SCALE, 6);
    expect(transformOf(world, "translateX")).toBeCloseTo(pose.s * (WINDOW.width / 2 - pose.x), 6);
    expect(transformOf(world, "translateY")).toBeCloseTo(pose.s * (WINDOW.height / 2 - pose.y), 6);
    expect(transformOf(u.getByTestId("journey-tilt"), "rotate")).toBe(`${INTRO_TILT_DEG}deg`);
    expect(flat(u.getByTestId("journey-fog")).opacity).toBe(1);
    // The line has not drawn itself: every solid segment ends at 0.
    const solid = within(u.getByTestId("skia-Canvas"))
      .getAllByTestId("skia-Path")
      .filter((p) => p.props.end !== undefined);
    expect(solid.length).toBeGreaterThan(0);
    for (const p of solid) expect(p.props.end.value).toBe(0);
    // The start card breathes under its glow while it waits, as it does through the hold.
    expect(u.getByTestId("journey-intro-glow")).toBeTruthy();

    // The whole opening's worth of time passes: nothing has started.
    act(() => {
      jest.advanceTimersByTime(INTRO_HOLD_MS + INTRO_FLY_MS + 500);
    });
    expect(mode(u)).toBe("intro");
    expect(phase(u)).toBe("waiting");
    expect(u.queryByTestId("journey-title")).toBeNull();
    expect(u.queryByTestId("journey-counter")).toBeNull();
    expect(u.queryByTestId("journey-hint")).toBeNull();
    // …and the weekly flag has not been written: this member has not seen the opening.
    await flush();
    expect(await AsyncStorage.getItem(INTRO_FLAG)).toBeNull();
    expect(await resolveIntroKind({ todayKey: JOURNEY.todayKey })).toBe("full");
  });

  it("the canvas laying out is not enough on its own; shown + laid out starts the hold, writes the flag, then plays the fly into focus with the hint", async () => {
    jest.useFakeTimers();
    const u = renderStage({ introKind: "full", shown: false });
    layoutCanvas(u);
    expect(phase(u)).toBe("waiting");
    act(() => {
      jest.advanceTimersByTime(INTRO_HOLD_MS + INTRO_FLY_MS + 500);
    });
    expect(phase(u)).toBe("waiting");
    expect(await AsyncStorage.getItem(INTRO_FLAG)).toBeNull();

    // The screen's push ends: the hold starts NOW — the title is up, the flag lands.
    u.setProps({ shown: true });
    expect(mode(u)).toBe("intro");
    expect(phase(u)).toBe("hold");
    const title = u.getByTestId("journey-title");
    expect(within(title).getByText("Who am I becoming?")).toBeTruthy();
    expect(within(title).getByText(`“${JOURNEY.identity}”`)).toBeTruthy();
    await flush();
    expect(await AsyncStorage.getItem(INTRO_FLAG)).toBe("1");

    // The hold runs its full length on screen, then the fly, then the stage is the member's.
    act(() => {
      jest.advanceTimersByTime(INTRO_HOLD_MS - 10);
    });
    expect(phase(u)).toBe("hold");
    act(() => {
      jest.advanceTimersByTime(20);
    });
    expect(phase(u)).toBe("fly");
    expect(mode(u)).toBe("intro");
    expect(u.queryByTestId("journey-title")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(INTRO_FLY_MS + 100);
    });
    expect(phase(u)).toBe("done");
    expect(mode(u)).toBe("focus");
    expect(u.getByTestId("journey-counter").props.children).toBe(`Week ${WEEKS.length} of ${WEEKS.length}`);
    expect(u.getByTestId("journey-hint").props.children).toBe(FULL_HINT);
    expect(u.getByTestId(`journey-landed-${LIVE}`)).toBeTruthy();
    expect(u.queryByTestId("journey-intro-glow")).toBeNull();
  });

  it("…and in the other order: shown first, the canvas later — the canvas's layout is what starts it", () => {
    jest.useFakeTimers();
    // A host that passes nothing is "shown" (the default), and the canvas alone gates the opening.
    const u = renderStage({ introKind: "full" });
    expect(phase(u)).toBe("waiting");
    expect(u.queryByTestId("journey-title")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(INTRO_HOLD_MS + INTRO_FLY_MS + 500);
    });
    expect(phase(u)).toBe("waiting");
    layoutCanvas(u);
    expect(phase(u)).toBe("hold");
    expect(u.getByTestId("journey-title")).toBeTruthy();
    // Beat by beat: the fly's timer is only set once the hold's state change has rendered.
    act(() => {
      jest.advanceTimersByTime(INTRO_HOLD_MS + 10);
    });
    expect(phase(u)).toBe("fly");
    act(() => {
      jest.advanceTimersByTime(INTRO_FLY_MS + 100);
    });
    expect(mode(u)).toBe("focus");
    expect(u.getByTestId("journey-hint").props.children).toBe(FULL_HINT);
  });

  it("the gesture surface — laid out in the same commit as the canvas — reports the same beat, so a dropped prop can never leave the opening waiting", () => {
    jest.useFakeTimers();
    const u = renderStage({ introKind: "full" });
    expect(phase(u)).toBe("waiting");
    layoutSurface(u);
    expect(phase(u)).toBe("hold");
  });

  it("the short opening waits the same way, in its 0.7 zoom under the lighter fog, and plays whole once on screen", async () => {
    jest.useFakeTimers();
    const u = renderStage({ introKind: "short", shown: false });
    expect(mode(u)).toBe("intro");
    expect(phase(u)).toBe("waiting");
    expect(u.queryByTestId("journey-title")).toBeNull();
    const pose = openingPose("short", POSITIONS[LIVE], WINDOW.width, WINDOW.height);
    expect([pose.s, pose.fog, pose.tilt, pose.draw]).toEqual([SHORT_INTRO_SCALE, SHORT_INTRO_FOG, 0, 1]);
    expect(transformOf(u.getByTestId("journey-world"), "scale")).toBeCloseTo(SHORT_INTRO_SCALE, 6);
    expect(flat(u.getByTestId("journey-fog")).opacity).toBe(SHORT_INTRO_FOG);
    expect(transformOf(u.getByTestId("journey-tilt"), "rotate")).toBe("0deg");
    act(() => {
      jest.advanceTimersByTime(SHORT_INTRO_MS * 3);
    });
    expect(phase(u)).toBe("waiting");
    await flush();
    expect(await AsyncStorage.getItem(INTRO_FLAG)).toBeNull();

    layoutCanvas(u);
    u.setProps({ shown: true });
    expect(phase(u)).toBe("fly");
    expect(u.queryByTestId("journey-title")).toBeNull();
    await flush();
    expect(await AsyncStorage.getItem(INTRO_FLAG)).toBe("1");
    act(() => {
      jest.advanceTimersByTime(SHORT_INTRO_MS + 50);
    });
    expect(mode(u)).toBe("focus");
    expect(phase(u)).toBe("done");
    // The short opening sets no hint; the bottom line is the default for the focused card.
    expect(u.getByTestId("journey-hint").props.children).not.toBe(FULL_HINT);
  });
});

describe("an opening that never started", () => {
  it("a touch during the wait cuts it to focus and writes NO flag — the member gets the opening next time", async () => {
    jest.useFakeTimers();
    const u = renderStage({ introKind: "full", shown: false });
    expect(phase(u)).toBe("waiting");
    tapAt(300, 600);
    expect(mode(u)).toBe("focus");
    expect(phase(u)).toBe("done");
    expect(u.queryByTestId("journey-title")).toBeNull();
    expect(u.getByTestId("journey-counter").props.children).toBe(`Week ${WEEKS.length} of ${WEEKS.length}`);
    expect(u.getByTestId(`journey-landed-${LIVE}`)).toBeTruthy();
    await flush();
    expect(await AsyncStorage.getItem(INTRO_FLAG)).toBeNull();
    expect(await resolveIntroKind({ todayKey: JOURNEY.todayKey })).toBe("full");
    // Being shown afterwards does not start what was cut.
    layoutCanvas(u);
    u.setProps({ shown: true });
    expect(mode(u)).toBe("focus");
    expect(phase(u)).toBe("done");
    act(() => {
      jest.advanceTimersByTime(INTRO_HOLD_MS + INTRO_FLY_MS + 500);
    });
    expect(mode(u)).toBe("focus");
    expect(await AsyncStorage.getItem(INTRO_FLAG)).toBeNull();
  });

  it("Reduce Motion landing during the wait cuts it too, with no flag", async () => {
    reduce.restore();
    reduce = mockReduceMotion(true);
    jest.useFakeTimers();
    const u = renderStage({ introKind: "full", shown: false });
    await flush();
    expect(mode(u)).toBe("focus");
    expect(phase(u)).toBe("done");
    expect(u.queryByTestId("journey-title")).toBeNull();
    expect(await AsyncStorage.getItem(INTRO_FLAG)).toBeNull();
  });

  it("no opening never waits: the stage is the member's at once, shown or not", () => {
    jest.useFakeTimers();
    const u = renderStage({ introKind: "none", shown: false });
    expect(mode(u)).toBe("focus");
    expect(phase(u)).toBe("done");
    expect(u.getByTestId(`journey-landed-${LIVE}`)).toBeTruthy();
    expect(u.getByTestId("journey-counter").props.children).toBe(`Week ${WEEKS.length} of ${WEEKS.length}`);
    expect(transformOf(u.getByTestId("journey-world"), "scale")).toBeCloseTo(1, 6);
    expect(flat(u.getByTestId("journey-fog")).opacity).toBe(0);
  });
});

// ─── 3. the screen wires it ───────────────────────────────────────────────────

describe("the screen asks its navigator at its own mount and hands the answer to the stage", () => {
  const mockApiFetch = apiFetch as unknown as jest.Mock;

  function renderScreen() {
    return render(
      <GestureHandlerRootView>
        <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
          <BecomingScreen />
        </SafeAreaProvider>
      </GestureHandlerRootView>,
    );
  }

  // Fake timers here too: the hook's fallback is a real clock, and a slow CI
  // worker must not be able to flip `shown` under an assertion.
  it("the stage waits for the push to end AND its canvas; the opening then starts and the flag lands", async () => {
    jest.useFakeTimers();
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(JOURNEY);
    const u = renderScreen();
    // Subscribed at the screen's mount — while the journey is still loading.
    expect(mockNavListeners).toHaveLength(1);
    await waitFor(() => expect(u.getByTestId("journey-stage")).toBeTruthy());
    expect(mode(u)).toBe("intro");
    expect(phase(u)).toBe("waiting");
    expect(u.queryByTestId("journey-title")).toBeNull();
    layoutCanvas(u);
    expect(phase(u)).toBe("waiting");
    emitTransitionEnd(false);
    expect(phase(u)).toBe("hold");
    expect(u.getByTestId("journey-title")).toBeTruthy();
    await flush();
    expect(await AsyncStorage.getItem(INTRO_FLAG)).toBe("1");
  });

  it("a push that ended before the journey arrived still counts: the answer is latched at the screen", async () => {
    jest.useFakeTimers();
    mockApiFetch.mockReset();
    let resolveJourney: (j: typeof JOURNEY) => void = () => {};
    mockApiFetch.mockImplementation(
      () =>
        new Promise((res) => {
          resolveJourney = res;
        }),
    );
    const u = renderScreen();
    expect(u.getByTestId("journey-loading")).toBeTruthy();
    emitTransitionEnd(false);
    expect(mockNavListeners).toHaveLength(0);
    // The screen has asked for the journey (its cache read is a promise or two deep) and is still waiting on it.
    await flush();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(u.getByTestId("journey-loading")).toBeTruthy();
    await act(async () => {
      resolveJourney(JOURNEY);
    });
    await waitFor(() => expect(u.getByTestId("journey-stage")).toBeTruthy());
    expect(phase(u)).toBe("waiting");
    layoutCanvas(u);
    expect(phase(u)).toBe("hold");
    expect(u.getByTestId("journey-title")).toBeTruthy();
  });

  it("the wiring, in the source: the screen passes `shown`, and the stage writes the weekly flag from its two beats only", () => {
    const screen = fs.readFileSync(path.join(EXPO_DIR, "app/(app)/becoming.tsx"), "utf8");
    expect(screen).toMatch(/const shown = useScreenShown\(\)/);
    expect(screen).toMatch(/shown=\{shown\}/);
    const stage = fs.readFileSync(path.join(EXPO_DIR, "components/becoming/journey/JourneyStage.tsx"), "utf8");
    // The hold (full) and the short opening's fly — never at mount.
    expect(stage.match(/markIntroShown\(data\.todayKey\)/g)).toHaveLength(2);
    expect(stage).toMatch(/introPhase !== "hold"\) return;[\s\S]*?markIntroShown\(data\.todayKey\)/);
    expect(stage).toMatch(/introKind === "short"\) \{[\s\S]*?markIntroShown\(data\.todayKey\)/);
    // The phase on screen is derived, not stored: no effect sets it.
    expect(stage).toMatch(/const introPhase: IntroPhase = introBeat !== "done" && !onScreen \? "waiting" : introBeat;/);
    expect(stage).not.toMatch(/setIntroPhase/);
  });
});
