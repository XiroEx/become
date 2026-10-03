/**
 * ─── The pure iOS timeline builder ───────────────────────────────────────────
 *
 * WidgetKit never runs our fetch code, so the app pushes one timeline per tile
 * and the system renders the latest entry whose date has passed. This pins the
 * three promises that builder makes: yesterday's numbers are never drawn, a
 * tile is never blank, and the day ends at midnight — plus the refresh clamp
 * and the rule that every tap resolves to a real native screen (the same bar
 * `__tests__/widgetTaps.test.ts` holds Android taps to).
 *
 * Explicit dates throughout, no `Math.random`, no real clock: DST safety is
 * asserted by handing `nextLocalMidnight` in as an absolute instant across a
 * real fall-back boundary (US Eastern, 2026-11-01) rather than by deriving it
 * here.
 */
import type { BecomeWidget, WidgetFeed, WidgetKey } from "@become/api-client";
import { resolveWebPath } from "@/lib/navigation/webPathToRoute";
import {
  IOS_REFRESH_DEFAULT_SECONDS,
  IOS_REFRESH_MAX_SECONDS,
  IOS_REFRESH_MIN_SECONDS,
  IOS_SIGN_IN_PROMPT,
  buildIosTimeline,
  nextRefreshDate,
  type IosWidgetProps,
} from "@/lib/widgets/iosTimeline";
import {
  snapshotFromFeed,
  type WidgetSnapshot,
} from "@/lib/widgets/snapshot";

const KEYS: readonly WidgetKey[] = [
  "streak",
  "nutrition",
  "mind",
  "becoming",
  "training",
];

function row(key: WidgetKey, deepLink: string): BecomeWidget {
  const titles: Record<WidgetKey, string> = {
    streak: "Streak",
    nutrition: "Nutrition",
    mind: "Mind",
    becoming: "Becoming",
    training: "Training",
  };
  return {
    key,
    title: titles[key],
    headline: "12",
    headlineUnit: "days",
    caption: "2 days to 14",
    state: "done",
    progress: 0.857,
    rings: [],
    deepLink,
    ...{},
  } as BecomeWidget;
}

const DEEP_LINKS: Record<string, string> = {
  streak: "/dashboard/streaks",
  nutrition: "/dashboard/nutrition",
  mind: "/dashboard/mind",
  becoming: "/dashboard/mind/becoming",
};

/** A snapshot for `todayKey`, holding the four gallery rows. */
function snapshot(todayKey: string): WidgetSnapshot {
  const feed = {
    generatedAt: 1_790_000_000_000,
    todayKey,
    refreshAfterSeconds: 900,
    badgeCount: 0,
    widgets: KEYS.filter((k) => k !== "training").map((k) =>
      row(k, DEEP_LINKS[k] ?? "/dashboard"),
    ),
  } as WidgetFeed;
  return snapshotFromFeed(feed, 1_790_000_000_000);
}

/** Every url the builder emits must land on a real route, never a guess. */
function expectRealRoute(props: IosWidgetProps): void {
  const target = resolveWebPath(props.url);
  expect(target.kind).toBe("native");
  if (target.kind !== "native") return;
  expect(target.fallback).not.toBe("unknown");
}

function expectPrompt(props: IosWidgetProps): void {
  expect(props.signedIn).toBe(false);
  if (props.signedIn) return;
  expect(props.prompt).toBe(IOS_SIGN_IN_PROMPT);
  expect(props.prompt).toBe("Open Become to sign in");
}

describe("signed in with today's snapshot", () => {
  // A fixed morning: 2026-09-29 09:00 UTC, local day 2026-09-29.
  const now = new Date("2026-09-29T09:00:00.000Z");
  // Next local midnight handed in as an absolute instant (00:00 UTC+2).
  const midnight = new Date("2026-09-29T22:00:00.000Z");

  it("yields the row now plus an Open Become entry at local midnight", () => {
    const timeline = buildIosTimeline({
      snapshot: snapshot("2026-09-29"),
      signedIn: true,
      now,
      todayKey: "2026-09-29",
      nextLocalMidnight: midnight,
      refreshAfterSeconds: 900,
    });
    for (const key of ["streak", "nutrition", "mind", "becoming"] as const) {
      const entries = timeline[key] ?? [];
      // Row at now, row restated at the 15-minute-clamped refresh point, prompt
      // at midnight: the first and last entries are the contract.
      expect(entries.length).toBeGreaterThanOrEqual(2);
      expect(entries[0]?.date).toEqual(now);
      const first = entries[0]?.props;
      expect(first?.signedIn).toBe(true);
      if (!first || !first.signedIn) continue;
      expect(first.headline).toBe("12");
      expect(first.headlineUnit).toBe("days");
      expect(first.caption).toBe("2 days to 14");
      expect(first.progress).toBeCloseTo(0.857);
      const last = entries[entries.length - 1];
      expect(last?.date).toEqual(midnight);
      if (last) expectPrompt(last.props);
    }
  });

  it("every url resolves via resolveWebPath to a real route", () => {
    const timeline = buildIosTimeline({
      snapshot: snapshot("2026-09-29"),
      signedIn: true,
      now,
      todayKey: "2026-09-29",
      nextLocalMidnight: midnight,
      refreshAfterSeconds: 900,
    });
    for (const key of KEYS) {
      for (const entry of timeline[key] ?? []) {
        expectRealRoute(entry.props);
      }
    }
  });
});

describe("signed out", () => {
  it("yields ONE entry at now with the sign-in prompt, even with a snapshot", () => {
    const now = new Date("2026-09-29T09:00:00.000Z");
    const timeline = buildIosTimeline({
      snapshot: snapshot("2026-09-29"),
      signedIn: false,
      now,
      todayKey: "2026-09-29",
      nextLocalMidnight: new Date("2026-09-29T22:00:00.000Z"),
      refreshAfterSeconds: 900,
    });
    for (const key of KEYS) {
      const entries = timeline[key] ?? [];
      expect(entries).toHaveLength(1);
      expect(entries[0]?.date).toEqual(now);
      expectPrompt(entries[0]?.props as never);
      expectRealRoute(entries[0]?.props as never);
    }
  });
});

describe("revoked (signedIn false with a stale snapshot still on disk)", () => {
  it("never draws the stale numbers", () => {
    const now = new Date("2026-09-29T09:00:00.000Z");
    const timeline = buildIosTimeline({
      snapshot: snapshot("2026-09-29"),
      signedIn: false,
      now,
      todayKey: "2026-09-29",
      nextLocalMidnight: new Date("2026-09-29T22:00:00.000Z"),
      refreshAfterSeconds: 900,
    });
    for (const key of KEYS) {
      for (const entry of timeline[key] ?? []) {
        expect(entry.props.signedIn).toBe(false);
        expectPrompt(entry.props);
      }
    }
  });
});

describe("yesterday's snapshot", () => {
  it("is never drawn: signed in with a stale day yields the prompt", () => {
    const now = new Date("2026-09-30T08:00:00.000Z");
    const timeline = buildIosTimeline({
      snapshot: snapshot("2026-09-29"),
      signedIn: true,
      now,
      todayKey: "2026-09-30",
      nextLocalMidnight: new Date("2026-09-30T22:00:00.000Z"),
      refreshAfterSeconds: 900,
    });
    for (const key of KEYS) {
      const entries = timeline[key] ?? [];
      expect(entries).toHaveLength(1);
      expect(entries[0]?.date).toEqual(now);
      expectPrompt(entries[0]?.props as never);
      expectRealRoute(entries[0]?.props as never);
    }
  });

  it("no snapshot at all is the same prompt, never a blank", () => {
    const now = new Date("2026-09-30T08:00:00.000Z");
    const timeline = buildIosTimeline({
      snapshot: null,
      signedIn: true,
      now,
      todayKey: "2026-09-30",
      nextLocalMidnight: new Date("2026-09-30T22:00:00.000Z"),
      refreshAfterSeconds: 900,
    });
    for (const key of KEYS) {
      expect(timeline[key]).toHaveLength(1);
      expectPrompt(timeline[key]?.[0]?.props as never);
    }
  });
});

describe("a missing key", () => {
  it("gets the prompt for that key, never a blank", () => {
    // `training` has no gallery widget: the snapshot never keeps it.
    const now = new Date("2026-09-29T09:00:00.000Z");
    const timeline = buildIosTimeline({
      snapshot: snapshot("2026-09-29"),
      signedIn: true,
      now,
      todayKey: "2026-09-29",
      nextLocalMidnight: new Date("2026-09-29T22:00:00.000Z"),
      refreshAfterSeconds: 900,
    });
    const entries = timeline.training ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]?.date).toEqual(now);
    expectPrompt(entries[0]?.props as never);
    expectRealRoute(entries[0]?.props as never);
  });
});

describe("midnight entry across a DST change", () => {
  it("lands on the absolute midnight handed in, not now + 24h", () => {
    // US Eastern falls back on 2026-11-01: the local day is 25 hours long, so
    // midnight EDT→EST is 2026-11-02T04:00:00Z — a full hour past now + 24h.
    const now = new Date("2026-11-01T03:00:00.000Z");
    const midnight = new Date("2026-11-02T04:00:00.000Z");
    expect(midnight.getTime() - now.getTime()).toBe(25 * 3_600_000);
    const timeline = buildIosTimeline({
      snapshot: snapshot("2026-11-01"),
      signedIn: true,
      now,
      todayKey: "2026-11-01",
      nextLocalMidnight: midnight,
      refreshAfterSeconds: 900,
    });
    const entries = timeline.streak ?? [];
    const last = entries[entries.length - 1];
    expect(last?.date).toEqual(midnight);
    expect(last && last.date.getTime() - now.getTime()).toBe(25 * 3_600_000);
    if (last) expectPrompt(last.props);
  });
});

describe("nextRefreshDate", () => {
  const now = new Date("2026-09-29T09:00:00.000Z");

  it("adds the advertised cadence", () => {
    expect(nextRefreshDate(now, 1800)).toEqual(
      new Date("2026-09-29T09:30:00.000Z"),
    );
  });

  it("defaults to 30 minutes when absent", () => {
    expect(nextRefreshDate(now, undefined)).toEqual(
      new Date(now.getTime() + IOS_REFRESH_DEFAULT_SECONDS * 1000),
    );
    expect(nextRefreshDate(now, null)).toEqual(
      new Date(now.getTime() + IOS_REFRESH_DEFAULT_SECONDS * 1000),
    );
    expect(IOS_REFRESH_DEFAULT_SECONDS).toBe(1800);
  });

  it("clamps below to 15 minutes and above to 6 hours", () => {
    expect(nextRefreshDate(now, 60)).toEqual(
      new Date(now.getTime() + IOS_REFRESH_MIN_SECONDS * 1000),
    );
    expect(nextRefreshDate(now, 100_000)).toEqual(
      new Date(now.getTime() + IOS_REFRESH_MAX_SECONDS * 1000),
    );
    expect(IOS_REFRESH_MIN_SECONDS).toBe(900);
    expect(IOS_REFRESH_MAX_SECONDS).toBe(21_600);
  });
});
