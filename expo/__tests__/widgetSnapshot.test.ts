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
    expect(snapshot.rows.map((r) => r.key)).toEqual([
      "streak",
      "nutrition",
      "mind",
      "becoming",
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
    const snapshot = snapshotFromFeed(
      feed(
        (["streak", "nutrition", "mind", "becoming"] as const).map((key) =>
          row({
            key,
            title: longest,
            headline: longest,
            headlineUnit: longest,
            caption: longest,
            deepLink: "/dashboard/mind/becoming",
            progress: 0.123456789,
          }),
        ),
      ),
    );
    const encoded = encodeSnapshot(snapshot);
    expect(Buffer.byteLength(encoded, "utf8")).toBeLessThan(
      SNAPSHOT_BYTE_BUDGET,
    );
    // And it is still under the budget once a fifth row lands here one day.
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
