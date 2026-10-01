import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { StatTile } from "@/components/dashboard/StatTile";
import { TileGrid } from "@/components/dashboard/TileGrid";
import { DashboardScreen } from "@/components/DashboardScreen";
import { MOOD_OPTIONS } from "@/components/dashboard/MoodLogSheet";
import type { DashboardTile } from "@become/api-client";
import type { DashboardStatData } from "@/lib/dashboard/types";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

describe("Dashboard stat tiles: mood, this week, goal, calories, water, weight, total workouts (NP-107)", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  // ─── Acceptance Criterion 1: e015c916 ──────────────────────────────────────
  describe("e015c916: Each tile shows the same number as the web for the same member at the same moment", () => {
    it("renders all seven stat tiles with numbers exactly matching the web renderers", () => {
      const layout: DashboardTile[] = [
        { id: "mood", kind: "stat", size: "1x1" },
        { id: "weekly", kind: "stat", size: "1x1" },
        { id: "goal", kind: "stat", size: "1x1" },
        { id: "calories", kind: "stat", size: "1x1" },
        { id: "water", kind: "stat", size: "1x1" },
        { id: "weight", kind: "stat", size: "1x1" },
        { id: "workouts", kind: "stat", size: "1x1" },
      ];

      const statData: DashboardStatData = {
        streakDays: 7,
        todaysMood: 4,
        recentMoods: [3, 4, 4, 5, 4],
        thisWeekWorkouts: 2,
        weeklyTarget: 4,
        fitnessGoal: "gain_muscle",
        nutritionDirection: "gain",
        targetWeightKg: 82.1,
        startWeightKg: 79.5,
        latestWeight: 175.2,
        earliestWeight: 175.2,
        weightUnit: "lbs",
        pace: { status: "on", eta: "~12 wks", behindByKg: 0 },
        caloriesConsumed: 1850,
        caloriesGoal: 2000,
        waterCurrent: 48,
        waterGoal: 64,
        totalWorkouts: 42,
        weightEntries: [
          { date: "2026-09-29", value: 174.0 },
          { date: "2026-10-01", value: 175.2 },
        ],
      };

      const { getByTestId, getByText } = render(
        <TileGrid layout={layout} statData={statData} />,
      );

      // 1. Mood tile: "Pretty Good" value, "Last 5 days" footer
      expect(getByText("Today's Mood")).toBeTruthy();
      expect(getByTestId("tile-mood-value").props.children).toBe("Pretty Good");
      expect(getByTestId("tile-mood-footer").props.children).toBe("Last 5 days");

      // 2. Weekly tile: "2/4" value, "2 to weekly target" footer
      expect(getByText("This Week")).toBeTruthy();
      expect(getByTestId("tile-weekly-value").props.children).toBe("2/4");
      expect(getByTestId("tile-weekly-footer").props.children).toBe("2 to weekly target");

      // 3. Goal tile: "5.8 lbs to go" value, arrow + "181 lbs · ~12 wks" footer
      expect(getByText("Goal · Build muscle")).toBeTruthy();
      expect(getByTestId("tile-goal-value").props.children).toContain("5.8 lbs to go");
      expect(getByTestId("tile-goal-footer").props.children).toContain("181 lbs");

      // 4. Calories tile: "1850/2000" value, "150 cal left" footer
      expect(getByText("Calories")).toBeTruthy();
      expect(getByTestId("tile-calories-value").props.children).toBe("1850/2000");
      expect(getByTestId("tile-calories-footer").props.children).toBe("150 cal left");

      // 5. Water tile: "48/64 oz" value, "16 oz to goal" footer
      expect(getByText("Water")).toBeTruthy();
      expect(getByTestId("tile-water-value").props.children).toBe("48/64 oz");
      expect(getByTestId("tile-water-footer").props.children).toBe("16 oz to goal");

      // 6. Weight tile: "175.2 lbs" value, "↑ +1.2" footer
      expect(getByText("Weight")).toBeTruthy();
      expect(getByTestId("tile-weight-value").props.children).toBe("175.2 lbs");
      expect(getByTestId("tile-weight-footer").props.children).toBe("↑ +1.2");

      // 7. Workouts tile: "42" value, "Lifetime" footer
      expect(getByText("Total Workouts")).toBeTruthy();
      expect(getByTestId("tile-workouts-value").props.children).toBe("42");
      expect(getByTestId("tile-workouts-footer").props.children).toBe("Lifetime");
    });

    it("renders placeholders when calorie or water goals are unset", () => {
      const layout: DashboardTile[] = [
        { id: "calories", kind: "stat", size: "1x1" },
        { id: "water", kind: "stat", size: "1x1" },
        { id: "weight", kind: "stat", size: "1x1" },
      ];

      const statData: DashboardStatData = {
        streakDays: 0,
        thisWeekWorkouts: 0,
        caloriesConsumed: 0,
        caloriesGoal: 0,
        waterCurrent: 0,
        waterGoal: 0,
        latestWeight: null,
        weightEntries: [],
      };

      const { getByTestId } = render(<TileGrid layout={layout} statData={statData} />);

      expect(getByTestId("tile-calories-value").props.children).toBe("0/--");
      expect(getByTestId("tile-calories-footer").props.children).toBe("Set a calorie goal");

      expect(getByTestId("tile-water-value").props.children).toBe("0/-- oz");
      expect(getByTestId("tile-water-footer").props.children).toBe("Set a water goal");

      expect(getByTestId("tile-weight-value").props.children).toBe("—");
      expect(getByTestId("tile-weight-footer").props.children).toBe("Log your first weigh-in");
    });

    it("renders First weigh-in when only one weight entry exists", () => {
      const tile: DashboardTile = { id: "weight", kind: "stat", size: "1x1" };
      const statData: DashboardStatData = {
        streakDays: 1,
        thisWeekWorkouts: 0,
        latestWeight: 180.5,
        weightEntries: [{ date: "2026-10-01", value: 180.5 }],
        weightUnit: "lbs",
      };

      const { getByTestId } = render(<StatTile tile={tile} statData={statData} />);
      expect(getByTestId("tile-weight-value").props.children).toBe("180.5 lbs");
      expect(getByTestId("tile-weight-footer").props.children).toBe("First weigh-in");
    });
  });

  // ─── Acceptance Criterion 2: e015c917 ──────────────────────────────────────
  describe("e015c917: Changing mood on the mood tile updates the web's check-in state for today", () => {
    it("opens MoodLogSheet on tapping the mood tile and invokes onSubmitMood when selecting a mood", () => {
      const mockSubmitMood = jest.fn();
      const statData: DashboardStatData = {
        streakDays: 3,
        thisWeekWorkouts: 1,
        todaysMood: 3,
        recentMoods: [3],
      };

      const { getByTestId, queryByTestId } = render(
        <DashboardScreen
          streakDays={3}
          todayWorkout={null}
          onStartWorkout={jest.fn()}
          onOpenCalendar={jest.fn()}
          onSubmitCheckIn={jest.fn()}
          statData={statData}
          layout={[{ id: "mood", kind: "stat", size: "1x1" }]}
          onSubmitMood={mockSubmitMood}
        />,
      );

      // Mood sheet initially closed
      expect(queryByTestId("dashboard-mood-sheet-option-4")).toBeNull();

      // Tap mood tile
      fireEvent.press(getByTestId("tile-mood"));

      // Mood sheet opens with the 5 mood options
      for (const m of MOOD_OPTIONS) {
        expect(getByTestId(`dashboard-mood-sheet-option-${m.level}`)).toBeTruthy();
      }

      // Select Pretty Good (4)
      fireEvent.press(getByTestId("dashboard-mood-sheet-option-4"));

      expect(mockSubmitMood).toHaveBeenCalledTimes(1);
      expect(mockSubmitMood).toHaveBeenCalledWith(4);
    });

    it("StatTile opens internal MoodLogSheet when onMoodChange is passed and onOpenMood is not", () => {
      const mockMoodChange = jest.fn();
      const tile: DashboardTile = { id: "mood", kind: "stat", size: "1x1" };

      const { getByTestId } = render(
        <StatTile tile={tile} onMoodChange={mockMoodChange} />,
      );

      // Press mood tile
      fireEvent.press(getByTestId("tile-mood"));

      // Tap mood option 5 (Great)
      fireEvent.press(getByTestId("tile-mood-sheet-option-5"));

      expect(mockMoodChange).toHaveBeenCalledWith(5);
    });
  });

  // ─── Acceptance Criterion 3: e015c918 ──────────────────────────────────────
  describe("e015c918: A member with no weekly target sees 'Set a weekly target', never a fraction against an invented number", () => {
    it("renders 'Set a weekly target' and done count with no fraction when weeklyTarget is null", () => {
      const tile: DashboardTile = { id: "weekly", kind: "stat", size: "1x1" };
      const statData: DashboardStatData = {
        streakDays: 4,
        thisWeekWorkouts: 2,
        weeklyTarget: null,
      };

      const { getByTestId } = render(<StatTile tile={tile} statData={statData} />);

      expect(getByTestId("tile-weekly-value").props.children).toBe("2");
      expect(getByTestId("tile-weekly-footer").props.children).toBe("Set a weekly target");
      expect(getByTestId("tile-weekly-value").props.children).not.toContain("/");
    });

    it("renders 'Set a weekly target' when weeklyTarget is undefined", () => {
      const tile: DashboardTile = { id: "weekly", kind: "stat", size: "1x1" };
      const statData: DashboardStatData = {
        streakDays: 0,
        thisWeekWorkouts: 0,
      };

      const { getByTestId } = render(<StatTile tile={tile} statData={statData} />);

      expect(getByTestId("tile-weekly-value").props.children).toBe("0");
      expect(getByTestId("tile-weekly-footer").props.children).toBe("Set a weekly target");
      expect(getByTestId("tile-weekly-value").props.children).not.toContain("/3");
    });

    it("renders weekly target fraction only when target is actually set", () => {
      const tile: DashboardTile = { id: "weekly", kind: "stat", size: "1x1" };
      const statData: DashboardStatData = {
        streakDays: 4,
        thisWeekWorkouts: 3,
        weeklyTarget: 5,
      };

      const { getByTestId } = render(<StatTile tile={tile} statData={statData} />);

      expect(getByTestId("tile-weekly-value").props.children).toBe("3/5");
      expect(getByTestId("tile-weekly-footer").props.children).toBe("2 to weekly target");
    });
  });

  // ─── Acceptance Criterion 4: e015c919 ──────────────────────────────────────
  describe("e015c919: A kg member sees kg on the weight and goal tiles", () => {
    it("displays kg units on both weight and goal tiles for a kg member", () => {
      const layout: DashboardTile[] = [
        { id: "weight", kind: "stat", size: "1x1" },
        { id: "goal", kind: "stat", size: "1x1" },
      ];

      const statData: DashboardStatData = {
        streakDays: 5,
        thisWeekWorkouts: 2,
        weightUnit: "kg",
        latestWeight: 75.4,
        earliestWeight: 78.0,
        targetWeightKg: 70.0,
        startWeightKg: 78.0,
        fitnessGoal: "lose_weight",
        nutritionDirection: "lose",
        weightEntries: [
          { date: "2026-09-28", value: 76.0 },
          { date: "2026-10-01", value: 75.4 },
        ],
      };

      const { getByTestId } = render(<TileGrid layout={layout} statData={statData} />);

      const weightValue = getByTestId("tile-weight-value").props.children;
      expect(weightValue).toBe("75.4 kg");
      expect(weightValue).not.toContain("lbs");

      const goalValue = getByTestId("tile-goal-value").props.children;
      expect(goalValue).toContain("5.4 kg to go");
      expect(goalValue).not.toContain("lbs");

      const goalFooter = getByTestId("tile-goal-footer").props.children;
      expect(goalFooter).toContain("70 kg");
      expect(goalFooter).not.toContain("lbs");
    });
  });
});
