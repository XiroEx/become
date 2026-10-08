// NP-342 — BECOMING STAGE: THE FOCUSED WEEK CARD IS SHORTER THAN THE WEB'S
// AND LOSES ITS SKY TINT (native).
//
// Visual + motion review of NP-204 on build 763bc68b (beta, 10/8): the slot
// sat where the web's card sits — same top edge, same line — but the card
// drawn in it did not fill it. The slot was `height: undefined` + `minHeight`
// when focused and `WeekCard` was content-sized, so the live card ended
// ~100 px higher than the web's (49% of the screen against the web's 60%)
// and was no longer centred on the line through it; the neighbours and the
// Horizon varied with their content. And the web's subject-tinted sky — a
// radial "sun" high on a climb and low on a dip, over a 160° wash, on
// `#0e0c17` with an inset ring in the week's hue — was a flat dark card.
// George, on his phone: on the web every stage card is the SAME height;
// make them one height natively, with the content laid out inside a fixed
// box, not cards that grow to fit.
//
// What this suite proves:
//
//   1. every card slot on the stage is exactly `cardSize` — the web's box —
//      and so is the card drawn in it: the focused week, its neighbours and
//      the Horizon, on the live week and after flying elsewhere;
//   2. the content is a column that fills the box with a flex spacer, so
//      "what to work on" and the identity row sit on the bottom edge, and
//      what will not fit is clipped, as on the web;
//   3. the sky: the web's two gradients and the ring, number for number, read
//      off the rendered svg — the sun high on a climb, low on a dip, mid-right
//      when the week held — and the same under the light and dark schemes;
//   4. the maths (`lib/becoming/cardSky.ts`) is CSS's: the 160° gradient line
//      runs through the centre with the box's corners on its 0% and 100%;
//   5. the web's content rule inside the box: the live card ends on the steps,
//      a finished week keeps two wins, the Horizon's words are clamped;
//   6. a card mounted bare (no box) is unchanged: it fits its content and
//      draws its sky on the size it measures.

import * as fs from "fs";
import * as path from "path";
import React from "react";
import { AccessibilityInfo } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, within, type RenderResult } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { colorScheme } from "nativewind";
import { LinearGradient, RadialGradient, Rect } from "react-native-svg";
import { cardSize, layoutWeeks } from "@become/core";
import { JourneyStage, type JourneyStageHandle } from "@/components/becoming/journey/JourneyStage";
import { HorizonCard, WeekCard } from "@/components/becoming/WeekCard";
import {
  SUN_ALPHA,
  SUN_FADE_AT,
  SUN_RADIUS,
  WASH_ALPHA,
  WASH_ANGLE_DEG,
  WASH_FADE_AT,
  cardRing,
  cardSky,
  gradientLine,
  sunCentre,
} from "@/lib/becoming/cardSky";
import { pillarColor } from "@/lib/becoming/pillarColors";
import { journeySignals } from "@/lib/becoming/signals";
import { resetIntroSession } from "@/lib/becoming/storage";
import type { WeekSnapshot } from "@/lib/becoming/types";
import { becomingStageTokens, resolveToken, rgbOf, type ThemeMode } from "@/lib/theme/tokens";
import { journeyWith, yearOfWeeks } from "../test-support/becomingFixtures";

const EXPO_DIR = path.resolve(__dirname, "..");

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};
// jest-expo's window: what `useWindowDimensions` answers, so what the stage lays out for.
const WINDOW = { width: 750, height: 1334 };
const SIZE = cardSize(WINDOW.width, WINDOW.height);

const WEEKS = yearOfWeeks(52);
const JOURNEY = journeyWith(WEEKS);
const LIVE = WEEKS.length - 1;
const SIGNALS = journeySignals(WEEKS, { unit: JOURNEY.unit, direction: JOURNEY.target?.direction ?? null });

type Instance = ReturnType<RenderResult["getByTestId"]>;

/** One flat style object out of RN's nested style arrays. */
function flat(node: { props: { style?: unknown } }): Record<string, unknown> {
  return Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
}

/** A host node's host children, in order, with composite wrappers flattened out. */
function hostKids(node: Instance): Instance[] {
  return node.children.flatMap((c) => (typeof c === "string" ? [] : typeof c.type === "string" ? [c] : hostKids(c)));
}

/** The `<Stop>`s a gradient was given, as react-native-svg reads them: off its children. */
function stopsOf(gradient: Instance): { offset: number; color: string; opacity: number }[] {
  return React.Children.toArray(gradient.props.children as React.ReactNode).map((el) => {
    const p = (el as React.ReactElement<{ offset: number; stopColor: string; stopOpacity: number }>).props;
    return { offset: p.offset, color: p.stopColor, opacity: p.stopOpacity };
  });
}

function skyOf(card: Instance) {
  return {
    sun: within(card).UNSAFE_getByType(RadialGradient),
    wash: within(card).UNSAFE_getByType(LinearGradient),
    // The sky's rects are the ones filled by a gradient; a lucide icon on the
    // card (a calendar, a book) is react-native-svg too and may draw a Rect.
    rects: within(card)
      .UNSAFE_getAllByType(Rect)
      .filter((r) => typeof r.props.fill === "string" && r.props.fill.startsWith("url(#")),
  };
}

function setSystemScheme(mode: ThemeMode): void {
  act(() => {
    colorScheme.set(mode);
  });
}

function renderStage(ref?: React.Ref<JourneyStageHandle>): RenderResult {
  return render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <JourneyStage
          ref={ref}
          data={JOURNEY}
          introKind="none"
          onClose={jest.fn()}
          onDetails={jest.fn()}
          onNavigate={jest.fn()}
        />
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
  setSystemScheme("dark");
});

// ─── 1. every card is the web's card box ─────────────────────────────────────

describe("every card on the stage is the web's card box", () => {
  it("every slot is exactly cardSize, focused or not, and none leaves its height to its content", () => {
    const u = renderStage();
    const positions = layoutWeeks(WEEKS, SIZE);
    expect(positions).toHaveLength(WEEKS.length + 1);
    for (const p of positions) {
      const s = flat(u.getByTestId(`journey-card-${p.index}`));
      expect(s.width).toBe(SIZE.w);
      expect(s.height).toBe(SIZE.h);
      expect(s.minHeight).toBeUndefined();
    }
  });

  it("the cards drawn in the slots are the box too: the live week, its neighbours and the Horizon", () => {
    const u = renderStage();
    for (const i of [LIVE, LIVE - 1, LIVE - 2]) {
      const s = flat(u.getByTestId(`week-card-${WEEKS[i]!.weekKey}`));
      expect(s.width).toBe(SIZE.w);
      expect(s.height).toBe(SIZE.h);
      expect(s.overflow).toBe("hidden");
    }
    const h = flat(u.getByTestId("horizon-card"));
    expect(h.width).toBe(SIZE.w);
    expect(h.height).toBe(SIZE.h);
    expect(h.overflow).toBe("hidden");
  });

  it("and after flying to another week, the new focus and its neighbours are the box", () => {
    const ref = React.createRef<JourneyStageHandle>();
    const u = renderStage(ref);
    act(() => ref.current!.focusOn(7));
    for (const i of [5, 6, 7, 8, 9]) {
      const s = flat(u.getByTestId(`week-card-${WEEKS[i]!.weekKey}`));
      expect(s.width).toBe(SIZE.w);
      expect(s.height).toBe(SIZE.h);
    }
  });

  it("the box is the web's: about 60% of a 390 × 844 phone, and a sized card takes exactly it", () => {
    const phone = cardSize(390, 844);
    expect(phone.h / 844).toBeCloseTo(0.6, 1);
    const u = render(
      <WeekCard week={WEEKS[LIVE]!} signals={SIGNALS[LIVE]!} next={JOURNEY.next} width={phone.w} height={phone.h} onDetails={jest.fn()} />,
    );
    const s = flat(u.getByTestId(`week-card-${WEEKS[LIVE]!.weekKey}`));
    expect(s.width).toBe(phone.w);
    expect(s.height).toBe(phone.h);
  });
});

// ─── 2. the content is laid out inside the box ───────────────────────────────

describe("the content is laid out inside the box, like the web's flex column", () => {
  it("the live card's column fills the box and a flex spacer puts the steps and the identity row on the bottom edge", () => {
    const u = renderStage();
    const card = u.getByTestId(`week-card-${WEEKS[LIVE]!.weekKey}`);
    const body = within(card).getByTestId("week-card-body");
    expect(flat(body).flex).toBe(1);
    const kids = hostKids(body);
    const headline = kids.findIndex((k) => within(k).queryByTestId("week-card-headline") != null);
    const spacer = kids.findIndex((k) => k.props.testID === "week-card-spacer");
    const steps = kids.findIndex((k) => k.props.testID === "week-card-steps");
    const footer = kids.findIndex((k) => within(k).queryByTestId("week-card-details-btn") != null);
    expect(headline).toBeGreaterThanOrEqual(0);
    expect(flat(kids[spacer]!).flex).toBe(1);
    expect(headline).toBeLessThan(spacer);
    expect(spacer).toBeLessThan(steps);
    expect(steps).toBeLessThan(footer);
    expect(footer).toBe(kids.length - 1);
  });

  it("the Horizon does the same: the column fills the box, the spacer sits between the words and 'what writes it'", () => {
    const u = renderStage();
    const body = within(u.getByTestId("horizon-card")).getByTestId("horizon-card-body");
    expect(flat(body).flex).toBe(1);
    const kids = hostKids(body);
    const words = kids.findIndex((k) => k.props.numberOfLines === 6);
    const spacer = kids.findIndex((k) => k.props.testID === "horizon-card-spacer");
    const writes = kids.findIndex((k) => k.props.testID === "horizon-writes");
    expect(words).toBeGreaterThanOrEqual(0);
    expect(flat(kids[spacer]!).flex).toBe(1);
    expect(words).toBeLessThan(spacer);
    expect(spacer).toBeLessThan(writes);
  });

  it("what will not fit is clipped, like the web's overflow-hidden — not scrolled, which would fight the stage's pan", () => {
    const u = renderStage();
    expect(flat(u.getByTestId(`week-card-${WEEKS[LIVE]!.weekKey}`)).overflow).toBe("hidden");
    expect(flat(u.getByTestId("horizon-card")).overflow).toBe("hidden");
    const src = fs.readFileSync(path.join(EXPO_DIR, "components/becoming/WeekCard.tsx"), "utf8");
    expect(src).not.toMatch(/ScrollView/);
  });
});

// ─── 3. the sky ──────────────────────────────────────────────────────────────

describe("the sky: the web's two gradients and ring, on every full card", () => {
  it("a climb: the sun sits high (75% 0%) in the subject's hue at 55% lightness, gone at 60% of its rim, over the 160° wash", () => {
    const u = renderStage();
    const i = [LIVE, LIVE - 1, LIVE - 2].find((n) => WEEKS[n]!.step === "up")!;
    const week = WEEKS[i]!;
    const { sun, wash, rects } = skyOf(u.getByTestId(`week-card-${week.weekKey}`));
    expect(sun.props).toEqual(expect.objectContaining({ cx: "75%", cy: "0%", rx: "90%", ry: "60%", gradientUnits: "objectBoundingBox" }));
    expect(stopsOf(sun)).toEqual([
      { offset: 0, color: pillarColor(week.subject, week.score, 55), opacity: 0.35 },
      { offset: 0.6, color: pillarColor(week.subject, week.score, 55), opacity: 0 },
    ]);
    const line = gradientLine(SIZE.w, SIZE.h, 160);
    expect(wash.props).toEqual(expect.objectContaining({ gradientUnits: "userSpaceOnUse", x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 }));
    expect(stopsOf(wash)).toEqual([
      { offset: 0, color: pillarColor(week.subject, week.score, 40), opacity: 0.28 },
      { offset: 0.55, color: pillarColor(week.subject, week.score, 40), opacity: 0 },
    ]);
    // The whole box, the wash first and the sun over it (CSS lists the sun first: topmost).
    expect(rects.map((r) => r.props.fill)).toEqual([`url(#week-card-wash-${week.weekKey})`, `url(#week-card-sun-${week.weekKey})`]);
    for (const r of rects) {
      expect(r.props.width).toBe(SIZE.w);
      expect(r.props.height).toBe(SIZE.h);
    }
  });

  it("a hold: the sun sits mid-right (90% 40%); a dip: low (80% 100%)", () => {
    const ref = React.createRef<JourneyStageHandle>();
    const u = renderStage(ref);
    const held = [LIVE, LIVE - 1, LIVE - 2].find((n) => WEEKS[n]!.step === "flat")!;
    expect(skyOf(u.getByTestId(`week-card-${WEEKS[held]!.weekKey}`)).sun.props).toEqual(expect.objectContaining({ cx: "90%", cy: "40%" }));
    const dip = WEEKS.findIndex((w) => w.step === "down");
    expect(dip).toBeGreaterThan(0);
    act(() => ref.current!.focusOn(dip));
    expect(skyOf(u.getByTestId(`week-card-${WEEKS[dip]!.weekKey}`)).sun.props).toEqual(expect.objectContaining({ cx: "80%", cy: "100%" }));
  });

  it("the ring and the ground: a hairline in the week's hue on a finished week, two px nearly solid on the live one, both on the web's #0e0c17", () => {
    const u = renderStage();
    const past = WEEKS[LIVE - 1]!;
    const live = WEEKS[LIVE]!;
    const p = flat(u.getByTestId(`week-card-${past.weekKey}`));
    expect(p.borderWidth).toBe(1);
    expect(p.borderColor).toBe(pillarColor(past.subject, past.score, 60, 0.18));
    expect(p.backgroundColor).toBe(rgbOf(becomingStageTokens.card));
    const l = flat(u.getByTestId(`week-card-${live.weekKey}`));
    expect(l.borderWidth).toBe(2);
    expect(l.borderColor).toBe(pillarColor(live.subject, live.score, 65, 0.9));
    expect(l.backgroundColor).toBe(rgbOf(becomingStageTokens.card));
    // 14 12 23 is #0e0c17.
    expect(becomingStageTokens.card).toBe("14 12 23");
    // The two weeks are about different things, and their skies say so.
    expect(skyOf(u.getByTestId(`week-card-${past.weekKey}`)).sun.props.cx).toBeDefined();
    expect(past.subject).not.toBe(live.subject);
    expect(stopsOf(skyOf(u.getByTestId(`week-card-${past.weekKey}`)).sun)[0]!.color).not.toBe(
      stopsOf(skyOf(u.getByTestId(`week-card-${live.weekKey}`)).sun)[0]!.color,
    );
  });

  it("the sky, the ring and the ground are the same under the light and dark schemes", () => {
    const read = (mode: ThemeMode) => {
      setSystemScheme(mode);
      const u = renderStage();
      const card = u.getByTestId(`week-card-${WEEKS[LIVE]!.weekKey}`);
      const { sun, wash } = skyOf(card);
      return {
        sun: { ...sun.props, children: stopsOf(sun) },
        wash: { ...wash.props, children: stopsOf(wash) },
        shell: flat(card),
      };
    };
    const dark = read("dark");
    const light = read("light");
    expect(light).toEqual(dark);
    expect(light.shell.backgroundColor).toBe(rgbOf(becomingStageTokens.card));
    expect(light.shell.backgroundColor).not.toBe(resolveToken("card", "light"));
  });
});

// ─── 4. the maths is CSS's ───────────────────────────────────────────────────

describe("the sky's numbers are the web's", () => {
  it("the sun: high on a climb, low on a dip, mid-right when the week held or started; the web's radius, fade and alpha", () => {
    expect(sunCentre("up")).toEqual({ cx: "75%", cy: "0%" });
    expect(sunCentre("down")).toEqual({ cx: "80%", cy: "100%" });
    expect(sunCentre("flat")).toEqual({ cx: "90%", cy: "40%" });
    expect(sunCentre("start")).toEqual({ cx: "90%", cy: "40%" });
    expect(SUN_RADIUS).toEqual({ rx: "90%", ry: "60%" });
    expect(SUN_FADE_AT).toBe(0.6);
    expect(SUN_ALPHA).toBe(0.35);
    expect(WASH_ANGLE_DEG).toBe(160);
    expect(WASH_FADE_AT).toBe(0.55);
    expect(WASH_ALPHA).toBe(0.28);
  });

  it("gradientLine is css-images' gradient line: through the centre, at the angle, with the corners on the 0% and 100% lines", () => {
    // cardSize(390, 844) — the review phone.
    const w = 350;
    const h = 508;
    const line = gradientLine(w, h, 160);
    // By hand: sin 160° = .34202, cos 160° = −.93969, length = 350·.34202 + 508·.93969 = 597.07.
    expect(line.x1).toBeCloseTo(72.9, 1);
    expect(line.y1).toBeCloseTo(-26.5, 1);
    expect(line.x2).toBeCloseTo(277.1, 1);
    expect(line.y2).toBeCloseTo(534.5, 1);
    // Through the centre …
    expect((line.x1 + line.x2) / 2).toBeCloseTo(w / 2, 6);
    expect((line.y1 + line.y2) / 2).toBeCloseTo(h / 2, 6);
    // … pointing 160° clockwise from straight up …
    const angle = (Math.atan2(line.x2 - line.x1, -(line.y2 - line.y1)) * 180) / Math.PI;
    expect(angle).toBeCloseTo(160, 6);
    // … and the top-left corner is at 0%, the bottom-right at 100%: the rule that fixes the length.
    const t = (x: number, y: number) => {
      const dx = line.x2 - line.x1;
      const dy = line.y2 - line.y1;
      return ((x - line.x1) * dx + (y - line.y1) * dy) / (dx * dx + dy * dy);
    };
    expect(t(0, 0)).toBeCloseTo(0, 6);
    expect(t(w, h)).toBeCloseTo(1, 6);
    // The angle is the box's: another box, another line.
    expect(gradientLine(380, 551, 160)).not.toEqual(line);
    expect(gradientLine(SIZE.w, SIZE.h)).toEqual(gradientLine(SIZE.w, SIZE.h, 160));
  });

  it("cardSky and cardRing are the web's pillarColor calls, in the subject's hue", () => {
    expect(cardSky("training", 72)).toEqual({
      sun: pillarColor("training", 72, 55),
      sunAlpha: 0.35,
      wash: pillarColor("training", 72, 40),
      washAlpha: 0.28,
    });
    expect(cardRing("fuel", 40, false)).toEqual({ width: 1, color: pillarColor("fuel", 40, 60, 0.18) });
    expect(cardRing("fuel", 40, true)).toEqual({ width: 2, color: pillarColor("fuel", 40, 65, 0.9) });
    // An amber "all" week and a green training week read differently before a word is read.
    expect(cardSky("all", 80).sun).toMatch(/^hsl\(38, /);
    expect(cardSky("training", 80).sun).toMatch(/^hsl\(142, /);
  });
});

// ─── 5. the web's content rule, inside the box ───────────────────────────────

describe("the web's content rule inside the box", () => {
  it("the live card ends on what to work on and shows no wins; a finished week keeps two of its wins and no steps", () => {
    const live: WeekSnapshot = { ...WEEKS[LIVE]!, mind: { ...WEEKS[LIVE]!.mind, wins: ["one", "two", "three"] } };
    const u = render(<WeekCard week={live} signals={SIGNALS[LIVE]!} next={JOURNEY.next} width={SIZE.w} height={SIZE.h} />);
    expect(u.getByTestId("week-card-steps")).toBeTruthy();
    expect(u.queryByTestId("week-card-wins")).toBeNull();

    const past: WeekSnapshot = { ...WEEKS[LIVE - 1]!, mind: { ...WEEKS[LIVE - 1]!.mind, wins: ["one", "two", "three"] } };
    const v = render(<WeekCard week={past} signals={SIGNALS[LIVE - 1]!} next={JOURNEY.next} width={SIZE.w} height={SIZE.h} />);
    expect(v.queryByTestId("week-card-steps")).toBeNull();
    expect(v.getByText("one")).toBeTruthy();
    expect(v.getByText("two")).toBeTruthy();
    expect(v.queryByText("three")).toBeNull();
  });

  it("the Horizon's words are clamped to six lines, like the web's line-clamp-6", () => {
    const long = "x".repeat(400);
    const u = render(<HorizonCard identity={long} trend="up" next={JOURNEY.next} width={SIZE.w} height={SIZE.h} />);
    expect(u.getByText(`“${long}”`).props.numberOfLines).toBe(6);
  });
});

// ─── 6. a card mounted bare ──────────────────────────────────────────────────

describe("a card mounted bare, with no box, is unchanged", () => {
  it("fits its content — no size, no spacer — and draws its sky on the size it measures", () => {
    const week = WEEKS[LIVE - 1]!;
    const u = render(<WeekCard week={week} signals={SIGNALS[LIVE - 1]!} onDetails={jest.fn()} />);
    const card = u.getByTestId(`week-card-${week.weekKey}`);
    const s = flat(card);
    expect(s.width).toBeUndefined();
    expect(s.height).toBeUndefined();
    expect(u.queryByTestId("week-card-spacer")).toBeNull();
    expect(flat(u.getByTestId("week-card-body")).flex).toBeUndefined();
    // Nothing to draw the 160° line on until the card has a size …
    expect(within(card).UNSAFE_queryByType(LinearGradient)).toBeNull();
    // … and once it does, the sky is drawn for that box.
    fireEvent(u.getByTestId("week-card-sky"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 350, height: 508 } } });
    expect(within(card).UNSAFE_getByType(LinearGradient).props).toEqual(expect.objectContaining(gradientLine(350, 508)));
    expect(within(card).UNSAFE_getByType(RadialGradient).props).toEqual(expect.objectContaining(sunCentre(week.step)));
  });
});
