/**
 * ─── The refresh the OS drives, with no app running ──────────────────────────
 *
 * This is the path that decides what a member sees on their home screen when
 * they have not opened Become since yesterday. It runs as a headless JS task: no
 * session in memory, maybe no network, and no one to report a failure to.
 *
 * Every branch below is a state the card names or a way to get it wrong:
 *
 *   • no stored token → the sign-in prompt (this is the "after sign-out" state:
 *     signing out clears the token AND bumps the server's counter);
 *   • a token the server no longer accepts → the prompt, and the dead token is
 *     dropped rather than re-asked for 180 days;
 *   • a good token → today's numbers, cached before they are drawn;
 *   • no network → today's cache if it is today's, the "open Become" tile if not;
 *   • anything that throws → the same fallback, never an exception out of the
 *     task and never a blank tile.
 */
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { ANDROID_WIDGETS } from "@/lib/widgets/androidWidgets";
import type { WidgetFeedResult } from "@/lib/widgets/feed";
import {
  encodeSnapshot,
  snapshotFromFeed,
  type WidgetSnapshot,
} from "@/lib/widgets/snapshot";
import { handleWidgetTask } from "@/lib/widgets/taskHandler";
import { widgetTaps, widgetTexts } from "@/test-support/widgetTree";

/** 2026-09-29 12:00 in New York (EDT, 240 minutes west). */
const NOW = new Date("2026-09-29T16:00:00Z");
const NY = 240;

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
      headline: "Upper Body",
      headlineUnit: null,
      caption: "45 min · 5 exercises",
      state: "todo",
      progress: 0.2,
      rings: [],
      deepLink: "/dashboard/workout",
    },
  ],
} as const;

interface Drawn {
  props: WidgetTaskHandlerProps;
  rendered: unknown[];
}

function taskProps(
  widgetName: string,
  widgetAction: WidgetTaskHandlerProps["widgetAction"] = "WIDGET_UPDATE",
): Drawn {
  const rendered: unknown[] = [];
  const props = {
    widgetInfo: {
      widgetName,
      widgetId: 7,
      width: 180,
      height: 130,
      screenInfo: {
        screenHeightDp: 800,
        screenWidthDp: 400,
        density: 3,
        densityDpi: 480,
      },
    },
    widgetAction,
    renderWidget: (component: unknown) => {
      rendered.push(component);
    },
  } as unknown as WidgetTaskHandlerProps;
  return { props, rendered };
}

function deps(over: Parameters<typeof handleWidgetTask>[1] = {}) {
  return {
    now: () => NOW,
    tzOffsetMinutes: () => NY,
    ...over,
  };
}

const okFeed = { kind: "ok", feed: FEED } as unknown as WidgetFeedResult;

describe("a signed-in refresh", () => {
  it("draws every one of the four widgets from its own feed row", async () => {
    const seen: Record<string, string[]> = {};
    for (const definition of ANDROID_WIDGETS) {
      const { props, rendered } = taskProps(definition.name);
      await handleWidgetTask(
        props,
        deps({
          loadToken: async () => "widgets.jwt",
          fetchFeed: async () => okFeed,
          saveSnapshot: async () => undefined,
        }),
      );
      expect(rendered).toHaveLength(1);
      seen[definition.name] = widgetTexts(rendered[0] as never);
    }

    expect(seen.Streak).toEqual(["Streak", "12", "days", "2 days to 14"]);
    expect(seen.Nutrition).toEqual([
      "Nutrition",
      "820",
      "cal left",
      "P 120/160g · C 180/240g · F 40/60g",
    ]);
    expect(seen.Mind).toEqual(["Mind", "Ready", "Chapter 2 · Momentum · 3/7"]);
    expect(seen.Becoming).toEqual([
      "Becoming",
      "Week 6",
      "3 of 4 this week",
    ]);
  });

  it("opens its own screen on a tap", async () => {
    const { props, rendered } = taskProps("Nutrition");
    await handleWidgetTask(
      props,
      deps({
        loadToken: async () => "widgets.jwt",
        fetchFeed: async () => okFeed,
        saveSnapshot: async () => undefined,
      }),
    );
    expect(widgetTaps(rendered[0] as never)[0]).toEqual({
      clickAction: "OPEN_URI",
      uri: "become://dashboard/nutrition",
    });
  });

  it("sends the request with the stored WIDGETS token, not a session", async () => {
    const tokens: string[] = [];
    const { props } = taskProps("Streak");
    await handleWidgetTask(
      props,
      deps({
        loadToken: async () => "widgets.jwt",
        fetchFeed: async (token) => {
          tokens.push(token);
          return okFeed;
        },
        saveSnapshot: async () => undefined,
      }),
    );
    expect(tokens).toEqual(["widgets.jwt"]);
  });

  it("caches the day BEFORE drawing it, so the next offline refresh has it", async () => {
    const order: string[] = [];
    const { props } = taskProps("Streak");
    await handleWidgetTask(
      props,
      deps({
        loadToken: async () => "widgets.jwt",
        fetchFeed: async () => okFeed,
        saveSnapshot: async (snapshot) => {
          order.push(`saved:${snapshot.todayKey}:${snapshot.rows.length}`);
        },
      }),
    );
    // Five rows kept: one snapshot feeds both platforms now (Android draws
    // four of them, iOS all five).
    expect(order).toEqual(["saved:2026-09-29:5"]);
  });
});

describe("after a sign-out", () => {
  it("draws the sign-in prompt on every one of the four widgets", async () => {
    for (const definition of ANDROID_WIDGETS) {
      const { props, rendered } = taskProps(definition.name);
      await handleWidgetTask(
        props,
        deps({
          // Sign-out cleared it (`clearWidgetsHandoff`).
          loadToken: async () => null,
          fetchFeed: async () => {
            throw new Error("must not be called with no token");
          },
        }),
      );
      const texts = widgetTexts(rendered[0] as never);
      expect(texts).toContain("Sign in");
      expect(texts.join(" ")).not.toMatch(/\d/);
      expect(widgetTaps(rendered[0] as never)[0]?.uri).toBe("become://login");
    }
  });

  // The other half of the same story: a widget that still holds a token minted
  // before the sign-out. The server answers 401 because `widgetTokenVersion`
  // moved, so the tile lands on the prompt from this direction too.
  it("drops a revoked token and draws the prompt", async () => {
    let cleared = 0;
    const { props, rendered } = taskProps("Streak");
    await handleWidgetTask(
      props,
      deps({
        loadToken: async () => "stale.widgets.jwt",
        fetchFeed: async () => ({ kind: "revoked" }),
        clearToken: async () => {
          cleared += 1;
        },
      }),
    );
    expect(cleared).toBe(1);
    expect(widgetTexts(rendered[0] as never)).toContain("Sign in");
  });

  it("does not draw a cached day once the token is gone", async () => {
    const snapshot = snapshotFromFeed(FEED as never, NOW.getTime());
    const { props, rendered } = taskProps("Streak");
    await handleWidgetTask(
      props,
      deps({
        loadToken: async () => null,
        loadSnapshot: async () => snapshot,
      }),
    );
    expect(widgetTexts(rendered[0] as never)).not.toContain("12");
  });
});

describe("a refresh with no network", () => {
  const snapshot: WidgetSnapshot = snapshotFromFeed(
    FEED as never,
    NOW.getTime(),
  );

  it("draws today's cached numbers", async () => {
    const { props, rendered } = taskProps("Streak");
    await handleWidgetTask(
      props,
      deps({
        loadToken: async () => "widgets.jwt",
        fetchFeed: async () => ({ kind: "unreachable" }),
        loadSnapshot: async () => snapshot,
      }),
    );
    expect(widgetTexts(rendered[0] as never)).toEqual([
      "Streak",
      "12",
      "days",
      "2 days to 14",
    ]);
  });

  // Yesterday's "820 cal left" is not stale, it is wrong: it describes a day
  // that has ended.
  it("refuses a snapshot from a day that has ended", async () => {
    const { props, rendered } = taskProps("Nutrition");
    await handleWidgetTask(
      props,
      deps({
        now: () => new Date("2026-09-30T16:00:00Z"),
        loadToken: async () => "widgets.jwt",
        fetchFeed: async () => ({ kind: "unreachable" }),
        loadSnapshot: async () => snapshot,
      }),
    );
    const texts = widgetTexts(rendered[0] as never);
    expect(texts).not.toContain("820");
    expect(texts).toContain("Open Become to update this.");
  });

  it("draws the open-the-app tile when there is no cache at all", async () => {
    const { props, rendered } = taskProps("Mind");
    await handleWidgetTask(
      props,
      deps({
        loadToken: async () => "widgets.jwt",
        fetchFeed: async () => ({ kind: "unreachable" }),
        loadSnapshot: async () => null,
      }),
    );
    expect(widgetTexts(rendered[0] as never)).toEqual([
      "Mind",
      "—",
      "Open Become to update this.",
    ]);
  });

  it("keeps the token: offline says nothing about it", async () => {
    let cleared = 0;
    const { props } = taskProps("Streak");
    await handleWidgetTask(
      props,
      deps({
        loadToken: async () => "widgets.jwt",
        fetchFeed: async () => ({ kind: "unreachable" }),
        loadSnapshot: async () => snapshot,
        clearToken: async () => {
          cleared += 1;
        },
      }),
    );
    expect(cleared).toBe(0);
  });
});

describe("the task never takes the widget down", () => {
  it("survives a store that throws, and still draws", async () => {
    const { props, rendered } = taskProps("Streak");
    await expect(
      handleWidgetTask(
        props,
        deps({
          loadToken: async () => {
            throw new Error("keystore unavailable");
          },
          loadSnapshot: async () => null,
        }),
      ),
    ).resolves.toBeUndefined();
    expect(rendered).toHaveLength(1);
    expect(widgetTexts(rendered[0] as never)).toContain(
      "Open Become to update this.",
    );
  });

  it("survives a fetch that throws", async () => {
    const { props, rendered } = taskProps("Streak");
    await handleWidgetTask(
      props,
      deps({
        loadToken: async () => "widgets.jwt",
        fetchFeed: async () => {
          throw new Error("boom");
        },
        loadSnapshot: async () => null,
      }),
    );
    expect(rendered).toHaveLength(1);
  });

  it("draws nothing for a deleted widget", async () => {
    const { props, rendered } = taskProps("Streak", "WIDGET_DELETED");
    await handleWidgetTask(props, deps({ loadToken: async () => "widgets.jwt" }));
    expect(rendered).toHaveLength(0);
  });

  it("draws nothing for a widget name this build does not declare", async () => {
    const { props, rendered } = taskProps("Training");
    await handleWidgetTask(props, deps({ loadToken: async () => "widgets.jwt" }));
    expect(rendered).toHaveLength(0);
  });

  it("treats WIDGET_ADDED and WIDGET_RESIZED as a draw", async () => {
    for (const action of ["WIDGET_ADDED", "WIDGET_RESIZED"] as const) {
      const { props, rendered } = taskProps("Streak", action);
      await handleWidgetTask(
        props,
        deps({
          loadToken: async () => "widgets.jwt",
          fetchFeed: async () => okFeed,
          saveSnapshot: async () => undefined,
        }),
      );
      expect(rendered).toHaveLength(1);
    }
  });
});

describe("the day the task asks about is the DEVICE's day", () => {
  it("uses the local day, not UTC, when judging the cache", async () => {
    // 2026-09-30T02:00Z is still 2026-09-29 in New York, so a snapshot built on
    // the 29th is still today's.
    const snapshot = decodeAgain(snapshotFromFeed(FEED as never, NOW.getTime()));
    const { props, rendered } = taskProps("Streak");
    await handleWidgetTask(
      props,
      deps({
        now: () => new Date("2026-09-30T02:00:00Z"),
        loadToken: async () => "widgets.jwt",
        fetchFeed: async () => ({ kind: "unreachable" }),
        loadSnapshot: async () => snapshot,
      }),
    );
    expect(widgetTexts(rendered[0] as never)).toContain("12");
  });
});

/** Round-trip through storage, so the test reads what a device would read. */
function decodeAgain(snapshot: WidgetSnapshot): WidgetSnapshot {
  return JSON.parse(encodeSnapshot(snapshot)) as WidgetSnapshot;
}
