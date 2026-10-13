// NP-345 — BECOMING STAGE: OVERVIEW TILES ARE DARK BOXES, THE WEB'S ARE
// COLOURED WEEK TILES (native).
//
// Visual + motion review of NP-204 on build 763bc68b (beta, 10/8): the web's
// compact card — the overview, and any card more than two weeks from the
// focus — is the WEEK'S COLOUR, `linear-gradient(160deg, pillarColor(subject,
// score, 48), pillarColor(subject, score, 30))` under an inset white ring,
// with a big `W<n>` (`…` for a gap), the week label, the headline and a step
// chip (`now` / climbed / held / a dip / new high). That is what makes the
// overview read as grey → green → amber blocks behind the markers. Native's
// `WeekTile` was a near-black box (`background @ 0.92`) with a thin colour
// stripe and small type, so at overview scale the tiles all but disappeared.
//
// What this suite proves:
//
//   1. the ground is the week's: the web's two stops along CSS's 160° line
//      for the box, the dark stop as the solid colour under the gradient,
//      the ring `1px rgba(255,255,255,0.15)` — and the old ground is gone;
//   2. the words are the web's: `W<n>` / `…`, the label, the headline, and
//      the chip — `now` on the live week, climbed / held / a dip / new high /
//      start otherwise, with the web's glyph for each;
//   3. the type is in card units: the web's px at the reviewed phone's card,
//      twice that on a card twice as wide, so it scales with the camera;
//   4. the Horizon tile is the web's horizon: the violet wash into the card
//      colour at 55%, a 2px dashed white/25 ring, Next Sunday, who the
//      member said they are becoming, and where the live week is trending;
//   5. on the stage every far card is such a tile, a new peak's chip says
//      `new high`, and the Horizon far from the focus is the horizon tile.
//
// What it cannot prove is how the blocks read at 20% scale on a phone: that
// is the device pass.

import React from "react";
import { AccessibilityInfo } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, within, type RenderResult } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { cardSize, peakIndexes } from "@become/core";
import { JourneyStage, type JourneyStageHandle } from "@/components/becoming/journey/JourneyStage";
import { WeekTile } from "@/components/becoming/journey/WeekTile";
import { gradientLine } from "@/lib/becoming/cardSky";
import { pillarColor } from "@/lib/becoming/pillarColors";
import { liveTrend } from "@/lib/becoming/stage";
import { resetIntroSession } from "@/lib/becoming/storage";
import type { WeekSnapshot } from "@/lib/becoming/types";
import {
  HORIZON_GROUND,
  HORIZON_RING,
  REFERENCE_CARD_WIDTH,
  REFERENCE_VIEWPORT,
  TILE,
  TILE_ANGLE_DEG,
  TILE_CHIP_BACKGROUND,
  TILE_LIGHTNESS,
  TILE_RING_COLOR,
  horizonTrendText,
  tileGradientPoints,
  tileGround,
  tileMark,
  tileStep,
  tileUnit,
} from "@/lib/becoming/weekTile";
import { becomingStageTokens, rgbOf } from "@/lib/theme/tokens";
import { journeyWith, yearOfWeeks } from "../test-support/becomingFixtures";

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};
// jest-expo's window: what `useWindowDimensions` answers, so what the stage lays out for.
const WINDOW = { width: 750, height: 1334 };
const SIZE = cardSize(WINDOW.width, WINDOW.height);

/** The web's card on the phone the review was made on — the tile's reference box. */
const PHONE = cardSize(REFERENCE_VIEWPORT.w, REFERENCE_VIEWPORT.h);

const WEEKS = yearOfWeeks(52);
const JOURNEY = journeyWith(WEEKS);
const LIVE = WEEKS.length - 1;
/** The fixture's two collapsed gaps. */
const GAP = WEEKS.findIndex((w) => !!w.gap);

/** One flat style object out of RN's nested style arrays. */
function flat(node: { props: { style?: unknown } }): Record<string, unknown> {
  return Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
}

/** A week with its path facts overridden — the chip is about these three. */
function weekLike(base: WeekSnapshot, over: Partial<WeekSnapshot>): WeekSnapshot {
  const w = { ...base, ...over };
  if ("gap" in over && over.gap === undefined) delete w.gap;
  return w;
}

function renderTile(week: WeekSnapshot, props: Partial<React.ComponentProps<typeof WeekTile>> = {}) {
  return render(<WeekTile week={week} width={PHONE.w} height={PHONE.h} totalWeeks={WEEKS.length} {...props} />);
}

function renderStage(ref?: React.Ref<JourneyStageHandle>): RenderResult {
  return render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <JourneyStage ref={ref} data={JOURNEY} introKind="none" onClose={jest.fn()} onDetails={jest.fn()} onNavigate={jest.fn()} />
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );
}

let reduceRead: jest.SpyInstance;
let reduceSub: jest.SpyInstance;
beforeEach(async () => {
  await AsyncStorage.clear();
  resetIntroSession();
  reduceRead = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(() => Promise.resolve(false));
  reduceSub = jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(() => ({ remove: () => {} }) as never);
});
afterEach(() => {
  reduceRead.mockRestore();
  reduceSub.mockRestore();
});

// ─── 1. the ground is the week's colour ──────────────────────────────────────

describe("a week tile is the week's colour, like the web's compact card", () => {
  const week = WEEKS[LIVE - 5]!;

  it("the web's two stops: pillarColor(subject, score, 48) into pillarColor(subject, score, 30), with the dark stop under the gradient", () => {
    expect(TILE_LIGHTNESS).toEqual({ from: 48, to: 30 });
    const ground = tileGround(week.subject, week.score);
    expect(ground.colors).toEqual([pillarColor(week.subject, week.score, 48), pillarColor(week.subject, week.score, 30)]);
    expect(ground.locations).toEqual([0, 1]);

    const u = renderTile(week);
    const tile = u.getByTestId(`journey-tile-${week.weekKey}`);
    const gradient = within(tile).getByTestId("week-tile-ground");
    expect(gradient.props.colors).toEqual(ground.colors);
    expect(gradient.props.locations).toEqual(ground.locations);
    // The view itself is the week's colour too, so the tile never paints dark first.
    expect(flat(tile).backgroundColor).toBe(pillarColor(week.subject, week.score, 30));
  });

  it("the gradient runs along CSS's 160° line for the box inside the ring", () => {
    expect(TILE_ANGLE_DEG).toBe(160);
    const u = renderTile(week);
    const gradient = within(u.getByTestId(`journey-tile-${week.weekKey}`)).getByTestId("week-tile-ground");
    // Yoga lays the absolute gradient out inside the border: the ring's inside is the box.
    const innerW = PHONE.w - 2 * TILE.ring;
    const innerH = PHONE.h - 2 * TILE.ring;
    const line = gradientLine(innerW, innerH, 160);
    expect(gradient.props.start).toEqual({ x: line.x1 / innerW, y: line.y1 / innerH });
    expect(gradient.props.end).toEqual({ x: line.x2 / innerW, y: line.y2 / innerH });
    expect(gradient.props.start).toEqual(tileGradientPoints(innerW, innerH).start);
    // The line points 160° clockwise from straight up: down and to the right.
    expect(gradient.props.end.x).toBeGreaterThan(gradient.props.start.x);
    expect(gradient.props.end.y).toBeGreaterThan(gradient.props.start.y);
  });

  it("the ring is the web's inset 1px white at 15%, and the box is the card box, clipped", () => {
    const u = renderTile(week);
    const s = flat(u.getByTestId(`journey-tile-${week.weekKey}`));
    expect(TILE.ring).toBe(1);
    expect(s.borderWidth).toBe(1);
    expect(s.borderColor).toBe(TILE_RING_COLOR);
    expect(s.borderColor).toBe("rgba(255, 255, 255, 0.15)");
    expect(s.borderStyle).toBe("solid");
    expect(s.width).toBe(PHONE.w);
    expect(s.height).toBe(PHONE.h);
    expect(s.overflow).toBe("hidden");
  });

  it("the near-black ground and the colour stripe are gone", () => {
    const u = renderTile(week);
    const tile = u.getByTestId(`journey-tile-${week.weekKey}`);
    expect(flat(tile).backgroundColor).not.toBe(rgbOf(becomingStageTokens.background, 0.92));
    // Nothing on the tile is a 6 × 72 stripe any more.
    const stripes = tile.findAll((n) => {
      const s = flat(n as { props: { style?: unknown } });
      return s.height === 6 && s.width === 72;
    });
    expect(stripes).toHaveLength(0);
  });

  it("every subject reads as its own colour — grey, green, red, violet, amber blocks", () => {
    const grounds = (["empty", "training", "fuel", "mind", "all"] as const).map((subject) => tileGround(subject, 70).colors[1]);
    expect(new Set(grounds).size).toBe(grounds.length);
    // A quiet week is grey: near-zero saturation, whatever the score.
    expect(tileGround("empty", 90).colors[1]).toBe("hsl(240, 8%, 30%)");
  });
});

// ─── 2. the words are the web's ──────────────────────────────────────────────

describe("the tile says what the web's compact card says", () => {
  it("a big W<n> for a week, … for a gap", () => {
    const week = WEEKS[LIVE - 4]!;
    expect(tileMark(week)).toBe(`W${week.index + 1}`);
    expect(tileMark(WEEKS[GAP]!)).toBe("…");

    const u = renderTile(week);
    expect(within(u.getByTestId(`journey-tile-${week.weekKey}`)).getByTestId("week-tile-mark").props.children).toBe(`W${week.index + 1}`);
    const g = renderTile(WEEKS[GAP]!);
    expect(within(g.getByTestId(`journey-tile-${WEEKS[GAP]!.weekKey}`)).getByTestId("week-tile-mark").props.children).toBe("…");
  });

  it("the week label and the headline", () => {
    const week = WEEKS[LIVE - 4]!;
    const u = renderTile(week);
    const tile = u.getByTestId(`journey-tile-${week.weekKey}`);
    expect(within(tile).getByTestId("week-tile-label").props.children).toBe(week.label);
    expect(within(tile).getByTestId("week-tile-headline").props.children).toBe(week.headline);
    expect(within(tile).getByTestId("week-tile-headline").props.numberOfLines).toBe(4);
  });

  it.each([
    ["the live week", { isCurrent: true, step: "up" }, false, "now", "up"],
    ["a climb", { isCurrent: false, step: "up" }, false, "climbed", "up"],
    ["a hold", { isCurrent: false, step: "flat" }, false, "held", "flat"],
    ["a dip", { isCurrent: false, step: "down" }, false, "a dip", "down"],
    ["a new peak", { isCurrent: false, step: "up" }, true, "new high", "up"],
    ["where it started", { isCurrent: false, step: "start" }, false, "start", "start"],
    ["a gap, whatever its step", { isCurrent: false, step: "flat", gap: { weeks: 3, fromKey: "a", toKey: "b" } }, false, "held", "flat"],
    ["a gap that was also a peak is still just held", { isCurrent: false, step: "up", gap: { weeks: 2, fromKey: "a", toKey: "b" } }, true, "held", "up"],
    ["the live week beats everything", { isCurrent: true, step: "down" }, true, "now", "down"],
  ] as const)("the chip on %s says %s", (_name, over, isPeak, text, icon) => {
    const base = weekLike(WEEKS[3]!, { gap: undefined });
    const week = weekLike(base, over as Partial<WeekSnapshot>);
    expect(tileStep(week, isPeak)).toEqual({ icon, text });

    const u = renderTile(week, { isPeak });
    const chip = within(u.getByTestId(`journey-tile-${week.weekKey}`)).getByTestId("week-tile-chip");
    expect(within(chip).getByText(text)).toBeTruthy();
    expect(flat(chip).backgroundColor).toBe(TILE_CHIP_BACKGROUND);
    expect(flat(chip).backgroundColor).toBe("rgba(0, 0, 0, 0.25)");
  });

  it("the accessibility label reads the tile out: which week, the label, the headline, the step", () => {
    const week = WEEKS[LIVE - 4]!;
    const u = renderTile(week);
    expect(u.getByTestId(`journey-tile-${week.weekKey}`).props.accessibilityLabel).toBe(
      `Week ${week.index + 1} of ${WEEKS.length}. ${week.label}. ${week.headline}. ${tileStep(week).text}.`,
    );
    const g = renderTile(WEEKS[GAP]!);
    expect(g.getByTestId(`journey-tile-${WEEKS[GAP]!.weekKey}`).props.accessibilityLabel).toMatch(/^Away\. /);
  });
});

// ─── 3. the type is in card units ────────────────────────────────────────────

describe("the type is in card units, so it scales with the card and the camera", () => {
  it("the reference card is the web's on a 390 × 844 phone, and one unit is one px there", () => {
    expect(REFERENCE_VIEWPORT).toEqual({ w: 390, h: 844 });
    expect(REFERENCE_CARD_WIDTH).toBe(cardSize(390, 844).w);
    expect(REFERENCE_CARD_WIDTH).toBe(350);
    expect(tileUnit(350)).toBe(1);
    expect(tileUnit(700)).toBe(2);
    expect(tileUnit(SIZE.w)).toBeCloseTo(SIZE.w / 350, 6);
  });

  it("at the reference card the sizes are the web's px: p-7, 40px mark, 20px label, 26px headline, 18px chip", () => {
    expect(TILE).toEqual(
      expect.objectContaining({
        pad: 28,
        mark: 40,
        markTracking: -1,
        label: 20,
        labelGap: 8,
        headline: 26,
        headlineLineHeight: 32.5,
        chipGap: 12,
        chip: 18,
        chipIcon: 20,
        chipPadX: 12,
        chipPadY: 6,
        chipInnerGap: 6,
      }),
    );
    const week = WEEKS[LIVE - 4]!;
    const u = renderTile(week);
    const tile = u.getByTestId(`journey-tile-${week.weekKey}`);
    const mark = flat(within(tile).getByTestId("week-tile-mark"));
    const label = flat(within(tile).getByTestId("week-tile-label"));
    const headline = flat(within(tile).getByTestId("week-tile-headline"));
    const chip = within(tile).getByTestId("week-tile-chip");
    expect(mark.fontSize).toBe(40);
    expect(mark.lineHeight).toBe(40);
    expect(mark.letterSpacing).toBe(-1);
    expect(mark.fontWeight).toBe("900");
    expect(label.fontSize).toBe(20);
    expect(label.marginTop).toBe(8);
    expect(headline.fontSize).toBe(26);
    expect(headline.lineHeight).toBe(32.5);
    expect(headline.fontWeight).toBe("800");
    expect(flat(chip).marginTop).toBe(12);
    expect(flat(chip).paddingHorizontal).toBe(12);
    expect(flat(chip).paddingVertical).toBe(6);
    expect(flat(within(chip).getByText(tileStep(week).text)).fontSize).toBe(18);
  });

  it("a card twice as wide sets everything twice as large", () => {
    const week = WEEKS[LIVE - 4]!;
    const u = render(<WeekTile week={week} width={700} height={1015} />);
    const tile = u.getByTestId(`journey-tile-${week.weekKey}`);
    expect(flat(within(tile).getByTestId("week-tile-mark")).fontSize).toBe(80);
    expect(flat(within(tile).getByTestId("week-tile-label")).fontSize).toBe(40);
    expect(flat(within(tile).getByTestId("week-tile-headline")).fontSize).toBe(52);
    expect(flat(within(tile).getByTestId("week-tile-headline")).lineHeight).toBe(65);
    expect(flat(within(within(tile).getByTestId("week-tile-chip")).getByText(tileStep(week).text)).fontSize).toBe(36);
    // The ring stays one px: it is a hairline, as on the web.
    expect(flat(tile).borderWidth).toBe(1);
  });

  it("the column is the web's: p-7, the two ends apart", () => {
    const week = WEEKS[LIVE - 4]!;
    const u = renderTile(week);
    const tile = u.getByTestId(`journey-tile-${week.weekKey}`);
    const column = within(tile).getByTestId("week-tile-column");
    // The mark and the headline both sit in that one column.
    expect(within(column).getByTestId("week-tile-mark")).toBeTruthy();
    expect(within(column).getByTestId("week-tile-headline")).toBeTruthy();
    const s = flat(column);
    expect(s.padding).toBe(28);
    expect(s.flex).toBe(1);
    expect(s.justifyContent).toBe("space-between");
  });
});

// ─── 4. the Horizon tile is the web's horizon ────────────────────────────────

describe("the Horizon tile is the web's horizon card, compact", () => {
  it("the ground is the violet wash into the card colour at 55%, under a 2px dashed white/25 ring", () => {
    expect(HORIZON_GROUND).toEqual({
      colors: ["rgba(124, 58, 237, 0.22)", "rgba(14, 12, 23, 0.97)"],
      locations: [0, 0.55],
    });
    expect(HORIZON_RING).toEqual({ width: 2, color: "rgba(255, 255, 255, 0.25)" });

    const u = render(<WeekTile horizon width={PHONE.w} height={PHONE.h} identity={JOURNEY.identity} trend="up" />);
    const tile = u.getByTestId("journey-tile-horizon");
    const s = flat(tile);
    expect(s.borderWidth).toBe(2);
    expect(s.borderStyle).toBe("dashed");
    expect(s.borderColor).toBe("rgba(255, 255, 255, 0.25)");
    // No solid ground: like the web's, the wash sits straight on the stage.
    expect(s.backgroundColor).toBeUndefined();
    const gradient = within(tile).getByTestId("week-tile-ground");
    expect(gradient.props.colors).toEqual(HORIZON_GROUND.colors);
    expect(gradient.props.locations).toEqual([0, 0.55]);
    const innerW = PHONE.w - 4;
    const innerH = PHONE.h - 4;
    expect(gradient.props.start).toEqual(tileGradientPoints(innerW, innerH).start);
    expect(gradient.props.end).toEqual(tileGradientPoints(innerW, innerH).end);
  });

  it("says Next Sunday, who the member said they are becoming, and where the week is trending", () => {
    const u = render(<WeekTile horizon width={PHONE.w} height={PHONE.h} identity={JOURNEY.identity} trend="up" />);
    const tile = u.getByTestId("journey-tile-horizon");
    expect(within(tile).getByTestId("week-tile-label").props.children).toBe("Next Sunday");
    const headline = within(tile).getByTestId("week-tile-headline");
    expect(headline.props.children).toBe(`“${JOURNEY.identity}”`);
    expect(flat(headline).fontStyle).toBe("italic");
    expect(flat(headline).fontSize).toBe(26);
    expect(within(within(tile).getByTestId("week-tile-chip")).getByText("Horizon lifting")).toBeTruthy();
    expect(tile.props.accessibilityLabel).toBe(`Horizon. Next Sunday. Becoming: ${JOURNEY.identity}. Horizon lifting.`);
  });

  it.each([
    ["up", "Horizon lifting"],
    ["flat", "Horizon holding"],
    ["down", "Horizon eased"],
  ] as const)("the trend chip for %s says %s, in the web's words", (trend, text) => {
    expect(horizonTrendText(trend)).toBe(text);
    const u = render(<WeekTile horizon width={PHONE.w} height={PHONE.h} trend={trend} />);
    expect(within(u.getByTestId("week-tile-chip")).getByText(text)).toBeTruthy();
  });

  it("with nothing written yet it asks the question", () => {
    const u = render(<WeekTile horizon width={PHONE.w} height={PHONE.h} identity={null} />);
    const headline = u.getByTestId("week-tile-headline");
    expect(headline.props.children).toBe("Who am I becoming?");
    expect(flat(headline).fontStyle).toBe("normal");
    expect(u.getByTestId("journey-tile-horizon").props.accessibilityLabel).toBe("Horizon. Next Sunday. Who am I becoming?. Horizon holding.");
  });
});

// ─── 5. on the stage ─────────────────────────────────────────────────────────

describe("on the stage, every far card is a coloured tile", () => {
  it("the far weeks are tiles in their own colour, not dark boxes", () => {
    const u = renderStage();
    for (const i of [0, 7, 19, LIVE - 3]) {
      const week = WEEKS[i]!;
      const tile = u.getByTestId(`journey-tile-${week.weekKey}`);
      expect(flat(tile).backgroundColor).toBe(pillarColor(week.subject, week.score, 30));
      expect(within(tile).getByTestId("week-tile-ground").props.colors).toEqual(tileGround(week.subject, week.score).colors);
      expect(flat(tile).width).toBe(SIZE.w);
      expect(flat(tile).height).toBe(SIZE.h);
    }
    // A gap week's tile is grey with its ellipsis.
    const gap = WEEKS[GAP]!;
    const gapTile = u.getByTestId(`journey-tile-${gap.weekKey}`);
    expect(within(gapTile).getByTestId("week-tile-mark").props.children).toBe("…");
    expect(flat(gapTile).backgroundColor).toBe(pillarColor("empty", gap.score, 30));
  });

  it("a week that set a new high says so on its tile, as the web's does", () => {
    const peaks = peakIndexes(WEEKS);
    const far = [...peaks].find((i) => LIVE - i > 2 && !WEEKS[i]!.gap);
    expect(far).toBeDefined();
    const u = renderStage();
    const tile = u.getByTestId(`journey-tile-${WEEKS[far!]!.weekKey}`);
    expect(within(tile).getByText("new high")).toBeTruthy();
    // And a far week that was not a peak says how it moved instead.
    const plain = WEEKS.findIndex((w, i) => i > 0 && LIVE - i > 2 && !peaks.has(i) && !w.gap && w.step === "flat");
    expect(plain).toBeGreaterThan(0);
    expect(within(u.getByTestId(`journey-tile-${WEEKS[plain]!.weekKey}`)).getByText("held")).toBeTruthy();
  });

  it("the Horizon far from the focus is the horizon tile, with the identity and the live week's trend", () => {
    const ref = React.createRef<JourneyStageHandle>();
    const u = renderStage(ref);
    // Next to the live week the Horizon is the full card …
    expect(u.getByTestId("horizon-card")).toBeTruthy();
    expect(u.queryByTestId("journey-tile-horizon")).toBeNull();
    // … and from the start of the path it is the tile.
    act(() => ref.current!.focusOn(0));
    const tile = u.getByTestId("journey-tile-horizon");
    expect(flat(tile).borderStyle).toBe("dashed");
    expect(within(tile).getByTestId("week-tile-ground").props.colors).toEqual(HORIZON_GROUND.colors);
    expect(within(tile).getByTestId("week-tile-headline").props.children).toBe(`“${JOURNEY.identity}”`);
    expect(within(tile).getByText(horizonTrendText(liveTrend(WEEKS)))).toBeTruthy();
  });
});
