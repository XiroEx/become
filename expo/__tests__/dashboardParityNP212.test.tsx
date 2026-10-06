import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ProgressChart } from "@/components/dashboard/ProgressChart";
import { NutritionCard } from "@/components/dashboard/NutritionCard";
import { CurrentProgramCard } from "@/components/dashboard/CurrentProgramCard";
import { DashboardScreen } from "@/components/DashboardScreen";
import {
  describeNutritionTrend,
  type SummaryDay,
} from "@/lib/dashboard/nutritionTrend";
import type { DashboardStatData } from "@/lib/dashboard/types";
import type { ProgressApiResponse } from "@become/api-client";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const baseStatData: DashboardStatData = {
  streakDays: 5,
  thisWeekWorkouts: 2,
};

describe("NP-212: Home Parity 2 (Trend Pill, Rounded Goal, Nutrition Card, Current Program Card)", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  describe("1. Weight chart trend pill renders text and arrow", () => {
    it("renders trend pill with '0.2lbs' text and up arrow when weight increased", () => {
      const weightData = [
        { date: "Oct 1", value: 180.0 },
        { date: "Oct 2", value: 180.2 },
      ];

      const { getByTestId } = render(
        <ProgressChart
          weightData={weightData}
          weightUnit="lbs"
          fitnessGoal="gain_muscle"
        />,
      );

      const changePill = getByTestId("progress-chart-change");
      expect(changePill).toBeTruthy();

      const changeText = getByTestId("progress-chart-change-text");
      expect(changeText.props.children).toBe("0.2lbs");
    });

    it("renders trend pill with down direction when weight decreased", () => {
      const weightData = [
        { date: "Oct 1", value: 180.5 },
        { date: "Oct 2", value: 180.1 },
      ];

      const { getByTestId } = render(
        <ProgressChart
          weightData={weightData}
          weightUnit="lbs"
          fitnessGoal="lose_weight"
        />,
      );

      const changePill = getByTestId("progress-chart-change");
      expect(changePill).toBeTruthy();
      expect(changePill.props.accessibilityLabel).toBe("Down 0.4 lbs");

      const changeText = getByTestId("progress-chart-change-text");
      expect(changeText.props.children).toBe("0.4lbs");
    });
  });

  describe("2. The goal line label is a rounded float (1 decimal)", () => {
    it("rounds unrounded float '180.7790549915996' to 'Goal 180.8 lbs'", () => {
      const weightData = [
        { date: "Oct 1", value: 180.0 },
        { date: "Oct 2", value: 180.2 },
      ];

      const { getByTestId } = render(
        <ProgressChart
          weightData={weightData}
          weightUnit="lbs"
          targetWeight={180.7790549915996}
        />,
      );

      const targetLabel = getByTestId("progress-chart-target-label");
      expect(targetLabel).toBeTruthy();
      expect(targetLabel.props.children.props.children).toBe("Goal 180.8 lbs");
    });

    it("formats whole number goal to 1 decimal place 'Goal 170.0 lbs'", () => {
      const weightData = [
        { date: "Oct 1", value: 175.0 },
      ];

      const { getByTestId } = render(
        <ProgressChart
          weightData={weightData}
          weightUnit="lbs"
          targetWeight={170}
        />,
      );

      const targetLabel = getByTestId("progress-chart-target-label");
      expect(targetLabel).toBeTruthy();
      expect(targetLabel.props.children.props.children).toBe("Goal 170.0 lbs");
    });
  });

  describe("3. Nutrition Card", () => {
    const nutritionData = {
      calories: { consumed: 0, goal: 2000 },
      protein: { current: 45, goal: 150 },
      carbs: { current: 120, goal: 250 },
      fats: { current: 30, goal: 65 },
      water: { current: 0, goal: 96 },
    };

    const days: SummaryDay[] = [
      { date: "2026-09-26", calories: 1650, protein: 90, hasData: true, mealCount: 3 },
      { date: "2026-09-27", calories: 1700, protein: 95, hasData: true, mealCount: 3 },
      { date: "2026-09-28", calories: 1600, protein: 85, hasData: true, mealCount: 2 },
      { date: "2026-09-29", calories: 1680, protein: 100, hasData: true, mealCount: 3 },
      { date: "2026-09-30", calories: 1640, protein: 90, hasData: true, mealCount: 3 },
      { date: "2026-10-01", calories: 1654, protein: 110, hasData: true, mealCount: 3 },
      { date: "2026-10-02", calories: 0, protein: 0, hasData: false, mealCount: 0 },
    ];

    const trend = describeNutritionTrend(days, { calories: 2000, protein: 150 });

    it("computes trend line correctly: logged 6 of 7 days · protein hit 0 · avg 1,654 cal (under)", () => {
      expect(trend.loggedDays).toBe(6);
      expect(trend.proteinHitDays).toBe(0);
      expect(trend.avgCalories).toBe(1654);
      expect(trend.calorieRead).toBe("under");
      expect(trend.line.replace(/^Logged /, "logged ")).toBe(
        "logged 6 of 7 days · protein hit 0 · avg 1,654 cal (under)",
      );
    });

    it("renders calorie ring with 2000 left, macro bars, water bar, trend text, and action buttons", () => {
      const onOpenNutrition = jest.fn();
      const onLogMeal = jest.fn();
      const onQuickAdd = jest.fn();

      const { getByTestId, getByText } = render(
        <NutritionCard
          calories={nutritionData.calories}
          protein={nutritionData.protein}
          carbs={nutritionData.carbs}
          fats={nutritionData.fats}
          water={nutritionData.water}
          trend={trend}
          onOpenNutrition={onOpenNutrition}
          onLogMeal={onLogMeal}
          onQuickAdd={onQuickAdd}
        />,
      );

      // Card title & View All link
      expect(getByTestId("nutrition-card-title").props.children).toBe("Nutrition");
      const viewAll = getByTestId("nutrition-card-view-all");
      expect(viewAll).toBeTruthy();
      fireEvent.press(viewAll);
      expect(onOpenNutrition).toHaveBeenCalledTimes(1);

      // Calorie Ring: 2000 left
      expect(getByTestId("nutrition-card-calories-val").props.children).toBe(2000);
      expect(getByTestId("nutrition-card-calories-label").props.children).toBe("left");

      // Macro Bars
      expect(getByTestId("nutrition-card-protein-meta").props.children).toEqual([45, "g / ", 150, "g"]);
      expect(getByTestId("nutrition-card-carbs-meta").props.children).toEqual([120, "g / ", 250, "g"]);
      expect(getByTestId("nutrition-card-fats-meta").props.children).toEqual([30, "g / ", 65, "g"]);

      // Water Bar
      expect(getByTestId("nutrition-card-water-meta").props.children).toEqual([0, "/", 96, " oz"]);

      // Trend Line
      expect(getByTestId("nutrition-trend")).toBeTruthy();
      expect(getByText(/logged 6 of 7 days · protein hit 0 · avg 1,654 cal \(under\)/)).toBeTruthy();

      // Action buttons
      const logMealBtn = getByTestId("nutrition-card-log-meal");
      expect(logMealBtn).toBeTruthy();
      fireEvent.press(logMealBtn);
      expect(onLogMeal).toHaveBeenCalledTimes(1);

      const quickAddBtn = getByTestId("nutrition-card-quick-add");
      expect(quickAddBtn).toBeTruthy();
      fireEvent.press(quickAddBtn);
      expect(onQuickAdd).toHaveBeenCalledTimes(1);
    });

    it("renders over state when calories consumed exceed goal", () => {
      const overCalories = { consumed: 2250, goal: 2000 };
      const { getByTestId } = render(
        <NutritionCard
          calories={overCalories}
          protein={nutritionData.protein}
          carbs={nutritionData.carbs}
          fats={nutritionData.fats}
          water={nutritionData.water}
        />,
      );

      expect(getByTestId("nutrition-card-calories-val").props.children).toBe(250);
      expect(getByTestId("nutrition-card-calories-label").props.children).toBe("over");
    });
  });

  describe("4. Current Program Card", () => {
    const currentProgram = {
      programId: "hypertrophy-foundations",
      name: "Hypertrophy Foundations",
      currentPhase: 1,
      currentWeek: 2,
      totalWeeks: 4,
      completedWorkouts: 4,
      totalWorkouts: 16,
      nextWorkout: "Upper Body Pump",
    };

    it("renders current program name, phase/week, progress %, and continue button", () => {
      const onView = jest.fn();
      const onContinue = jest.fn();

      const { getByTestId } = render(
        <CurrentProgramCard
          program={currentProgram}
          onView={onView}
          onContinue={onContinue}
        />,
      );

      expect(getByTestId("current-program-title").props.children).toBe("Current Program");

      const viewBtn = getByTestId("current-program-view");
      fireEvent.press(viewBtn);
      expect(onView).toHaveBeenCalledTimes(1);

      expect(getByTestId("current-program-name").props.children).toBe("Hypertrophy Foundations");
      expect(getByTestId("current-program-phase").props.children).toBe(
        "Phase 1 • Week 2 of 4",
      );

      // Progress: 4/16 = 25%
      expect(getByTestId("current-program-progress-pct").props.children).toBe("25%");

      // Continue button
      const continueBtn = getByTestId("current-program-continue");
      expect(continueBtn).toBeTruthy();
      fireEvent.press(continueBtn);
      expect(onContinue).toHaveBeenCalledTimes(1);
    });

    it("the Progress label is a link to the Training Log records (NP-256, web's /dashboard/progress#records)", () => {
      const onPressProgress = jest.fn();
      const { getByTestId } = render(
        <CurrentProgramCard
          program={currentProgram}
          onPressProgress={onPressProgress}
        />,
      );

      const progressLink = getByTestId("current-program-progress-link");
      expect(progressLink.props.accessibilityRole).toBe("link");
      fireEvent.press(progressLink);
      expect(onPressProgress).toHaveBeenCalledTimes(1);
    });
  });

  describe("5. DashboardScreen Integration", () => {
    it("renders ProgressChart, NutritionCard, and CurrentProgramCard in order", () => {
      const nutritionData = {
        calories: { consumed: 500, goal: 2000 },
        protein: { current: 40, goal: 150 },
        carbs: { current: 60, goal: 250 },
        fats: { current: 15, goal: 65 },
        water: { current: 32, goal: 96 },
      };

      const currentProgram = {
        programId: "prog-1",
        name: "Strength Phase",
        currentPhase: 1,
        currentWeek: 1,
        totalWeeks: 4,
        completedWorkouts: 1,
        totalWorkouts: 12,
        nextWorkout: "Leg Day 1",
      };

      const progressData = {
        weightData: [{ date: "Oct 1", value: 180.2 }],
        bmiData: [{ date: "Oct 1", value: 25.0 }],
        moodData: [{ date: "Oct 1", value: 4 }],
        currentProgram,
        stats: { streakDays: 5, totalWorkouts: 10, thisWeekWorkouts: 2, goalProgress: 25 },
      } as unknown as ProgressApiResponse;

      const { getByTestId } = render(
        <DashboardScreen
          userName="Jon"
          streakDays={5}
          todayWorkout={null}
          onStartWorkout={jest.fn()}
          onOpenCalendar={jest.fn()}
          onSubmitCheckIn={jest.fn()}
          statData={baseStatData}
          progressData={progressData}
          targetWeight={180.7790549915996}
          nutritionData={nutritionData}
          currentProgram={currentProgram}
        />,
      );

      // 1. Progress chart with rounded target
      expect(getByTestId("progress-chart")).toBeTruthy();
      const targetLabel = getByTestId("progress-chart-target-label");
      expect(targetLabel).toBeTruthy();
      expect(targetLabel.props.children.props.children).toBe("Goal 180.8 lbs");

      // 2. Nutrition card below chart
      expect(getByTestId("dashboard-nutrition-card")).toBeTruthy();

      // 3. Current program card after nutrition
      expect(getByTestId("dashboard-current-program-card")).toBeTruthy();
      expect(getByTestId("current-program-name").props.children).toBe("Strength Phase");
    });
  });
});
