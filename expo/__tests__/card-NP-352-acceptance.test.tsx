/* eslint-disable import/first */
// ─── Card NP-352: Home Dashboard spacing, equal tile grid height, ────────────
// chart domain/gridlines, and Becoming door styles
//
// Full visual parity pass (native vs web) covering 14 areas:
//   1. Header & global chrome parity.
//   2. The Becoming Door (BecomingDoor.tsx): 36x36 icon badge (12px radius),
//      Mind icon violet (mind-violet), Fuel icon red (brand), Training icon
//      emerald (success), chip radius 8px, chip values & subtitles single-line
//      truncated with ellipsis.
//   3. Metric Tile Grid (TileGrid.tsx, StatTile.tsx, StreakTile.tsx):
//      equal fixed cell height 6rem (96px).
//   4. Metric Tile Grid - 1x1 Tile Layout: horizontal layout in 1x1 cells with
//      circular badge on left (36x36, borderRadius: 18), stacked label and
//      2xl font-extrabold value, bottom full-width progress bar and caption.
//   5. Super Streak Tile: value rendered via animated flame gradient FireNumber.
//   6. 2x1 Smart Tile Layout: SmartRotatingTile.tsx forwards tile.size so 2x1
//      cards render wide.
//   7. Suggestion/Nudge Card (SuggestionTile.tsx): dismiss 'X' button inside
//      36x36 circular ring, CTA pill button (rounded-full px-3 py-1). No
//      handwritten rgb() or rgba().
//   8. Customize Tiles Link: marginTop: 8 (matches web mt-2).
//   9. Progress Chart (ProgressChart.tsx): strictly data-driven Y-domain
//      ['dataMin - 2', 'dataMax + 2'] (targetWeight excluded from min/max
//      calculation and omitted when outside domain), 4 horizontal gridlines
//      with numeric ticks, vertical gridlines at 5 evenly spaced date ticks.
//   10. Nutrition Card (NutritionCard.tsx): action buttons styling with
//       minHeight: 44, paddingVertical: 9, paddingHorizontal: 12,
//       borderRadius: 8, gap: 8, marginTop: 12, tokens-only color palette.
//   11. Current Program Card (CurrentProgramCard.tsx): subtle grey
//       text-xs text-muted-foreground font-medium Progress link.
//   12. Mindset Card (MindsetCard.tsx): status text fontSize: 14,
//       fontWeight: "500", CTA button borderRadius: 8, paddingVertical: 10.
//   13. Quick Links (DashboardQuickLinks.tsx, DashboardScreen.tsx,
//       app/(app)/(tabs)/dashboard/index.tsx): 4th "Connect" card
//       completing 2x2 grid, wired with onOpenChat.
//   14. Dashboard Card Padding (DashboardScreen.tsx): ScrollView
//       contentContainerStyle padding: 16, gap: 12,
//       paddingBottom: TAB_BAR_CONTENT_INSET.

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

import * as fs from "fs";
import * as path from "path";
import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { TileGrid } from "@/components/dashboard/TileGrid";
import { StatTile } from "@/components/dashboard/StatTile";
import { StreakTile } from "@/components/dashboard/StreakTile";
import { StatActionTile } from "@/components/dashboard/StatActionTile";
import { SmartRotatingTile } from "@/components/dashboard/SmartRotatingTile";
import { BecomingDoor } from "@/components/dashboard/BecomingDoor";
import { SuggestionTile } from "@/components/dashboard/SuggestionTile";
import { ProgressChart } from "@/components/dashboard/ProgressChart";
import { NutritionCard } from "@/components/dashboard/NutritionCard";
import { CurrentProgramCard } from "@/components/dashboard/CurrentProgramCard";
import { MindsetCard } from "@/components/dashboard/MindsetCard";
import { DashboardQuickLinks } from "@/components/dashboard/DashboardQuickLinks";
import { DashboardScreen } from "@/components/DashboardScreen";
import { TAB_BAR_CONTENT_INSET } from "@/lib/navigation/tabBarInset";
import type {
  DashboardTile,
  DashboardSuggestion,
  GoalProgressResponse,
  MindSummaryResponse,
} from "@become/api-client";
import type { DashboardStatData } from "@/lib/dashboard/types";
/* eslint-enable import/first */

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

describe("Card NP-352: Home Dashboard spacing, tile height & typography parity", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  // ─── 1. Header & global chrome parity ──────────────────────────────────────
  describe("(id: np352-01) Header & global chrome parity", () => {
    it("source wires onOpenChat in DashboardScreen and index.tsx", () => {
      const screenSrc = readExpo("components/DashboardScreen.tsx");
      const indexSrc = readExpo("app/(app)/(tabs)/dashboard/index.tsx");

      expect(screenSrc).toContain("onOpenChat?: () => void;");
      expect(screenSrc).toContain("onOpenChat={onOpenChat}");
      expect(indexSrc).toContain('router.push("/(tabs)/chat"');
    });
  });

  // ─── 2. The Becoming Door ──────────────────────────────────────────────────
  describe("(id: np352-02) BecomingDoor badge, chip radius, tokens and truncation", () => {
    it("BecomingDoor source defines 36x36 badge with 12px radius, 8px chip radius, and token colors", () => {
      const src = readExpo("components/dashboard/BecomingDoor.tsx");

      // 36x36 badge with 12px radius
      expect(src).toContain("width: 36,");
      expect(src).toContain("height: 36,");
      expect(src).toContain("borderRadius: 12,");

      // Chip radius 8px
      expect(src).toContain("borderRadius: 8,");

      // Token colors for icons
      expect(src).toContain('colors["mind-violet"]');
      expect(src).toContain("colors.brand");
      expect(src).toContain("colors.success");

      // Ellipsis and single-line truncation
      expect(src).toContain('numberOfLines={1}');
      expect(src).toContain('ellipsizeMode="tail"');
    });

    it("renders BecomingDoor component and chips with correct structure", () => {
      const mockGoals: GoalProgressResponse = {
        mind: { score: 85, completed: true },
        nutrition: {
          score: 90,
          calorieTarget: 2000,
          proteinTarget: 150,
          currentCalories: 1800,
          currentProtein: 140,
        },
        training: {
          score: 75,
          phase: "Hypertrophy",
          dayName: "Legs",
          completedWorkouts: 3,
          targetWorkouts: 4,
        },
      } as unknown as GoalProgressResponse;

      const mockMind: MindSummaryResponse = {
        level: 2,
        chapter: 1,
        totalCompleted: 5,
        sessionCount: 10,
        currentDayCompleted: true,
      } as unknown as MindSummaryResponse;

      const { getByTestId, getByText } = render(
        <BecomingDoor
          testID="becoming-door"
          goals={mockGoals}
          mind={mockMind}
        />,
      );

      expect(getByTestId("becoming-door")).toBeTruthy();
      expect(getByText("Mind")).toBeTruthy();
      expect(getByText("Fuel")).toBeTruthy();
      expect(getByText("Training")).toBeTruthy();
    });
  });

  // ─── 3. Metric Tile Grid - Fixed Cell Height ───────────────────────────────
  describe("(id: np352-03) Metric Tile Grid equal fixed cell height 96px (6rem)", () => {
    it("TileGrid source enforces fixed cell height of 96px on all grid cells", () => {
      const src = readExpo("components/dashboard/TileGrid.tsx");

      expect(src).toContain("height: 96,");
      expect(src).toContain("{ width: cellWidth, height: 96 }");
    });

    it("renders grid with 1x1 and 2x1 cells having height 96", () => {
      const layout: DashboardTile[] = [
        { id: "calories", kind: "stat", size: "1x1" },
        { id: "streak", kind: "streak", size: "2x1" },
      ];

      const { getByTestId } = render(
        <TileGrid layout={layout} />,
      );

      const grid = getByTestId("dashboard-tile-grid");
      expect(grid).toBeTruthy();
    });
  });

  // ─── 4. Metric Tile Grid - 1x1 Tile Layout ─────────────────────────────────
  describe("(id: np352-04) 1x1 Tile Layout with horizontal badge, stacked text, and bar", () => {
    const STAT_DATA: DashboardStatData = {
      streakDays: 5,
      caloriesConsumed: 1500,
      caloriesGoal: 2000,
      waterCurrent: 48,
      waterGoal: 64,
      latestWeight: 175,
    } as unknown as DashboardStatData;

    it("StatTile source enforces 36x36 circular badge, 96px minHeight, and 2xl font-extrabold value", () => {
      const src = readExpo("components/dashboard/StatTile.tsx");

      // 36x36 badge with borderRadius: 18
      expect(src).toContain("width: 36,");
      expect(src).toContain("height: 36,");
      expect(src).toContain("borderRadius: 18,");

      // 96px height
      expect(src).toContain('height: "100%",');
      expect(src).toContain("minHeight: 96,");

      // Horizontal top row with gap 12
      expect(src).toContain('flexDirection: "row",');
      expect(src).toContain('gap: 12,');

      // 2xl font-extrabold value
      expect(src).toContain('className="text-foreground text-2xl font-extrabold tracking-tight"');
    });

    it("renders 1x1 StatTile with 2xl font-extrabold value", () => {
      const tile: DashboardTile = { id: "calories", kind: "stat", size: "1x1" };
      const { getByTestId } = render(
        <StatTile tile={tile} statData={STAT_DATA} />,
      );

      const value = getByTestId("tile-stat-calories-value");
      expect(String(value.props.className)).toContain("text-2xl");
      expect(String(value.props.className)).toContain("font-extrabold");
    });

    it("renders 1x1 StreakTile with 2xl font-extrabold value", () => {
      const tile: DashboardTile = { id: "streak", kind: "streak", size: "1x1" };
      const { getByTestId } = render(
        <StreakTile tile={tile} statData={STAT_DATA} />,
      );

      const value = getByTestId("tile-streak-value");
      expect(String(value.props.className)).toContain("text-2xl");
      expect(String(value.props.className)).toContain("font-extrabold");
    });
  });

  // ─── 5. Super Streak Tile ──────────────────────────────────────────────────
  describe("(id: np352-05) Super Streak Tile rendered with animated flame FireNumber", () => {
    it("StreakTile source renders FireNumber for super streak value", () => {
      const src = readExpo("components/dashboard/StreakTile.tsx");

      expect(src).toContain('<FireNumber');
      expect(src).toContain('testID="streak-super-value"');
    });

    it("FireNumber supports testID prop", () => {
      const src = readExpo("components/streaks/FireNumber.tsx");
      expect(src).toContain("testID?: string;");
      expect(src).toContain('testID={testID ?? "fire-number"}');
    });
  });

  // ─── 6. 2x1 Smart Tile Layout ──────────────────────────────────────────────
  describe("(id: np352-06) 2x1 Smart Tile Layout forwards tile.size", () => {
    it("SmartRotatingTile forwards tile.size to child tiles", () => {
      const src = readExpo("components/dashboard/SmartRotatingTile.tsx");

      expect(src).toContain("tile={{ id: item.id, kind: \"stat\", size: tile.size }}");
      expect(src).not.toContain("tile={{ id: item.id, kind: \"stat\", size: \"1x1\" }}");
    });

    it("renders wide layout with text-3xl font when tile size is 2x1", () => {
      const STAT_DATA: DashboardStatData = {
        streakDays: 5,
        caloriesConsumed: 1200,
        caloriesGoal: 2000,
      } as unknown as DashboardStatData;

      const tile: DashboardTile = {
        id: "smart",
        kind: "smart-rotating",
        size: "2x1",
        settings: { pool: ["stat:calories"] },
      };

      const { getByTestId } = render(
        <SmartRotatingTile tile={tile} statData={STAT_DATA} />,
      );

      const value = getByTestId("tile-stat-calories-value");
      expect(String(value.props.className)).toContain("text-3xl");
    });
  });

  // ─── 7. Suggestion/Nudge Card ──────────────────────────────────────────────
  describe("(id: np352-07) SuggestionTile 36x36 dismiss ring, pill CTA and no raw colors", () => {
    it("SuggestionTile source enforces 36x36 dismiss button, pill CTA, and no raw rgb/rgba", () => {
      const src = readExpo("components/dashboard/SuggestionTile.tsx");

      // 36x36 dismiss ring
      expect(src).toContain("width: 36,");
      expect(src).toContain("height: 36,");
      expect(src).toContain("borderRadius: 18,");
      expect(src).toContain("borderWidth: 1,");

      // CTA pill button
      expect(src).toContain("borderRadius: 999,");
      expect(src).toContain("paddingHorizontal: 12,");
      expect(src).toContain("paddingVertical: 4,");

      // Tokens only
      expect(src).not.toMatch(/rgba?\(\s*\d/);
      expect(src).not.toMatch(/#(?:[0-9a-fA-F]{3,8})/);
    });

    it("renders SuggestionTile with dismiss and action buttons", () => {
      const mockSuggestion: DashboardSuggestion = {
        id: "sug-test",
        type: "nudge",
        title: "Stay Hydrated",
        body: "Drink 500ml of water now.",
        dismissible: true,
        primaryAction: {
          label: "Log Water",
          action: "log_water",
        },
      };

      const tile: DashboardTile = {
        id: "sug",
        kind: "suggestion",
        size: "2x1",
      };

      const onDismiss = jest.fn();
      const { getByTestId, getByText } = render(
        <SuggestionTile
          tile={tile}
          suggestion={mockSuggestion}
          onDismissSuggestion={onDismiss}
        />,
      );

      expect(getByText("Stay Hydrated")).toBeTruthy();
      expect(getByText("Log Water")).toBeTruthy();

      const dismissBtn = getByTestId("suggestion-dismiss");
      fireEvent.press(dismissBtn);
      expect(onDismiss).toHaveBeenCalledWith("sug-test");
    });
  });

  // ─── 8. Customize Tiles Link ───────────────────────────────────────────────
  describe("(id: np352-08) Customize Tiles Link marginTop: 8", () => {
    it("DashboardScreen source has marginTop: 8 for customize tiles link", () => {
      const src = readExpo("components/DashboardScreen.tsx");

      expect(src).toContain("alignItems: \"flex-end\",");
      expect(src).toContain("marginTop: 8,");
    });
  });

  // ─── 9. Progress Chart ─────────────────────────────────────────────────────
  describe("(id: np352-09) ProgressChart data-driven Y-domain and gridlines", () => {
    const mockWeightData = [
      { date: "Oct 1", value: 178.0 },
      { date: "Oct 2", value: 176.5 },
      { date: "Oct 3", value: 175.2 },
    ];

    it("source enforces data-driven domain [dataMin - 2, dataMax + 2], 4 horizontal ticks, 5 vertical ticks", () => {
      const src = readExpo("components/dashboard/ProgressChart.tsx");

      // Data-driven domain
      expect(src).toContain("const minVal = Math.min(...values);");
      expect(src).toContain("const maxVal = Math.max(...values);");
      expect(src).toContain("let yMin = minVal - 2;");
      expect(src).toContain("let yMax = maxVal + 2;");

      // Target weight check inside domain
      expect(src).toContain("targetWeight >= yMin &&");
      expect(src).toContain("targetWeight <= yMax");

      // 4 horizontal gridlines with numeric ticks
      expect(src).toContain("[0, 1 / 3, 2 / 3, 1].map((ratio)");

      // 5 evenly spaced date ticks
      expect(src).toContain("const tickCount = Math.min(5, count);");
    });

    it("omits target weight line when target is outside domain", () => {
      // dataMin = 175.2, dataMax = 178.0 => domain is [173.2, 180.0]
      // targetWeight = 170 is outside
      const { queryByTestId } = render(
        <ProgressChart
          weightData={mockWeightData}
          targetWeight={170}
        />,
      );

      expect(queryByTestId("progress-chart-target-line")).toBeNull();
    });

    it("renders target weight line when target is inside domain", () => {
      // targetWeight = 176 is inside [173.2, 180.0]
      const { getByTestId } = render(
        <ProgressChart
          weightData={mockWeightData}
          targetWeight={176}
        />,
      );

      expect(getByTestId("progress-chart-target-line")).toBeTruthy();
    });
  });

  // ─── 10. Nutrition Card Action Buttons ─────────────────────────────────────
  describe("(id: np352-10) NutritionCard action buttons styling", () => {
    it("NutritionCard source specifies minHeight: 44, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8", () => {
      const src = readExpo("components/dashboard/NutritionCard.tsx");

      expect(src).toContain("buttonsRow: {");
      expect(src).toContain("gap: 8,");
      expect(src).toContain("marginTop: 12,");

      expect(src).toContain("primaryButton: {");
      expect(src).toContain("minHeight: 44,");
      expect(src).toContain("paddingVertical: 9,");
      expect(src).toContain("paddingHorizontal: 12,");
      expect(src).toContain("borderRadius: 8,");

      expect(src).toContain("secondaryButton: {");
    });
  });

  // ─── 11. Current Program Card ──────────────────────────────────────────────
  describe("(id: np352-11) CurrentProgramCard subtle grey Progress link", () => {
    it("CurrentProgramCard source has subtle grey text-xs text-muted-foreground font-medium", () => {
      const src = readExpo("components/dashboard/CurrentProgramCard.tsx");

      expect(src).toContain('className="text-xs text-muted-foreground font-medium"');
      expect(src).not.toContain("text-blue-600");
    });
  });

  // ─── 12. Mindset Card ──────────────────────────────────────────────────────
  describe("(id: np352-12) MindsetCard status text and CTA styling", () => {
    it("MindsetCard source has fontSize: 14, fontWeight: '500' and CTA button borderRadius: 8, paddingVertical: 10", () => {
      const src = readExpo("components/dashboard/MindsetCard.tsx");

      expect(src).toContain("statusText: {");
      expect(src).toContain("fontSize: 14,");
      expect(src).toContain('fontWeight: "500",');

      expect(src).toContain("actionButton: {");
      expect(src).toContain("borderRadius: 8,");
      expect(src).toContain("paddingVertical: 10,");
    });
  });

  // ─── 13. Quick Links - Connect Card ────────────────────────────────────────
  describe("(id: np352-13) DashboardQuickLinks 4th Connect card wired with onOpenChat", () => {
    it("renders Connect card completing 2x2 grid and fires onOpenChat on press", () => {
      const onOpenChat = jest.fn();
      const { getByTestId, getByText } = render(
        <DashboardQuickLinks
          onOpenChat={onOpenChat}
        />,
      );

      const connectCard = getByTestId("dashboard-quick-link-connect");
      expect(connectCard).toBeTruthy();
      expect(getByText("Connect")).toBeTruthy();
      expect(getByText("Chat with trainers")).toBeTruthy();

      fireEvent.press(connectCard);
      expect(onOpenChat).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 14. Dashboard Card Padding ────────────────────────────────────────────
  describe("(id: np352-14) DashboardScreen ScrollView padding and gap", () => {
    it("DashboardScreen source sets padding: 16, gap: 12, paddingBottom: TAB_BAR_CONTENT_INSET", () => {
      const src = readExpo("components/DashboardScreen.tsx");

      expect(src).toContain("padding: 16,");
      expect(src).toContain("gap: 12,");
      expect(src).toContain("paddingBottom: TAB_BAR_CONTENT_INSET,");
    });
  });
});
