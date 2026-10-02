import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { NutritionCard } from "@/components/dashboard/NutritionCard";

describe("NutritionCard (NP-149)", () => {
  const baseProps = {
    calories: { consumed: 1750, goal: 2200 },
    protein: { current: 145, goal: 160 },
    carbs: { current: 190, goal: 220 },
    fats: { current: 50, goal: 65 },
    water: { current: 72, goal: 96 },
    trend: {
      loggedDays: 5,
      totalDays: 7,
      proteinHitDays: 3,
      avgCalories: 2150,
      calorieRead: "near" as const,
      line: "Logged 5 of 7 days · protein hit 3 · avg 2,150 cal (on target)",
    },
    onOpenNutrition: jest.fn(),
    onLogMeal: jest.fn(),
    onQuickAdd: jest.fn(),
  };

  it("renders calorie ring with remaining calories and 'left' when under goal", () => {
    const { getByTestId } = render(<NutritionCard {...baseProps} />);
    expect(getByTestId("nutrition-card-calories-val").props.children).toBe(450);
    expect(getByTestId("nutrition-card-calories-label").props.children).toBe("left");
  });

  it("renders calorie ring with over amount and 'over' when over goal", () => {
    const { getByTestId } = render(
      <NutritionCard
        {...baseProps}
        calories={{ consumed: 2500, goal: 2200 }}
      />,
    );
    expect(getByTestId("nutrition-card-calories-val").props.children).toBe(300);
    expect(getByTestId("nutrition-card-calories-label").props.children).toBe("over");
  });

  it("renders macros and water progress correctly", () => {
    const { getByTestId } = render(<NutritionCard {...baseProps} />);
    expect(getByTestId("nutrition-card-protein-meta").props.children).toEqual([145, "g / ", 160, "g"]);
    expect(getByTestId("nutrition-card-carbs-meta").props.children).toEqual([190, "g / ", 220, "g"]);
    expect(getByTestId("nutrition-card-fats-meta").props.children).toEqual([50, "g / ", 65, "g"]);
    expect(getByTestId("nutrition-card-water-meta").props.children).toEqual([72, "/", 96, " oz"]);
  });

  it("renders the 7-day trend sentence with 'Last 7 days:' prefix and lowercase 'logged'", () => {
    const { getByTestId, getByText } = render(<NutritionCard {...baseProps} />);
    expect(getByTestId("nutrition-trend")).toBeTruthy();
    expect(getByText(/logged 5 of 7 days · protein hit 3 · avg 2,150 cal \(on target\)/i)).toBeTruthy();
  });

  it("omits trend section when trend is null", () => {
    const { queryByTestId } = render(<NutritionCard {...baseProps} trend={null} />);
    expect(queryByTestId("nutrition-trend")).toBeNull();
  });

  it("calls onLogMeal when 'Log Meal' button is pressed", () => {
    const onLogMeal = jest.fn();
    const { getByTestId } = render(<NutritionCard {...baseProps} onLogMeal={onLogMeal} />);
    fireEvent.press(getByTestId("nutrition-card-log-meal"));
    expect(onLogMeal).toHaveBeenCalledTimes(1);
  });

  it("falls back to onOpenNutrition when onLogMeal is not provided", () => {
    const onOpenNutrition = jest.fn();
    const { getByTestId } = render(
      <NutritionCard {...baseProps} onLogMeal={undefined} onOpenNutrition={onOpenNutrition} />,
    );
    fireEvent.press(getByTestId("nutrition-card-log-meal"));
    expect(onOpenNutrition).toHaveBeenCalledTimes(1);
  });

  it("calls onQuickAdd when 'Quick Add' button is pressed", () => {
    const onQuickAdd = jest.fn();
    const { getByTestId } = render(<NutritionCard {...baseProps} onQuickAdd={onQuickAdd} />);
    fireEvent.press(getByTestId("nutrition-card-quick-add"));
    expect(onQuickAdd).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenNutrition when 'View All' header link is pressed", () => {
    const onOpenNutrition = jest.fn();
    const { getByTestId } = render(<NutritionCard {...baseProps} onOpenNutrition={onOpenNutrition} />);
    fireEvent.press(getByTestId("nutrition-card-view-all"));
    expect(onOpenNutrition).toHaveBeenCalledTimes(1);
  });
});
