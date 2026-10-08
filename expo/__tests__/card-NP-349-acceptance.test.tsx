// NP-349 — BECOMING STAGE: IDENTITY LINES ARE SANS ITALIC, THE WEB SETS THEM
// IN SERIF (native).
//
// Visual + motion review of NP-204 on build 763bc68b (beta, 10/8), the web
// (become-beta, 390 × 844) against the S23 and the iOS simulator: every
// identity line on the web's stage is `font-serif italic` —
//
//   1. the INTRO TITLE's quote   font-serif text-base italic text-white/75 line-clamp-3, max-w-sm
//   2. the OVERVIEW HUD          font-serif text-[15px] italic leading-snug text-white/85 line-clamp-2, max-w-md
//   3. the HORIZON card          font-serif italic leading-snug text-white line-clamp-6, 24px (19px past 140)
//   4. the card WHISPER          font-serif text-[12px] italic text-white/45
//
// — and native set all four in Geist italic, which reads as a different
// product. The title over the quote, `text-4xl font-black tracking-tight`,
// wraps to two lines on the web at 390 (36px, −0.025em, inside `px-8`).
//
// Nothing serif is bundled (NP-160 ships Geist and Geist Mono), so the serif
// is the PLATFORM's, named once — `SERIF_FONT_FAMILY` in `lib/theme/fonts.ts`:
// Georgia on iOS (Safari's `ui-serif` is New York, which has no name React
// Native can ask for), `serif` (Noto Serif) on Android — and every one of the
// four lines takes it from THAT constant, so there is one serif, not four.
//
// What this suite proves: the four lines, read off the rendered stage, are
// serif italic at the web's size, leading, alpha, measure and clamp, and all
// four name the same face; that face is Georgia on iOS and `serif` on
// Android and never a Geist face, and the app's Text lets it through; the
// title is 36 on 40 at −0.9 and 900 in a full-width `px-8` block, unclamped;
// and the web still sets those lines the way the numbers say.

import fs from "node:fs";
import path from "node:path";
import React from "react";
import { AccessibilityInfo, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, within, act, type RenderResult } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { cardSize } from "@become/core";
import { Text } from "@/components/Text";
import { JourneyStage, type JourneyStageProps } from "@/components/becoming/journey/JourneyStage";
import { HorizonCard, WeekCard } from "@/components/becoming/WeekCard";
import { WHISPER_ALPHA, WHISPER_FONT_FAMILY, WHISPER_FONT_SIZE } from "@/lib/becoming/focusedCard";
import { HORIZON_FONT_FAMILY, HORIZON_IDENTITY_FONT_SIZE, horizonIdentityType } from "@/lib/becoming/horizonCard";
import { journeySignals } from "@/lib/becoming/signals";
import {
  HUD_IDENTITY_ALPHA,
  HUD_IDENTITY_FONT_SIZE,
  HUD_IDENTITY_LEADING,
  HUD_IDENTITY_LINES,
  HUD_IDENTITY_MAX_WIDTH,
  INTRO_QUOTE_ALPHA,
  INTRO_QUOTE_FONT_SIZE,
  INTRO_QUOTE_GAP,
  INTRO_QUOTE_LINE_HEIGHT,
  INTRO_QUOTE_LINES,
  INTRO_QUOTE_MAX_WIDTH,
  TITLE_BLOCK_PADDING,
  TITLE_FONT_SIZE,
  TITLE_FONT_WEIGHT,
  TITLE_GAP,
  TITLE_LINE_HEIGHT,
  TITLE_TRACKING,
  hudIdentityType,
  introQuoteType,
  introTitleType,
  serifItalic,
} from "@/lib/becoming/stageWords";
import { resetIntroSession } from "@/lib/becoming/storage";
import { GEIST_FACES, SERIF_FONT_FAMILY, geistFontFamily, serifFontFamilyFor } from "@/lib/theme/fonts";
import { becomingStageTokens, rgbOf } from "@/lib/theme/tokens";
import { journeyWith, yearOfWeeks } from "../test-support/becomingFixtures";

const EXPO_DIR = path.resolve(__dirname, "..");
const REPO_DIR = path.resolve(EXPO_DIR, "..");
const readRepo = (rel: string): string => fs.readFileSync(path.join(REPO_DIR, rel), "utf8");

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
const SIGNALS = journeySignals(WEEKS, { unit: JOURNEY.unit, direction: JOURNEY.target?.direction ?? null });
const QUOTE = `“${JOURNEY.identity}”`;
/** The eight faces NP-160 bundles: a serif line must be none of them. */
const EVERY_GEIST_FACE = [...Object.values(GEIST_FACES.sans), ...Object.values(GEIST_FACES.mono)];

type Instance = ReturnType<RenderResult["getByTestId"]>;

/** One flat style object out of RN's nested style arrays. */
function flat(node: { props: { style?: unknown } }): Record<string, unknown> {
  return Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
}

/** A Text's children as the string it shows (`“{identity}”` is three children). */
const textOf = (node: Instance): string => React.Children.toArray(node.props.children as React.ReactNode).join("");

const NOOP = { onClose: jest.fn(), onDetails: jest.fn(), onNavigate: jest.fn() };

function renderStage(props: Partial<JourneyStageProps> = {}) {
  return render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <JourneyStage data={JOURNEY} introKind="none" {...NOOP} {...props} />
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );
}

/** The opening starts when the stage is ON SCREEN (NP-347): RNTL lays nothing out, so the test says so. */
function showStage(u: RenderResult) {
  act(() => {
    u.getByTestId("skia-Canvas").props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: WINDOW.width, height: WINDOW.height } } });
  });
}

const slot = (u: RenderResult, i: number): Instance => u.getByTestId(`journey-card-${i}`);

/** The opening's title block, held: the full opening, on screen, before the hold ends. */
function openTitle(props: Partial<JourneyStageProps> = {}) {
  jest.useFakeTimers();
  const u = renderStage({ introKind: "full", ...props });
  showStage(u);
  return { u, title: u.getByTestId("journey-title") };
}

/** The overview, and its HUD. */
function openHud(props: Partial<JourneyStageProps> = {}) {
  const u = renderStage(props);
  fireEvent.press(u.getByTestId("journey-zoom"));
  return { u, hud: u.getByTestId("journey-hud") };
}

/** A serif line: the platform serif, italic — and not one of the eight Geist faces. */
function expectSerifItalic(s: Record<string, unknown>) {
  expect(s.fontFamily).toBe(SERIF_FONT_FAMILY);
  expect(s.fontStyle).toBe("italic");
  expect(EVERY_GEIST_FACE).not.toContain(s.fontFamily);
}

let reduceRead: jest.SpyInstance;
let reduceSub: jest.SpyInstance;
beforeEach(async () => {
  await AsyncStorage.clear();
  resetIntroSession();
  reduceRead = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(() => Promise.resolve(false));
  reduceSub = jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((() => ({ remove: () => {} })) as never);
});
afterEach(() => {
  reduceRead.mockRestore();
  reduceSub.mockRestore();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// ─── 1. the intro title's quote ─────────────────────────────────────────────

describe("the intro title's quote is the web's: serif italic, 16 on 24, 75% white, three lines, max-w-sm", () => {
  it("reads the identity in the platform serif, italic, at the web's numbers", () => {
    const { title } = openTitle();
    const quote = within(title).getByTestId("journey-title-quote");
    expect(textOf(quote)).toBe(QUOTE);
    const s = flat(quote);
    expectSerifItalic(s);
    expect(s.fontSize).toBe(16);
    expect(s.lineHeight).toBe(24);
    expect(s.color).toBe(rgbOf(becomingStageTokens.ink, INTRO_QUOTE_ALPHA));
    expect(s.color).toBe("rgba(255, 255, 255, 0.75)");
    expect(s.maxWidth).toBe(384);
    expect(s.marginTop).toBe(16);
    expect(s.textAlign).toBe("center");
    expect(quote.props.numberOfLines).toBe(3);
  });

  it("is the one line of the block in serif: the kicker and the title stay in Geist", () => {
    const { title } = openTitle();
    const kicker = within(title).getByText("The Becoming");
    const headline = within(title).getByTestId("journey-title-headline");
    expect(flat(kicker).fontFamily).toBe(GEIST_FACES.sans[600]);
    expect(flat(headline).fontFamily).toBe(GEIST_FACES.sans[700]);
    expect(flat(kicker).fontStyle).toBeUndefined();
    expect(flat(headline).fontStyle).toBeUndefined();
  });

  it("is not drawn when nothing has been written; the title still is", () => {
    const { title, u } = openTitle({ data: journeyWith(WEEKS, { identity: null }) });
    expect(within(title).queryByTestId("journey-title-quote")).toBeNull();
    expect(within(title).getByText("Who am I becoming?")).toBeTruthy();
    expect(u.queryByText(QUOTE)).toBeNull();
  });
});

// ─── 2. the overview HUD ─────────────────────────────────────────────────────

describe("the overview HUD's identity is the web's: serif italic, 15 snug, 85% white, two lines, max-w-md", () => {
  it("reads the identity in the platform serif, italic, at the web's numbers", () => {
    const { hud } = openHud();
    const line = within(hud).getByTestId("journey-hud-identity");
    expect(textOf(line)).toBe(QUOTE);
    const s = flat(line);
    expectSerifItalic(s);
    expect(s.fontSize).toBe(15);
    expect(s.lineHeight).toBe(15 * 1.375);
    expect(s.color).toBe(rgbOf(becomingStageTokens.ink, HUD_IDENTITY_ALPHA));
    expect(s.color).toBe("rgba(255, 255, 255, 0.85)");
    expect(s.maxWidth).toBe(448);
    expect(s.textAlign).toBe("center");
    expect(line.props.numberOfLines).toBe(2);
  });

  it("the aggregate under it stays in Geist — 11px, tabular, 6 below — as on the web", () => {
    const { hud } = openHud();
    const agg = within(hud).getByTestId("journey-aggregate");
    const s = flat(agg);
    expect(s.fontFamily).toBe(GEIST_FACES.sans[400]);
    expect(s.fontStyle).toBeUndefined();
    expect(s.fontSize).toBe(11);
    expect(s.marginTop).toBe(6);
    expect(s.fontVariant).toEqual(["tabular-nums"]);
  });

  it("is not drawn when nothing has been written; the aggregate still is", () => {
    const { hud } = openHud({ data: journeyWith(WEEKS, { identity: null }) });
    expect(within(hud).queryByTestId("journey-hud-identity")).toBeNull();
    expect(within(hud).getByTestId("journey-aggregate")).toBeTruthy();
  });
});

// ─── 3. one serif, four places ───────────────────────────────────────────────

describe("one serif, four places", () => {
  it("the Horizon card's words and the whisper name the same face as the title's quote and the HUD", () => {
    expect(HORIZON_FONT_FAMILY).toBe(SERIF_FONT_FAMILY);
    expect(WHISPER_FONT_FAMILY).toBe(SERIF_FONT_FAMILY);
    expect(introQuoteType().fontFamily).toBe(SERIF_FONT_FAMILY);
    expect(hudIdentityType().fontFamily).toBe(SERIF_FONT_FAMILY);
    expect(horizonIdentityType(JOURNEY.identity).fontFamily).toBe(SERIF_FONT_FAMILY);
  });

  it("on the rendered stage: the live card's whisper and the Horizon's words, in focus; the HUD, zoomed out; the quote, in the opening", () => {
    const u = renderStage();
    const whisper = within(slot(u, LIVE)).getByTestId("week-card-identity");
    const horizon = within(slot(u, HORIZON)).getByTestId("horizon-card-identity");
    expectSerifItalic(flat(whisper));
    expectSerifItalic(flat(horizon));
    expect(flat(whisper).fontSize).toBe(WHISPER_FONT_SIZE);
    expect(flat(whisper).fontSize).toBe(12);
    expect(flat(whisper).color).toBe(rgbOf(becomingStageTokens.ink, WHISPER_ALPHA));
    expect(flat(horizon).fontSize).toBe(HORIZON_IDENTITY_FONT_SIZE);
    expect(flat(horizon).fontSize).toBe(24);
    expect(textOf(horizon)).toBe(QUOTE);

    fireEvent.press(u.getByTestId("journey-zoom"));
    expectSerifItalic(flat(within(u.getByTestId("journey-hud")).getByTestId("journey-hud-identity")));
    u.unmount();

    const { title } = openTitle();
    expectSerifItalic(flat(within(title).getByTestId("journey-title-quote")));
  });

  it("a card mounted bare reads the same serif — the face does not depend on the stage or the scheme", () => {
    const week = WEEKS[LIVE - 1]!;
    const bare = render(<WeekCard week={week} signals={SIGNALS[LIVE - 1]!} identity={JOURNEY.identity} width={SIZE.w} height={SIZE.h} />);
    expectSerifItalic(flat(bare.getByTestId("week-card-identity")));
    const horizon = render(<HorizonCard identity={JOURNEY.identity} trend="up" next={JOURNEY.next} width={SIZE.w} height={SIZE.h} />);
    expectSerifItalic(flat(horizon.getByTestId("horizon-card-identity")));
  });

  it("the face is the platform's serif — Georgia on iOS, the system serif on Android — never a Geist face", () => {
    // The stack the web's `font-serif` is: `ui-serif, Georgia, …, serif`. Georgia is
    // its first NAMED face and iOS ships it (New York has no public name); `serif`
    // is React Native's name for Android's system serif, where Chrome lands too.
    expect(serifFontFamilyFor("ios")).toBe("Georgia");
    expect(serifFontFamilyFor("android")).toBe("serif");
    expect(serifFontFamilyFor("web")).toBe("serif");
    expect(SERIF_FONT_FAMILY).toBe(serifFontFamilyFor(Platform.OS));
    expect(SERIF_FONT_FAMILY).toMatch(/^(Georgia|serif)$/);
    expect(EVERY_GEIST_FACE).not.toContain(SERIF_FONT_FAMILY);
    expect(EVERY_GEIST_FACE).not.toContain("Georgia");
    expect(EVERY_GEIST_FACE).not.toContain("serif");
  });

  it("the app's Text lets the serif through: the Geist face it resolves sits UNDER the caller's family", () => {
    // `components/Text.tsx` is `[{ fontFamily: geistFontFamily(...) }, style]`: the
    // caller's family comes later in the array, so it wins — the Geist face is
    // still resolved (regular sans) but never drawn on a serif line.
    const u = render(
      <Text testID="t" style={serifItalic(16, 24)}>
        x
      </Text>,
    );
    const s = flat(u.getByTestId("t"));
    expect(s.fontFamily).toBe(SERIF_FONT_FAMILY);
    expect(s.fontStyle).toBe("italic");
    expect(geistFontFamily(undefined, serifItalic(16, 24))).toBe(GEIST_FACES.sans[400]);
    expect(serifItalic(16, 24)).toEqual({ fontFamily: SERIF_FONT_FAMILY, fontStyle: "italic", fontSize: 16, lineHeight: 24 });
  });
});

// ─── 4. the title ────────────────────────────────────────────────────────────

describe("the intro title is the web's `text-4xl font-black tracking-tight`, in the web's measure", () => {
  it("is 36 on a 40 line, tracked −0.9, weight 900 → the heaviest Geist bundled, centred, 8 under the kicker, unclamped", () => {
    const { title } = openTitle();
    const h = within(title).getByTestId("journey-title-headline");
    expect(h.props.children).toBe("Who am I becoming?");
    const s = flat(h);
    expect(s.fontSize).toBe(36);
    expect(s.lineHeight).toBe(40);
    expect(s.letterSpacing).toBeCloseTo(-0.9, 10);
    expect(s.fontWeight).toBe("900");
    // NP-160 snaps 900 to the heaviest face bundled: Bold.
    expect(s.fontFamily).toBe(GEIST_FACES.sans[700]);
    expect(geistFontFamily(undefined, { fontWeight: "900" })).toBe(GEIST_FACES.sans[700]);
    expect(s.textAlign).toBe("center");
    expect(s.marginTop).toBe(8);
    // Nothing stops it taking a second line, as the web's does at 390.
    expect(h.props.numberOfLines).toBeUndefined();
    expect(h.props.adjustsFontSizeToFit).toBeFalsy();
  });

  it("the block is the web's: full width, `px-8`, centred, at 36% — the measure the title wraps in", () => {
    const { title } = openTitle();
    const t = flat(title);
    expect(t.position).toBe("absolute");
    expect(t.left).toBe(0);
    expect(t.right).toBe(0);
    expect(t.top).toBe("36%");
    expect(t.paddingHorizontal).toBe(TITLE_BLOCK_PADDING);
    expect(t.paddingHorizontal).toBe(32);
    expect(t.alignItems).toBe("center");
  });
});

// ─── 5. the numbers are the web's ────────────────────────────────────────────

describe("lib/becoming/stageWords.ts holds the web's numbers", () => {
  it("the title", () => {
    expect(TITLE_FONT_SIZE).toBe(36);
    expect(TITLE_LINE_HEIGHT).toBe(40);
    expect(TITLE_TRACKING).toBeCloseTo(-0.025 * 36, 10);
    expect(TITLE_FONT_WEIGHT).toBe("900");
    expect(TITLE_GAP).toBe(8);
    expect(TITLE_BLOCK_PADDING).toBe(32);
    expect(introTitleType()).toEqual({ fontSize: 36, lineHeight: 40, letterSpacing: expect.closeTo(-0.9, 10), fontWeight: "900" });
  });

  it("the quote", () => {
    expect(INTRO_QUOTE_FONT_SIZE).toBe(16);
    expect(INTRO_QUOTE_LINE_HEIGHT).toBe(24);
    expect(INTRO_QUOTE_MAX_WIDTH).toBe(384);
    expect(INTRO_QUOTE_ALPHA).toBe(0.75);
    expect(INTRO_QUOTE_LINES).toBe(3);
    expect(INTRO_QUOTE_GAP).toBe(16);
    expect(introQuoteType()).toEqual({ fontFamily: SERIF_FONT_FAMILY, fontStyle: "italic", fontSize: 16, lineHeight: 24 });
  });

  it("the HUD", () => {
    expect(HUD_IDENTITY_FONT_SIZE).toBe(15);
    expect(HUD_IDENTITY_LEADING).toBe(1.375);
    expect(HUD_IDENTITY_MAX_WIDTH).toBe(448);
    expect(HUD_IDENTITY_ALPHA).toBe(0.85);
    expect(HUD_IDENTITY_LINES).toBe(2);
    expect(hudIdentityType()).toEqual({ fontFamily: SERIF_FONT_FAMILY, fontStyle: "italic", fontSize: 15, lineHeight: 20.625 });
  });
});

// ─── 6. the web is the source of truth ───────────────────────────────────────

describe("the web still sets these lines the way the numbers say", () => {
  it("JourneyCanvas: the title block and the HUD", () => {
    const web = readRepo("webapp/components/becoming/journey/JourneyCanvas.tsx");
    expect(web).toContain('className="mt-2 text-4xl font-black tracking-tight">Who am I becoming?</h1>');
    expect(web).toContain('className="mx-auto mt-4 max-w-sm font-serif text-base italic text-white/75 line-clamp-3"');
    expect(web).toContain('className="mx-auto max-w-md font-serif text-[15px] italic leading-snug text-white/85 line-clamp-2"');
    expect(web).toContain('className="pointer-events-none absolute inset-x-0 top-[36%] px-8 text-center"');
  });

  it("WeekCard: the Horizon's words and the whisper", () => {
    const web = readRepo("webapp/components/becoming/journey/WeekCard.tsx");
    expect(web).toContain("font-serif italic leading-snug text-white line-clamp-6");
    expect(web).toContain("font-serif text-[12px] italic text-white/45");
  });

  it("and the web's serif is Tailwind's own stack, not overridden — so the platform serif IS what it resolves to on a phone", () => {
    // Tailwind's `--font-serif` is `ui-serif, Georgia, Cambria, "Times New Roman",
    // Times, serif`. If the web ever names a serif of its own, this is the test
    // that says the phone should bundle it.
    const globals = readRepo("webapp/app/globals.css");
    expect(globals).not.toContain("--font-serif");
    const layout = readRepo("webapp/app/layout.tsx");
    expect(layout).not.toMatch(/serif/i);
  });
});
