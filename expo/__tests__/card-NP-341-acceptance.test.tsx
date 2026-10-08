/* eslint-disable import/first */
// NP-341 — BECOMING STAGE: WEEK CARDS TURN WHITE IN LIGHT MODE ON THE DARK
// STAGE (native).
//
// Visual review of NP-204 on build 763bc68b, 10/8: the S23 (`uimode night no`)
// and the iOS simulator (appearance light) both drew the stage dark and every
// week card — and the Horizon card, the highlight block, the "what to work on"
// block — as a white card with dark ink on the purple sky. `ios/ios-dark.mp4`
// shows the open stage flipping from white to dark cards as the sim's
// appearance switches.
//
// The web's stage is a night sky in both schemes and so are its cards:
// `JourneyCanvas.tsx` is `bg-[#07060d] text-white` with no `dark:` variant
// under it. Natively the stage's chrome and tiles already drew from
// `becomingStageTokens`, but `WeekCard` / `HorizonCard` read `useThemeTokens()`
// — the SYSTEM scheme.
//
// The fix is a scheme OVERRIDE, not a literal: `JourneyStage` wraps everything
// under it in `ForcedThemeMode mode="dark"`, and `useThemeTokens()` answers
// with the dark palette beneath it. So this suite asserts:
//
//   1. under the LIGHT system scheme, every full card on the stage — a past
//      week, the live week, the Horizon — is dark, with the dark `foreground`
//      as ink, the dark `muted` tint on the live badge, the step chip, the
//      Details button and the "what writes it" block; the tiles and the stage
//      itself are `becomingStageTokens`;
//   2. the dark-scheme render is byte-for-byte the same as the light one;
//   3. a LIVE flip of the system scheme while the stage is open leaves the
//      cards dark (the iOS video);
//   4. it is a provider and not a literal: `WeekCard` mounted OUTSIDE the stage
//      still follows the system, a sibling outside the provider is unaffected,
//      and the stage's source has no colour class (a class resolves against
//      NativeWind's global scheme and would bypass the override).
//
// NP-342 then gave a week card the web's own ground — `becomingStageTokens.card`,
// the web's `#0e0c17`, under a subject-tinted sky, with the web's ring in the
// week's hue — in the dark palette. So the surface and ring read below are the
// stage's card and the week's hue rather than the palette's `card` / `border`;
// everything this suite guards is unchanged: dark in both schemes, identical
// in both, and a card outside the stage still follows the system.

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import * as fs from "fs";
import * as path from "path";
import React from "react";
import { AccessibilityInfo, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, within, type RenderResult } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { colorScheme } from "nativewind";
import { JourneyStage, type JourneyStageHandle } from "@/components/becoming/journey/JourneyStage";
import { WeekCard } from "@/components/becoming/WeekCard";
import { pillarColor } from "@/lib/becoming/pillarColors";
import { journeySignals } from "@/lib/becoming/signals";
import { resetIntroSession } from "@/lib/becoming/storage";
import { ForcedThemeMode, useThemeTokens } from "@/lib/theme/useThemeTokens";
import { becomingStageTokens, resolveToken, rgbOf, tintToken, type ThemeMode } from "@/lib/theme/tokens";
import { journeyWith, yearOfWeeks } from "../test-support/becomingFixtures";
/* eslint-enable import/first */

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string => fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};

const WEEKS = yearOfWeeks(52);
const JOURNEY = journeyWith(WEEKS);
const LIVE = WEEKS.length - 1;
const PAST = LIVE - 1;
const SIGNALS = journeySignals(WEEKS, { unit: JOURNEY.unit, direction: JOURNEY.target?.direction ?? null });

/** What the phone is set to — the signal NativeWind reports and the hook reads. */
function setSystemScheme(mode: ThemeMode): void {
  act(() => {
    colorScheme.set(mode);
  });
}

/** One flat style object out of RN's nested style arrays. */
function flat(node: { props: { style?: unknown } }): Record<string, unknown> {
  return Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
}

const DARK = {
  card: resolveToken("card", "dark"),
  border: resolveToken("border", "dark"),
  foreground: resolveToken("foreground", "dark"),
  mutedForeground: resolveToken("muted-foreground", "dark"),
  chip: tintToken("muted", "dark", 0.5),
  block: tintToken("muted", "dark", 0.2),
};
const LIGHT_CARD = resolveToken("card", "light");
/** A week card's ground in the dark palette: the stage's card, the web's `#0e0c17` (NP-342). */
const STAGE_CARD = rgbOf(becomingStageTokens.card);
/** A finished week's ring: a hairline in the week's hue (NP-342). */
const PAST_RING = pillarColor(WEEKS[PAST]!.subject, WEEKS[PAST]!.score, 60, 0.18);

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

/** The colours this card is about, read off a rendered stage. */
function stageColours(u: RenderResult) {
  const past = u.getByTestId(`week-card-${WEEKS[PAST]!.weekKey}`);
  const live = u.getByTestId(`week-card-${WEEKS[LIVE]!.weekKey}`);
  const horizon = u.getByTestId("horizon-card");
  const detailsBtn = within(live).getByTestId("week-card-details-btn");
  const detailsLabel = within(detailsBtn).getByText("Details");
  const liveBadge = within(live).getByTestId("week-card-live");
  const liveHeadline = within(live).getByTestId("week-card-headline");
  const pastHeadline = within(past).getByTestId("week-card-headline");
  const pastSub = within(past).getByTestId("week-card-sub");
  const horizonWrites = within(horizon).getByTestId("horizon-writes");
  return {
    pastCard: flat(past).backgroundColor,
    pastBorder: flat(past).borderColor,
    pastHeadline: flat(pastHeadline).color,
    pastSub: flat(pastSub).color,
    liveCard: flat(live).backgroundColor,
    liveHeadline: flat(liveHeadline).color,
    liveBadge: flat(liveBadge).backgroundColor,
    liveBadgeText: flat(within(liveBadge).getByText("live")).color,
    detailsBtn: flat(detailsBtn).backgroundColor,
    detailsLabel: flat(detailsLabel).color,
    horizonCard: flat(horizon).backgroundColor,
    horizonWrites: flat(horizonWrites).backgroundColor,
    horizonWritesBorder: flat(horizonWrites).borderColor,
    tile: flat(u.getByTestId(`journey-tile-${WEEKS[LIVE - 3]!.weekKey}`)).backgroundColor,
    stage: flat(u.getByTestId("journey-stage")).backgroundColor,
  };
}

let reduceRead: jest.SpyInstance;
let reduceSub: jest.SpyInstance;
beforeEach(async () => {
  await AsyncStorage.clear();
  resetIntroSession();
  // Full motion, answered the way the OS answers it; the opening is "none" anyway.
  reduceRead = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(() => Promise.resolve(false));
  reduceSub = jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(() => ({ remove: () => {} }) as never);
});
afterEach(() => {
  reduceRead.mockRestore();
  reduceSub.mockRestore();
  setSystemScheme("dark");
});

// ─── 1. light mode: the cards are the dark palette's ─────────────────────────

describe("under the light scheme the stage's cards are the dark palette's", () => {
  it("a past week's card ground is the stage's card (the web's #0e0c17), its ring the week's hue, its ink the dark `foreground`", () => {
    setSystemScheme("light");
    const u = renderStage();
    const c = stageColours(u);
    expect(c.pastCard).toBe(STAGE_CARD);
    expect(c.pastCard).not.toBe(LIGHT_CARD);
    expect(c.pastBorder).toBe(PAST_RING);
    expect(c.pastHeadline).toBe(DARK.foreground);
    expect(c.pastSub).toBe(DARK.mutedForeground);
  });

  it("the live week's chips, headline and Details button are the dark palette's too", () => {
    setSystemScheme("light");
    const u = renderStage();
    const c = stageColours(u);
    expect(c.liveHeadline).toBe(DARK.foreground);
    expect(c.liveBadge).toBe(DARK.chip);
    expect(c.liveBadgeText).toBe(DARK.foreground);
    expect(c.detailsBtn).toBe(DARK.chip);
    expect(c.detailsLabel).toBe(DARK.foreground);
  });

  it("the Horizon card and its 'what writes it' block are the dark palette's", () => {
    setSystemScheme("light");
    const u = renderStage();
    const c = stageColours(u);
    expect(c.horizonCard).toBe(DARK.card);
    expect(c.horizonWrites).toBe(DARK.block);
    expect(c.horizonWritesBorder).toBe(DARK.border);
  });

  it("the stage and its tiles stay on the stage tokens", () => {
    setSystemScheme("light");
    const u = renderStage();
    const c = stageColours(u);
    expect(c.stage).toBe(rgbOf(becomingStageTokens.background));
    expect(c.tile).toBe(rgbOf(becomingStageTokens.background, 0.92));
  });

  it("the live week's own ground is the dark one in light mode, not the light card", () => {
    // The live week sits on the same ground as every week (NP-342), under its
    // own sky; under the override it is the stage's card in both schemes.
    // Pinned by comparison with the dark render below, and here by what it is NOT.
    setSystemScheme("light");
    const light = stageColours(renderStage()).liveCard;
    setSystemScheme("dark");
    const dark = stageColours(renderStage()).liveCard;
    expect(light).toBe(dark);
    expect(light).toBe(STAGE_CARD);
    expect(light).not.toBe(LIGHT_CARD);
  });
});

// ─── 2. the two schemes render the same stage ────────────────────────────────

describe("the stage is the same in both schemes, like the web's", () => {
  it("every colour this card is about is identical under light and dark", () => {
    setSystemScheme("dark");
    const dark = stageColours(renderStage());
    setSystemScheme("light");
    const light = stageColours(renderStage());
    expect(light).toEqual(dark);
  });
});

// ─── 3. a live flip while the stage is open ──────────────────────────────────

describe("a live appearance flip leaves an open stage dark", () => {
  it("dark → light → dark: the cards on screen do not repaint", () => {
    setSystemScheme("dark");
    const u = renderStage();
    expect(stageColours(u).pastCard).toBe(STAGE_CARD);

    setSystemScheme("light");
    const flipped = stageColours(u);
    expect(flipped.pastCard).toBe(STAGE_CARD);
    expect(flipped.horizonCard).toBe(DARK.card);
    expect(flipped.detailsBtn).toBe(DARK.chip);
    expect(flipped.pastHeadline).toBe(DARK.foreground);

    setSystemScheme("dark");
    expect(stageColours(u).pastCard).toBe(STAGE_CARD);
  });

  it("opening on the light scheme and flying to another week keeps the new focus dark", () => {
    setSystemScheme("light");
    const ref = React.createRef<JourneyStageHandle>();
    const u = renderStage(ref);
    act(() => ref.current!.focusOn(7));
    const card = u.getByTestId(`week-card-${WEEKS[7]!.weekKey}`);
    expect(flat(card).backgroundColor).toBe(STAGE_CARD);
    expect(flat(within(card).getByTestId("week-card-headline")).color).toBe(DARK.foreground);
  });
});

// ─── 4. a provider, not a literal ────────────────────────────────────────────

function Probe({ testID }: { testID: string }) {
  const { colors, mode } = useThemeTokens();
  return <View testID={testID} accessibilityLabel={mode} style={{ backgroundColor: colors.card }} />;
}

describe("the override is a scoped provider, not a per-component literal", () => {
  it("WeekCard mounted outside the stage still follows the system", () => {
    setSystemScheme("light");
    const u = render(<WeekCard week={WEEKS[PAST]!} signals={SIGNALS[PAST]!} onDetails={jest.fn()} />);
    const card = u.getByTestId(`week-card-${WEEKS[PAST]!.weekKey}`);
    expect(flat(card).backgroundColor).toBe(LIGHT_CARD);
    expect(flat(within(card).getByTestId("week-card-headline")).color).toBe(resolveToken("foreground", "light"));
    expect(flat(within(card).getByTestId("week-card-details-btn")).backgroundColor).toBe(tintToken("muted", "light", 0.5));
  });

  it("the same WeekCard under ForcedThemeMode is the dark palette's, and a sibling outside it is not", () => {
    setSystemScheme("light");
    const u = render(
      <View>
        <Probe testID="outside" />
        <ForcedThemeMode mode="dark">
          <Probe testID="inside" />
          <WeekCard week={WEEKS[PAST]!} signals={SIGNALS[PAST]!} onDetails={jest.fn()} />
        </ForcedThemeMode>
      </View>,
    );
    expect(u.getByTestId("outside").props.accessibilityLabel).toBe("light");
    expect(flat(u.getByTestId("outside")).backgroundColor).toBe(LIGHT_CARD);
    expect(u.getByTestId("inside").props.accessibilityLabel).toBe("dark");
    expect(flat(u.getByTestId("inside")).backgroundColor).toBe(DARK.card);
    expect(flat(u.getByTestId(`week-card-${WEEKS[PAST]!.weekKey}`)).backgroundColor).toBe(STAGE_CARD);
  });

  it("ForcedThemeMode can pin light as well — it is a mode, not a dark switch", () => {
    setSystemScheme("dark");
    const u = render(
      <ForcedThemeMode mode="light">
        <Probe testID="inside" />
      </ForcedThemeMode>,
    );
    expect(u.getByTestId("inside").props.accessibilityLabel).toBe("light");
    expect(flat(u.getByTestId("inside")).backgroundColor).toBe(LIGHT_CARD);
  });

  it("the stage wraps its whole subtree in the provider and the cards keep reading tokens", () => {
    const stage = readExpo("components/becoming/journey/JourneyStage.tsx");
    expect(stage).toContain('import { ForcedThemeMode } from "@/lib/theme/useThemeTokens"');
    expect(stage).toContain('<ForcedThemeMode mode="dark">');
    expect(stage).toContain("</ForcedThemeMode>");
    // The provider sits inside the stage root, above the canvas, the world
    // layer and the chrome — one wrap, not one per card.
    expect(stage.indexOf('<ForcedThemeMode mode="dark">')).toBeLessThan(stage.indexOf("<StageCanvas"));
    expect(stage.indexOf("</ForcedThemeMode>")).toBeGreaterThan(stage.indexOf('testID="journey-world"'));
    expect(stage.match(/<ForcedThemeMode /g)).toHaveLength(1);

    const card = readExpo("components/becoming/WeekCard.tsx");
    expect(card).toContain("useThemeTokens()");
    expect(card).not.toMatch(/resolveToken\([^)]*"dark"\)/);
    expect(card).not.toContain("darkTokens");
  });

  it("nothing on the stage takes a colour from a class, which the override cannot reach", () => {
    // NativeWind resolves `bg-*` / `text-*` / `border-*` against its GLOBAL
    // scheme; only `useThemeTokens()` sees the provider. A colour class in
    // any of these files would follow the system again.
    const COLOUR_CLASS = /className=["'{][^"'}]*\b(?:bg|text|border|fill|stroke)-(?!\[)[a-z]/;
    for (const rel of [
      "components/becoming/journey/JourneyStage.tsx",
      "components/becoming/journey/WeekTile.tsx",
      "components/becoming/WeekCard.tsx",
    ]) {
      expect({ file: rel, hit: COLOUR_CLASS.exec(readExpo(rel))?.[0] ?? null }).toEqual({ file: rel, hit: null });
    }
  });
});
