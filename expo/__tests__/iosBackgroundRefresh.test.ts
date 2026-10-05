/**
 * ─── The iOS background refresh: the feed, re-read while the app is closed ──
 *
 * `expo-widgets` never fetches — the extension renders a timeline the APP
 * pushed — so without `refreshIosWidgets` the widget only changes when the
 * member opens the app. What is pinned here:
 *
 *   • no token → the sign-in prompt, nothing cleared, nothing fetched;
 *   • ok → the snapshot is SAVED and the timelines are pushed, and the task
 *     is re-registered with the feed's cadence;
 *   • revoked → the token AND the snapshot are gone, the prompt is drawn
 *     (never a stale number on a signed-out tile);
 *   • unreachable (or anything throwing) → the stored snapshot is painted,
 *     the token is kept, and the function still resolves;
 *   • the interval is the feed's `refreshAfterSeconds` clamped to >= 15 min;
 *   • registration happens on iOS only — off iOS nothing is defined and
 *     nothing is registered.
 *
 * Everything runs on injected deps: no network, no SecureStore, no clock
 * beyond the one handed in. Jest runs on iOS (the RN preset's default), so
 * the iOS-only paths are the live ones; the off-iOS case swaps `Platform.OS`
 * (writable under jest-expo) and restores it after.
 */
import { Platform } from "react-native";
import type { WidgetFeed } from "@become/api-client";
import { localDayStamp } from "@/lib/timezone/reportTimezone";
import type { WidgetFeedResult } from "@/lib/widgets/feed";
import {
  IOS_WIDGETS_REFRESH_TASK,
  refreshIntervalMinutes,
  refreshIosWidgets,
  registerIosWidgetsRefresh,
  type IosWidgetsRefreshDeps,
} from "@/lib/widgets/iosBackgroundRefresh";
import type { WidgetSnapshot } from "@/lib/widgets/snapshot";

/** 2026-09-29 12:00 in New York (EDT, 240 minutes west). */
const NOW = new Date("2026-09-29T16:00:00Z");
const NY = 240;
const TODAY = "2026-09-29";
const TOKEN = "widgets.jwt";

const FEED = {
  generatedAt: NOW.getTime(),
  todayKey: TODAY,
  refreshAfterSeconds: 900,
  badgeCount: 0,
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
      caption: "P 120/160g",
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
      caption: "Chapter 2",
      state: "todo",
      progress: null,
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
      headline: "Upper Body",
      headlineUnit: null,
      caption: "45 min",
      state: "at-risk",
      progress: 0.2,
      rings: [],
      deepLink: "/dashboard/workout",
    },
  ],
} as unknown as WidgetFeed;

const okFeed: WidgetFeedResult = { kind: "ok", feed: FEED };

interface DrawCall {
  snapshot: WidgetSnapshot | null;
  signedIn: boolean;
  todayKey: string;
}

interface Harness {
  deps: IosWidgetsRefreshDeps;
  draws: DrawCall[];
  saved: WidgetSnapshot[];
  clearedToken: number;
  clearedSnapshot: number;
  rescheduled: (number | null)[];
  storedToken: string | null;
  storedSnapshot: WidgetSnapshot | null;
}

function harness(
  overrides: IosWidgetsRefreshDeps = {},
  seed: { token?: string | null; snapshot?: WidgetSnapshot | null } = {},
): Harness {
  const h: Harness = {
    deps: {},
    draws: [],
    saved: [],
    clearedToken: 0,
    clearedSnapshot: 0,
    rescheduled: [],
    storedToken: seed.token === undefined ? TOKEN : seed.token,
    storedSnapshot: seed.snapshot === undefined ? null : seed.snapshot,
  };
  h.deps = {
    loadToken: async () => h.storedToken,
    clearToken: async () => {
      h.clearedToken += 1;
      h.storedToken = null;
    },
    loadSnapshot: async () => h.storedSnapshot,
    saveSnapshot: async (s) => {
      h.saved.push(s);
      h.storedSnapshot = s;
    },
    clearSnapshot: async () => {
      h.clearedSnapshot += 1;
      h.storedSnapshot = null;
    },
    fetchFeed: async () => okFeed,
    draw: async (args) => {
      h.draws.push(args);
      return 5;
    },
    reschedule: async (seconds) => {
      h.rescheduled.push(seconds);
    },
    now: () => NOW,
    tzOffsetMinutes: () => NY,
    ...overrides,
  };
  return h;
}

function storedSnapshotForToday(): WidgetSnapshot {
  return {
    generatedAt: NOW.getTime(),
    todayKey: TODAY,
    rows: [
      {
        key: "streak",
        title: "Streak",
        headline: "12",
        headlineUnit: "days",
        caption: "2 days to 14",
        state: "done",
        progress: 0.85,
        deepLink: "/dashboard/streaks",
      },
    ],
  };
}

describe("refreshIosWidgets", () => {
  it("with no token draws the prompt and touches nothing else", async () => {
    const h = harness({}, { token: null });
    const fetchFeed = jest.fn(h.deps.fetchFeed);
    h.deps.fetchFeed = fetchFeed;

    await expect(refreshIosWidgets(h.deps)).resolves.toBe("no-token");

    expect(fetchFeed).not.toHaveBeenCalled();
    expect(h.clearedToken).toBe(0);
    expect(h.clearedSnapshot).toBe(0);
    expect(h.saved).toHaveLength(0);
    expect(h.rescheduled).toHaveLength(0);
    expect(h.draws).toEqual([{ snapshot: null, signedIn: false, todayKey: TODAY }]);
  });

  it("on ok saves the snapshot, pushes signed-in timelines, reschedules", async () => {
    const h = harness();

    await expect(refreshIosWidgets(h.deps)).resolves.toBe("refreshed");

    // Saved BEFORE drawing, so the next offline refresh has today's numbers.
    expect(h.saved).toHaveLength(1);
    expect(h.saved[0]?.todayKey).toBe(TODAY);
    expect(h.saved[0]?.rows.length).toBeGreaterThan(0);
    expect(h.draws).toHaveLength(1);
    expect(h.draws[0]?.signedIn).toBe(true);
    expect(h.draws[0]?.todayKey).toBe(TODAY);
    expect(h.draws[0]?.snapshot).toBe(h.saved[0]);
    // The feed's cadence, passed through for the next registration.
    expect(h.rescheduled).toEqual([900]);
    // The token survives a good read.
    expect(h.storedToken).toBe(TOKEN);
    expect(h.clearedToken).toBe(0);
    expect(h.clearedSnapshot).toBe(0);
  });

  it("on revoked clears the token and the snapshot and draws the prompt", async () => {
    const h = harness(
      { fetchFeed: async () => ({ kind: "revoked" }) },
      { snapshot: storedSnapshotForToday() },
    );

    await expect(refreshIosWidgets(h.deps)).resolves.toBe("revoked");

    expect(h.clearedToken).toBe(1);
    expect(h.clearedSnapshot).toBe(1);
    expect(h.storedToken).toBeNull();
    expect(h.storedSnapshot).toBeNull();
    expect(h.saved).toHaveLength(0);
    expect(h.rescheduled).toHaveLength(0);
    // The prompt — never a stale number on a signed-out tile.
    expect(h.draws).toEqual([{ snapshot: null, signedIn: false, todayKey: TODAY }]);
  });

  it("when unreachable paints the stored snapshot and keeps the token", async () => {
    const stored = storedSnapshotForToday();
    const h = harness(
      { fetchFeed: async () => ({ kind: "unreachable" }) },
      { snapshot: stored },
    );

    await expect(refreshIosWidgets(h.deps)).resolves.toBe("offline");

    expect(h.storedToken).toBe(TOKEN);
    expect(h.clearedToken).toBe(0);
    expect(h.clearedSnapshot).toBe(0);
    expect(h.saved).toHaveLength(0);
    expect(h.draws).toEqual([{ snapshot: stored, signedIn: true, todayKey: TODAY }]);
  });

  it("when unreachable with no snapshot draws the prompt side, still signed in", async () => {
    const h = harness({ fetchFeed: async () => ({ kind: "unreachable" }) });

    await expect(refreshIosWidgets(h.deps)).resolves.toBe("offline");

    expect(h.storedToken).toBe(TOKEN);
    expect(h.draws).toEqual([{ snapshot: null, signedIn: true, todayKey: TODAY }]);
  });

  it("never throws: a throwing store still resolves offline", async () => {
    const h = harness({
      loadToken: async () => {
        throw new Error("keychain locked");
      },
    });

    await expect(refreshIosWidgets(h.deps)).resolves.toBe("offline");
  });

  it("never throws: a throwing draw still resolves, as offline", async () => {
    const h = harness({
      draw: async () => {
        throw new Error("extension gone");
      },
    });

    // The timelines were not pushed, so the verdict is the retryable one —
    // the snapshot was still saved for the next run.
    await expect(refreshIosWidgets(h.deps)).resolves.toBe("offline");
    expect(h.saved).toHaveLength(1);
  });

  it("computes the day the same way the hand-off does", async () => {
    const h = harness();
    await refreshIosWidgets(h.deps);
    expect(h.draws[0]?.todayKey).toBe(localDayStamp(NOW, NY));
  });
});

describe("refreshIntervalMinutes", () => {
  it("passes the feed cadence through in minutes", () => {
    expect(refreshIntervalMinutes(900)).toBe(15);
    expect(refreshIntervalMinutes(1800)).toBe(30);
    expect(refreshIntervalMinutes(3600)).toBe(60);
  });

  it("clamps below the 15-minute floor", () => {
    expect(refreshIntervalMinutes(60)).toBe(15);
    expect(refreshIntervalMinutes(0)).toBe(15);
    expect(refreshIntervalMinutes(-30)).toBe(15);
  });

  it("clamps above the 6-hour ceiling", () => {
    expect(refreshIntervalMinutes(24 * 3600)).toBe(360);
    expect(refreshIntervalMinutes(Number.MAX_SAFE_INTEGER)).toBe(360);
  });

  it("falls back to 30 minutes when the feed names no cadence", () => {
    expect(refreshIntervalMinutes(null)).toBe(30);
    expect(refreshIntervalMinutes(undefined)).toBe(30);
    expect(refreshIntervalMinutes(NaN)).toBe(30);
    expect(refreshIntervalMinutes(Infinity)).toBe(30);
  });
});

function fakeScheduler(): {
  defined: string[];
  registered: { name: string; minimumInterval: number }[];
  taskSucceeded: number;
  taskFailed: number;
  defineTask: jest.Mock<void, [string]>;
  isTaskDefined: jest.Mock<boolean, [string]>;
  registerTaskAsync: jest.Mock<Promise<void>, [string, { minimumInterval: number }]>;
} {
  const defined: string[] = [];
  const registered: { name: string; minimumInterval: number }[] = [];
  const defineTask: jest.Mock<void, [string]> = jest.fn((name: string) => {
    defined.push(name);
  });
  const isTaskDefined: jest.Mock<boolean, [string]> = jest.fn(
    (_name: string) => defined.length > 0,
  );
  const registerTaskAsync: jest.Mock<
    Promise<void>,
    [string, { minimumInterval: number }]
  > = jest.fn(async (name: string, options: { minimumInterval: number }) => {
    registered.push({ name, minimumInterval: options.minimumInterval });
  });
  return {
    defined,
    registered,
    taskSucceeded: 1,
    taskFailed: 2,
    defineTask,
    isTaskDefined,
    registerTaskAsync,
  };
}

describe("registerIosWidgetsRefresh", () => {
  it("registers on iOS with the clamped interval", async () => {
    const scheduler = fakeScheduler();

    await expect(
      registerIosWidgetsRefresh({ refreshAfterSeconds: 300, scheduler }),
    ).resolves.toBe("registered");

    expect(scheduler.defined).toEqual([IOS_WIDGETS_REFRESH_TASK]);
    expect(scheduler.registered).toEqual([
      { name: IOS_WIDGETS_REFRESH_TASK, minimumInterval: 15 },
    ]);
  });

  it("registers the default interval when the caller holds no cadence", async () => {
    const scheduler = fakeScheduler();

    await expect(registerIosWidgetsRefresh({ scheduler })).resolves.toBe(
      "registered",
    );

    expect(scheduler.registered).toEqual([
      { name: IOS_WIDGETS_REFRESH_TASK, minimumInterval: 30 },
    ]);
  });

  it("does not redefine a task that is already defined", async () => {
    const scheduler = fakeScheduler();
    scheduler.defined.push(IOS_WIDGETS_REFRESH_TASK);

    await expect(registerIosWidgetsRefresh({ scheduler })).resolves.toBe(
      "registered",
    );

    expect(scheduler.defineTask).not.toHaveBeenCalled();
    expect(scheduler.registered).toHaveLength(1);
  });

  it("does not register off iOS", async () => {
    const scheduler = fakeScheduler();
    jest.replaceProperty(Platform, "OS", "android");
    try {
      await expect(registerIosWidgetsRefresh({ scheduler })).resolves.toBe(
        "unsupported",
      );
    } finally {
      jest.replaceProperty(Platform, "OS", "ios");
    }

    expect(scheduler.defineTask).not.toHaveBeenCalled();
    expect(scheduler.registerTaskAsync).not.toHaveBeenCalled();
  });

  it("reports unsupported when there is no scheduler to register with", async () => {
    await expect(
      registerIosWidgetsRefresh({ scheduler: null }),
    ).resolves.toBe("unsupported");
  });

  it("never throws when the OS refuses the registration", async () => {
    const scheduler = fakeScheduler();
    scheduler.registerTaskAsync.mockRejectedValueOnce(new Error("denied"));

    await expect(registerIosWidgetsRefresh({ scheduler })).resolves.toBe(
      "unsupported",
    );
  });
});
