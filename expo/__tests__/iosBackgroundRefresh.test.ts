/**
 * ─── The iOS background refresh: the feed re-read while the app is closed ───
 *
 * `expo-widgets` never fetches from the extension — it paints a timeline the
 * APP pushed. Without this task the widget only changes when the member opens
 * the app. What is pinned here is the contract of `refreshIosWidgets` and of
 * the registration around it:
 *
 *   • no stored token → the sign-in prompt, never a throw;
 *   • a good token → today's numbers, cached BEFORE they are drawn;
 *   • a revoked token → the prompt, and the dead token AND the snapshot are
 *     dropped (stale numbers must never survive a sign-out);
 *   • no network → today's cache if it is today's, the prompt if not — and
 *     the token is kept, because offline says nothing about it;
 *   • anything that throws → the same fallback, never an exception;
 *   • registration happens on iOS only, with the interval from the feed's
 *     `refreshAfterSeconds` clamped to >= 15 min.
 *
 * Every dependency is injected — no real network, no real clock, no native
 * module. Mirrors `__tests__/widgetTaskHandler.test.tsx` (the Android half
 * of the same four branches) on purpose.
 */
import {
  IOS_WIDGETS_REFRESH_TASK,
  refreshIntervalMinutes,
  refreshIosWidgets,
  registerIosWidgetsRefresh,
  type IosWidgetsRefreshDeps,
  type IosWidgetsRefreshResult,
} from "@/lib/widgets/iosBackgroundRefresh";
import type { WidgetFeedResult } from "@/lib/widgets/feed";
import type { WidgetSnapshot } from "@/lib/widgets/snapshot";

/** 2026-09-29 12:00 in New York (EDT, 240 minutes west). */
const NOW = new Date("2026-09-29T16:00:00Z");
const NY = 240;
const TODAY = "2026-09-29";

const FEED = {
  generatedAt: NOW.getTime(),
  todayKey: TODAY,
  refreshAfterSeconds: 900,
  badgeCount: 1,
  widgets: [
    {
      key: "streak",
      title: "Streak",
      headline: "12",
      headlineUnit: "days",
      caption: "2 days to 14",
      state: "done",
      progress: 0.85,
      rings: [],
      deepLink: "/dashboard/streaks",
    },
    {
      key: "nutrition",
      title: "Nutrition",
      headline: "820",
      headlineUnit: "cal left",
      caption: "P 120/160g · C 180/240g · F 40/60g",
      state: "todo",
      progress: 0.6,
      rings: [],
      deepLink: "/dashboard/nutrition",
    },
    {
      key: "mind",
      title: "Mind",
      headline: "Ready",
      headlineUnit: null,
      caption: "Chapter 2 · Momentum · 3/7",
      state: "todo",
      progress: 0.42,
      rings: [],
      deepLink: "/dashboard/mind",
    },
    {
      key: "becoming",
      title: "Becoming",
      headline: "Week 6",
      headlineUnit: null,
      caption: "3 of 4 this week",
      state: "todo",
      progress: 0.75,
      rings: [],
      deepLink: "/dashboard/mind/becoming",
    },
    {
      key: "training",
      title: "Training",
      headline: "Push day",
      headlineUnit: null,
      caption: "45 min · 6 exercises",
      state: "todo",
      progress: 0.2,
      rings: [],
      deepLink: "/dashboard/training",
    },
  ],
} as const;

interface DrawCall {
  snapshot: WidgetSnapshot | null;
  signedIn: boolean;
  todayKey: string;
}

interface Harness {
  deps: IosWidgetsRefreshDeps;
  draws: DrawCall[];
  clearedToken: number;
  clearedSnapshot: number;
  saved: WidgetSnapshot[];
}

function harness(
  overrides: Partial<IosWidgetsRefreshDeps> & {
    token?: string | null;
    feed?: WidgetFeedResult;
    storedSnapshot?: WidgetSnapshot | null;
  } = {},
): Harness {
  const { token = "widgets.jwt", feed, storedSnapshot, ...rest } = overrides;
  const draws: DrawCall[] = [];
  const saved: WidgetSnapshot[] = [];
  let clearedToken = 0;
  let clearedSnapshot = 0;
  const deps: IosWidgetsRefreshDeps = {
    loadToken: jest.fn(async () => token),
    clearToken: jest.fn(async () => {
      clearedToken += 1;
    }),
    loadSnapshot: jest.fn(async () => storedSnapshot ?? null),
    saveSnapshot: jest.fn(async (s: WidgetSnapshot) => {
      saved.push(s);
    }),
    clearSnapshot: jest.fn(async () => {
      clearedSnapshot += 1;
    }),
    fetchFeed: jest.fn(
      async (): Promise<WidgetFeedResult> =>
        feed ?? { kind: "unreachable" },
    ),
    draw: jest.fn(async (args: DrawCall) => {
      draws.push(args);
      return 5;
    }),
    now: () => NOW,
    tzOffsetMinutes: () => NY,
    ...rest,
  };
  return {
    deps,
    draws,
    saved,
    get clearedToken() {
      return clearedToken;
    },
    get clearedSnapshot() {
      return clearedSnapshot;
    },
  };
}

describe("refreshIosWidgets — the four branches, none of them throwing", () => {
  it("no stored token draws the sign-in prompt", async () => {
    const h = harness({ token: null });
    const result: IosWidgetsRefreshResult = await refreshIosWidgets(h.deps);
    expect(result).toBe("no-token");
    expect(h.draws).toHaveLength(1);
    expect(h.draws[0]).toEqual({
      snapshot: null,
      signedIn: false,
      todayKey: TODAY,
    });
    expect(h.clearedToken).toBe(0);
    expect(h.saved).toHaveLength(0);
  });

  it("a good token saves the snapshot before drawing today's numbers", async () => {
    const order: string[] = [];
    const h = harness({
      feed: { kind: "ok", feed: { ...FEED, widgets: [...FEED.widgets] } },
      saveSnapshot: jest.fn(async (s: WidgetSnapshot) => {
        order.push("save");
        h.saved.push(s);
      }),
      draw: jest.fn(async (args: DrawCall) => {
        order.push("draw");
        h.draws.push(args);
        return 5;
      }),
    });
    const result = await refreshIosWidgets(h.deps);
    expect(result).toBe("refreshed");
    // Saved BEFORE drawing, so the next offline refresh has today's numbers
    // even if this draw is the last thing that happens in the task.
    expect(order).toEqual(["save", "draw"]);
    expect(h.saved).toHaveLength(1);
    expect(h.saved[0]?.todayKey).toBe(TODAY);
    expect(h.draws).toHaveLength(1);
    expect(h.draws[0]?.signedIn).toBe(true);
    expect(h.draws[0]?.snapshot?.todayKey).toBe(TODAY);
    expect(h.clearedToken).toBe(0);
    expect(h.clearedSnapshot).toBe(0);
  });

  it("a revoked token clears token + snapshot and draws the prompt", async () => {
    const h = harness({ feed: { kind: "revoked" } });
    const result = await refreshIosWidgets(h.deps);
    expect(result).toBe("revoked");
    expect(h.clearedToken).toBe(1);
    expect(h.clearedSnapshot).toBe(1);
    expect(h.draws).toHaveLength(1);
    expect(h.draws[0]).toEqual({
      snapshot: null,
      signedIn: false,
      todayKey: TODAY,
    });
    expect(h.saved).toHaveLength(0);
  });

  it("offline draws today's stored snapshot and keeps the token", async () => {
    const stored: WidgetSnapshot = {
      generatedAt: NOW.getTime(),
      todayKey: TODAY,
      rows: [],
    };
    const h = harness({ feed: { kind: "unreachable" }, storedSnapshot: stored });
    const result = await refreshIosWidgets(h.deps);
    expect(result).toBe("offline");
    expect(h.draws).toHaveLength(1);
    expect(h.draws[0]?.signedIn).toBe(true);
    expect(h.draws[0]?.snapshot).toBe(stored);
    // Offline says nothing about the token: it stays, and so does the cache.
    expect(h.clearedToken).toBe(0);
    expect(h.clearedSnapshot).toBe(0);
  });

  it("offline with no snapshot draws the prompt side, still signed in", async () => {
    const h = harness({ feed: { kind: "unreachable" } });
    const result = await refreshIosWidgets(h.deps);
    expect(result).toBe("offline");
    expect(h.draws).toHaveLength(1);
    // `signedIn: true` with a null snapshot is the "open Become" tile, not
    // the sign-in prompt — `drawIosWidgets` tells them apart.
    expect(h.draws[0]).toEqual({
      snapshot: null,
      signedIn: true,
      todayKey: TODAY,
    });
    expect(h.clearedToken).toBe(0);
  });

  it("a throwing store still draws from the fallback instead of throwing", async () => {
    const h = harness({
      loadToken: jest.fn(async () => {
        throw new Error("Keystore locked");
      }),
      storedSnapshot: null,
    });
    await expect(refreshIosWidgets(h.deps)).resolves.toBe("offline");
    expect(h.draws.length).toBeGreaterThan(0);
  });

  it("a throwing draw still resolves instead of rejecting", async () => {
    const h = harness({
      token: null,
      draw: jest.fn(async () => {
        throw new Error("no module");
      }),
    });
    await expect(refreshIosWidgets(h.deps)).resolves.toBe("no-token");
  });
});

describe("revoked or signed-out never leaves stale numbers", () => {
  it("revoked drops the snapshot even when one is stored", async () => {
    const stored: WidgetSnapshot = {
      generatedAt: NOW.getTime(),
      todayKey: TODAY,
      rows: [],
    };
    const h = harness({ feed: { kind: "revoked" }, storedSnapshot: stored });
    await refreshIosWidgets(h.deps);
    expect(h.clearedSnapshot).toBe(1);
    // The prompt draw carries no snapshot — yesterday's numbers cannot leak
    // through a draw that still holds them.
    expect(h.draws[0]?.snapshot).toBeNull();
  });

  it("offline paints only today's snapshot: a stale day draws the prompt side", async () => {
    const stale: WidgetSnapshot = {
      generatedAt: NOW.getTime() - 24 * 60 * 60 * 1000,
      todayKey: "2026-09-28",
      rows: [],
    };
    const drawn: DrawCall[] = [];
    const h = harness({
      feed: { kind: "unreachable" },
      storedSnapshot: stale,
      draw: jest.fn(async (args: DrawCall) => {
        drawn.push(args);
        // The real `drawIosWidgets` refuses a stale day; the task hands it
        // the stored snapshot verbatim and the day check still applies.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { snapshotIsForDay } = require("@/lib/widgets/snapshot") as {
          snapshotIsForDay: (
            s: WidgetSnapshot | null,
            day: string,
          ) => boolean;
        };
        expect(snapshotIsForDay(args.snapshot, TODAY)).toBe(false);
        return 5;
      }),
    });
    await refreshIosWidgets(h.deps);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.snapshot).toBe(stale);
  });
});

describe("refreshIntervalMinutes — the feed's cadence, clamped to >= 15 min", () => {
  it("passes the feed's cadence through when it is above the floor", () => {
    expect(refreshIntervalMinutes(NOW, 1800)).toBe(30);
    expect(refreshIntervalMinutes(NOW, 900)).toBe(15);
  });

  it("clamps anything below 15 minutes up to the floor", () => {
    expect(refreshIntervalMinutes(NOW, 60)).toBe(15);
    expect(refreshIntervalMinutes(NOW, 0)).toBe(15);
    expect(refreshIntervalMinutes(NOW, -30)).toBe(15);
  });

  it("falls back to the default cadence when the feed names none", () => {
    expect(refreshIntervalMinutes(NOW, null)).toBe(30);
    expect(refreshIntervalMinutes(NOW, undefined)).toBe(30);
    expect(refreshIntervalMinutes(NOW, Number.NaN)).toBe(30);
  });
});

describe("registerIosWidgetsRefresh — iOS only", () => {
  function scheduler() {
    return {
      defineTask: jest.fn(),
      registerTaskAsync: jest.fn(async () => undefined),
    };
  }

  it("registers nothing off iOS", async () => {
    for (const platform of ["android", "web"]) {
      const s = scheduler();
      await expect(
        registerIosWidgetsRefresh({ platform, scheduler: s }),
      ).resolves.toBe(false);
      expect(s.defineTask).not.toHaveBeenCalled();
      expect(s.registerTaskAsync).not.toHaveBeenCalled();
    }
  });

  it("registers nothing without a scheduler (Expo Go, missing module)", async () => {
    await expect(
      registerIosWidgetsRefresh({ platform: "ios", scheduler: null }),
    ).resolves.toBe(false);
  });

  it("on iOS defines the task and registers it with the clamped interval", async () => {
    const s = scheduler();
    await expect(
      registerIosWidgetsRefresh({
        platform: "ios",
        now: () => NOW,
        refreshAfterSeconds: 60,
        scheduler: s,
      }),
    ).resolves.toBe(true);
    expect(s.defineTask).toHaveBeenCalledTimes(1);
    expect(s.defineTask.mock.calls[0]?.[0]).toBe(IOS_WIDGETS_REFRESH_TASK);
    expect(s.registerTaskAsync).toHaveBeenCalledTimes(1);
    const registered = s.registerTaskAsync.mock.calls[0] as
      | [string, { minimumInterval?: number }]
      | undefined;
    expect(registered?.[0]).toBe(IOS_WIDGETS_REFRESH_TASK);
    expect(registered?.[1]).toEqual({
      minimumInterval: 15,
    });
  });

  it("on iOS passes a longer feed cadence through unclamped", async () => {
    const s = scheduler();
    await registerIosWidgetsRefresh({
      platform: "ios",
      now: () => NOW,
      refreshAfterSeconds: 3600,
      scheduler: s,
    });
    const registered = s.registerTaskAsync.mock.calls[0] as
      | [string, { minimumInterval?: number }]
      | undefined;
    expect(registered?.[1]).toEqual({
      minimumInterval: 60,
    });
  });
});
