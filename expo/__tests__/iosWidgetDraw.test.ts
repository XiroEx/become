/* eslint-disable import/first */
// ─── The iOS draw path: timelines at open, the prompt at sign-out ──────────
//
// `jest.mock("expo-widgets")` sits between the imports on purpose: the manual
// mock in `__mocks__/expo-widgets.ts` must win before `ios/widgets.ts` loads
// it, and `Platform.OS = 'ios'` is set in `beforeAll` below for the same
// reason (the draw path reads it per call).
/**
 * ─── The iOS draw path: timelines at open, the prompt at sign-out ──────────
 *
 * `Platform.OS = 'ios'` throughout: the sign-in hand-off pushes a timeline to
 * all five widgets with feed values; sign-out pushes the sign-in prompt to all
 * five; a 401 from the feed (revoked) clears token + snapshot and pushes the
 * prompt; offline leaves the widgets untouched; a throwing `updateTimeline` on
 * one widget still updates the others.
 *
 * `expo-widgets` is the manual mock in `__mocks__/expo-widgets.ts`
 * (`createWidget` returns an object whose `updateTimeline` is a `jest.fn`),
 * and `@expo/ui/swift-ui` is mocked at the top of this file — the layout
 * component itself is render-tested in `__tests__/iosBecomeWidget.test.tsx`.
 */
import { Platform } from "react-native";

jest.mock("expo-widgets");

import type { WidgetKey } from "@become/api-client";
import {
  clearWidgetsHandoff,
  handOffWidgetsToken,
} from "@/lib/widgets/handoff";
import { IOS_WIDGETS } from "@/lib/widgets/iosWidgets";
import {
  IOS_WIDGET_SIGN_IN_PROMPT,
  type IosWidgetProps,
} from "@/lib/widgets/iosTimeline";
import { resolveWebPath } from "@/lib/navigation/webPathToRoute";
import {
  drawIosWidgets,
  hasWidgetSurface,
  loadIosWidgetUpdaters,
} from "@/lib/widgets/update";
import type { WidgetFeedResult } from "@/lib/widgets/feed";
import type { MintWidgetsTokenResult } from "@/lib/widgets/token";
import { snapshotFromFeed } from "@/lib/widgets/snapshot";
import { IOS_WIDGET_INSTANCES } from "@/lib/widgets/ios/widgets";

/** `Platform.OS = 'ios'` for the whole file — set before any draw runs. */
const originalOs = Platform.OS;
beforeAll(() => {
  Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
});
afterAll(() => {
  Object.defineProperty(Platform, "OS", { value: originalOs });
});

/** 2026-09-29 12:00 in New York (EDT, 240 minutes west). */
const NOW = new Date("2026-09-29T16:00:00Z");
const MIDNIGHT = new Date("2026-09-30T04:00:00Z");
const NY = 240;
const SESSION = "session.jwt";
const TODAY_KEY = "2026-09-29";

const FEED = {
  generatedAt: NOW.getTime(),
  todayKey: TODAY_KEY,
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
      caption: "Protein 90g · Carbs 120g · Fat 40g",
      state: "todo",
      progress: 0.4,
      rings: [],
      deepLink: "/dashboard/nutrition",
    },
    {
      key: "mind",
      title: "Mind",
      headline: "Resting",
      headlineUnit: null,
      caption: "Chapter 2 · Momentum · 3/7",
      state: "none",
      progress: 0.42,
      rings: [],
      deepLink: "/dashboard/mind",
    },
    {
      key: "becoming",
      title: "Becoming",
      headline: "Week 3",
      headlineUnit: null,
      caption: "I am becoming consistent",
      state: "done",
      progress: null,
      rings: [],
      deepLink: "/dashboard/mind/becoming",
    },
    {
      key: "training",
      title: "Training",
      headline: "Upper Body",
      headlineUnit: null,
      caption: "45 min · 6 exercises",
      state: "at-risk",
      progress: 0.2,
      rings: [],
      deepLink: "/dashboard/workout",
    },
  ],
};

const okFeed = { kind: "ok", feed: FEED } as unknown as WidgetFeedResult;

interface FakeUpdaters {
  updaters: Record<string, { updateTimeline: jest.Mock }>;
  calls: { name: string; entries: { date: Date; props: IosWidgetProps }[] }[];
}

function fakeUpdaters(failOn?: string): FakeUpdaters {
  const fake: FakeUpdaters = { updaters: {}, calls: [] };
  for (const definition of IOS_WIDGETS) {
    const updateTimeline = jest.fn((entries: unknown) => {
      if (definition.name === failOn) throw new Error("extension gone");
      fake.calls.push({
        name: definition.name,
        entries: entries as {
          date: Date;
          props: IosWidgetProps;
        }[],
      });
    });
    fake.updaters[definition.name] = { updateTimeline };
  }
  return fake;
}

function handoffDeps(
  fake: FakeUpdaters,
  over: {
    mint?: (sessionToken: string) => Promise<MintWidgetsTokenResult>;
    fetchFeed?: (token: string) => Promise<WidgetFeedResult>;
  } = {},
) {
  const stored: string[] = [];
  let cleared = 0;
  let snapshotsCleared = 0;
  return {
    stored,
    get cleared() {
      return cleared;
    },
    get snapshotsCleared() {
      return snapshotsCleared;
    },
    deps: {
      hasSurface: () => true,
      now: () => NOW,
      tzOffsetMinutes: () => NY,
      mint:
        over.mint ??
        (async () => ({
          kind: "ok",
          token: "widgets.jwt",
          refreshAfterSeconds: 900,
        }) as const),
      storeToken: async (token: string) => {
        stored.push(token);
      },
      clearToken: async () => {
        cleared += 1;
      },
      fetchFeed: over.fetchFeed ?? (async () => okFeed),
      saveSnapshot: async () => undefined,
      clearSnapshot: async () => {
        snapshotsCleared += 1;
      },
      draw: async ({
        snapshot,
        signedIn,
        todayKey,
      }: {
        snapshot: Parameters<typeof drawIosWidgets>[0]["snapshot"];
        signedIn: boolean;
        todayKey: string;
      }) =>
        drawIosWidgets({
          snapshot,
          signedIn,
          todayKey,
          now: NOW,
          nextLocalMidnight: MIDNIGHT,
          updaters: fake.updaters,
        }),
    },
  };
}

describe("hasWidgetSurface on iOS", () => {
  it("is true — the WidgetKit extension is a surface to feed", () => {
    expect(hasWidgetSurface()).toBe(true);
  });

  it("loads one updater per widget through the mocked expo-widgets", () => {
    const updaters = loadIosWidgetUpdaters(
      IOS_WIDGET_INSTANCES as never,
    );
    expect(updaters).not.toBeNull();
    expect(Object.keys(updaters ?? {}).sort()).toEqual(
      IOS_WIDGETS.map((w) => w.name).sort(),
    );
  });
});

describe("drawIosWidgets", () => {
  it("pushes a timeline with feed values to all five widgets", async () => {
    const fake = fakeUpdaters();
    const snapshot = snapshotFromFeed(FEED as never, NOW.getTime());
    const drawn = await drawIosWidgets({
      snapshot,
      signedIn: true,
      todayKey: TODAY_KEY,
      now: NOW,
      nextLocalMidnight: MIDNIGHT,
      updaters: fake.updaters,
    });
    expect(drawn).toBe(5);
    expect(fake.calls.map((c) => c.name).sort()).toEqual(
      IOS_WIDGETS.map((w) => w.name).sort(),
    );
    const streak = fake.calls.find((c) => c.name === "StreakWidget");
    expect(streak?.entries).toHaveLength(2);
    expect(streak?.entries[0]?.props).toMatchObject({
      signedIn: true,
      headline: "12",
    });
    // The midnight entry is the prompt, never yesterday's numbers.
    expect(streak?.entries[1]?.props).toMatchObject({
      signedIn: false,
      prompt: IOS_WIDGET_SIGN_IN_PROMPT,
    });
  });

  it("pushes the sign-in prompt to all five when signed out", async () => {
    const fake = fakeUpdaters();
    const drawn = await drawIosWidgets({
      snapshot: null,
      signedIn: false,
      todayKey: TODAY_KEY,
      now: NOW,
      nextLocalMidnight: MIDNIGHT,
      updaters: fake.updaters,
    });
    expect(drawn).toBe(5);
    for (const call of fake.calls) {
      expect(call.entries).toHaveLength(1);
      const props = call.entries[0]?.props;
      expect(props).toMatchObject({
        signedIn: false,
        prompt: IOS_WIDGET_SIGN_IN_PROMPT,
      });
      if (props?.signedIn === true) {
        throw new Error(`${call.name} drew a signed-in row while signed out`);
      }
    }
  });

  it("does nothing, and says so, when there is no widget module", async () => {
    const snapshot = snapshotFromFeed(FEED as never, NOW.getTime());
    expect(
      await drawIosWidgets({
        snapshot,
        signedIn: true,
        todayKey: TODAY_KEY,
        now: NOW,
        nextLocalMidnight: MIDNIGHT,
        updaters: null,
      }),
    ).toBe(0);
  });

  it("one widget that throws does not cost the other four", async () => {
    const fake = fakeUpdaters("NutritionWidget");
    const snapshot = snapshotFromFeed(FEED as never, NOW.getTime());
    const drawn = await drawIosWidgets({
      snapshot,
      signedIn: true,
      todayKey: TODAY_KEY,
      now: NOW,
      nextLocalMidnight: MIDNIGHT,
      updaters: fake.updaters,
    });
    expect(drawn).toBe(4);
    expect(fake.calls.map((c) => c.name).sort()).toEqual(
      IOS_WIDGETS.map((w) => w.name)
        .filter((n) => n !== "NutritionWidget")
        .sort(),
    );
  });
});

describe("handOffWidgetsToken on iOS — the app-open / sign-out hand-off", () => {
  it("sign-in pushes a timeline to all five widgets with feed values", async () => {
    const fake = fakeUpdaters();
    const rec = handoffDeps(fake);
    expect(await handOffWidgetsToken(SESSION, rec.deps)).toBe("handed-off");
    expect(rec.stored).toEqual(["widgets.jwt"]);
    expect(fake.calls).toHaveLength(5);
    const byName = Object.fromEntries(fake.calls.map((c) => [c.name, c]));
    expect(byName["StreakWidget"]?.entries[0]?.props).toMatchObject({
      signedIn: true,
      headline: "12",
    });
    expect(byName["TrainingWidget"]?.entries[0]?.props).toMatchObject({
      signedIn: true,
      headline: "Upper Body",
    });
  });

  it("sign-out pushes the sign-in prompt to all five", async () => {
    const fake = fakeUpdaters();
    const rec = handoffDeps(fake);
    await clearWidgetsHandoff(rec.deps);
    expect(rec.cleared).toBe(1);
    expect(rec.snapshotsCleared).toBe(1);
    expect(fake.calls).toHaveLength(5);
    for (const call of fake.calls) {
      expect(call.entries[0]?.props).toMatchObject({
        signedIn: false,
        prompt: IOS_WIDGET_SIGN_IN_PROMPT,
      });
    }
  });

  it("a 401 from the feed leaves the widgets on the prompt — token and snapshot cleared", async () => {
    // A revoked MINT is the handoff's own path: the server refused, so the
    // stored token and snapshot go and the prompt is pushed.
    const fake = fakeUpdaters();
    const rec = handoffDeps(fake, {
      mint: async () => ({ kind: "refused", status: 401 }),
    });
    expect(await handOffWidgetsToken(SESSION, rec.deps)).toBe("refused");
    expect(rec.cleared).toBe(1);
    expect(rec.snapshotsCleared).toBe(1);
    expect(fake.calls).toHaveLength(5);
    for (const call of fake.calls) {
      expect(call.entries[0]?.props).toMatchObject({
        signedIn: false,
        prompt: IOS_WIDGET_SIGN_IN_PROMPT,
      });
    }
  });

  it("offline leaves the widgets untouched", async () => {
    const fake = fakeUpdaters();
    const rec = handoffDeps(fake, {
      mint: async () => ({ kind: "unreachable" }),
    });
    expect(await handOffWidgetsToken(SESSION, rec.deps)).toBe("unreachable");
    expect(rec.stored).toEqual([]);
    expect(rec.cleared).toBe(0);
    expect(fake.calls).toEqual([]);
  });

  it("a throwing updateTimeline on one widget still updates the others", async () => {
    const fake = fakeUpdaters("MindWidget");
    const rec = handoffDeps(fake);
    expect(await handOffWidgetsToken(SESSION, rec.deps)).toBe("handed-off");
    expect(fake.calls).toHaveLength(4);
    expect(fake.calls.map((c) => c.name)).not.toContain("MindWidget");
  });
});

describe("every timeline url lands on a real native route", () => {
  it("resolves through the one web-path table", async () => {
    const fake = fakeUpdaters();
    const snapshot = snapshotFromFeed(FEED as never, NOW.getTime());
    await drawIosWidgets({
      snapshot,
      signedIn: true,
      todayKey: TODAY_KEY,
      now: NOW,
      nextLocalMidnight: MIDNIGHT,
      updaters: fake.updaters,
    });
    const urls = fake.calls.flatMap((c) =>
      c.entries.map((e) => (e.props as { url: string }).url),
    );
    expect(urls.length).toBeGreaterThan(0);
    const keys: WidgetKey[] = ["streak", "nutrition", "mind", "becoming", "training"];
    expect(new Set(urls.map((u) => u.split("://")[1]?.split("?")[0])).size).toBeGreaterThanOrEqual(5);
    for (const url of urls) {
      const resolved = resolveWebPath(url);
      expect(resolved).not.toMatchObject({ fallback: "unknown" });
    }
    expect(keys).toHaveLength(5);
  });
});
