/**
 * ─── The iOS timeline is pure data: rows now, the prompt after midnight ─────
 *
 * WidgetKit paints a pushed timeline, not our code, so the two things pinned
 * here are the difference between a widget that rolls over and one that lies:
 *
 *   • **TODAY, THEN THE PROMPT.** Signed in with today's snapshot: the row at
 *     `now`, the sign-in prompt at the handed-in local midnight. Signed out,
 *     revoked, snapshot-less, stale-day or missing-key: the prompt, never
 *     yesterday's numbers and never a blank.
 *   • **MIDNIGHT IS HANDED IN, NOT COMPUTED.** The DST case below uses
 *     explicit fixed instants (deterministic fixtures throughout — no real
 *     clock, no seeded values): the fall-back midnight 25 hours out must be
 *     used verbatim, not re-derived as now-plus-24h.
 *
 * Every `url` this builder emits goes through `resolveWebPath` and must land
 * on a real native route — the same gate `widgetTaps.test.ts` holds the tap
 * helpers to, because a widget tap that resolves Home-by-guess is a typo with
 * no error anywhere.
 */
import type { WidgetKey } from "@become/api-client";
import { resolveWebPath } from "@/lib/navigation/webPathToRoute";
import { IOS_WIDGETS } from "@/lib/widgets/iosWidgets";
import {
  buildIosTimeline,
  IOS_WIDGET_REFRESH_DEFAULT_SECONDS,
  IOS_WIDGET_REFRESH_MAX_SECONDS,
  IOS_WIDGET_REFRESH_MIN_SECONDS,
  IOS_WIDGET_SIGN_IN_PROMPT,
  nextRefreshDate,
  type IosTimelineEntry,
} from "@/lib/widgets/iosTimeline";
import type {
  WidgetSnapshot,
  WidgetSnapshotRow,
} from "@/lib/widgets/snapshot";

const NOW = new Date("2026-09-29T10:00:00.000Z");
const MIDNIGHT = new Date("2026-09-30T00:00:00.000Z");
const TODAY_KEY = "2026-09-29";

function row(over: Partial<WidgetSnapshotRow> & { key: WidgetKey }): WidgetSnapshotRow {
  return {
    title: `${over.key} title`,
    headline: `${over.key} headline`,
    headlineUnit: "days",
    caption: `${over.key} caption`,
    state: "done",
    progress: 0.5,
    rings: [],
    deepLink: "/dashboard/streaks",
    ...over,
  } as WidgetSnapshotRow;
}

const DEEP_LINKS: Record<WidgetKey, string> = {
  streak: "/dashboard/streaks",
  nutrition: "/dashboard/nutrition",
  mind: "/dashboard/mind",
  becoming: "/dashboard/mind/becoming",
  training: "/dashboard/workout",
};

function snapshot(
  todayKey: string,
  keys: WidgetKey[] = ["streak", "nutrition", "mind", "becoming", "training"],
): WidgetSnapshot {
  return {
    generatedAt: NOW.getTime(),
    todayKey,
    rows: keys.map((key) => row({ key, deepLink: DEEP_LINKS[key] })),
  };
}

function signedInTimeline() {
  return buildIosTimeline({
    snapshot: snapshot(TODAY_KEY),
    signedIn: true,
    now: NOW,
    todayKey: TODAY_KEY,
    nextLocalMidnight: MIDNIGHT,
  });
}

function allEntries(
  timeline: Record<WidgetKey, IosTimelineEntry[]>,
): IosTimelineEntry[] {
  return Object.values(timeline).flat();
}

/** Indexed access is `| undefined` under `noUncheckedIndexedAccess`. */
function entriesOf(
  timeline: Record<WidgetKey, IosTimelineEntry[]>,
  key: WidgetKey,
): IosTimelineEntry[] {
  const entries = timeline[key];
  if (!entries) throw new Error(`missing timeline for ${key}`);
  return entries;
}

describe("signed in with today's snapshot", () => {
  it("draws the row now plus an Open Become entry at local midnight", () => {
    const timeline = signedInTimeline();
    for (const definition of IOS_WIDGETS) {
      const entries = entriesOf(timeline, definition.feedKey);
      expect(entries).toHaveLength(2);
      expect(entries[0]?.date.getTime()).toBe(NOW.getTime());
      expect(entries[1]?.date.getTime()).toBe(MIDNIGHT.getTime());
      const first = entries[0]?.props;
      expect(first).toMatchObject({ signedIn: true });
      if (first?.signedIn !== true) continue;
      expect(first.title).toBe(`${definition.feedKey} title`);
      expect(first.headline).toBe(`${definition.feedKey} headline`);
      expect(first.caption).toBe(`${definition.feedKey} caption`);
      expect(first.progress).toBe(0.5);
      const second = entries[1]?.props;
      expect(second).toMatchObject({
        signedIn: false,
        prompt: IOS_WIDGET_SIGN_IN_PROMPT,
      });
    }
  });

  it("copies the row's strings and fraction through with no business logic", () => {
    const timeline = buildIosTimeline({
      snapshot: {
        generatedAt: NOW.getTime(),
        todayKey: TODAY_KEY,
        rows: [
          row({
            key: "nutrition",
            title: "Nutrition",
            headline: "Rest day",
            headlineUnit: null,
            caption: "Nothing scheduled — recover",
            state: "at-risk",
            progress: 0.857,
            deepLink: "/dashboard/nutrition",
          }),
        ],
      },
      signedIn: true,
      now: NOW,
      todayKey: TODAY_KEY,
      nextLocalMidnight: MIDNIGHT,
    });
    const first = entriesOf(timeline, "nutrition")[0]?.props;
    expect(first).toEqual({
      signedIn: true,
      title: "Nutrition",
      headline: "Rest day",
      headlineUnit: null,
      caption: "Nothing scheduled — recover",
      state: "at-risk",
      progress: 0.857,
      rings: [],
      url: "become://dashboard/nutrition",
    });
  });

  it("carries the nutrition rings through for the medium tile's macros", () => {
    const rings: [string, number, number | null, string][] = [
      ["Cal", 1180, 0.59, "cal"],
      ["Protein", 120, 0.75, "g"],
    ];
    const timeline = buildIosTimeline({
      snapshot: {
        generatedAt: NOW.getTime(),
        todayKey: TODAY_KEY,
        rows: [
          row({
            key: "nutrition",
            title: "Nutrition",
            headline: "820",
            headlineUnit: "cal left",
            caption: "P 120/160g · C 180/240g · F 40/60g",
            state: "todo",
            progress: 0.59,
            rings,
            deepLink: "/dashboard/nutrition",
          }),
        ],
      },
      signedIn: true,
      now: NOW,
      todayKey: TODAY_KEY,
      nextLocalMidnight: MIDNIGHT,
    });
    const first = entriesOf(timeline, "nutrition")[0]?.props;
    expect(first).toMatchObject({ signedIn: true });
    if (first?.signedIn !== true) throw new Error("expected a signed-in row");
    expect(first.rings).toEqual(rings);
  });
});

describe("signed out", () => {
  it("yields one prompt entry per key at now, even with today's snapshot on disk", () => {
    const timeline = buildIosTimeline({
      snapshot: snapshot(TODAY_KEY),
      signedIn: false,
      now: NOW,
      todayKey: TODAY_KEY,
      nextLocalMidnight: MIDNIGHT,
    });
    for (const definition of IOS_WIDGETS) {
      const entries = entriesOf(timeline, definition.feedKey);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.date.getTime()).toBe(NOW.getTime());
      expect(entries[0]?.props).toMatchObject({
        signedIn: false,
        prompt: IOS_WIDGET_SIGN_IN_PROMPT,
      });
    }
  });
});

describe("revoked", () => {
  it("signedIn false with a stale snapshot still on disk prompts, never stale data", () => {
    const timeline = buildIosTimeline({
      snapshot: snapshot("2026-09-28"),
      signedIn: false,
      now: NOW,
      todayKey: TODAY_KEY,
      nextLocalMidnight: MIDNIGHT,
    });
    for (const entries of Object.values(timeline)) {
      expect(entries).toHaveLength(1);
      const props = entries[0]?.props;
      expect(props).toMatchObject({
        signedIn: false,
        prompt: IOS_WIDGET_SIGN_IN_PROMPT,
      });
      if (props?.signedIn === true) {
        throw new Error("revoked timeline drew a signed-in row");
      }
      expect(props?.title).toBeTruthy();
    }
  });
});

describe("a snapshot for another day", () => {
  it("is never drawn: yesterday's snapshot yields the prompt, not yesterday's numbers", () => {
    const timeline = buildIosTimeline({
      snapshot: snapshot("2026-09-28"),
      signedIn: true,
      now: NOW,
      todayKey: TODAY_KEY,
      nextLocalMidnight: MIDNIGHT,
    });
    for (const definition of IOS_WIDGETS) {
      const entries = entriesOf(timeline, definition.feedKey);
      expect(entries).toHaveLength(1);
      const props = entries[0]?.props;
      expect(props).toMatchObject({
        signedIn: false,
        prompt: IOS_WIDGET_SIGN_IN_PROMPT,
      });
      if (props?.signedIn === true) {
        expect(props.headline).not.toBe(`${definition.feedKey} headline`);
      }
    }
  });

  it("a null snapshot prompts too", () => {
    const timeline = buildIosTimeline({
      snapshot: null,
      signedIn: true,
      now: NOW,
      todayKey: TODAY_KEY,
      nextLocalMidnight: MIDNIGHT,
    });
    for (const entries of Object.values(timeline)) {
      expect(entries).toHaveLength(1);
      expect(entries[0]?.props).toMatchObject({
        signedIn: false,
        prompt: IOS_WIDGET_SIGN_IN_PROMPT,
      });
    }
  });
});

describe("a key the snapshot lacks", () => {
  it("gets the prompt for that key, never a blank", () => {
    const timeline = buildIosTimeline({
      snapshot: snapshot(TODAY_KEY, ["streak", "nutrition", "mind", "becoming"]),
      signedIn: true,
      now: NOW,
      todayKey: TODAY_KEY,
      nextLocalMidnight: MIDNIGHT,
    });
    // The keys present still draw their rows.
    expect(entriesOf(timeline, "streak")[0]?.props).toMatchObject({ signedIn: true });
    // The missing key prompts at both dates — titled, with a tap target.
    expect(entriesOf(timeline, "training")).toHaveLength(2);
    for (const entry of entriesOf(timeline, "training")) {
      expect(entry.props).toMatchObject({
        signedIn: false,
        prompt: IOS_WIDGET_SIGN_IN_PROMPT,
      });
      if (entry.props.signedIn === false) {
        expect(entry.props.title).toBeTruthy();
        expect(entry.props.url).toBeTruthy();
      }
    }
  });
});

describe("midnight across a DST change", () => {
  it("uses the handed-in fall-back midnight verbatim (25 hours out, not 24)", () => {
    // US Eastern fall-back 2026: 2026-11-01 00:00 EDT (-04:00) to 2026-11-02
    // 00:00 EST (-05:00) is 25 wall-clock hours. A builder adding 24h would
    // plant the rollover an hour early and hide today's numbers.
    const now = new Date("2026-11-01T00:00:00.000-04:00");
    const midnight = new Date("2026-11-02T00:00:00.000-05:00");
    expect(midnight.getTime() - now.getTime()).toBe(25 * 60 * 60 * 1000);
    const timeline = buildIosTimeline({
      snapshot: snapshot("2026-11-01"),
      signedIn: true,
      now,
      todayKey: "2026-11-01",
      nextLocalMidnight: midnight,
    });
    for (const definition of IOS_WIDGETS) {
      const entries = entriesOf(timeline, definition.feedKey);
      expect(entries[1]?.date.getTime()).toBe(midnight.getTime());
    }
  });

  it("uses the handed-in spring-forward midnight verbatim (23 hours out)", () => {
    const now = new Date("2026-03-08T00:00:00.000-05:00");
    const midnight = new Date("2026-03-09T00:00:00.000-04:00");
    expect(midnight.getTime() - now.getTime()).toBe(23 * 60 * 60 * 1000);
    const timeline = buildIosTimeline({
      snapshot: snapshot("2026-03-08"),
      signedIn: true,
      now,
      todayKey: "2026-03-08",
      nextLocalMidnight: midnight,
    });
    for (const definition of IOS_WIDGETS) {
      const entries = entriesOf(timeline, definition.feedKey);
      expect(entries[1]?.date.getTime()).toBe(midnight.getTime());
    }
  });
});

describe("every url resolves to a real route", () => {
  it("row taps and sign-in prompts never resolve Home-by-guess", () => {
    const timelines = [
      signedInTimeline(),
      buildIosTimeline({
        snapshot: snapshot(TODAY_KEY),
        signedIn: false,
        now: NOW,
        todayKey: TODAY_KEY,
        nextLocalMidnight: MIDNIGHT,
      }),
      buildIosTimeline({
        snapshot: snapshot(TODAY_KEY, ["streak"]),
        signedIn: true,
        now: NOW,
        todayKey: TODAY_KEY,
        nextLocalMidnight: MIDNIGHT,
      }),
    ];
    expect.assertions(timelines.flatMap(allEntries).length * 2);
    for (const timeline of timelines) {
      for (const entry of allEntries(timeline)) {
        const target = resolveWebPath(entry.props.url);
        expect(target.kind).toBe("native");
        if (target.kind !== "native") continue;
        // "unknown" is the resolver's way of saying it guessed. A widget tap
        // may be a deliberate `nearest`, never a guess.
        expect(target.fallback).not.toBe("unknown");
      }
    }
  });

  it("the sign-in prompt lands on the login screen", () => {
    const timeline = buildIosTimeline({
      snapshot: null,
      signedIn: false,
      now: NOW,
      todayKey: TODAY_KEY,
      nextLocalMidnight: MIDNIGHT,
    });
    for (const entry of allEntries(timeline)) {
      expect(resolveWebPath(entry.props.url)).toMatchObject({
        kind: "native",
        pathname: "/login",
        fallback: "exact",
      });
    }
  });
});

describe("nextRefreshDate", () => {
  it("defaults to 30 minutes when the feed names no cadence", () => {
    expect(nextRefreshDate(NOW).getTime()).toBe(
      NOW.getTime() + IOS_WIDGET_REFRESH_DEFAULT_SECONDS * 1000,
    );
    expect(nextRefreshDate(NOW, null).getTime()).toBe(
      NOW.getTime() + IOS_WIDGET_REFRESH_DEFAULT_SECONDS * 1000,
    );
    expect(nextRefreshDate(NOW, undefined).getTime()).toBe(
      NOW.getTime() + IOS_WIDGET_REFRESH_DEFAULT_SECONDS * 1000,
    );
    expect(nextRefreshDate(NOW, Number.NaN).getTime()).toBe(
      NOW.getTime() + IOS_WIDGET_REFRESH_DEFAULT_SECONDS * 1000,
    );
  });

  it("clamps below 15 minutes and above 6 hours", () => {
    expect(nextRefreshDate(NOW, 60).getTime()).toBe(
      NOW.getTime() + IOS_WIDGET_REFRESH_MIN_SECONDS * 1000,
    );
    expect(nextRefreshDate(NOW, 0).getTime()).toBe(
      NOW.getTime() + IOS_WIDGET_REFRESH_MIN_SECONDS * 1000,
    );
    expect(nextRefreshDate(NOW, -30).getTime()).toBe(
      NOW.getTime() + IOS_WIDGET_REFRESH_MIN_SECONDS * 1000,
    );
    expect(nextRefreshDate(NOW, 24 * 60 * 60).getTime()).toBe(
      NOW.getTime() + IOS_WIDGET_REFRESH_MAX_SECONDS * 1000,
    );
    expect(nextRefreshDate(NOW, Number.POSITIVE_INFINITY).getTime()).toBe(
      NOW.getTime() + IOS_WIDGET_REFRESH_DEFAULT_SECONDS * 1000,
    );
  });

  it("passes a sane cadence through untouched", () => {
    expect(nextRefreshDate(NOW, 1800).getTime()).toBe(
      NOW.getTime() + 1800 * 1000,
    );
  });
});
