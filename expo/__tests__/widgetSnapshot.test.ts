/**
 * ─── The cached day a widget paints when its refresh has no network ──────────
 *
 * Two things are pinned here, and both are the difference between a widget that
 * degrades and one that lies:
 *
 *   • **SIZE.** The snapshot lives in SecureStore, whose documented ceiling is
 *     2048 bytes per value, and it is written by a background task that swallows
 *     its failures — so an oversized snapshot would not be an error, it would be
 *     four tiles that silently stop caching. Worst-case content is asserted under
 *     `SNAPSHOT_BYTE_BUDGET` below.
 *   • **DAY.** Every number in the feed is about the member's local day, so a
 *     snapshot is only valid FOR that day. "820 cal left" redrawn tomorrow is not
 *     stale, it is wrong.
 */
import type { BecomeWidget, WidgetFeed } from "@become/api-client";
import {
  MAX_CAPTION_CHARS,
  MAX_HEADLINE_CHARS,
  SNAPSHOT_BYTE_BUDGET,
  decodeSnapshot,
  encodeSnapshot,
  snapshotFromFeed,
  snapshotIsForDay,
  snapshotRow,
  snapshotRowFor,
} from "@/lib/widgets/snapshot";

function row(over: Partial<BecomeWidget> = {}): BecomeWidget {
  return {
    key: "streak",
    title: "Streak",
    headline: "12",
    headlineUnit: "days",
    caption: "2 days to 14",
    state: "done",
    progress: 0.857,
    rings: [],
    deepLink: "/dashboard/streaks",
    ...over,
  } as BecomeWidget;
}

function feed(rows: BecomeWidget[], over: Partial<WidgetFeed> = {}): WidgetFeed {
  return {
    generatedAt: 1_780_000_000_000,
    todayKey: "2026-09-29",
    refreshAfterSeconds: 900,
    badgeCount: 1,
    widgets: rows,
    ...over,
  } as WidgetFeed;
}

describe("snapshotFromFeed", () => {
  it("keeps only the rows a widget draws", () => {
    const snapshot = snapshotFromFeed(
      feed([
        row({ key: "streak" }),
        row({ key: "nutrition" }),
        row({ key: "mind" }),
        row({ key: "becoming" }),
        row({ key: "training" }),
      ]),
    );
    // Both platforms' tiles, from one snapshot: Android draws four (no
    // `training`), iOS draws all five — so all five rows are kept.
    expect(snapshot.rows.map((r) => r.key)).toEqual([
      "streak",
      "nutrition",
      "mind",
      "becoming",
      "training",
    ]);
  });

  it("carries the day and the build time the server sent", () => {
    const snapshot = snapshotFromFeed(feed([row()]));
    expect(snapshot.todayKey).toBe("2026-09-29");
    expect(snapshot.generatedAt).toBe(1_780_000_000_000);
  });

  it("a feed with no todayKey can never be trusted for a later day", () => {
    const snapshot = snapshotFromFeed(
      feed([row()], { todayKey: undefined as unknown as string }),
    );
    expect(snapshot.todayKey).toBe("");
    expect(snapshotIsForDay(snapshot, "2026-09-29")).toBe(false);
  });

  it("clamps progress into 0..1 and keeps null as null", () => {
    const snapshot = snapshotFromFeed(
      feed([
        row({ key: "streak", progress: 1.4 }),
        row({ key: "mind", progress: -2 }),
        row({ key: "becoming", progress: null }),
      ]),
    );
    expect(snapshotRowFor(snapshot, "streak")?.progress).toBe(1);
    expect(snapshotRowFor(snapshot, "mind")?.progress).toBe(0);
    expect(snapshotRowFor(snapshot, "becoming")?.progress).toBeNull();
  });

  it("compacts the nutrition rings for the medium tile's macros", () => {
    const compact = snapshotRow(
      row({
        key: "nutrition",
        rings: [
          { key: "calories", label: "Cal", value: 1180.4, target: 2000, pct: 0.5902, unit: "cal" },
          { key: "protein", label: "Protein", value: 120, target: 160, pct: 0.75, unit: "g" },
          { key: "carbs", label: "Carbs", value: 180, target: null, pct: null, unit: "g" },
          { key: "fats", label: "Fat", value: 40, target: 60, pct: 2.5, unit: "g" },
        ],
      }),
    );
    expect(compact.rings).toEqual([
      ["Cal", 1180.4, 0.5902, "cal"],
      ["Protein", 120, 0.75, "g"],
      ["Carbs", 180, null, "g"],
      // A fraction over 1 is clamped — the bar fills, it does not overfill.
      ["Fat", 40, 1, "g"],
    ]);
  });

  it("caps ring labels and units like every other server word", () => {
    const compact = snapshotRow(
      row({
        key: "nutrition",
        rings: [
          { key: "protein", label: "A very long macro label", value: 1, target: 2, pct: 0.5, unit: "grams!" },
        ],
      }),
    );
    expect(compact.rings[0]?.[0].length).toBeLessThanOrEqual(12);
    expect(compact.rings[0]?.[3].length).toBeLessThanOrEqual(8);
  });

  it("keeps rings empty everywhere but nutrition", () => {
    const snapshot = snapshotFromFeed(feed([row({ key: "streak" }), row({ key: "mind" })]));
    expect(snapshotRowFor(snapshot, "streak")?.rings).toEqual([]);
    expect(snapshotRowFor(snapshot, "mind")?.rings).toEqual([]);
  });

  it("does not re-word anything the server said", () => {
    const compact = snapshotRow(
      row({ headline: "Rest day", headlineUnit: null, caption: "Nothing scheduled — recover" }),
    );
    expect(compact.headline).toBe("Rest day");
    expect(compact.headlineUnit).toBeNull();
    expect(compact.caption).toBe("Nothing scheduled — recover");
  });

  it("caps a long identity statement instead of storing all of it", () => {
    const long = "I am the kind of person who ".repeat(12);
    const compact = snapshotRow(row({ key: "becoming", caption: long }));
    expect(compact.caption.length).toBeLessThanOrEqual(MAX_CAPTION_CHARS);
    expect(compact.caption.endsWith("…")).toBe(true);
  });

  it("caps a headline too, and normalises whitespace", () => {
    const compact = snapshotRow(row({ headline: "  Upper   Body   Strength Day  " }));
    expect(compact.headline.length).toBeLessThanOrEqual(MAX_HEADLINE_CHARS);
    expect(compact.headline).not.toMatch(/ {2}/);
  });
});

describe("the encoded snapshot fits SecureStore", () => {
  it("stays under the byte budget with worst-case content", () => {
    const longest = "x".repeat(300);
    // Only the nutrition row fills `rings` — the feed ships [] everywhere
    // else (`BecomeWidgetSchema`: "Only the nutrition widget fills this").
    const ringiest = {
      key: "calories" as const,
      label: longest,
      value: 123456.789,
      target: 234567.891,
      pct: 0.123456789,
      unit: longest,
    };
    const snapshot = snapshotFromFeed(
      feed(
        (["streak", "nutrition", "mind", "becoming", "training"] as const).map(
          (key) =>
            row({
              key,
              title: longest,
              headline: longest,
              headlineUnit: longest,
              caption: longest,
              deepLink: "/dashboard/mind/becoming",
              progress: 0.123456789,
              rings:
                key === "nutrition"
                  ? [ringiest, ringiest, ringiest, ringiest]
                  : [],
            }),
        ),
      ),
    );
    const encoded = encodeSnapshot(snapshot);
    expect(Buffer.byteLength(encoded, "utf8")).toBeLessThan(
      SNAPSHOT_BYTE_BUDGET,
    );
    // And the budget itself stays inside SecureStore's documented ceiling.
    expect(SNAPSHOT_BYTE_BUDGET).toBeLessThan(2048);
  });

  it("round-trips", () => {
    const snapshot = snapshotFromFeed(feed([row(), row({ key: "mind" })]));
    expect(decodeSnapshot(encodeSnapshot(snapshot))).toEqual(snapshot);
  });

  it("reads anything unreadable as 'no snapshot'", () => {
    expect(decodeSnapshot(null)).toBeNull();
    expect(decodeSnapshot("")).toBeNull();
    expect(decodeSnapshot("{oops")).toBeNull();
    expect(decodeSnapshot("[]")).toBeNull();
    expect(decodeSnapshot('{"rows":"nope"}')).toBeNull();
  });

  it("drops a row from an older shape rather than drawing an empty tile", () => {
    const decoded = decodeSnapshot(
      '{"generatedAt":1,"todayKey":"2026-09-29","rows":[{"key":"streak"},' +
        '{"key":"mind","title":"Mind","headline":"Ready","caption":"Chapter 2",' +
        '"state":"todo","deepLink":"/dashboard/mind"}]}',
    );
    expect(decoded?.rows.map((r) => r.key)).toEqual(["mind"]);
  });

  it("reads a snapshot written before rings existed as rings-less, not as nothing", () => {
    const decoded = decodeSnapshot(
      '{"generatedAt":1,"todayKey":"2026-09-29","rows":[' +
        '{"key":"nutrition","title":"Nutrition","headline":"820",' +
        '"headlineUnit":"cal left","caption":"P 120/160g","state":"todo",' +
        '"progress":0.59,"deepLink":"/dashboard/nutrition"}]}',
    );
    expect(decoded?.rows.map((r) => r.key)).toEqual(["nutrition"]);
    expect(decoded?.rows[0]?.rings).toEqual([]);
  });

  it("drops a malformed ring rather than the whole row", () => {
    const decoded = decodeSnapshot(
      '{"generatedAt":1,"todayKey":"2026-09-29","rows":[' +
        '{"key":"nutrition","title":"Nutrition","headline":"820",' +
        '"headlineUnit":"cal left","caption":"P 120/160g","state":"todo",' +
        '"progress":0.59,"deepLink":"/dashboard/nutrition",' +
        '"rings":[["Cal",1180,0.59,"cal"],["oops"],{"label":"Fat"}]}]}',
    );
    expect(decoded?.rows[0]?.rings).toEqual([["Cal", 1180, 0.59, "cal"]]);
  });
});

describe("snapshotIsForDay", () => {
  const snapshot = snapshotFromFeed(feed([row()]));

  it("is true for the day it was built for", () => {
    expect(snapshotIsForDay(snapshot, "2026-09-29")).toBe(true);
  });

  it("is false once the device's local day has moved on", () => {
    expect(snapshotIsForDay(snapshot, "2026-09-30")).toBe(false);
  });

  it("is false with no snapshot at all", () => {
    expect(snapshotIsForDay(null, "2026-09-29")).toBe(false);
  });
});
