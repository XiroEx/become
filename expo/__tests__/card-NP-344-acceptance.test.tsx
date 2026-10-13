// NP-344 — BECOMING STAGE: HORIZON CARD AND THE LINE TO IT DON'T MATCH THE
// WEB (native).
//
// Visual + motion review of NP-204 on build 763bc68b (beta, 10/8), the web
// against the S23 and the iOS simulator, on the Horizon — the card one step
// past the live week:
//
//   1. the CARD. The web's is a violet wash
//      (`linear-gradient(160deg, rgba(124,58,237,.22), rgba(14,12,23,.97) 55%)`)
//      under a 2px dashed border — violet-300/60 while it is the focus,
//      white/25 otherwise — with the identity in serif italic at 24px (19px
//      once past 140 characters), filling the card box with "What writes it"
//      on the bottom edge. Native was a flat dark card in sans italic.
//   2. the LINE. On the web the last segment (live week → Horizon) is a
//      dashed `#a78bfa` line and the Horizon's marker in the overview a
//      dashed `#a78bfa` ring. On native both came out BLACK, on both phones.
//      The stage asked for violet — `rgbOf(VIOLET)` — but as `rgb(167 139 250)`,
//      the CSS Color 4 form React Native reads and Skia's own colour parser
//      does not; a colour Skia cannot parse is painted black. The area fill
//      beside them, an alpha'd `rgba(…, 0.22)`, was fine: that was the tell.
//
// What this suite proves: the Horizon card's border, wash and type are the
// web's, number for number, read off the rendered tree and held by
// `lib/becoming/horizonCard.ts`; the border follows the focus; the card
// fills the box with "What writes it" on the bottom edge; the segment to the
// Horizon and the Horizon's ring are violet-400 and dashed as on the web, in
// the overview too; and nothing on the stage's canvas is handed a colour in
// a form Skia would not read.

import React from "react";
import { AccessibilityInfo } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, within, type RenderResult } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { colorScheme } from "nativewind";
import { LinearGradient, Rect } from "react-native-svg";
import { cardSize, layoutWeeks } from "@become/core";
import { JourneyStage, type JourneyStageHandle } from "@/components/becoming/journey/JourneyStage";
import { HorizonCard } from "@/components/becoming/WeekCard";
import { gradientLine } from "@/lib/becoming/cardSky";
import { WHISPER_FONT_FAMILY } from "@/lib/becoming/focusedCard";
import {
  HORIZON_BORDER_ALPHA,
  HORIZON_BORDER_FOCUSED_ALPHA,
  HORIZON_BORDER_WIDTH,
  HORIZON_FONT_FAMILY,
  HORIZON_GROUND_ALPHA,
  HORIZON_GROUND_AT,
  HORIZON_IDENTITY_FONT_SIZE,
  HORIZON_IDENTITY_FONT_SIZE_LONG,
  HORIZON_IDENTITY_LEADING,
  HORIZON_IDENTITY_LINES,
  HORIZON_IDENTITY_LONG_OVER,
  HORIZON_KICKER_ALPHA,
  HORIZON_KICKER_FONT_SIZE,
  HORIZON_KICKER_TRACKING,
  HORIZON_RADIUS,
  HORIZON_WASH_ALPHA,
  HORIZON_WASH_ANGLE_DEG,
  horizonBorder,
  horizonIdentityType,
  horizonWash,
} from "@/lib/becoming/horizonCard";
import { resetIntroSession } from "@/lib/becoming/storage";
import { becomingStageTokens, resolveToken, rgbOf, skiaRgbOf, type ThemeMode } from "@/lib/theme/tokens";
import { journeyWith, yearOfWeeks } from "../test-support/becomingFixtures";

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
const HORIZON = WEEKS.length;
const POSITIONS = layoutWeeks(WEEKS, SIZE);
const LIVE_POS = POSITIONS[LIVE]!;
const HORIZON_POS = POSITIONS.find((p) => p.horizon)!;

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

/** Every colour string handed to anything under a node: `color`, and a gradient's `colors`. */
function coloursUnder(node: Instance): string[] {
  const out: string[] = [];
  const visit = (n: Instance | string) => {
    if (typeof n === "string") return;
    const { color, colors } = n.props as { color?: unknown; colors?: unknown };
    if (typeof color === "string") out.push(color);
    if (Array.isArray(colors)) for (const c of colors) if (typeof c === "string") out.push(c);
    for (const c of n.children) visit(c);
  };
  visit(node);
  return out;
}

/**
 * What Skia's colour parser reads: hex, a named colour, and the COMMA forms
 * of rgb()/rgba()/hsl()/hsla(). Not CSS Color 4's `rgb(r g b)`.
 */
const SKIA_READS =
  /^(?:#[0-9a-f]{3,8}|[a-z]+|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)|hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(?:,\s*[\d.]+\s*)?\))$/i;
/** The form the stage used to hand Skia for every solid colour, and Skia painted black. */
const SPACE_RGB = /^rgb\(\s*\d+\s+\d+\s+\d+\s*\)$/;

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

const mode = (u: RenderResult): string => u.getByTestId("journey-stage").props.accessibilityValue.text;
const horizonCard = (u: RenderResult): Instance => u.getByTestId("horizon-card");

let reduceRead: jest.SpyInstance;
let reduceSub: jest.SpyInstance;
beforeEach(async () => {
  await AsyncStorage.clear();
  resetIntroSession();
  reduceRead = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(() => Promise.resolve(false));
  reduceSub = jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockImplementation((() => ({ remove: () => {} })) as never);
});
afterEach(() => {
  reduceRead.mockRestore();
  reduceSub.mockRestore();
  jest.restoreAllMocks();
  setSystemScheme("dark");
});

// ─── 1. the card's box: border and wash ──────────────────────────────────────

describe("the Horizon card wears the web's box", () => {
  it("a 2px dashed border on a 28px radius — violet-300 at 60% while it is the focus, white at 25% otherwise — with no ground of its own", () => {
    const ref = React.createRef<JourneyStageHandle>();
    const u = renderStage(ref);
    // The live week is the focus; the Horizon is its neighbour.
    let s = flat(horizonCard(u));
    expect(s.borderWidth).toBe(2);
    expect(s.borderStyle).toBe("dashed");
    expect(s.borderRadius).toBe(28);
    expect(s.borderColor).toBe(rgbOf(becomingStageTokens.ink, 0.25));
    expect(s.borderColor).toBe("rgba(255, 255, 255, 0.25)");
    // The wash IS the ground, as on the web: nothing solid under it.
    expect(s.backgroundColor).toBe("transparent");

    act(() => ref.current!.focusOn(HORIZON));
    s = flat(horizonCard(u));
    expect(s.borderColor).toBe(rgbOf(becomingStageTokens.horizonRing, 0.6));
    expect(s.borderColor).toBe("rgba(196, 181, 253, 0.6)");
    expect(s.borderWidth).toBe(2);
    expect(s.borderStyle).toBe("dashed");

    act(() => ref.current!.focusOn(LIVE));
    expect(flat(horizonCard(u)).borderColor).toBe("rgba(255, 255, 255, 0.25)");
  });

  it("the wash: the web's 160° gradient, violet-600 at .22 into the card ground at .97 by 55%, over the whole box", () => {
    const u = renderStage();
    const card = horizonCard(u);
    const wash = within(card).UNSAFE_getByType(LinearGradient);
    // The gradient line is CSS's for 160° on this box — the same maths as the week card's sky.
    expect(wash.props).toEqual(expect.objectContaining({ gradientUnits: "userSpaceOnUse", ...gradientLine(SIZE.w, SIZE.h, 160) }));
    expect(stopsOf(wash)).toEqual([
      { offset: 0, color: rgbOf(becomingStageTokens.skyViolet), opacity: 0.22 },
      { offset: 0.55, color: rgbOf(becomingStageTokens.card), opacity: 0.97 },
    ]);
    // `rgba(124,58,237,…)` and `rgba(14,12,23,…)` on the web.
    expect(rgbOf(becomingStageTokens.skyViolet)).toBe("rgb(124 58 237)");
    expect(rgbOf(becomingStageTokens.card)).toBe("rgb(14 12 23)");
    // Painted edge to edge on the card's box.
    const rect = within(card)
      .UNSAFE_getAllByType(Rect)
      .find((r) => r.props.fill === "url(#horizon-card-wash)");
    expect(rect?.props).toEqual(expect.objectContaining({ x: 0, y: 0, width: SIZE.w, height: SIZE.h }));
    // Under the content, not over it: the wash is the shell's first child.
    expect(hostKids(card)[0]!.props.testID).toBe("horizon-card-wash");
  });

  it("is the same box whichever scheme the phone is in: the stage is a night sky in both", () => {
    for (const scheme of ["light", "dark"] as const) {
      setSystemScheme(scheme);
      const u = renderStage();
      const s = flat(horizonCard(u));
      expect([scheme, s.borderColor]).toEqual([scheme, "rgba(255, 255, 255, 0.25)"]);
      expect([scheme, s.backgroundColor]).toEqual([scheme, "transparent"]);
      expect(within(horizonCard(u)).UNSAFE_getByType(LinearGradient)).toBeTruthy();
      u.unmount();
    }
  });
});

// ─── 2. the type ─────────────────────────────────────────────────────────────

describe("the Horizon's words are set the way the web sets them", () => {
  it("the identity: the platform serif, italic, 24px and snug, in white, clamped to six lines", () => {
    const u = renderStage();
    const words = within(horizonCard(u)).getByTestId("horizon-card-identity");
    const s = flat(words);
    expect(s.fontFamily).toBe(WHISPER_FONT_FAMILY);
    expect(["Georgia", "serif"]).toContain(s.fontFamily);
    expect(s.fontStyle).toBe("italic");
    expect(s.fontSize).toBe(24);
    expect(s.lineHeight).toBe(24 * 1.375);
    expect(s.color).toBe(rgbOf(becomingStageTokens.ink));
    expect(s.color).toBe("rgb(255 255 255)");
    expect(words.props.numberOfLines).toBe(6);
    expect(words.props.children).toBe(`“${JOURNEY.identity}”`);
  });

  it("19px once the identity runs past 140 characters — and not at 140", () => {
    const at = "x".repeat(140);
    const past = "x".repeat(141);
    const u = render(<HorizonCard identity={at} trend="up" next={JOURNEY.next} width={SIZE.w} height={SIZE.h} />);
    expect(flat(u.getByTestId("horizon-card-identity"))).toEqual(expect.objectContaining({ fontSize: 24, lineHeight: 24 * 1.375 }));
    const v = render(<HorizonCard identity={past} trend="up" next={JOURNEY.next} width={SIZE.w} height={SIZE.h} />);
    expect(flat(v.getByTestId("horizon-card-identity"))).toEqual(expect.objectContaining({ fontSize: 19, lineHeight: 19 * 1.375 }));
    expect(flat(v.getByTestId("horizon-card-identity")).fontStyle).toBe("italic");
    // The unwritten line is the short size too.
    const w = render(<HorizonCard identity={null} trend="flat" width={SIZE.w} height={SIZE.h} />);
    expect(flat(w.getByTestId("horizon-card-identity")).fontSize).toBe(24);
    expect(w.getByText("You have not written it yet. Your Mind sessions will ask.")).toBeTruthy();
  });

  it("the kicker: 11px semibold, uppercase, tracked 0.3em, white at 50%, 24 under the eyebrow with the words 8 under it", () => {
    const u = renderStage();
    const card = horizonCard(u);
    const kicker = within(card).getByText("Who am I becoming?");
    const s = flat(kicker);
    expect(s.fontSize).toBe(11);
    expect(s.fontWeight).toBe("600");
    expect(s.textTransform).toBe("uppercase");
    expect(s.letterSpacing).toBeCloseTo(3.3, 10);
    expect(s.color).toBe("rgba(255, 255, 255, 0.5)");
    const body = within(card).getByTestId("horizon-card-body");
    const block = hostKids(body)[1]!;
    expect(hostKids(block).map((k) => k.props.testID ?? k.props.children)).toEqual(["Who am I becoming?", "horizon-card-identity"]);
    // The column's own gap is 12, so `mt-6` (24) is 12 more; `mt-2` (8) between the two.
    expect(flat(body).gap).toBe(12);
    expect(flat(block).marginTop).toBe(12);
    expect(flat(block).gap).toBe(8);
  });
});

// ─── 3. the card fills the box ───────────────────────────────────────────────

describe("the Horizon fills the card box, with 'What writes it' on the bottom edge", () => {
  it("is exactly cardSize, its column fills it, and the spacer sits between the words and the steps", () => {
    const u = renderStage();
    const card = horizonCard(u);
    expect(flat(card)).toEqual(expect.objectContaining({ width: SIZE.w, height: SIZE.h, overflow: "hidden" }));
    const body = within(card).getByTestId("horizon-card-body");
    expect(flat(body).flex).toBe(1);
    const kids = hostKids(body);
    const ids = kids.map((k) => k.props.testID ?? null);
    const words = kids.findIndex((k) => within(k).queryByTestId("horizon-card-identity") != null);
    const spacer = ids.indexOf("horizon-card-spacer");
    const writes = ids.indexOf("horizon-writes");
    expect(words).toBe(1); // after the eyebrow row
    expect(spacer).toBeGreaterThan(words);
    expect(writes).toBe(spacer + 1);
    expect(flat(hostKids(body)[spacer]!).flex).toBe(1);
    expect(within(card).getByText("What writes it")).toBeTruthy();
  });

  it("a card mounted bare draws the wash on the size it measures; in light mode it keeps the system's card under it instead", () => {
    const u = render(<HorizonCard identity={JOURNEY.identity} trend="up" next={JOURNEY.next} />);
    const card = u.getByTestId("horizon-card");
    expect(flat(card).width).toBeUndefined();
    expect(u.queryByTestId("horizon-card-spacer")).toBeNull();
    // Nothing to draw the 160° line on until the card has a size …
    expect(within(card).UNSAFE_queryByType(LinearGradient)).toBeNull();
    // … and once it does, the wash is drawn for that box.
    fireEvent(u.getByTestId("horizon-card-wash"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 350, height: 508 } } });
    expect(within(card).UNSAFE_getByType(LinearGradient).props).toEqual(expect.objectContaining(gradientLine(350, 508, 160)));

    setSystemScheme("light");
    const v = render(<HorizonCard identity={JOURNEY.identity} trend="up" next={JOURNEY.next} width={SIZE.w} height={SIZE.h} />);
    const light = v.getByTestId("horizon-card");
    expect(flat(light).backgroundColor).toBe(resolveToken("card", "light"));
    expect(v.queryByTestId("horizon-card-wash")).toBeNull();
    expect(flat(v.getByTestId("horizon-card-identity")).color).toBe(resolveToken("foreground", "light"));
  });
});

// ─── 4. the numbers are the web's ────────────────────────────────────────────

describe("lib/becoming/horizonCard.ts holds the web's numbers", () => {
  it("the box", () => {
    expect(HORIZON_RADIUS).toBe(28);
    expect(HORIZON_BORDER_WIDTH).toBe(2);
    expect(HORIZON_BORDER_FOCUSED_ALPHA).toBe(0.6);
    expect(HORIZON_BORDER_ALPHA).toBe(0.25);
    expect(horizonBorder(true)).toEqual({ width: 2, style: "dashed", color: "rgba(196, 181, 253, 0.6)" });
    expect(horizonBorder(false)).toEqual({ width: 2, style: "dashed", color: "rgba(255, 255, 255, 0.25)" });
    // violet-300 is `#c4b5fd`.
    expect(becomingStageTokens.horizonRing).toBe("196 181 253");
  });

  it("the wash", () => {
    expect(HORIZON_WASH_ANGLE_DEG).toBe(160);
    expect(HORIZON_WASH_ALPHA).toBe(0.22);
    expect(HORIZON_GROUND_ALPHA).toBe(0.97);
    expect(HORIZON_GROUND_AT).toBe(0.55);
    expect(horizonWash()).toEqual([
      { offset: 0, color: "rgb(124 58 237)", opacity: 0.22 },
      { offset: 0.55, color: "rgb(14 12 23)", opacity: 0.97 },
    ]);
  });

  it("the type", () => {
    expect(HORIZON_IDENTITY_FONT_SIZE).toBe(24);
    expect(HORIZON_IDENTITY_FONT_SIZE_LONG).toBe(19);
    expect(HORIZON_IDENTITY_LONG_OVER).toBe(140);
    expect(HORIZON_IDENTITY_LEADING).toBe(1.375);
    expect(HORIZON_IDENTITY_LINES).toBe(6);
    expect(HORIZON_FONT_FAMILY).toBe(WHISPER_FONT_FAMILY);
    expect(HORIZON_KICKER_FONT_SIZE).toBe(11);
    expect(HORIZON_KICKER_TRACKING).toBeCloseTo(3.3, 10);
    expect(HORIZON_KICKER_ALPHA).toBe(0.5);
    expect(horizonIdentityType("x".repeat(140))).toEqual({ fontFamily: WHISPER_FONT_FAMILY, fontStyle: "italic", fontSize: 24, lineHeight: 33 });
    expect(horizonIdentityType("x".repeat(141))).toEqual({ fontFamily: WHISPER_FONT_FAMILY, fontStyle: "italic", fontSize: 19, lineHeight: 26.125 });
    expect(horizonIdentityType(null).fontSize).toBe(24);
    expect(horizonIdentityType(undefined).fontSize).toBe(24);
  });
});

// ─── 5. the line to the Horizon, on the Skia canvas ──────────────────────────

describe("the line to the Horizon is violet-400 and dashed, in a form Skia reads", () => {
  it("the last segment — live week to Horizon — is a dashed `6 6` stroke in `#a78bfa` at .85", () => {
    const u = renderStage();
    const canvas = u.getByTestId("skia-Canvas");
    const seg = within(canvas)
      .getAllByTestId("skia-Path")
      .find((p) => p.props.path === `M ${LIVE_POS.x} ${LIVE_POS.y} L ${HORIZON_POS.x} ${HORIZON_POS.y}`);
    expect(seg).toBeTruthy();
    expect(seg!.props).toEqual(expect.objectContaining({ style: "stroke", strokeCap: "round", opacity: 0.85 }));
    expect(seg!.props.color).toBe(skiaRgbOf(becomingStageTokens.violet));
    expect(seg!.props.color).toBe("rgba(167, 139, 250, 1)");
    expect(within(seg!).getByTestId("skia-DashPathEffect").props.intervals).toEqual([6, 6]);
  });

  it("the Horizon's marker is a dashed `3 3` ring in `#a78bfa`, and stays so in the overview", () => {
    const ref = React.createRef<JourneyStageHandle>();
    const u = renderStage(ref);
    const ring = () =>
      within(u.getByTestId("skia-Canvas"))
        .getAllByTestId("skia-Circle")
        .find((c) => c.props.cx === HORIZON_POS.x && c.props.cy === HORIZON_POS.y);
    for (const where of ["focus", "overview"] as const) {
      if (where === "overview") act(() => ref.current!.enterOverview());
      expect(mode(u)).toBe(where);
      const r = ring();
      expect([where, r?.props.style]).toEqual([where, "stroke"]);
      expect([where, r?.props.color]).toEqual([where, "rgba(167, 139, 250, 1)"]);
      expect(within(r!).getByTestId("skia-DashPathEffect").props.intervals).toEqual([3, 3]);
    }
  });

  it("nothing on the canvas is handed a colour in the form Skia paints black", () => {
    const u = renderStage();
    const colours = coloursUnder(u.getByTestId("skia-Canvas"));
    // The sky, the stars, the gridlines, the area fill, every segment and marker: plenty to check.
    expect(colours.length).toBeGreaterThan(WEEKS.length * 3);
    const unread = colours.filter((c) => !SKIA_READS.test(c));
    expect(unread).toEqual([]);
    expect(colours.filter((c) => SPACE_RGB.test(c))).toEqual([]);
    // And the solid ones — the ring, the gold ring, a marker's outline — are among them, in the comma form.
    expect(colours).toContain("rgba(167, 139, 250, 1)");
    expect(colours).toContain(skiaRgbOf(becomingStageTokens.background));
  });

  it("skiaRgbOf is the comma form at every alpha; rgbOf's solid form is the one Skia does not read", () => {
    expect(skiaRgbOf("167 139 250")).toBe("rgba(167, 139, 250, 1)");
    expect(skiaRgbOf("167 139 250", 0.22)).toBe("rgba(167, 139, 250, 0.22)");
    expect(skiaRgbOf("167 139 250", 0)).toBe("rgba(167, 139, 250, 0)");
    // At an alpha under 1 the two agree, which is why the area fill was never black.
    expect(skiaRgbOf("167 139 250", 0.22)).toBe(rgbOf("167 139 250", 0.22));
    // Solid, they do not: `rgbOf` writes the space form, which React Native reads and Skia does not.
    expect(rgbOf("167 139 250")).toBe("rgb(167 139 250)");
    expect(SPACE_RGB.test(rgbOf("167 139 250"))).toBe(true);
    expect(SKIA_READS.test(rgbOf("167 139 250"))).toBe(false);
    expect(SKIA_READS.test(skiaRgbOf("167 139 250"))).toBe(true);
    // The guard can tell hsl() apart from a space-form rgb(): the week segments are `pillarColor`'s hsl.
    expect(SKIA_READS.test("hsl(142, 71%, 62%)")).toBe(true);
    expect(SKIA_READS.test("hsla(142, 71%, 62%, 0.5)")).toBe(true);
    expect(SKIA_READS.test("rgb(255 255 255)")).toBe(false);
  });
});
