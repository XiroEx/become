/* eslint-disable import/first */
// THE BECOMING STAGE, NATIVELY (NP-204).
//
// The web's journey stage — the intro fly-in, drag steering between cards
// along the path, the snap, and the pinch-out overview with month ticks and
// the aggregate line — on Reanimated, Gesture Handler and Skia. What jest can
// prove about it:
//
//   • a week sits where the web puts it: every card slot's position is
//     `@become/core`'s `layoutWeeks` (the copy of the web's layout) for the
//     same viewport, and the world layer's transform is the camera;
//   • the gestures decide what the web's do — a drag along the path that goes
//     far enough lands on the next card, a short one snaps back, a pinch out
//     opens the overview and a tap on a far card flies to it — driven through
//     Gesture Handler's own `fireGestureHandler`, so the real pan/pinch/tap
//     callbacks run, not a re-statement of them;
//   • the chrome: prev/next/today, the zoom toggle, the counter, the overview
//     HUD with month ticks and the aggregate line;
//   • Reduce Motion skips the intro and animations: the stage opens in focus
//     with no title, every camera move is a zero-duration timing, and the
//     landing haptic is not asked for;
//   • the screen mounts the stage over the journey it fetches and opens the
//     details sheet from a card.
//
// What it cannot prove is the frame rate: that is the device pass.

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({ user: { id: "member-1" }, token: "test-jwt", loading: false, isAuthed: true }),
}));
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import React from "react";
import { AccessibilityInfo } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  GestureHandlerRootView,
  State,
  type PanGesture,
  type PinchGesture,
  type TapGesture,
} from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import * as Reanimated from "react-native-reanimated";
import { apiFetch } from "@become/api-client";
import { aggregate, cardSize, layoutWeeks, monthTicks } from "@become/core";
import { JourneyStage, type JourneyStageHandle } from "@/components/becoming/journey/JourneyStage";
import { INTRO_FLY_MS, INTRO_HOLD_MS, sinceLabel, thinTicks } from "@/lib/becoming/stage";
import { resetIntroSession } from "@/lib/becoming/storage";
import BecomingScreen from "../app/(app)/becoming";
import { journeyWith, yearOfWeeks } from "../test-support/becomingFixtures";
/* eslint-enable import/first */

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};
// jest-expo's window: what `useWindowDimensions` answers, so what the stage lays out for.
const WINDOW = { width: 750, height: 1334 };

const WEEKS = yearOfWeeks(52);
const JOURNEY = journeyWith(WEEKS);
const LIVE = WEEKS.length - 1;
const HORIZON = WEEKS.length;

type Reduce = { restore: () => void; emit: (value: boolean) => void };
function mockReduceMotion(initial: boolean): Reduce {
  const listeners: ((v: boolean) => void)[] = [];
  const read = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(() => Promise.resolve(initial));
  const sub = jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((event: string, handler: unknown) => {
    if (event === "reduceMotionChanged") listeners.push(handler as (v: boolean) => void);
    return { remove: () => {} } as never;
  });
  return {
    restore: () => {
      read.mockRestore();
      sub.mockRestore();
    },
    emit: (value) => act(() => listeners.forEach((l) => l(value))),
  };
}

function renderStage(props: Partial<React.ComponentProps<typeof JourneyStage>> = {}, ref?: React.Ref<JourneyStageHandle>) {
  const onClose = jest.fn();
  const onDetails = jest.fn();
  const onNavigate = jest.fn();
  // The root layout mounts `GestureHandlerRootView`, and so does this: it is
  // what starts Gesture Handler listening for events, the test-fired ones too.
  const utils = render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <JourneyStage
          ref={ref}
          data={JOURNEY}
          introKind="none"
          onClose={onClose}
          onDetails={onDetails}
          onNavigate={onNavigate}
          {...props}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );
  return { ...utils, onClose, onDetails, onNavigate };
}

const counter = (u: ReturnType<typeof render>) => u.getByTestId("journey-counter").props.children;
const mode = (u: ReturnType<typeof render>) => u.getByTestId("journey-stage").props.accessibilityValue.text;

// Gesture Handler's `fireGestureHandler` runs the stage's OWN pan/pinch/tap
// callbacks (the worklets, callable in jest) and the release they hand to JS.
// It dispatches outside React's `act`, so each is wrapped: a release sets state.
function drag(dx: number, dy: number, velocity = 0) {
  act(() => {
    fireGestureHandler<PanGesture>(getByGestureTestId("journey-pan"), [
      { state: State.BEGAN, translationX: 0, translationY: 0, x: 375, y: 667 },
      { state: State.ACTIVE, translationX: dx / 2, translationY: dy / 2, x: 375 + dx / 2, y: 667 + dy / 2 },
      { state: State.ACTIVE, translationX: dx, translationY: dy, x: 375 + dx, y: 667 + dy },
      { state: State.END, translationX: dx, translationY: dy, velocityX: velocity, velocityY: 0, x: 375 + dx, y: 667 + dy },
    ]);
  });
}

function pinch(scale: number) {
  act(() => {
    fireGestureHandler<PinchGesture>(getByGestureTestId("journey-pinch"), [
      { state: State.BEGAN, scale: 1, focalX: 375, focalY: 667 },
      { state: State.ACTIVE, scale: 1, focalX: 375, focalY: 667 },
      { state: State.ACTIVE, scale, focalX: 375, focalY: 667 },
      { state: State.END, scale, focalX: 375, focalY: 667 },
    ]);
  });
}

function tapAt(x: number, y: number) {
  act(() => {
    fireGestureHandler<TapGesture>(getByGestureTestId("journey-tap"), [
      { state: State.BEGAN, x, y },
      { state: State.ACTIVE, x, y },
      { state: State.END, x, y },
    ]);
  });
}

let reduce: Reduce;
beforeEach(async () => {
  await AsyncStorage.clear();
  resetIntroSession();
  reduce = mockReduceMotion(false);
  (Haptics.impactAsync as jest.Mock).mockClear();
});
afterEach(() => {
  reduce.restore();
  jest.useRealTimers();
});

describe("a week sits where the web puts it", () => {
  it("places every card slot at @become/core's layout for this viewport, plus the Horizon one past the last week", () => {
    const u = renderStage();
    const size = cardSize(WINDOW.width, WINDOW.height);
    const positions = layoutWeeks(WEEKS, size);
    expect(positions).toHaveLength(WEEKS.length + 1);
    for (const p of positions) {
      const slot = u.getByTestId(`journey-card-${p.index}`);
      const style = Object.assign({}, ...[slot.props.style].flat(Infinity));
      expect(style.left).toBeCloseTo(p.x - size.w / 2, 6);
      expect(style.top).toBeCloseTo(p.y - size.h / 2, 6);
      expect(style.width).toBe(size.w);
      // The slot IS the web's card box, focused or not (NP-342): a card's
      // height is never left to its content.
      expect(style.height).toBe(size.h);
    }
    expect(positions[HORIZON]!.horizon).toBe(true);
  });

  it("the world layer's transform IS the camera: the focused card's world point sits at the viewport centre", () => {
    const u = renderStage();
    const size = cardSize(WINDOW.width, WINDOW.height);
    const live = layoutWeeks(WEEKS, size)[LIVE]!;
    const world = u.getByTestId("journey-world");
    const style = Object.assign({}, ...[world.props.style].flat(Infinity));
    const t = Object.assign({}, ...style.transform);
    // Scale 1: translate = s * (vw/2 - x), which puts world (x, y) at (vw/2, vh/2).
    expect(t.scale).toBeCloseTo(1, 6);
    expect(t.translateX).toBeCloseTo(WINDOW.width / 2 - live.x, 6);
    expect(t.translateY).toBeCloseTo(WINDOW.height / 2 - live.y, 6);
  });

  it("renders the focus and its neighbours as full cards and the rest of the year as tiles", () => {
    const u = renderStage();
    expect(u.getByTestId(`week-card-${WEEKS[LIVE]!.weekKey}`)).toBeTruthy();
    expect(u.getByTestId(`week-card-${WEEKS[LIVE - 2]!.weekKey}`)).toBeTruthy();
    expect(u.queryByTestId(`week-card-${WEEKS[LIVE - 3]!.weekKey}`)).toBeNull();
    expect(u.getByTestId(`journey-tile-${WEEKS[LIVE - 3]!.weekKey}`)).toBeTruthy();
    expect(u.getByTestId("horizon-card")).toBeTruthy();
    expect(u.getAllByTestId(/^journey-tile-/).length).toBe(WEEKS.length - 3);
  });

  it("draws one marker per card on the Skia canvas, and a month tick where the web does", () => {
    const u = renderStage();
    const canvas = u.getByTestId("skia-Canvas");
    // Each week: its dot and its background ring; the Horizon: a dashed ring. Rings for the live week and the peaks on top.
    const circles = within(canvas).getAllByTestId("skia-Circle");
    expect(circles.length).toBeGreaterThanOrEqual(WEEKS.length * 2 + 1);
    const ticks = thinTicks(monthTicks(WEEKS), WEEKS.length);
    const texts = within(canvas).getAllByTestId("skia-Text").map((t) => t.props.text);
    for (const t of ticks) expect(texts).toContain(t.label);
    expect(texts).toContain("started");
    // A year labels every other month, so not every month is on the line.
    expect(ticks.length).toBeLessThan(monthTicks(WEEKS).length);
  });
});

describe("focus: the finger steers, the buttons step", () => {
  it("opens on the live week with no intro when told so, and the chrome counts", () => {
    const u = renderStage();
    expect(mode(u)).toBe("focus");
    expect(counter(u)).toBe(`Week ${WEEKS.length} of ${WEEKS.length}`);
    expect(u.queryByTestId("journey-title")).toBeNull();
    expect(u.getByTestId("journey-next").props.accessibilityState.disabled).toBe(false);
    expect(u.queryByTestId("journey-today")).toBeNull();
  });

  it("next → Horizon (where next is disabled), prev → back, today → the live week", () => {
    const u = renderStage();
    fireEvent.press(u.getByTestId("journey-next"));
    expect(counter(u)).toBe("Horizon");
    expect(u.getByTestId("journey-next").props.accessibilityState.disabled).toBe(true);
    expect(u.getByTestId("journey-hint").props.children).toBe("written next Sunday · pinch out for the line");
    fireEvent.press(u.getByTestId("journey-prev"));
    fireEvent.press(u.getByTestId("journey-prev"));
    expect(counter(u)).toBe(`Week ${WEEKS.length - 1} of ${WEEKS.length}`);
    expect(u.getByTestId("journey-today")).toBeTruthy();
    fireEvent.press(u.getByTestId("journey-today"));
    expect(counter(u)).toBe(`Week ${WEEKS.length} of ${WEEKS.length}`);
  });

  it("a drag along the path that goes far enough lands on the next card; a short one snaps back", () => {
    const u = renderStage();
    const size = cardSize(WINDOW.width, WINDOW.height);
    const pos = layoutWeeks(WEEKS, size);
    // From the live week, the Horizon is up and to the right: drag the finger
    // left-and-down the whole segment, as the web's hint says ("pull down").
    const seg = { dx: pos[HORIZON]!.x - pos[LIVE]!.x, dy: pos[HORIZON]!.y - pos[LIVE]!.y };
    drag(-seg.dx * 0.6, -seg.dy * 0.6);
    expect(counter(u)).toBe("Horizon");
    // Back on the live week, a nudge is not a swipe.
    fireEvent.press(u.getByTestId("journey-prev"));
    expect(counter(u)).toBe(`Week ${WEEKS.length} of ${WEEKS.length}`);
    drag(-seg.dx * 0.1, -seg.dy * 0.1);
    expect(counter(u)).toBe(`Week ${WEEKS.length} of ${WEEKS.length}`);
  });

  it("a flick commits sooner than a slow drag", () => {
    const u = renderStage();
    const size = cardSize(WINDOW.width, WINDOW.height);
    const pos = layoutWeeks(WEEKS, size);
    const seg = { dx: pos[HORIZON]!.x - pos[LIVE]!.x, dy: pos[HORIZON]!.y - pos[LIVE]!.y };
    drag(-seg.dx * 0.15, -seg.dy * 0.15, 900);
    expect(counter(u)).toBe("Horizon");
  });

  it("a drag against the path navigates nowhere and says which way the line goes", () => {
    const u = renderStage();
    // From the live week the Horizon sits UP and to the right and the week
    // before sits level, so a finger moving straight up (the world moving
    // down) projects onto neither segment: the camera nudges, springs back,
    // and the hint says where the line actually goes.
    const before = counter(u);
    drag(0, -400);
    expect(counter(u)).toBe(before);
    expect(u.getByTestId("journey-hint").props.children).toBe("the line goes up from here · pull down");
  });

  it("a drag that pulls a LOWER previous week in commits like any other step along the path", () => {
    const u = renderStage();
    const size = cardSize(WINDOW.width, WINDOW.height);
    const pos = layoutWeeks(WEEKS, size);
    // Two steps back, the week before sits a full row lower: pushing the world
    // down is along the path there, and far enough to land.
    fireEvent.press(u.getByTestId("journey-prev"));
    fireEvent.press(u.getByTestId("journey-prev"));
    expect(counter(u)).toBe(`Week ${WEEKS.length - 2} of ${WEEKS.length}`);
    const at = WEEKS.length - 3;
    expect(pos[at - 1]!.y).toBeGreaterThan(pos[at]!.y);
    drag(0, -400);
    expect(counter(u)).toBe(`Week ${WEEKS.length - 3} of ${WEEKS.length}`);
  });

  it("tapping a neighbouring card brings it forward; tapping the focused card does nothing", () => {
    const u = renderStage();
    const size = cardSize(WINDOW.width, WINDOW.height);
    const pos = layoutWeeks(WEEKS, size);
    // The previous card's centre, on screen, at scale 1.
    const dx = pos[LIVE - 1]!.x - pos[LIVE]!.x;
    const dy = pos[LIVE - 1]!.y - pos[LIVE]!.y;
    tapAt(WINDOW.width / 2 + dx, WINDOW.height / 2 + dy);
    expect(counter(u)).toBe(`Week ${WEEKS.length - 1} of ${WEEKS.length}`);
    tapAt(WINDOW.width / 2, WINDOW.height / 2);
    expect(counter(u)).toBe(`Week ${WEEKS.length - 1} of ${WEEKS.length}`);
  });

  it("the focused card's own Details button reaches the screen", () => {
    const u = renderStage();
    const card = u.getByTestId(`week-card-${WEEKS[LIVE]!.weekKey}`);
    fireEvent.press(within(card).getByTestId("week-card-details-btn"));
    expect(u.onDetails).toHaveBeenCalledWith(LIVE);
    fireEvent.press(u.getByTestId("journey-close"));
    expect(u.onClose).toHaveBeenCalledTimes(1);
  });

  it("lands with one light haptic", () => {
    const u = renderStage();
    fireEvent.press(u.getByTestId("journey-next"));
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });
});

describe("overview: pinch out for the line", () => {
  it("the zoom button opens the overview with the aggregate line and the HUD, and closes it again", () => {
    const u = renderStage();
    fireEvent.press(u.getByTestId("journey-zoom"));
    expect(mode(u)).toBe("overview");
    expect(counter(u)).toBe(`${WEEKS.length} weeks`);
    const agg = u.getByTestId("journey-aggregate");
    expect(agg.props.children.join("")).toBe(aggregate(WEEKS, "lbs") + sinceLabel(JOURNEY.firstActivity));
    expect(u.getByText("your line · tap a week to open it")).toBeTruthy();
    expect(u.getByText(`“${JOURNEY.identity}”`)).toBeTruthy();
    // Everything is a tile in the overview — every week and the Horizon.
    expect(u.getAllByTestId(/^journey-tile-/).length).toBe(WEEKS.length + 1);
    expect(u.getByTestId("journey-tile-horizon")).toBeTruthy();
    fireEvent.press(u.getByTestId("journey-zoom"));
    expect(mode(u)).toBe("focus");
    expect(counter(u)).toBe(`Week ${WEEKS.length} of ${WEEKS.length}`);
  });

  it("a pinch out enters the overview; a pinch back in lands on the nearest card", () => {
    const u = renderStage();
    pinch(0.3);
    expect(mode(u)).toBe("overview");
    expect(counter(u)).toBe(`${WEEKS.length} weeks`);
    // The overview sits at a few hundredths of scale for a year of weeks, so
    // a pinch has to multiply by a lot to cross back over 0.5.
    pinch(60);
    expect(mode(u)).toBe("focus");
    expect(counter(u)).toMatch(/^Week \d+ of 52$|^Horizon$/);
  });

  it("the imperative handle flies the stage to a week (the details Story screen's jump)", () => {
    const ref = React.createRef<JourneyStageHandle>();
    const u = renderStage({}, ref);
    act(() => ref.current!.focusOn(7));
    expect(counter(u)).toBe(`Week 8 of ${WEEKS.length}`);
    act(() => ref.current!.enterOverview());
    expect(mode(u)).toBe("overview");
  });
});

describe("the intro", () => {
  it("the full opening holds the title, then flies in and hands over to focus", () => {
    jest.useFakeTimers();
    const u = renderStage({ introKind: "full" });
    expect(mode(u)).toBe("intro");
    const title = u.getByTestId("journey-title");
    expect(within(title).getByText("Who am I becoming?")).toBeTruthy();
    expect(within(title).getByText(`“${JOURNEY.identity}”`)).toBeTruthy();
    expect(u.queryByTestId("journey-counter")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(INTRO_HOLD_MS + 10);
    });
    expect(u.queryByTestId("journey-title")).toBeNull();
    expect(mode(u)).toBe("intro");
    act(() => {
      jest.advanceTimersByTime(INTRO_FLY_MS + 100);
    });
    expect(mode(u)).toBe("focus");
    expect(counter(u)).toBe(`Week ${WEEKS.length} of ${WEEKS.length}`);
    expect(u.getByTestId("journey-hint").props.children).toBe("swipe to move through your weeks · pinch out for the line");
  });

  it("any touch skips it", () => {
    jest.useFakeTimers();
    const u = renderStage({ introKind: "full" });
    tapAt(300, 600);
    expect(mode(u)).toBe("focus");
    expect(u.queryByTestId("journey-title")).toBeNull();
    expect(counter(u)).toBe(`Week ${WEEKS.length} of ${WEEKS.length}`);
  });

  it("the short opening has no title and hands over sooner", () => {
    jest.useFakeTimers();
    const u = renderStage({ introKind: "short" });
    expect(mode(u)).toBe("intro");
    expect(u.queryByTestId("journey-title")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(mode(u)).toBe("focus");
  });

  it("a deep link opens on that week", () => {
    const u = renderStage({ initialWeekKey: WEEKS[7]!.weekKey });
    expect(counter(u)).toBe(`Week 8 of ${WEEKS.length}`);
    expect(u.getByTestId(`week-card-${WEEKS[7]!.weekKey}`)).toBeTruthy();
  });
});

describe("Reduce Motion skips the intro and animations", () => {
  it("an opening that is playing when the system answers is cut to focus, with no title", async () => {
    reduce.restore();
    reduce = mockReduceMotion(true);
    jest.useFakeTimers();
    const u = renderStage({ introKind: "full" });
    // The hook's first paint is "full motion"; the real answer lands on the next tick.
    await act(async () => {
      await Promise.resolve();
    });
    expect(mode(u)).toBe("focus");
    expect(u.queryByTestId("journey-title")).toBeNull();
    expect(counter(u)).toBe(`Week ${WEEKS.length} of ${WEEKS.length}`);
  });

  it("every camera move is a zero-duration timing, and the landing haptic is not asked for", async () => {
    reduce.restore();
    reduce = mockReduceMotion(true);
    const timing = jest.spyOn(Reanimated, "withTiming");
    const u = renderStage();
    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    timing.mockClear();
    fireEvent.press(u.getByTestId("journey-next"));
    expect(counter(u)).toBe("Horizon");
    expect(timing).toHaveBeenCalled();
    for (const call of timing.mock.calls) {
      expect((call[1] as { duration?: number } | undefined)?.duration).toBe(0);
    }
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    fireEvent.press(u.getByTestId("journey-zoom"));
    expect(mode(u)).toBe("overview");
    for (const call of timing.mock.calls) {
      expect((call[1] as { duration?: number } | undefined)?.duration).toBe(0);
    }
    timing.mockRestore();
  });

  it("with motion on, a fly has the web's duration and a felt click", async () => {
    const timing = jest.spyOn(Reanimated, "withTiming");
    const spring = jest.spyOn(Reanimated, "withSpring");
    const u = renderStage();
    await act(async () => {
      await Promise.resolve();
    });
    timing.mockClear();
    fireEvent.press(u.getByTestId("journey-next"));
    const durations = timing.mock.calls.map((c) => (c[1] as { duration?: number } | undefined)?.duration);
    expect(durations).toContain(850);
    expect(spring).toHaveBeenCalled();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    timing.mockRestore();
    spring.mockRestore();
  });

  it("flipping the setting mid-session is honoured by the next move", async () => {
    const timing = jest.spyOn(Reanimated, "withTiming");
    const u = renderStage();
    await act(async () => {
      await Promise.resolve();
    });
    reduce.emit(true);
    timing.mockClear();
    fireEvent.press(u.getByTestId("journey-next"));
    for (const call of timing.mock.calls) {
      expect((call[1] as { duration?: number } | undefined)?.duration).toBe(0);
    }
    timing.mockRestore();
  });
});

describe("the screen", () => {
  const mockApiFetch = apiFetch as unknown as jest.Mock;

  it("mounts the stage over the fetched journey and opens the details sheet from a card", async () => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(JOURNEY);
    const u = render(
      <GestureHandlerRootView>
        <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
          <BecomingScreen />
        </SafeAreaProvider>
      </GestureHandlerRootView>,
    );
    await waitFor(() => expect(u.getByTestId("journey-stage")).toBeTruthy());
    // A fresh session, nothing seen this week: the full opening. While it
    // plays the cards take no touches — any touch is "skip".
    expect(mode(u)).toBe("intro");
    expect(u.getByTestId("journey-title")).toBeTruthy();
    tapAt(300, 600);
    expect(mode(u)).toBe("focus");
    const card = u.getByTestId(`week-card-${WEEKS[LIVE]!.weekKey}`);
    fireEvent.press(within(card).getByTestId("week-card-details-btn"));
    await waitFor(() => expect(u.getByTestId("details-tab-story")).toBeTruthy());
  });

  it("with Reduce Motion on, the screen mounts the stage straight into focus", async () => {
    reduce.restore();
    reduce = mockReduceMotion(true);
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(JOURNEY);
    const u = render(
      <GestureHandlerRootView>
        <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
          <BecomingScreen />
        </SafeAreaProvider>
      </GestureHandlerRootView>,
    );
    await waitFor(() => expect(u.getByTestId("journey-stage")).toBeTruthy());
    expect(mode(u)).toBe("focus");
    expect(u.queryByTestId("journey-title")).toBeNull();
  });
});
