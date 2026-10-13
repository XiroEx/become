// THE STAGE'S MATHS (NP-204): the worklets, held to the layout copy.
//
// `lib/becoming/stage.ts` repeats two pieces of `@become/core`'s layout as
// worklets (a gesture callback cannot call a plain imported function on the
// UI thread). The first block here is the lockstep that makes that repetition
// safe: every drag in a fixture table must project the same way through the
// worklet as through the copy, and the nearest card must be the same card.
// The rest pins the web stage's release rules and the opening's decision.

import { AccessibilityInfo } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cardSize, layoutWeeks, nearestCard, scrubTarget, OVERVIEW_MIN_SCALE, TILE_FADE_SCALE, TILE_FULL_SCALE } from "@become/core";
import {
  MAX_SCALE,
  againstPathHint,
  cardEmphasis,
  clampPinchScale,
  commitScrub,
  counterLabel,
  defaultHint,
  graphChromeOpacity,
  hitCard,
  hudOpacity,
  introKindFor,
  liveTrend,
  markerOpacity,
  markerRadius,
  nearestIndex,
  pinchCamera,
  projectScrub,
  ringRadius,
  rubberBand,
  segmentDraw,
  sinceLabel,
  startIndexFor,
  thinTicks,
  tileOpacity,
  toWorld,
  weekKeyOfToday,
} from "@/lib/becoming/stage";
import { markIntroShown, resetIntroSession, resolveIntroKind } from "@/lib/becoming/storage";
import { yearOfWeeks } from "../test-support/becomingFixtures";

const VIEWPORTS: [number, number][] = [
  [390, 844],
  [375, 812],
  [320, 568],
  [430, 932],
  [768, 1024],
];
const DRAGS: [number, number][] = [
  [0, 0],
  [-120, 0],
  [120, 0],
  [0, -160],
  [0, 160],
  [-300, -200],
  [300, 200],
  [-40, 90],
  [40, -90],
  [-600, 10],
  [5, -5],
  [-1, 0],
];
const SCALES = [1, 0.5, 0.2, 1.6];

describe("the worklets answer exactly as @become/core's layout copy", () => {
  const weeks = yearOfWeeks(52);
  const shortRun = yearOfWeeks(4);

  it("projectScrub is scrubTarget, drag for drag, at every scale", () => {
    let compared = 0;
    for (const [vw, vh] of VIEWPORTS) {
      const size = cardSize(vw, vh);
      for (const set of [weeks, shortRun]) {
        const pos = layoutWeeks(set, size);
        for (let current = -1; current <= pos.length; current++) {
          for (const [dx, dy] of DRAGS) {
            for (const s of SCALES) {
              expect(projectScrub(pos, current, dx, dy, s)).toEqual(scrubTarget(pos, current, dx, dy, s));
              compared += 1;
            }
          }
        }
      }
    }
    // A floor, so the table cannot be gutted into a green no-op.
    expect(compared).toBeGreaterThan(10_000);
  });

  it("nearestIndex is nearestCard, point for point", () => {
    for (const [vw, vh] of VIEWPORTS) {
      const size = cardSize(vw, vh);
      const pos = layoutWeeks(weeks, size);
      for (const p of pos) {
        for (const [ox, oy] of [[0, 0], [size.col / 2 - 1, 0], [size.col / 2 + 1, 0], [-30, size.row / 2], [17, -40], [10_000, -10_000]]) {
          expect(nearestIndex(pos, p.x + ox!, p.y + oy!)).toBe(nearestCard(pos, p.x + ox!, p.y + oy!));
        }
      }
      expect(nearestIndex([], 10, 10)).toBe(nearestCard([], 10, 10));
    }
  });

  it("a committed drag along the path moves the camera between the two cards and nowhere else", () => {
    const size = cardSize(390, 844);
    const pos = layoutWeeks(weeks, size);
    const current = 10;
    const cur = pos[current]!;
    const next = pos[current + 1]!;
    // Pull the next card in: the finger moves opposite to the camera.
    const sc = projectScrub(pos, current, -(next.x - cur.x), -(next.y - cur.y), 1)!;
    expect(sc.target).toBe(current + 1);
    expect(sc.progress).toBeCloseTo(1, 9);
    const p = rubberBand(sc.progress);
    expect(cur.x + (next.x - cur.x) * p).toBeCloseTo(next.x, 9);
    expect(cur.y + (next.y - cur.y) * p).toBeCloseTo(next.y, 9);
  });
});

describe("the release rules", () => {
  it("rubber-bands past either end at a quarter of the drag", () => {
    expect(rubberBand(0.5)).toBe(0.5);
    expect(rubberBand(1)).toBe(1);
    expect(rubberBand(0)).toBe(0);
    expect(rubberBand(1.4)).toBeCloseTo(1.1);
    expect(rubberBand(-0.8)).toBeCloseTo(-0.2);
  });

  it("commits a drag that went far, or fast and a little", () => {
    expect(commitScrub(0.35, 0)).toBe(true);
    expect(commitScrub(0.349, 0)).toBe(false);
    expect(commitScrub(0.1, 0.6)).toBe(true);
    expect(commitScrub(0.08, 0.6)).toBe(false);
    expect(commitScrub(0.1, 0.55)).toBe(false);
    expect(commitScrub(-0.5, 5)).toBe(false);
  });

  it("clamps the pinch to the stage's range", () => {
    expect(clampPinchScale(1, 3)).toBe(MAX_SCALE);
    expect(clampPinchScale(1, 0.001)).toBe(OVERVIEW_MIN_SCALE);
    expect(clampPinchScale(0.5, 0.5)).toBe(0.25);
  });

  it("keeps the world point under the fingers while pinching", () => {
    const cam = { x: 1200, y: -300, s: 1 };
    const vw = 390,
      vh = 844;
    const focal = { x: 100, y: 500 };
    const under = toWorld(focal.x, focal.y, cam, vw, vh);
    for (const s of [0.2, 0.5, 1.3]) {
      const c = pinchCamera(under, focal.x, focal.y, s, vw, vh);
      const again = toWorld(focal.x, focal.y, { x: c.x, y: c.y, s }, vw, vh);
      expect(again.x).toBeCloseTo(under.x, 9);
      expect(again.y).toBeCloseTo(under.y, 9);
    }
  });

  it("fades tiles to markers between the two scales, and the graph chrome in below 0.5", () => {
    expect(tileOpacity(1)).toBe(1);
    expect(tileOpacity(TILE_FULL_SCALE)).toBe(1);
    expect(tileOpacity(TILE_FADE_SCALE)).toBe(0);
    expect(tileOpacity((TILE_FADE_SCALE + TILE_FULL_SCALE) / 2)).toBeCloseTo(0.5);
    expect(markerOpacity(0.16)).toBeCloseTo(1 - tileOpacity(0.16));
    expect(graphChromeOpacity(1)).toBe(0);
    expect(graphChromeOpacity(0.35)).toBe(1);
    expect(hudOpacity(1)).toBe(0);
    expect(hudOpacity(0.3)).toBe(1);
  });

  it("markers read as constant screen pixels until the column caps them", () => {
    expect(markerRadius(1, 444)).toBeCloseTo(6.5);
    expect(markerRadius(0.5, 444)).toBeCloseTo(13);
    expect(markerRadius(0.02, 444)).toBeCloseTo(444 * 0.42);
    expect(ringRadius(0.5, 444)).toBeCloseTo(24);
  });

  it("hit-tests a card's box, grown to the overview's tolerance", () => {
    const size = cardSize(390, 844);
    const pos = layoutWeeks(yearOfWeeks(6), size);
    const p = pos[2]!;
    expect(hitCard(pos, p.x + 10, p.y - 10, size.w / 2, size.h / 2)?.index).toBe(2);
    expect(hitCard(pos, p.x + size.w / 2 + 1, p.y, size.w / 2, size.h / 2)).toBeNull();
    expect(hitCard(pos, p.x + size.w / 2 + 1, p.y, size.w / 2, size.h / 2, size.w)?.index).toBe(2);
  });

  it("draws the line segment by segment through the opening", () => {
    expect(segmentDraw(0, 0, 4)).toBe(0);
    expect(segmentDraw(0.25, 0, 4)).toBe(1);
    expect(segmentDraw(0.25, 1, 4)).toBe(0);
    expect(segmentDraw(0.375, 1, 4)).toBeCloseTo(0.5);
    expect(segmentDraw(1, 3, 4)).toBe(1);
    expect(segmentDraw(0, 0, 0)).toBe(1);
  });
});

describe("the stage's pure rules", () => {
  const weeks = yearOfWeeks(52);

  it("opens on the live week, or the deep-linked one (a gap card covers its span)", () => {
    expect(startIndexFor(weeks, null)).toBe(51);
    expect(startIndexFor(weeks, weeks[7]!.weekKey)).toBe(7);
    // Week 20 is a collapsed 3-week gap: a key inside it lands on the gap card.
    const gap = weeks[20]!.gap!;
    expect(startIndexFor(weeks, gap.toKey)).toBe(20);
    expect(startIndexFor(weeks, "1999-01-03")).toBe(51);
    expect(startIndexFor([], "2026-01-04")).toBe(0);
  });

  it("decides the opening the way the web does", () => {
    const base = { reduced: false, initialWeekKey: null, openedThisSession: false, seenThisWeek: false };
    expect(introKindFor(base)).toBe("full");
    expect(introKindFor({ ...base, reduced: true })).toBe("none");
    expect(introKindFor({ ...base, initialWeekKey: "2026-09-27" })).toBe("short");
    expect(introKindFor({ ...base, openedThisSession: true })).toBe("none");
    expect(introKindFor({ ...base, seenThisWeek: true })).toBe("short");
    // Reduce Motion wins over everything.
    expect(introKindFor({ reduced: true, initialWeekKey: "2026-09-27", openedThisSession: false, seenThisWeek: false })).toBe("none");
  });

  it("names the Sunday of today's week in UTC, like the web", () => {
    expect(weekKeyOfToday("2026-10-08")).toBe("2026-10-04");
    expect(weekKeyOfToday("2026-10-04")).toBe("2026-10-04");
    expect(weekKeyOfToday("2026-01-01")).toBe("2025-12-28");
  });

  it("labels every other month once the history is long", () => {
    const ticks = ["a", "b", "c", "d", "e"];
    expect(thinTicks(ticks, 26)).toEqual(ticks);
    expect(thinTicks(ticks, 27)).toEqual(["a", "c", "e"]);
  });

  it("counts weeks for the chrome", () => {
    expect(counterLabel("intro", 3, 52)).toBe("");
    expect(counterLabel("focus", 3, 52)).toBe("Week 4 of 52");
    expect(counterLabel("focus", 52, 52)).toBe("Horizon");
    expect(counterLabel("overview", 3, 52)).toBe("52 weeks");
  });

  it("hints where the line goes", () => {
    expect(defaultHint("up", false)).toBe("pull down · next week climbs");
    expect(defaultHint("down", false)).toBe("push up · next week dips");
    expect(defaultHint("right", false)).toBe("swipe left · next week holds");
    expect(defaultHint(null, false)).toBe("pinch out to see the line");
    expect(defaultHint("up", true)).toBe("written next Sunday · pinch out for the line");
    expect(againstPathHint("up")).toMatch(/pull down/);
    expect(againstPathHint("down")).toMatch(/push up/);
    expect(againstPathHint("right")).toMatch(/drag left/);
    expect(againstPathHint(null)).toBe("written next Sunday");
  });

  it("renders the focus and its two neighbours in full, everything further as a tile", () => {
    expect(cardEmphasis(10, 10, "focus")).toEqual({ compact: false, opacity: 1, scale: 1, focused: true });
    expect(cardEmphasis(12, 10, "focus")).toEqual({ compact: false, opacity: 1, scale: 0.94, focused: false });
    expect(cardEmphasis(13, 10, "focus")).toEqual({ compact: true, opacity: 0.35, scale: 0.94, focused: false });
    expect(cardEmphasis(10, 10, "overview")).toEqual({ compact: true, opacity: 1, scale: 1, focused: false });
    expect(cardEmphasis(10, 10, "intro")).toEqual({ compact: false, opacity: 1, scale: 1, focused: false });
    const year = yearOfWeeks(52);
    const full = year.filter((_, i) => !cardEmphasis(i, 51, "focus").compact).length;
    expect(full).toBe(3);
  });

  it("reads the live week's trend for the Horizon", () => {
    expect(liveTrend([{ daysElapsed: 5, step: "up" }])).toBe("up");
    expect(liveTrend([{ daysElapsed: 5, step: "down" }])).toBe("down");
    expect(liveTrend([{ daysElapsed: 1, step: "up" }])).toBe("flat");
    expect(liveTrend([])).toBe("flat");
  });

  it("formats the HUD's since-date in UTC, or says nothing", () => {
    expect(sinceLabel("2025-10-05")).toBe(" · since Oct 5, 2025");
    expect(sinceLabel(null)).toBe("");
    expect(sinceLabel("not a date")).toBe("");
  });
});

describe("resolveIntroKind: the opening, from the phone's own answers", () => {
  let read: jest.SpyInstance;
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetIntroSession();
    read = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(() => Promise.resolve(false));
  });
  afterEach(() => read.mockRestore());

  it("plays the full opening the first time this week, then the short one, then none this session", async () => {
    expect(await resolveIntroKind({ todayKey: "2026-10-08" })).toBe("full");
    await markIntroShown("2026-10-08");
    expect(await resolveIntroKind({ todayKey: "2026-10-08" })).toBe("none");
    // A new launch, same week: the weekly flag is still there.
    resetIntroSession();
    expect(await resolveIntroKind({ todayKey: "2026-10-08" })).toBe("short");
    // A new week: full again.
    expect(await resolveIntroKind({ todayKey: "2026-10-15" })).toBe("full");
  });

  it("a deep link gets the short opening", async () => {
    expect(await resolveIntroKind({ todayKey: "2026-10-08", initialWeekKey: "2026-09-27" })).toBe("short");
  });

  it("Reduce Motion skips the opening outright — asked of the system, not the hook's first paint", async () => {
    read.mockImplementation(() => Promise.resolve(true));
    expect(await resolveIntroKind({ todayKey: "2026-10-08" })).toBe("none");
    expect(await resolveIntroKind({ todayKey: "2026-10-08", initialWeekKey: "2026-09-27" })).toBe("none");
    expect(read).toHaveBeenCalled();
  });

  it("survives a platform with no accessibility manager", async () => {
    read.mockImplementation(() => Promise.reject(new Error("no manager")));
    expect(await resolveIntroKind({ todayKey: "2026-10-08" })).toBe("full");
  });
});
