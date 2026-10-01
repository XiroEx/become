import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { StatTile } from "@/components/dashboard/StatTile";
import { SuggestionTile } from "@/components/dashboard/SuggestionTile";
import { BecomingDoor } from "@/components/dashboard/BecomingDoor";
import { UpNextCard } from "@/components/dashboard/UpNextCard";
import { TileGrid } from "@/components/dashboard/TileGrid";
import type { DashboardStatData, UpcomingWorkoutSummary } from "@/lib/dashboard/types";
import type {
  DashboardTile,
  DashboardTilesResponse,
  DashboardSuggestion,
  GoalProgressResponse,
  MindSummaryResponse,
} from "@become/api-client";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

describe("NP-210: Home Dashboard Parity & Stat Tiles", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  describe("StatTile - Day Streak", () => {
    it("renders Day Streak with 12 days and milestone footer", () => {
      const tile: DashboardTile = { id: "streak", kind: "stat", size: "1x1" };
      const statData: DashboardStatData = {
        streakDays: 12,
        nextMilestone: 14,
        thisWeekWorkouts: 2,
      };

      const { getByTestId, getByText } = render(
        <StatTile tile={tile} statData={statData} />,
      );

      expect(getByTestId("tile-streak")).toBeTruthy();
      expect(getByTestId("tile-streak-value").props.children).toBe("12 days");
      expect(getByTestId("tile-streak-footer").props.children).toBe(
        "2d to 14-day 🏆",
      );
      expect(getByText("Day Streak")).toBeTruthy();
    });

    it("renders building streak when days < 3", () => {
      const tile: DashboardTile = { id: "streak", kind: "stat", size: "1x1" };
      const statData: DashboardStatData = {
        streakDays: 1,
        thisWeekWorkouts: 1,
      };

      const { getByTestId } = render(
        <StatTile tile={tile} statData={statData} />,
      );

      expect(getByTestId("tile-streak-value").props.children).toBe("1 days");
      expect(getByTestId("tile-streak-footer").props.children).toBe(
        "1/3 · 2 more days",
      );
    });
  });

  describe("StatTile - Today's Mood", () => {
    it("renders mood label and last 7 days footer", () => {
      const tile: DashboardTile = { id: "mood", kind: "stat", size: "1x1" };
      const statData: DashboardStatData = {
        streakDays: 5,
        thisWeekWorkouts: 2,
        todaysMood: 4,
        recentMoods: [3, 4, 4, 5, 4],
      };

      const { getByTestId, getByText } = render(
        <StatTile tile={tile} statData={statData} />,
      );

      expect(getByTestId("tile-mood-value").props.children).toBe("Pretty Good");
      expect(getByTestId("tile-mood-footer").props.children).toBe("Last 5 days");
      expect(getByText("Today's Mood")).toBeTruthy();
    });

    it("renders 'Set' and 'No entries yet' when mood is not recorded", () => {
      const tile: DashboardTile = { id: "mood", kind: "stat", size: "1x1" };
      const statData: DashboardStatData = {
        streakDays: 0,
        thisWeekWorkouts: 0,
        todaysMood: null,
        recentMoods: [],
      };

      const { getByTestId } = render(
        <StatTile tile={tile} statData={statData} />,
      );

      expect(getByTestId("tile-mood-value").props.children).toBe("Set");
      expect(getByTestId("tile-mood-footer").props.children).toBe(
        "No entries yet",
      );
    });
  });

  describe("StatTile - This Week", () => {
    it("renders completed vs weekly target and remaining footer", () => {
      const tile: DashboardTile = { id: "weekly", kind: "stat", size: "1x1" };
      const statData: DashboardStatData = {
        streakDays: 5,
        thisWeekWorkouts: 2,
        weeklyTarget: 3,
      };

      const { getByTestId, getByText } = render(
        <StatTile tile={tile} statData={statData} />,
      );

      expect(getByTestId("tile-weekly-value").props.children).toBe("2/3");
      expect(getByTestId("tile-weekly-footer").props.children).toBe(
        "1 to weekly target",
      );
      expect(getByText("This Week")).toBeTruthy();
    });

    it("renders weekly target hit when completed meets target", () => {
      const tile: DashboardTile = { id: "weekly", kind: "stat", size: "1x1" };
      const statData: DashboardStatData = {
        streakDays: 5,
        thisWeekWorkouts: 3,
        weeklyTarget: 3,
      };

      const { getByTestId } = render(
        <StatTile tile={tile} statData={statData} />,
      );

      expect(getByTestId("tile-weekly-value").props.children).toBe("3/3");
      expect(getByTestId("tile-weekly-footer").props.children).toBe(
        "Weekly target hit 🎉",
      );
    });
  });

  describe("StatTile - Goal", () => {
    it("renders muscle building goal with remaining weight and ETA", () => {
      const tile: DashboardTile = { id: "goal", kind: "stat", size: "1x1" };
      const statData: DashboardStatData = {
        streakDays: 5,
        thisWeekWorkouts: 2,
        fitnessGoal: "gain_muscle",
        nutritionDirection: "gain",
        targetWeightKg: 82.1,
        startWeightKg: 79.5,
        latestWeight: 175.2,
        earliestWeight: 175.2,
        weightUnit: "lbs",
        pace: { status: "on", eta: "~12 wks", behindByKg: 0 },
      };

      const { getByTestId, getByText } = render(
        <StatTile tile={tile} statData={statData} />,
      );

      expect(getByText("Goal · Build muscle")).toBeTruthy();
      expect(getByTestId("tile-goal-value").props.children).toContain("5.8 lbs to go");
      expect(getByTestId("tile-goal-footer").props.children).toContain("181 lbs");
      expect(getByTestId("tile-goal-footer").props.children).toContain("~12 wks");
    });
  });

  describe("StatTile - Calories", () => {
    it("renders Calories tile with 0/2000 and 2000 cal left", () => {
      const tile: DashboardTile = { id: "calories", kind: "stat", size: "1x1" };
      const statData: DashboardStatData = {
        streakDays: 5,
        thisWeekWorkouts: 2,
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

    it("renders over calories when consumed exceeds goal", () => {
      const tile: DashboardTile = { id: "calories", kind: "stat", size: "1x1" };
      const statData: DashboardStatData = {
        streakDays: 5,
        thisWeekWorkouts: 2,
        caloriesConsumed: 2250,
        caloriesGoal: 2000,
      };

      const { getByTestId } = render(
        <StatTile tile={tile} statData={statData} />,
      );

      expect(getByTestId("tile-calories-value").props.children).toBe("2250/2000");
      expect(getByTestId("tile-calories-footer").props.children).toBe("250 over");
    });
  });

  describe("SuggestionTile & Smart Tile Parity", () => {
    it("renders server suggestion with Nudge severity, title, body, action, and dismiss button", () => {
      const tile: DashboardTile = { id: "smart", kind: "smart-rotating", size: "2x1" };
      const suggestion: DashboardSuggestion = {
        id: "core-nudge",
        severity: "nudge",
        title: "Bring core back in",
        body: "You haven't logged core work in 2 weeks",
        placement: "dashboard",
        primaryAction: {
          label: "Browse exercises",
          href: "/programming",
        },
        dismissible: true,
        source: "workout",
      };

      const onDismiss = jest.fn();

      const { getByTestId, getByText, queryByText } = render(
        <SuggestionTile
          tile={tile}
          suggestion={suggestion}
          onDismissSuggestion={onDismiss}
        />,
      );

      // Verify no "Coming soon"
      expect(queryByText("Coming soon")).toBeNull();

      // Verify title, body, badge
      expect(getByText("Bring core back in")).toBeTruthy();
      expect(getByText("You haven't logged core work in 2 weeks")).toBeTruthy();
      expect(getByTestId("suggestion-badge")).toBeTruthy();

      // Action button triggers navigation
      const actionBtn = getByTestId("suggestion-primary-action");
      expect(getByText("Browse exercises")).toBeTruthy();
      fireEvent.press(actionBtn);
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming");

      // Dismiss button triggers callback
      const dismissBtn = getByTestId("suggestion-dismiss");
      fireEvent.press(dismissBtn);
      expect(onDismiss).toHaveBeenCalledWith("core-nudge");
    });

    it("falls back to rotating unpinned stat card when no suggestions exist and never shows Coming soon", () => {
      const tile: DashboardTile = { id: "smart", kind: "smart-rotating", size: "2x1" };
      const statData: DashboardStatData = {
        streakDays: 5,
        thisWeekWorkouts: 2,
        caloriesConsumed: 500,
        caloriesGoal: 2000,
      };

      const { queryByText, getByTestId } = render(
        <SuggestionTile tile={tile} statData={statData} />,
      );

      expect(queryByText("Coming soon")).toBeNull();
      expect(getByTestId("tile-smart")).toBeTruthy();
    });
  });

  describe("The Becoming Widget (BecomingDoor)", () => {
    it("renders at top with Mind Lv, Nutrition pace, Training x/target and next line", () => {
      const goals = {
        todayKey: "2026-10-01",
        nutrition: {
          unit: "lbs",
          status: "active",
          kind: "weight",
          direction: "lose",
          startedAt: "2026-09-01",
          achievedAt: null,
          baseline: { date: "2026-09-01", weight: 190 },
          journeyStart: { date: "2026-09-01", weight: 190 },
          now: { date: "2026-10-01", weight: 185 },
          target: { weight: 181, paceKgPerWeek: 0.5, pacePerWeek: 1.1, bandKg: 1 },
          pace: { status: "on", eta: "~12 wks", behindByKg: 0 },
          adherence: null,
          proteinGoal: 150,
          suggestion: {
            title: "Nutrition on track",
            sub: "Keep up the consistent intake",
            severity: "good",
          },
        },
        training: {
          target: { daysPerWeek: 3 },
          thisWeek: { done: 2, remaining: 1, weekLost: false },
          suggestion: {
            title: "Upper Body Focus",
            sub: "1 session remaining this week",
            severity: "nudge",
          },
        },
      } as unknown as GoalProgressResponse;

      const mind: MindSummaryResponse = {
        todayKey: "2026-10-01",
        level: 4,
        levelPct: 60,
        chapter: 2,
        chapterName: "Foundations",
        sessionsIntoChapter: 3,
        sessionsPerChapter: 10,
        sessionDoneToday: false,
        mainSessionAvailable: true,
        sessionsLast7Days: 4,
        moodCheckinsLast7Days: 5,
        todayMood: 4,
        lastState: null,
      };

      const onPress = jest.fn();

      const { getByTestId, getByText } = render(
        <BecomingDoor goals={goals} mind={mind} onPress={onPress} />,
      );

      expect(getByTestId("becoming-door")).toBeTruthy();
      expect(getByText("The Becoming")).toBeTruthy();
      expect(getByText("Then → now → next, across all three")).toBeTruthy();

      // Mind chip
      expect(getByText("Lv 4")).toBeTruthy();
      expect(getByText("Ch 2 · Foundations")).toBeTruthy();

      // Nutrition chip
      expect(getByText("On pace")).toBeTruthy();

      // Training chip
      expect(getByText("2/3")).toBeTruthy();
      expect(getByText("this week")).toBeTruthy();

      // Next line
      expect(getByTestId("becoming-door-next")).toBeTruthy();
      expect(getByText("Upper Body Focus")).toBeTruthy();

      // Tap navigates
      fireEvent.press(getByTestId("becoming-door"));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("satisfies 44x44 minimum touch target and allows dynamic type wrapping", () => {
      const { getByTestId } = render(<BecomingDoor goals={null} mind={null} />);
      const door = getByTestId("becoming-door");
      const flatStyle = Array.isArray(door.props.style)
        ? Object.assign({}, ...door.props.style)
        : door.props.style;
      expect(flatStyle.minHeight).toBeGreaterThanOrEqual(44);
      expect(flatStyle.minWidth).toBeGreaterThanOrEqual(44);
    });
  });

  describe("Up Next Widget (UpNextCard)", () => {
    it("renders with header, calendar link, date label, and workout details", () => {
      const workout: UpcomingWorkoutSummary = {
        dateLabel: "Tomorrow",
        dayLabel: "Day 2 Lower A",
        workoutTitle: "Lower Body Strength",
        programName: "Hypertrophy 1",
        programId: "prog-1",
        workoutIndex: 1,
        phase: 1,
      };

      const onOpenCalendar = jest.fn();
      const onPressWorkout = jest.fn();

      const { getByTestId, getByText } = render(
        <UpNextCard
          workout={workout}
          onOpenCalendar={onOpenCalendar}
          onPressWorkout={onPressWorkout}
        />,
      );

      expect(getByTestId("up-next-card")).toBeTruthy();
      expect(getByText("Up Next")).toBeTruthy();
      expect(getByTestId("up-next-day").props.children).toBe(
        "Tomorrow: Day 2 Lower A",
      );
      expect(getByTestId("up-next-title").props.children).toEqual([
        "Lower Body Strength",
        " · Hypertrophy 1",
      ]);

      // Calendar button
      const calBtn = getByTestId("up-next-calendar");
      fireEvent.press(calBtn);
      expect(onOpenCalendar).toHaveBeenCalledTimes(1);

      // Workout press
      fireEvent.press(getByTestId("up-next-card"));
      expect(onPressWorkout).toHaveBeenCalledTimes(1);
    });

    it("returns null when no workout is present", () => {
      const { queryByTestId } = render(<UpNextCard workout={null} />);
      expect(queryByTestId("up-next-card")).toBeNull();
    });
  });

  describe("TileGrid integration with live statData and server tilesData", () => {
    it("renders populated tiles with real numbers instead of dashes ('—')", () => {
      const layout: DashboardTile[] = [
        { id: "streak", kind: "stat", size: "1x1" },
        { id: "mood", kind: "stat", size: "1x1" },
        { id: "weekly", kind: "stat", size: "1x1" },
        { id: "goal", kind: "stat", size: "1x1" },
        { id: "calories", kind: "stat", size: "1x1" },
        { id: "smart", kind: "smart-rotating", size: "2x1" },
      ];

      const statData: DashboardStatData = {
        streakDays: 12,
        nextMilestone: 14,
        todaysMood: 4,
        recentMoods: [4, 5, 4],
        thisWeekWorkouts: 2,
        weeklyTarget: 3,
        fitnessGoal: "gain_muscle",
        nutritionDirection: "gain",
        targetWeightKg: 82.1,
        startWeightKg: 79.5,
        latestWeight: 175.2,
        earliestWeight: 175.2,
        weightUnit: "lbs",
        pace: { status: "on", eta: "~12 wks", behindByKg: 0 },
        caloriesConsumed: 0,
        caloriesGoal: 2000,
      };

      const tilesData: DashboardTilesResponse = {
        tiles: [],
        metrics: [],
        suggestions: [
          {
            id: "nudge-1",
            severity: "nudge",
            title: "Bring core back in",
            body: "You haven't logged core work in 2 weeks",
            placement: "dashboard",
            dismissible: true,
            source: "workout",
            primaryAction: {
              label: "Browse exercises",
              href: "/programming",
            },
          },
        ],
        engagement: [],
        now: "2026-10-01T08:00:00Z",
      };

      const { getByTestId, queryByText } = render(
        <TileGrid layout={layout} statData={statData} tilesData={tilesData} />,
      );

      // Verify no "Coming soon"
      expect(queryByText("Coming soon")).toBeNull();

      // Real live data rendered, not "—"
      expect(getByTestId("tile-streak-value").props.children).toBe("12 days");
      expect(getByTestId("tile-mood-value").props.children).toBe("Pretty Good");
      expect(getByTestId("tile-weekly-value").props.children).toBe("2/3");
      expect(getByTestId("tile-goal-value").props.children).toContain("5.8 lbs to go");
      expect(getByTestId("tile-calories-value").props.children).toBe("0/2000");

      // Smart tile shows real suggestion
      expect(getByTestId("tile-smart")).toBeTruthy();
      expect(queryByText("Bring core back in")).toBeTruthy();
    });
  });
});
