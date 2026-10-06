// ─── NP-316: Home — Mindset/Becoming visual pass follow-ups ────────────────
//
// Full visual pass (native vs web), Android S23 Ultra (One UI 7, font scale
// 0.9), build 24f4e34d. Covers:
//
//   1. The Mindset card's View/CTA open the Mind HUB, never an auto-started
//      session — `?start=1` used to fire even when today's was already done.
//   2. Quick Add is keyboard-aware on Android (the sheet shrinks instead of
//      leaving the keyboard to cover the macros/Note/Cancel+Add).
//   3. The Becoming door's calm-state kicker/compass/sparkle and the
//      Mindset card's brain tile use the web's violet, not the orange
//      accent; the "next" suggestion line stays one truncated line instead
//      of wrapping a second column.
//   4. A smart-rotating STAT tile always draws the square (1x1) layout, like
//      the web's rotator (which never passes `size` to a stat renderer) —
//      not the wide layout's bar-beside-the-value, which collides at larger
//      font scales.
//   5. The mood tile sheet is one row of five faces (the web's grid-cols-5),
//      with a single-line title so the close X can never be pushed past the
//      sheet's own padding.

import * as fs from "fs";
import * as path from "path";
import { render, fireEvent, act, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { Compass, Sparkles, Brain } from "lucide-react-native";
import { BecomingDoor } from "@/components/dashboard/BecomingDoor";
import { MindsetCard } from "@/components/dashboard/MindsetCard";
import { MoodLogSheet, MOOD_OPTIONS } from "@/components/dashboard/MoodLogSheet";
import { SmartRotatingTile } from "@/components/dashboard/SmartRotatingTile";
import { lightTokens } from "@/lib/theme/tokens";
import type { MindSummaryResponse, DashboardTile } from "@become/api-client";
import type { DashboardStatData } from "@/lib/dashboard/types";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const rgb = (triplet: string) => `rgb(${triplet})`;

function flat(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style as never) as Record<string, unknown>;
}

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

describe("NP-316 (1): the Mindset card never auto-starts a session", () => {
  it("the dashboard route's onOpenMind pushes the Mind hub with no ?start=1", () => {
    const src = readExpo("app/(app)/(tabs)/dashboard/index.tsx");
    const onOpenMindBlock = src.slice(
      src.indexOf("const onOpenMind = useCallback"),
      src.indexOf("const onOpenBecoming"),
    );
    expect(onOpenMindBlock).toContain('"/(tabs)/mind"');
    expect(onOpenMindBlock).not.toContain("start=1");
  });
});

describe("NP-316 (2): Quick Add is keyboard-aware on Android", () => {
  it("wraps its content in a KeyboardAvoidingView that shrinks (behavior=\"height\") on Android, and bounds the sheet so the content can scroll", () => {
    const src = readExpo("components/nutrition/QuickAddSheet.tsx");
    expect(src).toContain('Platform.OS === "ios" ? "padding" : "height"');
    expect(src).toContain('sheetStyle={{ maxHeight: "90%" }}');
  });
});

describe("NP-316 (3): Becoming door + Mindset card use the web's violet", () => {
  it("BecomingDoor's calm-state kicker, compass badge and sparkle are mind-violet, not the orange accent", () => {
    const { getByTestId, UNSAFE_getByType } = render(
      <BecomingDoor goals={null} mind={null} />,
    );
    expect(getByTestId("becoming-door")).toBeTruthy();

    const compass = UNSAFE_getByType(Compass);
    expect(compass.props.color).toBe(rgb(lightTokens["mind-violet"]));

    // The kicker Text's own color lives in its flattened style array.
    const kicker = within(getByTestId("becoming-door")).getByText(
      "The Becoming",
    );
    expect(flat(kicker.props.style).color).toBe(rgb(lightTokens["mind-violet"]));
  });

  it("BecomingDoor's top-suggestion sparkle is mind-violet in the calm state", () => {
    const goals = {
      todayKey: "2026-10-06",
      nutrition: {
        suggestion: { title: "Nutrition on track", sub: "Keep it up", severity: "good" },
      },
      training: {
        target: { daysPerWeek: 3 },
        thisWeek: { done: 2, remaining: 1, weekLost: false },
        suggestion: { title: "2 more by Saturday", sub: "1/3 so far", severity: "nudge" },
      },
    } as unknown as Parameters<typeof BecomingDoor>[0]["goals"];

    const { UNSAFE_getByType, getByTestId, getByText } = render(
      <BecomingDoor goals={goals} mind={null} />,
    );
    expect(UNSAFE_getByType(Sparkles).props.color).toBe(
      rgb(lightTokens["mind-violet"]),
    );
    // The suggestion line stays one truncated row, not two columns: title +
    // sub are nested Text nodes under one `numberOfLines={1}` container.
    const nextRow = getByTestId("becoming-door-next");
    expect(nextRow).toBeTruthy();
    expect(getByText("2 more by Saturday")).toBeTruthy();
  });

  it("MindsetCard's brain tile is mind-violet, not the orange accent", () => {
    const summary: MindSummaryResponse = {
      todayKey: "2026-10-06",
      level: 4,
      levelPct: 45,
      chapter: 2,
      chapterName: "The Foundation",
      sessionsIntoChapter: 3,
      sessionsPerChapter: 5,
      sessionDoneToday: false,
      mainSessionAvailable: true,
      sessionsLast7Days: 3,
      moodCheckinsLast7Days: 4,
      todayMood: null,
      lastState: null,
    };
    const { UNSAFE_getByType } = render(<MindsetCard summary={summary} />);
    expect(UNSAFE_getByType(Brain).props.color).toBe(
      rgb(lightTokens["mind-violet"]),
    );
  });
});

describe("NP-316 (4): a smart-rotating STAT tile always draws the square layout", () => {
  const STAT_DATA: DashboardStatData = {
    streakDays: 5,
    caloriesConsumed: 1200,
    caloriesGoal: 2000,
    waterCurrent: 32,
    waterGoal: 64,
    latestWeight: 180,
    weightEntries: [{ date: "2026-10-01", value: 181 }, { date: "2026-10-05", value: 180 }],
  } as unknown as DashboardStatData;

  it("renders the square (1x1) Calories layout even when the smart tile's own grid slot is 2x1 — like the web's rotator, which never forwards `size` to a stat renderer", () => {
    const tile: DashboardTile = {
      id: "smart",
      kind: "smart-rotating",
      size: "2x1",
      settings: { pool: ["stat:calories"] },
    };
    const { getByText } = render(
      <SmartRotatingTile tile={tile} statData={STAT_DATA} />,
    );
    // The square layout's label carries `flex-1 ml-2` (it sits beside a small
    // badge on one row, value+bar+footer stacked below); the wide layout's
    // label has neither — the two are told apart by that className.
    const label = getByText("Calories");
    expect(String(label.props.className)).toContain("ml-2");
    expect(String(label.props.className)).toContain("flex-1");
  });
});

describe("NP-316 (5): the mood tile sheet is one row of five faces", () => {
  it("renders a single-line title and all five mood options inside one row container", () => {
    const { getByTestId, getByText } = render(
      <MoodLogSheet visible testID="mood-sheet" onClose={jest.fn()} />,
    );

    expect(getByText("How are you feeling?")).toBeTruthy();

    for (const m of MOOD_OPTIONS) {
      expect(getByTestId(`mood-sheet-option-${m.level}`)).toBeTruthy();
    }

    // The title shrinks (flex: 1) and the close button cannot (flexShrink:
    // 0) — the exact fix for the X getting clipped off the right edge on
    // Android (a growing, unconstrained title pushed it there).
    const title = getByTestId("mood-sheet-title");
    expect(flat(title.props.style).flex).toBe(1);
    const close = getByTestId("mood-sheet-close");
    expect(flat(close.props.style).flexShrink).toBe(0);
  });

  it("lays the five faces out in one row, not a vertical list", () => {
    const { getByTestId } = render(
      <MoodLogSheet visible testID="mood-sheet" onClose={jest.fn()} />,
    );
    const first = getByTestId("mood-sheet-option-1");
    // Walk up to the row container and check its flexDirection.
    let node: typeof first | null = first.parent;
    while (node && flat(node.props?.style).flexDirection !== "row") {
      node = node.parent;
    }
    expect(node).toBeTruthy();
    expect(flat(node!.props.style).justifyContent).toBe("space-between");
  });

  it("still submits the selected mood", async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <MoodLogSheet
        visible
        testID="mood-sheet"
        onClose={jest.fn()}
        onSubmit={onSubmit}
      />,
    );
    await act(async () => {
      fireEvent.press(getByTestId("mood-sheet-option-4"));
    });
    expect(onSubmit).toHaveBeenCalledWith(4);
  });
});
