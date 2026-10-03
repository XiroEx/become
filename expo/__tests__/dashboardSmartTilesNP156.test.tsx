/* eslint-disable import/first */
// METRIC AND SMART-ROTATING TILES (NP-156).
//
// Two tile kinds come off the server's rotator and had nothing native behind
// them (NP-104 drew placeholders):
//
//   * a METRIC tile — one entry of `metrics[]` from `GET /api/dashboard/tiles`,
//     a number in 1x1 and a line or bar chart in 2x1
//     (`webapp/components/dashboard/TileGrid.tsx#MetricTileCard`);
//   * a SMART-ROTATING tile — a rotating window onto the cards the member has
//     NOT pinned, learning from taps
//     (`webapp/components/dashboard/SmartRotatingTile.tsx` +
//     `webapp/lib/dashboardTiles/smartRotation.ts`).
//
// This suite pins the native port to the same contract:
//
//   1. (e015ca2f) A smart tile rotates at its configured interval
//      (`settings.intervalMs`, one of 4s / 6s / 10s / 30s, defaulting to
//      `DEFAULT_SMART_INTERVAL_MS`) and never shows a card that is already
//      pinned on the grid.
//   2. (e015ca30) Pressing a card records the tap (`POST
//      /api/dashboard/tile-tap { key }`) and the card rises in the rotation —
//      on BOTH apps, which is checked by scoring against the web's own source
//      rather than against a number this file invented.
//
// Plus the metric tile itself: which chart it draws, what it draws it in
// (NP-130 kit colours, light AND dark), and the fact that a chart tile links
// NOWHERE — the web's `/dashboard/insights/[metricId]` drill-in is still a
// placeholder page, so NP-156 renders the data and navigates nowhere.

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com", name: "Jon" },
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import * as fs from "fs";
import * as path from "path";
import React from "react";
import { AccessibilityInfo } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import {
  apiFetch,
  DEFAULT_SMART_INTERVAL_MS,
  SMART_INTERVAL_OPTIONS_MS,
  STAT_TILE_IDS,
  TILE_KEY_REGEX,
  type DashboardMetricSummary,
  type DashboardTile,
  type DashboardTilesResponse,
  type TileEngagement,
} from "@become/api-client";
import { TileGrid } from "@/components/dashboard/TileGrid";
import { SmartRotatingTile } from "@/components/dashboard/SmartRotatingTile";
import {
  MetricTile,
  formatMetricValue,
  metricChartKind,
  metricLatestText,
} from "@/components/dashboard/MetricTile";
import { metricChartValues, sparklinePath } from "@/components/progress/ProgressCharts";
import {
  buildRotationItems,
  DEFAULT_SMART_POOL,
  engagementBoost,
  mergeEngagement,
  pinnedRotationKeys,
  rankedRotationKeys,
  scoreStatTile,
} from "@/lib/dashboard/smartRotation";
import { getTokens, type ThemeMode } from "@/lib/theme/tokens";
import type { DashboardStatData } from "@/lib/dashboard/types";

const EXPO_DIR = path.resolve(__dirname, "..");
const REPO_DIR = path.resolve(EXPO_DIR, "..");

function readRepo(rel: string): string {
  return fs.readFileSync(path.resolve(REPO_DIR, rel), "utf8");
}

const WEB_ROTATION = readRepo("webapp/lib/dashboardTiles/smartRotation.ts");
const WEB_SMART_TILE = readRepo(
  "webapp/components/dashboard/SmartRotatingTile.tsx",
);
const WEB_TILE_GRID = readRepo("webapp/components/dashboard/TileGrid.tsx");

const mockApiFetch = apiFetch as unknown as jest.Mock;

/** The accessibility label the visible card renders, e.g. `Weight: 182.0 lbs, …`. */
function shownLabel(card: { props: { accessibilityLabel?: string } }): string {
  return card.props.accessibilityLabel ?? "";
}

/** Just the card's name — the part before the first colon. */
function shownCard(card: { props: { accessibilityLabel?: string } }): string {
  return shownLabel(card).split(":")[0] ?? "";
}

/** Flush the reduce-motion read (a promise) so no update escapes act(). */
async function settle(): Promise<void> {
  await act(async () => {});
}

/**
 * react-native-svg normalises a `stroke`/`fill` into `{ type, payload }`, where
 * payload is the processed ARGB int — so a token is compared as that int rather
 * than as the `rgb(r g b)` string it was written as.
 */
function tokenArgb(triplet: string): number {
  const [r = 0, g = 0, b = 0] = triplet.split(" ").map(Number);
  return (((0xff << 24) | (r << 16) | (g << 8) | b) >>> 0) as number;
}

function svgColorInt(value: unknown): number | unknown {
  if (value && typeof value === "object" && "payload" in value) {
    return (value as { payload: number }).payload;
  }
  return value;
}

// ─── The fixture: one member, as the native dashboard assembles them ────────

const MEMBER: DashboardStatData = {
  streakDays: 5,
  longestStreak: 9,
  nextMilestone: 7,
  activityToday: true,
  todaysMood: 4,
  recentMoods: [4, 4, 5],
  thisWeekWorkouts: 3,
  weeklyTarget: 3,
  fitnessGoal: "lose_weight",
  nutritionDirection: "lose",
  targetWeightKg: 80,
  startWeightKg: 86,
  latestWeight: 182.5,
  earliestWeight: 190,
  weightUnit: "lbs",
  caloriesConsumed: 1500,
  caloriesGoal: 2000,
  waterCurrent: 40,
  waterGoal: 64,
  totalWorkouts: 64,
  weightEntries: [
    { date: "Sep 28", value: 184.0 },
    { date: "Oct 1", value: 182.5 },
  ],
};

const LINE_METRIC: DashboardMetricSummary = {
  id: "mood-trend",
  label: "Mood Trend",
  unit: "",
  domain: "mindset",
  trendDirection: "up-good",
  latest: { t: "2026-10-03T00:00:00.000Z", value: 4 },
  data: [
    { t: "2026-10-01T00:00:00.000Z", value: 3 },
    { t: "2026-10-02T00:00:00.000Z", value: 3.5 },
    { t: "2026-10-03T00:00:00.000Z", value: 4 },
  ],
};

const BAR_METRIC: DashboardMetricSummary = {
  id: "weekly-volume",
  label: "Weekly Volume",
  unit: "lbs",
  domain: "workout",
  trendDirection: "up-good",
  latest: { t: "2026-10-03T00:00:00.000Z", value: 12500 },
  data: [
    { t: "2026-09-21T00:00:00.000Z", value: 9000 },
    { t: "2026-09-28T00:00:00.000Z", value: 11000 },
    { t: "2026-10-03T00:00:00.000Z", value: 12500 },
  ],
};

const SINGLE_POINT_METRIC: DashboardMetricSummary = {
  id: "sessions",
  label: "Sessions",
  unit: "",
  domain: "workout",
  trendDirection: "neutral",
  latest: { t: "2026-10-03T00:00:00.000Z", value: 12 },
  data: [{ t: "2026-10-03T00:00:00.000Z", value: 12 }],
};

const BROKEN_METRIC: DashboardMetricSummary = {
  id: "strength-curve",
  label: "Strength Curve",
  unit: "lbs",
  domain: "workout",
  trendDirection: "up-good",
  latest: null,
  data: [],
  error: "compute failed",
};

function tilesPayload(
  over: Partial<DashboardTilesResponse> = {},
): DashboardTilesResponse {
  return {
    tiles: [],
    metrics: [],
    suggestions: [],
    engagement: [],
    now: "2026-10-03T12:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  mockPush.mockReset();
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({ success: true });
  // Deterministic: the rotation only runs when the OS is not asking for
  // reduced motion, and one test below flips this on purpose.
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(false);
  colorScheme.set("dark");
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ===========================================================================
// e015ca2f — a smart tile rotates at its configured interval and skips cards
//            already on the grid
// ===========================================================================

describe("e015ca2f: the rotation, its pool and its cadence", () => {
  describe("the pool skips what is already on the grid", () => {
    it("defaults to the eight stat cards and drops every pinned one", () => {
      const layout: DashboardTile[] = [
        { id: "streak", kind: "stat", size: "1x1" },
        { id: "weight", kind: "stat", size: "1x1" },
        { id: "smart", kind: "smart-rotating", size: "2x1" },
      ];
      const pinned = pinnedRotationKeys(layout);
      expect([...pinned].sort()).toEqual(["stat:streak", "stat:weight"]);

      const items = buildRotationItems({
        statData: MEMBER,
        excludeKeys: pinned,
      });
      const keys = items.map((i) => i.key);

      // Nothing pinned is repeated by the smart tile…
      expect(keys).not.toContain("stat:streak");
      expect(keys).not.toContain("stat:weight");
      // …and everything else in the default pool is still eligible.
      const expected = STAT_TILE_IDS.filter(
        (id) => id !== "streak" && id !== "weight",
      ).map((id) => `stat:${id}`);
      expect(keys.slice().sort()).toEqual(expected.slice().sort());
      // Every key is one the tap route will accept.
      for (const key of keys) expect(key).toMatch(TILE_KEY_REGEX);
    });

    it("honours settings.pool, and still subtracts the pinned cards", () => {
      const items = buildRotationItems({
        statData: MEMBER,
        poolKeys: new Set(["stat:water", "stat:weight", "stat:workouts"]),
        excludeKeys: new Set(["stat:weight"]),
      });
      expect(items.map((i) => i.key).sort()).toEqual([
        "stat:water",
        "stat:workouts",
      ]);
    });

    it("rotates metrics only when the pool opts them in, in the server's order", () => {
      const metricIds = ["mood-trend", "weekly-volume", "strength-curve"];

      // Default pool: stats only — exactly the web's DEFAULT_SMART_POOL rule.
      const statsOnly = buildRotationItems({ statData: MEMBER, metricIds });
      expect(statsOnly.some((i) => i.kind === "metric")).toBe(false);
      expect(DEFAULT_SMART_POOL).toEqual(
        STAT_TILE_IDS.map((id) => `stat:${id}`),
      );

      // Opted in (and one of them pinned on the grid, so it is skipped).
      const withMetrics = buildRotationItems({
        statData: MEMBER,
        metricIds,
        poolKeys: new Set([
          "metric:mood-trend",
          "metric:weekly-volume",
          "metric:strength-curve",
        ]),
        excludeKeys: new Set(["metric:weekly-volume"]),
      });
      expect(withMetrics.map((i) => i.key)).toEqual([
        // The server returns metrics in rotator-scored order, so index IS rank.
        "metric:mood-trend",
        "metric:strength-curve",
      ]);
    });

    it("says so, rather than repeating a card, when the whole pool is pinned", async () => {
      const layout: DashboardTile[] = [
        ...STAT_TILE_IDS.map((id) => ({
          id,
          kind: "stat" as const,
          size: "1x1" as const,
        })),
        { id: "smart", kind: "smart-rotating", size: "2x1" },
      ];
      const { getByTestId, getByText } = render(
        <TileGrid layout={layout} statData={MEMBER} />,
      );
      await settle();
      expect(getByTestId("tile-smart")).toBeTruthy();
      expect(getByText("Keep logging — smart tile coming")).toBeTruthy();
    });
  });

  describe("the cadence is the tile's configured interval", () => {
    const POOL = ["stat:streak", "stat:weight", "stat:workouts"];

    // Ranked for MEMBER: weight 0.45 (logged, so not urgent) > streak 0.40
    // (5 days, logged today) > workouts 0.30. Scores come from
    // scoreStatTile — the parity block below ties them to the web's source.
    const EXPECTED_ORDER = ["Weight", "Day Streak", "Total Workouts"];

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-10-03T12:00:00.000Z"));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it.each(SMART_INTERVAL_OPTIONS_MS)(
      "advances one card every %i ms and not a tick sooner",
      async (intervalMs) => {
        const tile: DashboardTile = {
          id: "smart",
          kind: "smart-rotating",
          size: "2x1",
          settings: { pool: POOL, intervalMs },
        };
        const { getByTestId } = render(
          <SmartRotatingTile tile={tile} statData={MEMBER} />,
        );
        await settle();
        const card = () => getByTestId("tile-smart-card");

        expect(shownCard(card())).toBe(EXPECTED_ORDER[0]);

        // One tick short of the interval: still the same card.
        act(() => {
          jest.advanceTimersByTime(intervalMs - 1);
        });
        expect(shownCard(card())).toBe(EXPECTED_ORDER[0]);

        // The interval lands: the next card, then the next, then back round.
        for (const step of [1, 2, 3]) {
          act(() => {
            jest.advanceTimersByTime(step === 1 ? 1 : intervalMs);
          });
          expect(shownCard(card())).toBe(
            EXPECTED_ORDER[step % EXPECTED_ORDER.length],
          );
        }
      },
    );

    it("falls back to the default interval when the tile carries no setting", async () => {
      const tile: DashboardTile = {
        id: "smart",
        kind: "smart-rotating",
        size: "2x1",
        settings: { pool: POOL },
      };
      const { getByTestId } = render(
        <SmartRotatingTile tile={tile} statData={MEMBER} />,
      );
      await settle();
      const card = () => getByTestId("tile-smart-card");

      expect(DEFAULT_SMART_INTERVAL_MS).toBe(6000);
      act(() => {
        jest.advanceTimersByTime(DEFAULT_SMART_INTERVAL_MS - 1);
      });
      expect(shownCard(card())).toBe(EXPECTED_ORDER[0]);
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(shownCard(card())).toBe(EXPECTED_ORDER[1]);
    });

    it("never lands on a pinned card, through three full cycles on the real grid", async () => {
      const layout: DashboardTile[] = [
        { id: "streak", kind: "stat", size: "1x1" },
        { id: "weight", kind: "stat", size: "1x1" },
        {
          id: "smart",
          kind: "smart-rotating",
          size: "2x1",
          settings: { intervalMs: 10000 },
        },
      ];
      const { getByTestId } = render(
        <TileGrid
          layout={layout}
          statData={MEMBER}
          tilesData={tilesPayload()}
        />,
      );
      await settle();
      const card = () => getByTestId("tile-smart-card");

      const eligible = buildRotationItems({
        statData: MEMBER,
        excludeKeys: pinnedRotationKeys(layout),
      });
      expect(eligible).toHaveLength(6); // 8 stat cards − streak − weight

      const seen = new Set<string>();
      for (let i = 0; i < eligible.length * 3; i++) {
        const name = shownCard(card());
        expect(name).not.toBe("Day Streak");
        expect(name).not.toBe("Weight");
        seen.add(name);
        act(() => {
          jest.advanceTimersByTime(10000);
        });
      }
      // It really did move: more than one distinct card was shown.
      expect(seen.size).toBeGreaterThan(1);
    });

    it("two smart tiles on one grid open on different cards", async () => {
      const layout: DashboardTile[] = [
        {
          id: "smart",
          kind: "smart-rotating",
          size: "1x1",
          settings: { pool: POOL },
        },
        {
          id: "smart-2",
          kind: "smart-rotating",
          size: "1x1",
          settings: { pool: POOL },
        },
      ];
      const { getByTestId } = render(
        <TileGrid layout={layout} statData={MEMBER} />,
      );
      await settle();
      expect(shownCard(getByTestId("tile-smart-card"))).toBe(
        EXPECTED_ORDER[0],
      );
      expect(shownCard(getByTestId("tile-smart-2-card"))).toBe(
        EXPECTED_ORDER[1],
      );
    });

    it("holds its card when the OS asks for reduced motion", async () => {
      jest
        .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
        .mockResolvedValue(true);
      const tile: DashboardTile = {
        id: "smart",
        kind: "smart-rotating",
        size: "2x1",
        settings: { pool: POOL, intervalMs: 4000 },
      };
      const { getByTestId } = render(
        <SmartRotatingTile tile={tile} statData={MEMBER} />,
      );
      await settle();
      act(() => {
        jest.advanceTimersByTime(4000 * 5);
      });
      // The most relevant card, held — not a carousel the member can't stop.
      expect(shownCard(getByTestId("tile-smart-card"))).toBe(
        EXPECTED_ORDER[0],
      );
    });
  });
});

// ===========================================================================
// e015ca30 — tapping a card records the tap and it rises in the rotation
// ===========================================================================

describe("e015ca30: a tap is recorded, and the card rises", () => {
  it("posts the tapped card's key to /api/dashboard/tile-tap", async () => {
    const layout: DashboardTile[] = [
      { id: "streak", kind: "stat", size: "1x1" },
      {
        id: "smart",
        kind: "smart-rotating",
        size: "2x1",
        settings: { pool: ["stat:water", "stat:weight"] },
      },
    ];
    const { getByTestId } = render(
      <TileGrid layout={layout} statData={MEMBER} tilesData={tilesPayload()} />,
    );
    await settle();

    // Which card is on screen is decided by the same pure function the tile
    // uses, so the expected key is derived, not guessed.
    const [first] = buildRotationItems({
      statData: MEMBER,
      poolKeys: new Set(["stat:water", "stat:weight"]),
      excludeKeys: pinnedRotationKeys(layout),
    });
    expect(first?.key).toBe("stat:water");

    fireEvent.press(getByTestId("tile-smart-card"));

    const call = mockApiFetch.mock.calls.find(
      (c) => c[0] === "/api/dashboard/tile-tap",
    );
    expect(call).toBeTruthy();
    expect(call?.[2]).toMatchObject({
      method: "POST",
      body: { key: "stat:water" },
    });
    expect(call?.[2].body.key).toMatch(TILE_KEY_REGEX);
  });

  it("records the tap AND still does what the card does", async () => {
    const onOpenWeight = jest.fn();
    const tile: DashboardTile = {
      id: "smart",
      kind: "smart-rotating",
      size: "1x1",
      settings: { pool: ["stat:weight"] },
    };
    const onTap = jest.fn();
    const { getByTestId } = render(
      <SmartRotatingTile
        tile={tile}
        statData={MEMBER}
        onTap={onTap}
        onOpenWeight={onOpenWeight}
      />,
    );
    await settle();

    fireEvent.press(getByTestId("tile-smart-card"));
    expect(onTap).toHaveBeenCalledWith("stat:weight");
    expect(onOpenWeight).toHaveBeenCalledTimes(1);
  });

  it("keeps the dashboard up when the tap POST fails", async () => {
    mockApiFetch.mockRejectedValue(new Error("offline"));
    const layout: DashboardTile[] = [
      {
        id: "smart",
        kind: "smart-rotating",
        size: "2x1",
        settings: { pool: ["stat:water", "stat:weight"] },
      },
    ];
    const { getByTestId } = render(
      <TileGrid layout={layout} statData={MEMBER} tilesData={tilesPayload()} />,
    );
    await settle();
    expect(() => fireEvent.press(getByTestId("tile-smart-card"))).not.toThrow();
    await settle();
    expect(getByTestId("tile-smart-card")).toBeTruthy();
  });

  it("a tapped card climbs the order, and a tap-free order is unchanged", () => {
    const statIds = ["water", "weight"];
    const before = rankedRotationKeys({
      statIds,
      metricIds: [],
      statData: MEMBER,
      now: new Date("2026-10-03T12:00:00.000Z"),
    });
    expect(before).toEqual(["stat:water", "stat:weight"]);

    const after = rankedRotationKeys({
      statIds,
      metricIds: [],
      statData: MEMBER,
      engagement: mergeEngagement([], {
        "stat:weight": { taps: 3, lastTapAt: "2026-10-03T11:00:00.000Z" },
      }),
      now: new Date("2026-10-03T12:00:00.000Z"),
    });
    expect(after.indexOf("stat:weight")).toBeLessThan(
      before.indexOf("stat:weight"),
    );
    expect(after[0]).toBe("stat:weight");
  });

  it("server taps already count: the engagement payload leads the rotation", async () => {
    const engagement: TileEngagement[] = [
      { key: "stat:weight", taps: 3, lastTapAt: "2026-10-03T11:00:00.000Z" },
    ];
    const tile: DashboardTile = {
      id: "smart",
      kind: "smart-rotating",
      size: "2x1",
      settings: { pool: ["stat:water", "stat:weight"] },
    };
    const { getByTestId } = render(
      <SmartRotatingTile
        tile={tile}
        statData={MEMBER}
        engagement={engagement}
        now={new Date("2026-10-03T12:00:00.000Z")}
      />,
    );
    await settle();
    expect(shownCard(getByTestId("tile-smart-card"))).toBe("Weight");
  });

  it("the tap tunes THIS session: the card the member keeps pressing leads the next cycle", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-03T12:00:00.000Z"));
    try {
      const layout: DashboardTile[] = [
        {
          id: "smart",
          kind: "smart-rotating",
          size: "2x1",
          settings: { pool: ["stat:water", "stat:weight"], intervalMs: 4000 },
        },
      ];
      const { getByTestId } = render(
        <TileGrid
          layout={layout}
          statData={MEMBER}
          tilesData={tilesPayload()}
        />,
      );
      await settle();
      const card = () => getByTestId("tile-smart-card");

      // Cycle position 0 leads with Water, which outranks Weight on
      // actionability alone.
      expect(shownCard(card())).toBe("Water");

      // Step to Weight and press it twice — enough for the boost to carry it
      // past Water's actionability score.
      act(() => {
        jest.advanceTimersByTime(4000);
      });
      expect(shownCard(card())).toBe("Weight");
      fireEvent.press(card());
      fireEvent.press(card());
      const taps = mockApiFetch.mock.calls.filter(
        (c) => c[0] === "/api/dashboard/tile-tap",
      );
      expect(taps.map((c) => c[2].body.key)).toEqual([
        "stat:weight",
        "stat:weight",
      ]);

      // Back to cycle position 0 — which is now Weight: it rose to the front
      // of the rotation on the strength of those taps alone.
      act(() => {
        jest.advanceTimersByTime(4000);
      });
      expect(shownCard(card())).toBe("Weight");
    } finally {
      jest.useRealTimers();
    }
  });

  it("the boost saturates and decays, so no card is buried for good", () => {
    const now = new Date("2026-10-03T12:00:00.000Z");
    const none = engagementBoost(undefined, now);
    const few = engagementBoost(
      { key: "stat:weight", taps: 2, lastTapAt: now.toISOString() },
      now,
    );
    const many = engagementBoost(
      { key: "stat:weight", taps: 40, lastTapAt: now.toISOString() },
      now,
    );
    const stale = engagementBoost(
      { key: "stat:weight", taps: 40, lastTapAt: "2026-01-01T00:00:00.000Z" },
      now,
    );
    expect(none).toBe(1);
    expect(few).toBeGreaterThan(1);
    expect(many).toBeGreaterThan(few);
    expect(many).toBeLessThanOrEqual(1.5); // bounded: a gentle nudge
    expect(stale).toBe(1); // older than the decay window — no influence left
  });

  it("merges this session's taps on top of the server's counts, without losing them", () => {
    const merged = mergeEngagement(
      [{ key: "stat:water", taps: 2, lastTapAt: "2026-10-01T00:00:00.000Z" }],
      {
        "stat:water": { taps: 1, lastTapAt: "2026-10-03T12:00:00.000Z" },
        "stat:weight": { taps: 2, lastTapAt: "2026-10-03T12:00:00.000Z" },
      },
    );
    expect(merged).toEqual(
      expect.arrayContaining([
        { key: "stat:water", taps: 3, lastTapAt: "2026-10-03T12:00:00.000Z" },
        { key: "stat:weight", taps: 2, lastTapAt: "2026-10-03T12:00:00.000Z" },
      ]),
    );
  });
});

// ===========================================================================
// Both apps order the same cards the same way — checked against the web's
// own source, so a change on either side fails here.
// ===========================================================================

describe("parity with the web's rotation (e015ca2f / e015ca30)", () => {
  it("scores every stat card with the web's own numbers", () => {
    // The web's branches, verbatim from webapp/lib/dashboardTiles/smartRotation.ts.
    expect(WEB_ROTATION).toContain("return todaysMood == null ? 0.95 : 0.35");
    expect(WEB_ROTATION).toContain("if (entries.length === 0) return 0.9");
    expect(WEB_ROTATION).toContain(
      "if (days > 0 && streakData && !streakData.activityToday) return 0.9",
    );
    expect(WEB_ROTATION).toContain("if (days === 0) return 0.55");
    expect(WEB_ROTATION).toContain("if (target > 0 && done < target) return 0.6");
    expect(WEB_ROTATION).toContain(
      "return cal.consumed > cal.goal ? 0.7 : 0.5",
    );
    expect(WEB_ROTATION).toContain("return w.current < w.goal ? 0.5 : 0.35");
    expect(WEB_ROTATION).toContain("const base = Math.max(0.3, 0.62 - i * 0.04)");

    // …and the native port answers those same numbers for the same member.
    expect(scoreStatTile("mood", { ...MEMBER, todaysMood: null })).toBe(0.95);
    expect(scoreStatTile("mood", MEMBER)).toBe(0.35);
    expect(scoreStatTile("weight", { ...MEMBER, weightEntries: [] })).toBe(0.9);
    expect(scoreStatTile("weight", MEMBER)).toBe(0.45);
    expect(scoreStatTile("streak", { ...MEMBER, activityToday: false })).toBe(
      0.9,
    );
    expect(scoreStatTile("streak", { ...MEMBER, streakDays: 0 })).toBe(0.55);
    expect(scoreStatTile("streak", MEMBER)).toBe(0.4);
    expect(scoreStatTile("weekly", { ...MEMBER, thisWeekWorkouts: 1 })).toBe(
      0.6,
    );
    expect(scoreStatTile("weekly", MEMBER)).toBe(0.4);
    expect(scoreStatTile("calories", { ...MEMBER, caloriesConsumed: 2500 })).toBe(
      0.7,
    );
    expect(scoreStatTile("calories", MEMBER)).toBe(0.5);
    expect(scoreStatTile("calories", { ...MEMBER, caloriesGoal: 0 })).toBe(0.3);
    expect(scoreStatTile("water", MEMBER)).toBe(0.5);
    expect(scoreStatTile("water", { ...MEMBER, waterCurrent: 80 })).toBe(0.35);
    expect(scoreStatTile("water", { ...MEMBER, waterGoal: 0 })).toBe(0.3);
    expect(scoreStatTile("goal", MEMBER)).toBe(0.4);
    expect(scoreStatTile("workouts", MEMBER)).toBe(0.3);
  });

  it("uses the web's engagement tuning, read out of the web's source", () => {
    const numberAfter = (re: RegExp): number => {
      const m = WEB_ROTATION.match(re);
      expect(m).toBeTruthy();
      return Number(m?.[1]);
    };
    const maxBoost = numberAfter(/ENGAGEMENT_MAX_BOOST = ([\d.]+)/);
    const tapsForHalf = numberAfter(/ENGAGEMENT_TAPS_FOR_HALF = ([\d.]+)/);
    const decayDays = numberAfter(/ENGAGEMENT_DECAY_DAYS = ([\d.]+)/);

    const now = new Date("2026-10-03T12:00:00.000Z");
    const taps = 3;
    expect(
      engagementBoost(
        { key: "stat:weight", taps, lastTapAt: now.toISOString() },
        now,
      ),
    ).toBeCloseTo(1 + maxBoost * (taps / (taps + tapsForHalf)), 10);

    // A tap exactly `decayDays` old has decayed to nothing.
    const stale = new Date(now.getTime() - decayDays * 24 * 60 * 60 * 1000);
    expect(
      engagementBoost(
        { key: "stat:weight", taps, lastTapAt: stale.toISOString() },
        now,
      ),
    ).toBe(1);
  });

  it("excludes pinned cards the way the web's buildRotationItems does", () => {
    expect(WEB_SMART_TILE).toContain("!exclude.has(`stat:${id}`)");
    expect(WEB_SMART_TILE).toContain("!exclude.has(`metric:${id}`)");
    // And the web records a tap on the same route with the same body.
    expect(WEB_TILE_GRID).toContain("'/api/dashboard/tile-tap'");
    expect(WEB_TILE_GRID).toContain("body: JSON.stringify({ key: tappedKey })");
  });

  it("picks the chart and formats the value the way MetricTileCard does", () => {
    expect(WEB_TILE_GRID).toContain("if (m.data.length < 2) return 'number'");
    expect(WEB_TILE_GRID).toContain(
      "if (m.id.includes('volume') || m.id.includes('bar')) return 'bar'",
    );
    expect(WEB_TILE_GRID).toContain(
      "const showChart = size === '2x1' && !metric.error && kind !== 'number'",
    );
    expect(WEB_TILE_GRID).toContain(
      "return value.toFixed(2).replace(/\\.?0+$/, '')",
    );

    expect(metricChartKind(SINGLE_POINT_METRIC)).toBe("number");
    expect(metricChartKind(BAR_METRIC)).toBe("bar");
    expect(metricChartKind(LINE_METRIC)).toBe("line");
    expect(formatMetricValue(12)).toBe("12");
    expect(formatMetricValue(3.5)).toBe("3.5");
    expect(formatMetricValue(3.456)).toBe("3.46");
    expect(metricLatestText(BAR_METRIC)).toBe("12500 lbs");
    expect(metricLatestText(LINE_METRIC)).toBe("4");
    expect(metricLatestText(BROKEN_METRIC)).toBe("—");
  });
});

// ===========================================================================
// The metric tile itself
// ===========================================================================

describe("the metric tile (NP-156)", () => {
  it("is a number in 1x1 and a chart in 2x1", () => {
    const square = render(<MetricTile metric={LINE_METRIC} size="1x1" />);
    expect(
      square.getByTestId("tile-mood-trend-value").props.children,
    ).toBe("4");
    expect(square.queryByTestId("tile-mood-trend-line-chart")).toBeNull();
    square.unmount();

    const wide = render(<MetricTile metric={LINE_METRIC} size="2x1" />);
    expect(wide.getByTestId("tile-mood-trend-value").props.children).toBe("4");
    expect(wide.getByTestId("tile-mood-trend-line-chart")).toBeTruthy();
    expect(wide.getByTestId("tile-mood-trend-line-chart-path")).toBeTruthy();
  });

  it("draws bars for a volume-like metric and nothing for a single point", () => {
    const bars = render(<MetricTile metric={BAR_METRIC} size="2x1" />);
    expect(bars.getByTestId("tile-weekly-volume-bar-chart")).toBeTruthy();
    expect(bars.getByTestId("tile-weekly-volume-bar-chart-bar-0")).toBeTruthy();
    expect(bars.getByTestId("tile-weekly-volume-bar-chart-bar-2")).toBeTruthy();
    expect(bars.getByTestId("tile-weekly-volume-value").props.children).toBe(
      "12500 lbs",
    );
    bars.unmount();

    const one = render(<MetricTile metric={SINGLE_POINT_METRIC} size="2x1" />);
    expect(one.queryByTestId("tile-sessions-line-chart")).toBeNull();
    expect(one.queryByTestId("tile-sessions-bar-chart")).toBeNull();
    expect(one.getByTestId("tile-sessions-value").props.children).toBe("12");
  });

  it("degrades one metric rather than the dashboard when compute threw", () => {
    const { getByTestId, queryByTestId, getByText } = render(
      <MetricTile metric={BROKEN_METRIC} size="2x1" />,
    );
    expect(getByText("Data temporarily unavailable.")).toBeTruthy();
    expect(getByTestId("tile-strength-curve-error")).toBeTruthy();
    expect(queryByTestId("tile-strength-curve-line-chart")).toBeNull();
    expect(queryByTestId("tile-strength-curve-bar-chart")).toBeNull();
  });

  it("drops a point whose timestamp or value is unusable", () => {
    expect(metricChartValues(LINE_METRIC.data)).toEqual([3, 3.5, 4]);
    expect(
      metricChartValues([
        { t: "not-a-date", value: 1 },
        { t: "2026-10-02T00:00:00.000Z", value: 2 },
        { t: "2026-10-03T00:00:00.000Z", value: Number.NaN },
      ]),
    ).toEqual([2]);
    expect(sparklinePath([], 100, 40)).toBe("");
    expect(sparklinePath([1, 2], 100, 40)).toMatch(/^M [\d.]+ [\d.]+ L/);
  });

  it("takes every colour from the theme, so both modes read (NP-130)", () => {
    for (const mode of ["light", "dark"] as ThemeMode[]) {
      act(() => {
        colorScheme.set(mode);
      });
      const line = render(<MetricTile metric={LINE_METRIC} size="2x1" />);
      expect(
        svgColorInt(
          line.getByTestId("tile-mood-trend-line-chart-path").props.stroke,
        ),
      ).toBe(tokenArgb(getTokens(mode).primary));
      line.unmount();

      const bar = render(<MetricTile metric={BAR_METRIC} size="2x1" />);
      expect(
        svgColorInt(
          bar.getByTestId("tile-weekly-volume-bar-chart-bar-0").props.fill,
        ),
      ).toBe(tokenArgb(getTokens(mode).accent));
      bar.unmount();
    }
  });

  it("links nowhere: the web drill-in is still a placeholder", async () => {
    const layout: DashboardTile[] = [
      { id: "weekly-volume", kind: "metric", size: "2x1" },
    ];
    const { getByTestId } = render(
      <TileGrid
        layout={layout}
        statData={MEMBER}
        tilesData={tilesPayload({ metrics: [BAR_METRIC] })}
      />,
    );
    await settle();
    fireEvent.press(getByTestId("tile-weekly-volume"));
    expect(mockPush).not.toHaveBeenCalled();

    const source = fs.readFileSync(
      path.resolve(EXPO_DIR, "components/dashboard/MetricTile.tsx"),
      "utf8",
    );
    // No navigation of any kind in the component (the drill-in is only named
    // in a comment explaining why it is not linked).
    expect(source).not.toMatch(
      /useRouter|router\.push|openWebSignedIn|Linking\.openURL|<Link/,
    );
  });

  it("shows a skeleton until /api/dashboard/tiles answers, then the real card", async () => {
    const layout: DashboardTile[] = [
      { id: "mood-trend", kind: "metric", size: "1x1" },
    ];
    const loading = render(<TileGrid layout={layout} statData={MEMBER} />);
    await settle();
    expect(loading.getByTestId("tile-mood-trend").props.accessibilityRole).toBe(
      "progressbar",
    );
    loading.unmount();

    const loaded = render(
      <TileGrid
        layout={layout}
        statData={MEMBER}
        tilesData={tilesPayload({ metrics: [LINE_METRIC] })}
      />,
    );
    await settle();
    expect(loaded.getByTestId("tile-mood-trend-value").props.children).toBe(
      "4",
    );
  });

  it("names the metric when the payload does not carry it", async () => {
    const layout: DashboardTile[] = [
      { id: "prs-timeline", kind: "metric", size: "1x1" },
    ];
    const { getByTestId, getByText } = render(
      <TileGrid layout={layout} statData={MEMBER} tilesData={tilesPayload()} />,
    );
    await settle();
    expect(getByTestId("tile-prs-timeline")).toBeTruthy();
    expect(getByText("Prs Timeline")).toBeTruthy();
  });

  it("rotates inside a smart tile, and records a tap without navigating", async () => {
    const tile: DashboardTile = {
      id: "smart",
      kind: "smart-rotating",
      size: "2x1",
      settings: { pool: ["metric:weekly-volume"] },
    };
    const onTap = jest.fn();
    const { getByTestId } = render(
      <SmartRotatingTile
        tile={tile}
        statData={MEMBER}
        metrics={[BAR_METRIC]}
        onTap={onTap}
      />,
    );
    await settle();
    expect(getByTestId("tile-smart-card-bar-chart")).toBeTruthy();
    fireEvent.press(getByTestId("tile-smart-card"));
    expect(onTap).toHaveBeenCalledWith("metric:weekly-volume");
    expect(mockPush).not.toHaveBeenCalled();
  });
});
