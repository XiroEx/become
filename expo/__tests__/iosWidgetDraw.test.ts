/**
 * ─── The iOS draw path: timelines pushed at open, the prompt at sign-out ────
 *
 * WidgetKit paints a pushed timeline, not our code, so what is pinned here is
 * the contract between the hand-off (`handoff.ts`) and the extension:
 *
 *   • sign-in hand-off pushes a timeline to ALL FIVE widgets with the feed's
 *     values (title, headline + unit, caption, progress, tap url);
 *   • sign-out pushes the sign-in prompt to all five — never a number, because
 *     a number on a signed-out tile is another member's day;
 *   • a 401 from the feed (revoked) clears the token + snapshot and pushes
 *     the prompt;
 *   • offline (mint unreachable, feed unreachable) leaves the widgets
 *     untouched — the tiles keep painting from their snapshot;
 *   • a throwing `updateTimeline` on one widget still updates the others.
 *
 * Jest runs on iOS (the RN preset's default platform), so `hasWidgetSurface`
 * is true here and the iOS loader is the live one. The native module itself
 * does not exist under Jest — `__mocks__/expo-widgets.ts` stands in for it —
 * so these tests drive `drawIosWidgets` with recording fakes and drive the
 * hand-off with its `draw`/`hasSurface` DI, exactly like the Android half of
 * `widgetHandoff.test.ts` does.
 */
import type { WidgetKey } from "@become/api-client";
import * as fs from "fs";
import * as path from "path";
import {
  clearWidgetsHandoff,
  handOffWidgetsToken,
  type WidgetHandoffDeps,
} from "@/lib/widgets/handoff";
import { IOS_WIDGETS } from "@/lib/widgets/iosWidgets";
import {
  buildIosTimeline,
  IOS_WIDGET_SIGN_IN_PROMPT,
  type IosWidgetProps,
} from "@/lib/widgets/iosTimeline";
import {
  drawIosWidgets,
  hasWidgetSurface,
  loadIosWidgetUpdaters,
  type IosWidgetUpdater,
} from "@/lib/widgets/update";
import { snapshotFromFeed, type WidgetSnapshot } from "@/lib/widgets/snapshot";
import type { WidgetFeedResult } from "@/lib/widgets/feed";

/** 2026-09-29 12:00 in New York (EDT, 240 minutes west). */
const NOW = new Date("2026-09-29T16:00:00Z");
const MIDNIGHT = new Date("2026-09-30T04:00:00Z");
const NY = 240;
const SESSION = "session.jwt";

const FEED = {
  generatedAt: NOW.getTime(),
  todayKey: "2026-09-29",
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
      caption: "45 min · 5 exercises",
      state: "at-risk",
      progress: 0.2,
      rings: [],
      deepLink: "/dashboard/workout",
    },
  ],
};

const okFeed = { kind: "ok", feed: FEED } as unknown as WidgetFeedResult;

const EXPO_DIR = path.resolve(__dirname, "..");

function snapshot(): WidgetSnapshot {
  return snapshotFromFeed(FEED as never, NOW.getTime());
}

interface Recording {
  updaters: Record<string, IosWidgetUpdater>;
  pushed: Record<string, { date: Date; props: IosWidgetProps }[]>;
}

function recording(onPush?: (name: string) => void): Recording {
  const rec: Recording = { updaters: {}, pushed: {} };
  for (const definition of IOS_WIDGETS) {
    rec.updaters[definition.name] = {
      updateTimeline: (entries) => {
        onPush?.(definition.name);
        rec.pushed[definition.name] = entries as {
          date: Date;
          props: IosWidgetProps;
        }[];
      },
    };
  }
  return rec;
}

function signedInProps(
  pushed: Recording["pushed"],
  feedKey: WidgetKey,
): IosWidgetProps & { signedIn: true } {
  const name = IOS_WIDGETS.find((w) => w.feedKey === feedKey)?.name;
  const first = name ? pushed[name]?.[0]?.props : undefined;
  if (!first || !first.signedIn) {
    throw new Error(`expected a signed-in timeline for ${feedKey}`);
  }
  return first;
}

describe("drawIosWidgets", () => {
  it("pushes a timeline with feed values to all five widgets", async () => {
    const rec = recording();
    const drawn = await drawIosWidgets({
      snapshot: snapshot(),
      signedIn: true,
      todayKey: "2026-09-29",
      now: NOW,
      nextLocalMidnight: MIDNIGHT,
      updaters: rec.updaters,
    });
    expect(drawn).toBe(5);
    expect(Object.keys(rec.pushed).sort()).toEqual(
      IOS_WIDGETS.map((w) => w.name).sort(),
    );

    // The feed's strings and fractions, verbatim — the widget holds no
    // business logic.
    const streak = signedInProps(rec.pushed, "streak");
    expect(streak.title).toBe("Streak");
    expect(streak.headline).toBe("12");
    expect(streak.headlineUnit).toBe("days");
    expect(streak.caption).toBe("2 days to 14");
    expect(streak.state).toBe("done");
    expect(streak.progress).toBe(0.85);
    expect(streak.url).toBe("become://dashboard/streaks");

    const mind = signedInProps(rec.pushed, "mind");
    expect(mind.headlineUnit).toBeNull();
    expect(mind.progress).toBeNull();

    // Today's row now, the prompt at local midnight — never yesterday's
    // numbers after the rollover.
    for (const definition of IOS_WIDGETS) {
      const entries = rec.pushed[definition.name];
      expect(entries?.length).toBe(2);
      expect(entries?.[0]?.date).toEqual(NOW);
      expect(entries?.[1]?.date).toEqual(MIDNIGHT);
      expect(entries?.[1]?.props.signedIn).toBe(false);
    }
  });

  it("pushes the sign-in prompt — never a number — when signed out", async () => {
    const rec = recording();
    const drawn = await drawIosWidgets({
      snapshot: snapshot(),
      signedIn: false,
      todayKey: "2026-09-29",
      now: NOW,
      nextLocalMidnight: MIDNIGHT,
      updaters: rec.updaters,
    });
    expect(drawn).toBe(5);
    for (const definition of IOS_WIDGETS) {
      const props = rec.pushed[definition.name]?.[0]?.props;
      expect(props?.signedIn).toBe(false);
      if (props && !props.signedIn) {
        expect(props.prompt).toBe(IOS_WIDGET_SIGN_IN_PROMPT);
        expect(props.url).toBe("become://login");
        expect(JSON.stringify(props)).not.toMatch(/\b12\b/);
      }
    }
  });

  it("refuses a snapshot from another day", async () => {
    const rec = recording();
    await drawIosWidgets({
      snapshot: snapshot(),
      signedIn: true,
      todayKey: "2026-09-30",
      now: NOW,
      nextLocalMidnight: MIDNIGHT,
      updaters: rec.updaters,
    });
    for (const definition of IOS_WIDGETS) {
      expect(rec.pushed[definition.name]?.[0]?.props.signedIn).toBe(false);
    }
  });

  it("does nothing, and says so, when there is no widget module (Expo Go)", async () => {
    expect(
      await drawIosWidgets({
        snapshot: snapshot(),
        signedIn: true,
        todayKey: "2026-09-29",
        updaters: null,
      }),
    ).toBe(0);
  });

  it("one widget that throws does not cost the other four", async () => {
    const rec = recording((name) => {
      if (name === "NutritionWidget") throw new Error("extension gone");
    });
    const drawn = await drawIosWidgets({
      snapshot: snapshot(),
      signedIn: true,
      todayKey: "2026-09-29",
      now: NOW,
      nextLocalMidnight: MIDNIGHT,
      updaters: rec.updaters,
    });
    expect(drawn).toBe(4);
    expect(Object.keys(rec.pushed).sort()).toEqual(
      IOS_WIDGETS.filter((w) => w.name !== "NutritionWidget").map((w) => w.name).sort(),
    );
  });

  it("only claims a surface where there is a loader to draw with", () => {
    // Jest runs on iOS, so the surface here is the WidgetKit one.
    expect(hasWidgetSurface()).toBe(true);
    expect(loadIosWidgetUpdaters()).not.toBeNull();
  });

  it("registers the iOS layouts from the app entry, on iOS only", () => {
    const entry = fs.readFileSync(path.join(EXPO_DIR, "index.js"), "utf8");
    expect(entry).toMatch(/Platform\.OS === "ios"/);
    expect(entry).toMatch(/lib\/widgets\/ios\/widgets/);
  });

  it("agrees with the pure builder about what each widget shows", async () => {
    const rec = recording();
    await drawIosWidgets({
      snapshot: snapshot(),
      signedIn: true,
      todayKey: "2026-09-29",
      now: NOW,
      nextLocalMidnight: MIDNIGHT,
      updaters: rec.updaters,
    });
    const expected = buildIosTimeline({
      snapshot: snapshot(),
      signedIn: true,
      now: NOW,
      todayKey: "2026-09-29",
      nextLocalMidnight: MIDNIGHT,
    });
    for (const definition of IOS_WIDGETS) {
      expect(rec.pushed[definition.name]).toEqual(
        expected[definition.feedKey],
      );
    }
  });
});

interface HandoffRecorder {
  deps: WidgetHandoffDeps;
  stored: string[];
  cleared: number;
  snapshotsSaved: WidgetSnapshot[];
  snapshotsCleared: number;
  draws: { signedIn: boolean; todayKey: string; rows: number | null }[];
}

function handoffRecorder(over: WidgetHandoffDeps = {}): HandoffRecorder {
  const rec: HandoffRecorder = {
    stored: [],
    cleared: 0,
    snapshotsSaved: [],
    snapshotsCleared: 0,
    draws: [],
    deps: {},
  };
  rec.deps = {
    hasSurface: () => true,
    now: () => NOW,
    tzOffsetMinutes: () => NY,
    mint: async () => ({
      kind: "ok",
      token: "widgets.jwt",
      refreshAfterSeconds: 900,
    }),
    storeToken: async (token) => {
      rec.stored.push(token);
    },
    clearToken: async () => {
      rec.cleared += 1;
    },
    fetchFeed: async () => okFeed,
    saveSnapshot: async (s) => {
      rec.snapshotsSaved.push(s);
    },
    clearSnapshot: async () => {
      rec.snapshotsCleared += 1;
    },
    draw: async ({ signedIn, todayKey, snapshot: s }) => {
      rec.draws.push({
        signedIn,
        todayKey,
        rows: s ? s.rows.length : null,
      });
      // The default draw this stands in for pushes all five iOS timelines on
      // iOS — mirror that count so the verdicts below mean something.
      return IOS_WIDGETS.length;
    },
    ...over,
  };
  return rec;
}

describe("the iOS hand-off at open and sign-out", () => {
  it("sign-in hand-off draws all five timelines with feed values", async () => {
    const rec = handoffRecorder();
    expect(await handOffWidgetsToken(SESSION, rec.deps)).toBe("handed-off");
    expect(rec.stored).toEqual(["widgets.jwt"]);
    expect(rec.snapshotsSaved[0]?.rows.map((r) => r.key)).toEqual([
      "streak",
      "nutrition",
      "mind",
      "becoming",
      "training",
    ]);
    expect(rec.draws).toEqual([
      { signedIn: true, todayKey: "2026-09-29", rows: 5 },
    ]);
  });

  it("sign-out pushes the sign-in prompt to all five", async () => {
    const rec = handoffRecorder();
    await clearWidgetsHandoff(rec.deps);
    expect(rec.cleared).toBe(1);
    expect(rec.snapshotsCleared).toBe(1);
    expect(rec.draws).toEqual([
      { signedIn: false, todayKey: "2026-09-29", rows: null },
    ]);
  });

  it("a 401 from the feed (revoked) clears token + snapshot and pushes the prompt", async () => {
    const rec = handoffRecorder({
      mint: async () => ({ kind: "refused", status: 401 }),
    });
    expect(await handOffWidgetsToken(SESSION, rec.deps)).toBe("refused");
    expect(rec.cleared).toBe(1);
    expect(rec.snapshotsCleared).toBe(1);
    expect(rec.draws).toEqual([
      { signedIn: false, todayKey: "2026-09-29", rows: null },
    ]);
  });

  it("offline leaves the widgets untouched", async () => {
    const mintGone = handoffRecorder({
      mint: async () => ({ kind: "unreachable" }),
    });
    expect(await handOffWidgetsToken(SESSION, mintGone.deps)).toBe(
      "unreachable",
    );
    expect(mintGone.stored).toEqual([]);
    expect(mintGone.draws).toEqual([]);

    const feedGone = handoffRecorder({
      fetchFeed: async () => ({ kind: "unreachable" }),
    });
    expect(await handOffWidgetsToken(SESSION, feedGone.deps)).toBe(
      "token-only",
    );
    expect(feedGone.stored).toEqual(["widgets.jwt"]);
    expect(feedGone.draws).toEqual([]);
  });
});
