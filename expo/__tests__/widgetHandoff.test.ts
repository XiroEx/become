/**
 * ─── What the app does for its widgets: at open, and at sign-out ─────────────
 *
 * The sign-out half is acceptance criterion e015cb0b, and it has to be more than
 * "the server revokes the token": the OS will not refresh a tile for up to half
 * an hour (`updatePeriodMillis` has a 30-minute floor), so a member who signs out
 * and looks at their home screen would otherwise see their streak and their
 * calories sitting there. So sign-out forgets the token, forgets the cached day,
 * and PUSHES the prompt onto all four tiles.
 *
 * The open half is the contract the server was built for: a fresh token at each
 * open, nothing stored longer, and one feed read to make the tiles true now.
 */
import {
  clearWidgetsHandoff,
  handOffWidgetsToken,
  type WidgetHandoffDeps,
} from "@/lib/widgets/handoff";
import { ANDROID_WIDGETS } from "@/lib/widgets/androidWidgets";
import {
  drawAndroidWidgets,
  hasWidgetSurface,
  loadAndroidWidgetUpdater,
  loadIosWidgetUpdaters,
} from "@/lib/widgets/update";
import type { WidgetFeedResult } from "@/lib/widgets/feed";
import { snapshotFromFeed, type WidgetSnapshot } from "@/lib/widgets/snapshot";
import { widgetTexts } from "@/test-support/widgetTree";

/** 2026-09-29 12:00 in New York (EDT, 240 minutes west). */
const NOW = new Date("2026-09-29T16:00:00Z");
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
  ],
};

const okFeed = { kind: "ok", feed: FEED } as unknown as WidgetFeedResult;

interface Recorder {
  deps: WidgetHandoffDeps;
  stored: string[];
  cleared: number;
  snapshotsSaved: WidgetSnapshot[];
  snapshotsCleared: number;
  draws: { signedIn: boolean; todayKey: string; rows: number | null }[];
}

function recorder(over: WidgetHandoffDeps = {}): Recorder {
  const rec: Recorder = {
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
    saveSnapshot: async (snapshot) => {
      rec.snapshotsSaved.push(snapshot);
    },
    clearSnapshot: async () => {
      rec.snapshotsCleared += 1;
    },
    draw: async ({ signedIn, todayKey, snapshot }) => {
      rec.draws.push({
        signedIn,
        todayKey,
        rows: snapshot ? snapshot.rows.length : null,
      });
      return ANDROID_WIDGETS.length;
    },
    ...over,
  };
  return rec;
}

describe("handOffWidgetsToken — a signed-in open", () => {
  it("mints with the session, stores the widgets token and redraws today", async () => {
    const minted: string[] = [];
    const rec = recorder({
      mint: async (session) => {
        minted.push(session);
        return { kind: "ok", token: "widgets.jwt", refreshAfterSeconds: 900 };
      },
    });

    const result = await handOffWidgetsToken(SESSION, rec.deps);

    expect(result).toBe("handed-off");
    expect(minted).toEqual([SESSION]);
    expect(rec.stored).toEqual(["widgets.jwt"]);
    expect(rec.snapshotsSaved[0]?.todayKey).toBe("2026-09-29");
    expect(rec.draws).toEqual([
      { signedIn: true, todayKey: "2026-09-29", rows: 1 },
    ]);
  });

  it("reads the feed with the token it just minted, never with the session", async () => {
    const tokens: string[] = [];
    const rec = recorder({
      fetchFeed: async (token) => {
        tokens.push(token);
        return okFeed;
      },
    });
    await handOffWidgetsToken(SESSION, rec.deps);
    expect(tokens).toEqual(["widgets.jwt"]);
    expect(tokens).not.toContain(SESSION);
  });

  it("keeps a good token when only the feed read failed", async () => {
    const rec = recorder({ fetchFeed: async () => ({ kind: "unreachable" }) });
    expect(await handOffWidgetsToken(SESSION, rec.deps)).toBe("token-only");
    expect(rec.stored).toEqual(["widgets.jwt"]);
    expect(rec.cleared).toBe(0);
    expect(rec.draws).toEqual([]);
  });

  it("changes nothing at all when the mint could not be sent", async () => {
    const rec = recorder({ mint: async () => ({ kind: "unreachable" }) });
    expect(await handOffWidgetsToken(SESSION, rec.deps)).toBe("unreachable");
    expect(rec.stored).toEqual([]);
    expect(rec.cleared).toBe(0);
    expect(rec.snapshotsCleared).toBe(0);
    expect(rec.draws).toEqual([]);
  });

  // A refused mint means the session is finished or a deletion is pending. The
  // home screen must not be the last place still showing the member's day.
  it("wipes the device state and draws the prompt when the server refuses", async () => {
    const rec = recorder({
      mint: async () => ({ kind: "refused", status: 401 }),
    });
    expect(await handOffWidgetsToken(SESSION, rec.deps)).toBe("refused");
    expect(rec.cleared).toBe(1);
    expect(rec.snapshotsCleared).toBe(1);
    expect(rec.draws).toEqual([
      { signedIn: false, todayKey: "2026-09-29", rows: null },
    ]);
  });

  it("uses the DEVICE's local day, not UTC, for the redraw", async () => {
    const rec = recorder({
      now: () => new Date("2026-09-30T02:00:00Z"),
      tzOffsetMinutes: () => NY,
    });
    await handOffWidgetsToken(SESSION, rec.deps);
    expect(rec.draws[0]?.todayKey).toBe("2026-09-29");
  });
});

describe("a platform with no widget surface (iOS, until NP-181)", () => {
  it("mints nothing at open — a token nothing reads is a request per open", async () => {
    let minted = 0;
    const rec = recorder({
      hasSurface: () => false,
      mint: async () => {
        minted += 1;
        return { kind: "unreachable" };
      },
    });
    expect(await handOffWidgetsToken(SESSION, rec.deps)).toBe("unsupported");
    expect(minted).toBe(0);
    expect(rec.stored).toEqual([]);
    expect(rec.draws).toEqual([]);
  });

  it("clears nothing at sign-out either — there is nothing stored", async () => {
    const rec = recorder({ hasSurface: () => false });
    await clearWidgetsHandoff(rec.deps);
    expect(rec.cleared).toBe(0);
    expect(rec.snapshotsCleared).toBe(0);
    expect(rec.draws).toEqual([]);
  });
});

describe("clearWidgetsHandoff — a sign-out", () => {
  it("forgets the token, forgets the day and draws the prompt", async () => {
    const rec = recorder();
    await clearWidgetsHandoff(rec.deps);
    expect(rec.cleared).toBe(1);
    expect(rec.snapshotsCleared).toBe(1);
    expect(rec.draws).toEqual([
      { signedIn: false, todayKey: "2026-09-29", rows: null },
    ]);
  });

  it("never mints and never reads the feed", async () => {
    let touched = 0;
    const rec = recorder({
      mint: async () => {
        touched += 1;
        return { kind: "unreachable" };
      },
      fetchFeed: async () => {
        touched += 1;
        return { kind: "unreachable" };
      },
    });
    await clearWidgetsHandoff(rec.deps);
    expect(touched).toBe(0);
  });

  it("is idempotent — a launch that was already signed out just redraws", async () => {
    const rec = recorder();
    await clearWidgetsHandoff(rec.deps);
    await clearWidgetsHandoff(rec.deps);
    expect(rec.draws).toHaveLength(2);
    expect(rec.draws.every((d) => d.signedIn === false)).toBe(true);
  });
});

describe("drawAndroidWidgets", () => {
  const snapshot = snapshotFromFeed(FEED as never, NOW.getTime());

  interface Update {
    widgetName: string;
    texts: string[];
  }

  function fakeUpdater(onEach?: (name: string) => void) {
    const updates: Update[] = [];
    return {
      updates,
      updater: {
        requestWidgetUpdate: async ({
          widgetName,
          renderWidget,
        }: {
          widgetName: string;
          renderWidget: (info: never) => unknown;
        }): Promise<void> => {
          onEach?.(widgetName);
          const rendered = await renderWidget(undefined as never);
          updates.push({ widgetName, texts: widgetTexts(rendered as never) });
        },
      } as never,
    };
  }

  it("redraws all four widgets from one snapshot", async () => {
    const { updates, updater } = fakeUpdater();
    const drawn = await drawAndroidWidgets({
      snapshot,
      signedIn: true,
      todayKey: "2026-09-29",
      updater,
    });
    expect(drawn).toBe(4);
    expect(updates.map((u) => u.widgetName)).toEqual([
      "Streak",
      "Nutrition",
      "Mind",
      "Becoming",
    ]);
    // The feed here carries only the streak row, so the other three draw the
    // honest "open Become" tile rather than an empty one.
    expect(updates[0]?.texts).toContain("12");
    expect(updates[1]?.texts).toContain("Open Become to update this.");
  });

  it("draws the sign-in prompt on all four when signed out", async () => {
    const { updates, updater } = fakeUpdater();
    await drawAndroidWidgets({
      snapshot: null,
      signedIn: false,
      todayKey: "2026-09-29",
      updater,
    });
    expect(updates).toHaveLength(4);
    for (const update of updates) expect(update.texts).toContain("Sign in");
  });

  it("refuses a snapshot from another day", async () => {
    const { updates, updater } = fakeUpdater();
    await drawAndroidWidgets({
      snapshot,
      signedIn: true,
      todayKey: "2026-09-30",
      updater,
    });
    expect(updates[0]?.texts).not.toContain("12");
  });

  // The invariant that keeps the platform checks from drifting apart: a
  // platform that claims a widget surface must have a module to draw with.
  // Under jest the platform is iOS in this file's sibling suite and Android
  // everywhere else, so this pins the platform it runs on: Android's updater
  // on Android, the iOS updaters on iOS. `__tests__/iosWidgetDraw.test.ts`
  // pins the iOS half with `Platform.OS = 'ios'`.
  it("only claims a surface where there is a module to draw with", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Platform.OS is reassigned per-suite; a static import would freeze it
    const { Platform } = require("react-native") as typeof import("react-native");
    if (Platform.OS === "ios") {
      expect(hasWidgetSurface()).toBe(loadIosWidgetUpdaters() !== null);
    } else {
      expect(hasWidgetSurface()).toBe(loadAndroidWidgetUpdater() !== null);
    }
  });

  it("does nothing, and says so, when there is no widget module (iOS, Expo Go)", async () => {
    expect(
      await drawAndroidWidgets({
        snapshot,
        signedIn: true,
        todayKey: "2026-09-29",
        updater: null,
      }),
    ).toBe(0);
  });

  it("one widget that throws does not cost the other three", async () => {
    const { updates, updater } = fakeUpdater((name) => {
      if (name === "Nutrition") throw new Error("provider gone");
    });
    const drawn = await drawAndroidWidgets({
      snapshot,
      signedIn: true,
      todayKey: "2026-09-29",
      updater,
    });
    expect(drawn).toBe(3);
    expect(updates.map((u) => u.widgetName)).toEqual([
      "Streak",
      "Mind",
      "Becoming",
    ]);
  });
});
