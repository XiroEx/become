import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { NutritionCard } from "@/components/dashboard/NutritionCard";
import type { NutritionTrend } from "@/lib/dashboard/nutritionTrend";

describe("NutritionCard (NP-149 / NP-212)", () => {
  const defaultProps = {
    calories: { consumed: 1750, goal: 2000 },
    protein: { current: 140, goal: 150 },
    carbs: { current: 180, goal: 220 },
    fats: { current: 55, goal: 65 },
    water: { current: 64, goal: 96 },
    trend: {
      loggedDays: 6,
      totalDays: 7,
      proteinHitDays: 4,
      avgCalories: 1950,
      calorieRead: "near" as const,
      line: "Logged 6 of 7 days · protein hit 4 · avg 1,950 cal (on target)",
    } as NutritionTrend,
    onOpenNutrition: jest.fn(),
    onLogMeal: jest.fn(),
    onQuickAdd: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("(id: e015ca09) renders calories, macros, water, and 7-day trend sentence", () => {
    const { getByTestId, getByText } = render(<NutritionCard {...defaultProps} />);

    // Calories: 2000 - 1750 = 250 left
    expect(getByTestId("nutrition-card-calories-val").props.children).toBe(250);
    expect(getByTestId("nutrition-card-calories-label").props.children).toBe("left");

    // Macros
    expect(getByTestId("nutrition-card-protein-meta").props.children).toEqual([140, "g / ", 150, "g"]);
    expect(getByTestId("nutrition-card-carbs-meta").props.children).toEqual([180, "g / ", 220, "g"]);
    expect(getByTestId("nutrition-card-fats-meta").props.children).toEqual([55, "g / ", 65, "g"]);

    // Water
    expect(getByTestId("nutrition-card-water-meta").props.children).toEqual([64, "/", 96, " oz"]);

    // Trend
    expect(getByTestId("nutrition-trend")).toBeTruthy();
    expect(getByText(/logged 6 of 7 days · protein hit 4 · avg 1,950 cal \(on target\)/)).toBeTruthy();
  });

  it("(id: e015ca0a) Quick add button triggers onQuickAdd callback", () => {
    const onQuickAdd = jest.fn();
    const { getByTestId } = render(<NutritionCard {...defaultProps} onQuickAdd={onQuickAdd} />);

    const quickAddBtn = getByTestId("nutrition-card-quick-add");
    expect(quickAddBtn).toBeTruthy();
    fireEvent.press(quickAddBtn);
    expect(onQuickAdd).toHaveBeenCalledTimes(1);
  });

  it("Log meal button triggers onLogMeal or falls back to onOpenNutrition", () => {
    const onLogMeal = jest.fn();
    const onOpenNutrition = jest.fn();
    const { getByTestId } = render(
      <NutritionCard
        {...defaultProps}
        onLogMeal={onLogMeal}
        onOpenNutrition={onOpenNutrition}
      />,
    );

    const logMealBtn = getByTestId("nutrition-card-log-meal");
    expect(logMealBtn).toBeTruthy();
    fireEvent.press(logMealBtn);
    expect(onLogMeal).toHaveBeenCalledTimes(1);
  });

  it("View all header link triggers onOpenNutrition", () => {
    const onOpenNutrition = jest.fn();
    const { getByTestId } = render(
      <NutritionCard {...defaultProps} onOpenNutrition={onOpenNutrition} />,
    );

    const viewAllBtn = getByTestId("nutrition-card-view-all");
    expect(viewAllBtn).toBeTruthy();
    fireEvent.press(viewAllBtn);
    expect(onOpenNutrition).toHaveBeenCalledTimes(1);
  });

  it("renders over state when calories consumed exceed goal", () => {
    const { getByTestId } = render(
      <NutritionCard
        {...defaultProps}
        calories={{ consumed: 2300, goal: 2000 }}
      />,
    );

    expect(getByTestId("nutrition-card-calories-val").props.children).toBe(300);
    expect(getByTestId("nutrition-card-calories-label").props.children).toBe("over");
  });
});
