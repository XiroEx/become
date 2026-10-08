import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { StatTile } from "@/components/dashboard/StatTile";
import { TileGrid } from "@/components/dashboard/TileGrid";
import { UpNextCard } from "@/components/dashboard/UpNextCard";
import { ProgressChart } from "@/components/dashboard/ProgressChart";
import { DashboardScreen } from "@/components/DashboardScreen";
import type { DashboardStatData, UpcomingWorkoutSummary } from "@/lib/dashboard/types";
import type {
  DashboardTile,
  DashboardTilesResponse,
  ProgressApiResponse,
} from "@become/api-client";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const baseStatData: DashboardStatData = {
  streakDays: 5,
  thisWeekWorkouts: 2,
};

describe("NP-211: Home Dashboard Parity", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  describe("1. Calories Tile Parity & Suggestions separation", () => {
    it("renders Calories tile with 0/2000, progress bar, and 2000 cal left", () => {
      const tile: DashboardTile = { id: "calories", kind: "stat", size: "1x1" };
      const statData: DashboardStatData = {
        ...baseStatData,
        caloriesConsumed: 0,
        caloriesGoal: 2000,
      };

      const { getByTestId, getByText } = render(
        <StatTile tile={tile} statData={statData} />,
      );

      expect(getByText("Calories")).toBeTruthy();
      expect(getByTestId("tile-calories-value").props.children).toBe("0/2000");
      expect(getByTestId("tile-calories-footer").props.children).toBe("2000 cal left");
    });

    it("renders Calories tile with consumed calories and remaining", () => {
      const tile: DashboardTile = { id: "calories", kind: "stat", size: "1x1" };
      const statData: DashboardStatData = {
        ...baseStatData,
        caloriesConsumed: 1850,
        caloriesGoal: 2000,
      };

      const { getByTestId } = render(
        <StatTile tile={tile} statData={statData} />,
      );

      expect(getByTestId("tile-calories-value").props.children).toBe("1850/2000");
      expect(getByTestId("tile-calories-footer").props.children).toBe("150 cal left");
    });

    it("renders every tile from layout in order without suggestions taking over stat slots", () => {
      const layout: DashboardTile[] = [
        { id: "streak", kind: "stat", size: "1x1" },
        { id: "mood", kind: "stat", size: "1x1" },
        { id: "calories", kind: "stat", size: "1x1" },
        { id: "smart", kind: "smart-rotating", size: "1x1" },
      ];

      const statData: DashboardStatData = {
        ...baseStatData,
        todaysMood: 4,
        caloriesConsumed: 1850,
        caloriesGoal: 2000,
      };

      const tilesData = {
        layout,
        suggestions: [
          {
            id: "water-reminder",
            severity: "nudge",
            title: "Hydrate",
            body: "Drink more water today",
            placement: "dashboard",
            dismissible: true,
            source: "nutrition",
          },
        ],
      } as unknown as DashboardTilesResponse;

      const { getByTestId, getByText } = render(
        <TileGrid layout={layout} statData={statData} tilesData={tilesData} />,
      );

      // Stat tiles remain in place
      expect(getByTestId("tile-streak-value").props.children).toBe("5 days");
      expect(getByTestId("tile-mood-value").props.children).toBe("Pretty Good");
      expect(getByTestId("tile-calories-value").props.children).toBe("1850/2000");

      // Suggestion is rendered below/outside the stat grid, not hijacking a stat tile
      expect(getByText("Hydrate")).toBeTruthy();
      expect(getByText("Drink more water today")).toBeTruthy();
    });
  });

  describe("2. Weight / BMI / Mood ProgressChart Card", () => {
    const mockProgressData = {
      weightData: [
        { date: "Sep 25", value: 178.0 },
        { date: "Sep 28", value: 176.5 },
        { date: "Oct 1", value: 175.2 },
      ],
      bmiData: [
        { date: "Sep 25", value: 25.1 },
        { date: "Sep 28", value: 24.9 },
        { date: "Oct 1", value: 24.7 },
      ],
      bodyFatData: [
        { date: "Sep 25", value: 18.5 },
        { date: "Oct 1", value: 18.0 },
      ],
      leanMassData: [
        { date: "Sep 25", value: 145.0 },
        { date: "Oct 1", value: 143.7 },
      ],
      moodData: [
        { date: "Sep 29", value: 3 },
        { date: "Sep 30", value: 4 },
        { date: "Oct 1", value: 5 },
      ],
      stats: {
        thisWeekWorkouts: 2,
        totalWorkouts: 42,
        streakDays: 5,
        goalProgress: 80,
      },
      weeklyAvailability: 4,
    } as unknown as ProgressApiResponse;

    it("renders segmented tabs for Weight, BMI, Body Fat, Lean Mass, and Mood", () => {
      const { getByTestId } = render(
        <ProgressChart
          testID="progress-chart-card"
          weightData={mockProgressData.weightData}
          bmiData={mockProgressData.bmiData}
          bodyFatData={mockProgressData.bodyFatData}
          leanMassData={mockProgressData.leanMassData}
          moodData={mockProgressData.moodData}
          fitnessGoal="lose_weight"
          targetWeight={176}
        />,
      );

      expect(getByTestId("progress-chart-card")).toBeTruthy();
      expect(getByTestId("progress-chart-tab-weight")).toBeTruthy();
      expect(getByTestId("progress-chart-tab-bmi")).toBeTruthy();
      expect(getByTestId("progress-chart-tab-body_fat")).toBeTruthy();
      expect(getByTestId("progress-chart-tab-lean_mass")).toBeTruthy();
      expect(getByTestId("progress-chart-tab-mood")).toBeTruthy();

      // Weight is selected by default
      expect(getByTestId("progress-chart-current").props.children).toBe("175.2");
      expect(getByTestId("progress-chart-target-line")).toBeTruthy();
    });

    it("switches to BMI tab and displays BMI value and SVG line chart", () => {
      const { getByTestId } = render(
        <ProgressChart
          weightData={mockProgressData.weightData}
          bmiData={mockProgressData.bmiData}
          bodyFatData={mockProgressData.bodyFatData}
          leanMassData={mockProgressData.leanMassData}
          moodData={mockProgressData.moodData}
          fitnessGoal="lose_weight"
        />,
      );

      fireEvent.press(getByTestId("progress-chart-tab-bmi"));

      expect(getByTestId("progress-chart-current").props.children).toBe("24.7");
      expect(getByTestId("progress-chart-canvas")).toBeTruthy();
    });

    it("switches to Mood tab and displays mood emoji and SVG chart", () => {
      const { getByTestId } = render(
        <ProgressChart
          weightData={mockProgressData.weightData}
          bmiData={mockProgressData.bmiData}
          bodyFatData={mockProgressData.bodyFatData}
          leanMassData={mockProgressData.leanMassData}
          moodData={mockProgressData.moodData}
        />,
      );

      fireEvent.press(getByTestId("progress-chart-tab-mood"));

      expect(getByTestId("progress-chart-current").props.children).toBe("😊");
      expect(getByTestId("progress-chart-canvas")).toBeTruthy();
    });

    it("shows empty state when no data exists for a metric", () => {
      const { getByTestId, getByText } = render(
        <ProgressChart
          weightData={[]}
          bmiData={[]}
          bodyFatData={[]}
          leanMassData={[]}
          moodData={[]}
        />,
      );

      expect(getByTestId("progress-chart-empty")).toBeTruthy();
      expect(getByText("No data yet")).toBeTruthy();
    });
  });

  describe("3. Customize Tiles Link", () => {
    it("renders Customize tiles link under the tiles with Sliders icon and fires onOpenCustomizeTiles", () => {
      const onOpenCustomizeTiles = jest.fn();

      const { getByTestId, getByText } = render(
        <DashboardScreen
          userName="Jon"
          streakDays={5}
          todayWorkout={null}
          onOpenCalendar={jest.fn()}
          onSubmitCheckIn={jest.fn()}
          statData={baseStatData}
          layout={[{ id: "streak", kind: "stat", size: "1x1" }]}
          tilesData={{ layout: [{ id: "streak", kind: "stat", size: "1x1" }] } as unknown as DashboardTilesResponse}
          onOpenCustomizeTiles={onOpenCustomizeTiles}
          onStartWorkout={jest.fn()}
        />,
      );

      const customizeBtn = getByTestId("dashboard-customize-tiles");
      expect(customizeBtn).toBeTruthy();
      expect(getByText("Customize tiles")).toBeTruthy();

      fireEvent.press(customizeBtn);
      expect(onOpenCustomizeTiles).toHaveBeenCalledTimes(1);
    });
  });

  describe("4. Up Next Card Styling & Navigation", () => {
    it("renders bordered card with dumbbell badge, single-line ellipsized meta, chevron, and start workout button", () => {
      const upcoming: UpcomingWorkoutSummary = {
        dateLabel: "Today",
        dayLabel: "Day 3",
        workoutTitle: "Upper Body Hypertrophy",
        programName: "Phase 2",
        phase: 2,
        workoutIndex: 2,
      };

      const onPressWorkout = jest.fn();
      const onOpenCalendar = jest.fn();

      const { getByTestId } = render(
        <UpNextCard
          workout={upcoming}
          onPressWorkout={onPressWorkout}
          onOpenCalendar={onOpenCalendar}
        />,
      );

      // Outer bordered card
      expect(getByTestId("up-next-card-container")).toBeTruthy();

      // Workout day & title
      const day = getByTestId("up-next-day");
      const title = getByTestId("up-next-title");
      expect(day.props.children).toBe("Today: Day 3");
      expect(day.props.numberOfLines).toBe(1);
      expect(day.props.ellipsizeMode).toBe("tail");
      expect(title.props.children).toEqual(["Upper Body Hypertrophy", " · Phase 2"]);
      expect(title.props.numberOfLines).toBe(1);
      expect(title.props.ellipsizeMode).toBe("tail");

      // Pressing workout card
      const card = getByTestId("up-next-card");
      expect(card).toBeTruthy();
      fireEvent.press(card);
      expect(onPressWorkout).toHaveBeenCalledTimes(1);

      // Calendar button
      const calBtn = getByTestId("up-next-calendar");
      expect(calBtn).toBeTruthy();
      fireEvent.press(calBtn);
      expect(onOpenCalendar).toHaveBeenCalledTimes(1);
    });
  });

  describe("5. Remove Stray Buttons", () => {
    it("ensures native-only stray Calendar and Check in buttons do not exist", () => {
      const { queryByTestId } = render(
        <DashboardScreen
          userName="Jon"
          streakDays={5}
          todayWorkout={null}
          onOpenCalendar={jest.fn()}
          onSubmitCheckIn={jest.fn()}
          statData={baseStatData}
          layout={[{ id: "streak", kind: "stat", size: "1x1" }]}
          tilesData={{ layout: [{ id: "streak", kind: "stat", size: "1x1" }] } as unknown as DashboardTilesResponse}
          onStartWorkout={jest.fn()}
        />,
      );

      // Full-width stray buttons under Up Next are removed
      expect(queryByTestId("dashboard-open-calendar")).toBeNull();
      expect(queryByTestId("dashboard-open-checkin")).toBeNull();
    });
  });

  describe("6. Today's Mood Rule", () => {
    it("renders 'Set' when today's mood is unset, even if historical mood data exists", () => {
      const tile: DashboardTile = { id: "mood", kind: "stat", size: "1x1" };
      // Today is unset (null), but there are past entries
      const statData: DashboardStatData = {
        ...baseStatData,
        todaysMood: null,
        recentMoods: [3, 4, 5],
      };

      const { getByTestId } = render(
        <StatTile tile={tile} statData={statData} />,
      );

      // Must show "Set", NOT previous entries
      expect(getByTestId("tile-mood-value").props.children).toBe("Set");
      expect(getByTestId("tile-mood-footer").props.children).toBe("Last 3 days");
    });

    it("renders mood label when today's mood is set", () => {
      const tile: DashboardTile = { id: "mood", kind: "stat", size: "1x1" };
      const statData: DashboardStatData = {
        ...baseStatData,
        todaysMood: 4,
        recentMoods: [3, 4, 4],
      };

      const { getByTestId } = render(
        <StatTile tile={tile} statData={statData} />,
      );

      expect(getByTestId("tile-mood-value").props.children).toBe("Pretty Good");
    });
  });
});
