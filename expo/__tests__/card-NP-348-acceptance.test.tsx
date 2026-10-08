/* eslint-disable import/first */
// NP-348 — BECOMING STAGE: THE OPENING PLAYS ON THE CACHED JOURNEY AND THE
// CARD CHANGES UNDER IT.
//
// Review of NP-204 on build 763bc68b (beta, 10/8): `becoming.tsx` painted the
// same-WEEK cache first and the stage mounted — and started its opening — on
// it. The cache had been written on an earlier day of the week, so on the S23
// the live card read "1 down, 2 to go · day 3 of 7" with Tuesday's highlights
// on Wednesday until the fresh payload landed ~23 s in and the focused card's
// content changed in place; on the iOS simulator the stale card showed for
// ~0.3 s during the push. The web never shows a stale journey.
//
// What this suite proves:
//   • `sameDay` is today's LOCAL day and nothing looser (a same-week cache is
//     not a same-day cache); `sameJourney` is deep equality;
//   • a cache from yesterday + a fresh fetch → the loading state while the
//     fetch is out (yesterday's card is never on screen), then the stage
//     mounts ONCE, on the fresh data, with its opening decided on it;
//   • a cache from yesterday + a fetch that fails → the stage mounts once,
//     on the cache (the offline fallback), not on the error;
//   • today's cache with an opening due → the stage still waits for the
//     fetch and mounts once, on the fresh data: the opening never runs on
//     data that is about to be replaced;
//   • today's cache with no opening due (a second open this session) → it is
//     painted at once, before the fetch; an identical fresh payload leaves
//     it alone, a differing one refreshes it in place, and the stage is
//     never remounted;
//   • in the source, the screen no longer paints on `sameWeek`.

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
// The REAL stage, counted: every mount records the journey and the opening it
// mounted with; every render records the journey object it was handed.
type StageMount = { todayKey: string; introKind: string; liveDays: number };
type StageRender = { todayKey: string; data: unknown };
const mockStageMounts: StageMount[] = [];
const mockStageRenders: StageRender[] = [];
jest.mock("@/components/becoming/journey/JourneyStage", () => {
  const ReactActual = jest.requireActual("react");
  const actual = jest.requireActual("@/components/becoming/journey/JourneyStage");
  const Counted = ReactActual.forwardRef(function CountedStage(
    props: { data: { todayKey: string; weeks: { daysElapsed: number }[] }; introKind: string },
    ref: unknown,
  ) {
    mockStageRenders.push({ todayKey: props.data.todayKey, data: props.data });
    const live = props.data.weeks[props.data.weeks.length - 1];
    // A mount is a mount: recorded once, for the props it mounted with.
    ReactActual.useEffect(() => {
      mockStageMounts.push({ todayKey: props.data.todayKey, introKind: props.introKind, liveDays: live?.daysElapsed ?? -1 });
    }, []);
    return ReactActual.createElement(actual.JourneyStage, { ...props, ref });
  });
  return { __esModule: true, ...actual, JourneyStage: Counted };
});

import fs from "node:fs";
import path from "node:path";
import React from "react";
import { AccessibilityInfo } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, waitFor, within, type RenderResult } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { apiFetch } from "@become/api-client";
import type { JourneyPayload, WeekSnapshot } from "@/lib/becoming/types";
import {
  localDayKey,
  markIntroShown,
  readBecomingCache,
  resetIntroSession,
  sameDay,
  sameJourney,
  sameWeek,
  writeBecomingCache,
} from "@/lib/becoming/storage";
import BecomingScreen from "../app/(app)/becoming";
import { journeyWith, yearOfWeeks } from "../test-support/becomingFixtures";
/* eslint-enable import/first */

const EXPO_DIR = path.resolve(__dirname, "..");
const mockApiFetch = apiFetch as unknown as jest.Mock;
const MEMBER = "member-1";

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};

// ─── the calendar ────────────────────────────────────────────────────────────
// The clock is pinned to Wednesday 7 October 2026, noon, local time. The live
// week is the one that starts on Sunday the 4th; the cache under review was
// written on Tuesday the 6th — the same week, a day behind.
const NOW = new Date(2026, 9, 7, 12, 0, 0);
const TODAY = "2026-10-07";
const YESTERDAY = "2026-10-06";
const LIVE_SUNDAY = "2026-10-04";

const WEEKS = yearOfWeeks(52, "2025-10-12");
const LIVE = WEEKS[WEEKS.length - 1]!;

/** The year of weeks, with the live week on its `days`th day and saying `headline`. */
function weeksAt(days: number, headline: string): WeekSnapshot[] {
  return WEEKS.map((w) => (w.isCurrent ? { ...w, daysElapsed: days, headline } : w));
}

/** Tuesday's journey: day 3, two to go. */
const CACHE_YESTERDAY: JourneyPayload = journeyWith(weeksAt(3, "1 down, 2 to go"), { todayKey: YESTERDAY });
/** Wednesday's journey, as the server has it now: day 4, one to go. */
const FRESH: JourneyPayload = journeyWith(weeksAt(4, "2 down, 1 to go"), { todayKey: TODAY });
/** Wednesday's journey as cached by an earlier open today — before the second workout was logged. */
const CACHE_TODAY: JourneyPayload = journeyWith(weeksAt(4, "1 down, 2 to go"), { todayKey: TODAY });

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ─── harness ─────────────────────────────────────────────────────────────────

function renderScreen() {
  return render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <BecomingScreen />
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );
}

/** The live card's headline, as rendered. */
const liveHeadline = (u: RenderResult): string =>
  within(u.getByTestId(`week-card-${LIVE.weekKey}`)).getByTestId("week-card-headline").props.children as string;

/** A fetch the test resolves (or rejects) itself. */
function pendingFetch() {
  let resolve: (j: JourneyPayload) => void = () => {};
  let reject: (e: Error) => void = () => {};
  mockApiFetch.mockImplementation(
    () =>
      new Promise<JourneyPayload>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
  );
  return {
    resolve: (j: JourneyPayload) =>
      act(async () => {
        resolve(j);
      }),
    reject: (e: Error) =>
      act(async () => {
        reject(e);
      }),
  };
}

/** Let promise chains (no timers) settle without touching the fake clock. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });

let reduceMotion: jest.SpyInstance;
beforeEach(async () => {
  jest.useFakeTimers({ now: NOW });
  await AsyncStorage.clear();
  resetIntroSession();
  mockApiFetch.mockReset();
  mockStageMounts.length = 0;
  mockStageRenders.length = 0;
  reduceMotion = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(() => Promise.resolve(false));
});
afterEach(() => {
  reduceMotion.mockRestore();
  jest.useRealTimers();
});

// ─── 1. the day, not the week ────────────────────────────────────────────────

describe("sameDay: a cache is today's only when its todayKey is today's local day", () => {
  it("is the local calendar day", () => {
    expect(localDayKey(NOW)).toBe(TODAY);
    expect(localDayKey(new Date(2026, 0, 5, 23, 59, 59))).toBe("2026-01-05");
    expect(sameDay(TODAY, NOW)).toBe(true);
    expect(sameDay(YESTERDAY, NOW)).toBe(false);
    expect(sameDay("2026-10-08", NOW)).toBe(false);
    expect(sameDay("", NOW)).toBe(false);
  });

  it("is stricter than sameWeek: yesterday's cache is this week's, and still not today's", () => {
    expect(sameWeek(YESTERDAY, NOW)).toBe(true);
    expect(sameDay(YESTERDAY, NOW)).toBe(false);
    expect(sameWeek(TODAY, NOW)).toBe(true);
    expect(sameDay(TODAY, NOW)).toBe(true);
  });

  it("the cache read is the same-week one — the offline fallback — not the same-day one", async () => {
    await writeBecomingCache(MEMBER, CACHE_YESTERDAY);
    expect((await readBecomingCache(MEMBER))?.todayKey).toBe(YESTERDAY);
  });
});

describe("sameJourney: two journeys that would paint the same stage", () => {
  it("is deep equality — the same reference, a JSON clone; not a changed headline", () => {
    expect(sameJourney(FRESH, FRESH)).toBe(true);
    expect(sameJourney(FRESH, clone(FRESH))).toBe(true);
    expect(sameJourney(CACHE_TODAY, FRESH)).toBe(false);
    expect(sameJourney(FRESH, { ...FRESH, identity: "someone else" })).toBe(false);
  });
});

// ─── 2. the stage mounts once, on the settled journey ────────────────────────

describe("a cache from yesterday is never painted; the stage mounts once, on the fresh data", () => {
  it("shows the loading state while the fetch is out — not Tuesday's card — then mounts the stage once, on Wednesday's journey, with the opening decided on it", async () => {
    await writeBecomingCache(MEMBER, CACHE_YESTERDAY);
    const fetch = pendingFetch();
    const u = renderScreen();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    await flush();

    // The cache was read and set aside: nothing of it is on screen.
    expect(u.getByTestId("journey-loading")).toBeTruthy();
    expect(u.queryByTestId("journey-stage")).toBeNull();
    expect(u.queryByText("This week · day 3 of 7")).toBeNull();
    expect(mockStageMounts).toHaveLength(0);
    expect(mockStageRenders).toHaveLength(0);

    await fetch.resolve(FRESH);
    await waitFor(() => expect(u.getByTestId("journey-stage")).toBeTruthy());

    // One mount, on the fresh journey, with the full opening (first open this week).
    expect(mockStageMounts).toEqual([{ todayKey: TODAY, introKind: "full", liveDays: 4 }]);
    expect(mockStageRenders.length).toBeGreaterThan(0);
    expect(mockStageRenders.every((r) => r.todayKey === TODAY)).toBe(true);
    expect(liveHeadline(u)).toBe("2 down, 1 to go");
    expect(u.getByText("This week · day 4 of 7")).toBeTruthy();
    expect(u.queryByText("This week · day 3 of 7")).toBeNull();
    expect(u.queryByTestId("journey-loading")).toBeNull();

    // The cache now holds today's journey for the next open.
    await flush();
    expect((await readBecomingCache(MEMBER))?.todayKey).toBe(TODAY);
  });

  it("when the fetch fails, yesterday's cache is the offline fallback: the stage mounts once, on it, not on the error", async () => {
    await writeBecomingCache(MEMBER, CACHE_YESTERDAY);
    const fetch = pendingFetch();
    const u = renderScreen();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    await flush();
    expect(u.getByTestId("journey-loading")).toBeTruthy();
    expect(mockStageMounts).toHaveLength(0);

    await fetch.reject(new Error("Network request failed"));
    await waitFor(() => expect(u.getByTestId("journey-stage")).toBeTruthy());
    expect(mockStageMounts).toEqual([{ todayKey: YESTERDAY, introKind: "full", liveDays: 3 }]);
    expect(liveHeadline(u)).toBe("1 down, 2 to go");
    expect(u.queryByText("Couldn't load your Becoming")).toBeNull();
    expect(u.queryByText("Network request failed")).toBeNull();
  });

  it("with no cache at all, a failed fetch is the error, as before", async () => {
    mockApiFetch.mockRejectedValue(new Error("Network request failed"));
    const u = renderScreen();
    expect(await u.findByText("Couldn't load your Becoming")).toBeTruthy();
    expect(await u.findByText("Network request failed")).toBeTruthy();
    expect(mockStageMounts).toHaveLength(0);
  });
});

describe("today's cache", () => {
  it("with an opening due, the stage still waits for the fetch and mounts once, on the fresh data — the opening never runs on data about to be replaced", async () => {
    await writeBecomingCache(MEMBER, CACHE_TODAY);
    const fetch = pendingFetch();
    const u = renderScreen();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    await flush();
    expect(u.getByTestId("journey-loading")).toBeTruthy();
    expect(mockStageMounts).toHaveLength(0);
    expect(mockStageRenders).toHaveLength(0);

    await fetch.resolve(FRESH);
    await waitFor(() => expect(u.getByTestId("journey-stage")).toBeTruthy());
    expect(mockStageMounts).toEqual([{ todayKey: TODAY, introKind: "full", liveDays: 4 }]);
    expect(mockStageRenders.every((r) => r.data === mockStageRenders[0]!.data)).toBe(true);
    expect(liveHeadline(u)).toBe("2 down, 1 to go");
  });

  it("with the short opening due (seen this week), the same: the stage waits, and mounts once on the fresh data", async () => {
    await AsyncStorage.setItem(`becoming.intro.v2.${LIVE_SUNDAY}`, "1");
    await writeBecomingCache(MEMBER, CACHE_TODAY);
    const fetch = pendingFetch();
    const u = renderScreen();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    await flush();
    expect(u.getByTestId("journey-loading")).toBeTruthy();
    expect(mockStageMounts).toHaveLength(0);

    await fetch.resolve(FRESH);
    await waitFor(() => expect(u.getByTestId("journey-stage")).toBeTruthy());
    expect(mockStageMounts).toEqual([{ todayKey: TODAY, introKind: "short", liveDays: 4 }]);
    expect(liveHeadline(u)).toBe("2 down, 1 to go");
  });

  it("with NO opening due (a second open this session), it is painted at once, before the fetch; an identical fresh payload leaves it alone", async () => {
    // The opening already started on screen earlier this session.
    await markIntroShown(TODAY);
    await writeBecomingCache(MEMBER, CACHE_TODAY);
    const fetch = pendingFetch();
    const u = renderScreen();

    // The stage is up on today's cache while the fetch is still out.
    await waitFor(() => expect(u.getByTestId("journey-stage")).toBeTruthy());
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockStageMounts).toEqual([{ todayKey: TODAY, introKind: "none", liveDays: 4 }]);
    expect(liveHeadline(u)).toBe("1 down, 2 to go");
    const painted = mockStageRenders[0]!.data;

    // The server agrees with the cache: nothing is replaced — the stage keeps the very object it mounted with.
    await fetch.resolve(clone(CACHE_TODAY));
    await flush();
    expect(mockStageMounts).toHaveLength(1);
    expect(mockStageRenders.every((r) => r.data === painted)).toBe(true);
    expect(liveHeadline(u)).toBe("1 down, 2 to go");
  });

  it("…and a fresh payload that differs refreshes the landed stage in place: no remount, today's data", async () => {
    await markIntroShown(TODAY);
    await writeBecomingCache(MEMBER, CACHE_TODAY);
    const fetch = pendingFetch();
    const u = renderScreen();
    await waitFor(() => expect(u.getByTestId("journey-stage")).toBeTruthy());
    expect(mockStageMounts).toEqual([{ todayKey: TODAY, introKind: "none", liveDays: 4 }]);
    const painted = mockStageRenders[0]!.data;

    await fetch.resolve(FRESH);
    await waitFor(() => expect(liveHeadline(u)).toBe("2 down, 1 to go"));
    expect(mockStageMounts).toHaveLength(1);
    expect(mockStageRenders[mockStageRenders.length - 1]!.data).not.toBe(painted);
    expect(mockStageRenders[mockStageRenders.length - 1]!.todayKey).toBe(TODAY);
    await flush();
    expect((await readBecomingCache(MEMBER))?.weeks[WEEKS.length - 1]?.headline).toBe("2 down, 1 to go");
  });
});

// ─── 3. the source ───────────────────────────────────────────────────────────

describe("the wiring, in the source", () => {
  it("the screen paints on sameDay, never on sameWeek; the journey and its opening are one state", () => {
    const screen = fs.readFileSync(path.join(EXPO_DIR, "app/(app)/becoming.tsx"), "utf8");
    expect(screen).not.toMatch(/sameWeek\(/);
    expect(screen).toMatch(/sameDay\(cached\.todayKey\)/);
    expect(screen).toMatch(/useState<\{ data: JourneyPayload; introKind: IntroKind \} \| null>/);
    // The cache read itself stays the same-week one: that is the offline fallback.
    const storage = fs.readFileSync(path.join(EXPO_DIR, "lib/becoming/storage.ts"), "utf8");
    expect(storage).toMatch(/sameWeek\(parsed\.todayKey\)/);
  });
});
