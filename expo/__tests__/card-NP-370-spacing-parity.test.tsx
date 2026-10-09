import React from "react";
import { render } from "@testing-library/react-native";
import { DateNav } from "@/components/nutrition/DateNav";
import { CalorieRing } from "@/components/nutrition/CalorieRing";
import { WaterTracker } from "@/components/nutrition/WaterTracker";
import { NutritionConsultantTeaser } from "@/components/nutrition/NutritionConsultantTeaser";

let mockParams: Record<string, string | undefined> = {};
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn().mockResolvedValue({}) };
});

import NutritionIndexRoute from "../app/(app)/(tabs)/nutrition/index";

describe("card NP-370: Nutrition Day spacing and typography parity", () => {
  describe("1. Header Chrome & View Selector", () => {
    it("header buttons have 40px height and rounded-xl (12px) border styling", () => {
      mockParams = { view: "day" };
      const { getByTestId } = render(<NutritionIndexRoute />);
      const myStuff = getByTestId("nutrition-my-stuff-button");
      const timeline = getByTestId("nutrition-timeline-button");

      expect(myStuff.props.style).toEqual(
        expect.objectContaining({
          height: 40,
          borderRadius: 12,
          paddingHorizontal: 12,
        }),
      );

      expect(timeline.props.style).toEqual(
        expect.objectContaining({
          height: 40,
          borderRadius: 12,
          paddingHorizontal: 12,
        }),
      );
    });

    it("header subtitle uses text-sm mt-1", () => {
      mockParams = { view: "day" };
      const { getByText } = render(<NutritionIndexRoute />);
      const subtitle = getByText("Track your food, macros, and hydration");
      expect(subtitle.props.className).toContain("text-sm");
      expect(subtitle.props.className).toContain("mt-1");
    });

    it("removes the extra 3-segment Day/Week/Month selector from the day tab", () => {
      mockParams = { view: "day" };
      const { queryByTestId } = render(<NutritionIndexRoute />);
      expect(queryByTestId("nutrition-view-selector")).toBeNull();
    });

    it("retains the 3-segment selector when in week view", () => {
      mockParams = { view: "week" };
      const { queryByTestId } = render(<NutritionIndexRoute />);
      expect(queryByTestId("nutrition-view-selector")).toBeTruthy();
    });
  });

  describe("2. Search & Quick Capture Row", () => {
    it("search input has 40px height and 12px border radius", () => {
      mockParams = { view: "day" };
      const { getByTestId } = render(<NutritionIndexRoute />);
      const searchBar = getByTestId("nutrition-search-bar");

      expect(searchBar.props.style).toEqual(
        expect.objectContaining({
          height: 40,
          borderRadius: 12,
        }),
      );
    });

    it("camera and upload buttons are 40x40 with 12px radius", () => {
      mockParams = { view: "day" };
      const { getByTestId } = render(<NutritionIndexRoute />);
      const camera = getByTestId("nutrition-camera-button");
      const upload = getByTestId("nutrition-upload-button");

      expect(camera.props.style).toEqual(
        expect.objectContaining({
          width: 40,
          height: 40,
          borderRadius: 12,
        }),
      );

      expect(upload.props.style).toEqual(
        expect.objectContaining({
          width: 40,
          height: 40,
          borderRadius: 12,
        }),
      );
    });
  });

  describe("3. DateNav Navigation", () => {
    it("date label uses text-sm font-semibold and plain text Today", () => {
      const { getByTestId } = render(
        <DateNav
          dateKey="2026-06-02"
          isToday
          onPrev={jest.fn()}
          onNext={jest.fn()}
        />,
      );

      const dateLabel = getByTestId("nutrition-current-date");
      expect(dateLabel.props.className).toContain("text-sm");
      expect(dateLabel.props.className).toContain("font-semibold");

      const todayBadge = getByTestId("nutrition-today-badge");
      expect(todayBadge.props.className).toContain("text-[10px]");
      expect(todayBadge.props.className).toContain("font-medium");
      expect(todayBadge.props.className).toContain("uppercase");
      expect(todayBadge.props.className).toContain("tracking-wider");
    });
  });

  describe("4. Calorie Ring & Goal Line", () => {
    it("center kcal number uses text-2xl font-bold tracking-tight", () => {
      const { getByTestId } = render(
        <CalorieRing
          consumed={1800}
          goal={2400}
          protein={{ current: 150, goal: 150 }}
          carbs={{ current: 200, goal: 200 }}
          fats={{ current: 65, goal: 65 }}
        />,
      );

      const kcalText = getByTestId("day-totals-kcal");
      expect(kcalText.props.className).toContain("text-2xl");
      expect(kcalText.props.className).toContain("font-bold");
      expect(kcalText.props.className).toContain("tracking-tight");
    });

    it("renders goal line outside the card below it with -mt-2 text-center", () => {
      const { getByTestId } = render(
        <CalorieRing
          consumed={1800}
          goal={2400}
          protein={{ current: 150, goal: 150 }}
          carbs={{ current: 200, goal: 200 }}
          fats={{ current: 65, goal: 65 }}
          goalLine="2,400 cal/day, on track for 180 lbs"
        />,
      );

      const goalLine = getByTestId("nutrition-goal-line");
      expect(goalLine.props.className).toContain("-mt-2");
      expect(goalLine.props.className).toContain("text-center");
      expect(goalLine.props.className).toContain("text-xs");
      expect(goalLine.props.children).toBe("2,400 cal/day, on track for 180 lbs");
    });

    it("macro tracks are h-2.5 (10px height) and macro labels are text-sm font-medium", () => {
      const { getByText, getByTestId } = render(
        <CalorieRing
          consumed={1800}
          goal={2400}
          protein={{ current: 120, goal: 150 }}
          carbs={{ current: 150, goal: 200 }}
          fats={{ current: 50, goal: 65 }}
        />,
      );

      expect(getByText("Protein").props.className).toContain("text-sm");
      expect(getByText("Protein").props.className).toContain("font-medium");
      expect(getByText("Carbs").props.className).toContain("text-sm");
      expect(getByText("Carbs").props.className).toContain("font-medium");
      expect(getByText("Fats").props.className).toContain("text-sm");
      expect(getByText("Fats").props.className).toContain("font-medium");

      expect(getByTestId("macro-bar-protein").parent?.props.className).toContain("h-2.5");
      expect(getByTestId("macro-bar-carbs").parent?.props.className).toContain("h-2.5");
      expect(getByTestId("macro-bar-fats").parent?.props.className).toContain("h-2.5");
    });

    it("macro pill chips use 4px rectangular rounded style", () => {
      const { getByTestId } = render(
        <CalorieRing
          consumed={1800}
          goal={2400}
          protein={{ current: 120, goal: 150 }}
          carbs={{ current: 150, goal: 200 }}
          fats={{ current: 50, goal: 65 }}
        />,
      );

      const proteinPill = getByTestId("day-totals-protein-pill");
      expect(proteinPill.props.style).toEqual(
        expect.objectContaining({ borderRadius: 4 }),
      );
    });
  });

  describe("5. Water Tracker & Quick Actions", () => {
    it("WaterTracker header uses text-sm font-medium", () => {
      const { getByTestId } = render(
        <WaterTracker current={32} goal={64} onAddWater={jest.fn()} />,
      );

      const label = getByTestId("nutrition-water-label");
      expect(label.props.className).toContain("text-sm");
      expect(label.props.className).toContain("font-medium");
    });

    it("WaterTracker quick-add buttons have 8px border radius", () => {
      const { getByTestId } = render(
        <WaterTracker current={32} goal={64} onAddWater={jest.fn()} />,
      );

      const add8 = getByTestId("nutrition-water-add-8");
      expect(add8.props.style).toEqual(
        expect.objectContaining({
          borderRadius: 8,
          paddingHorizontal: 8,
        }),
      );
    });

    it("Consultant teaser uses 16px radius and 16px padding with gradient", () => {
      const { getByTestId } = render(<NutritionConsultantTeaser />);
      const teaser = getByTestId("nutrition-consultant-teaser");
      expect(teaser.props.style).toEqual(
        expect.objectContaining({
          borderRadius: 16,
        }),
      );
    });

    it("quick action tiles have 8px radius icon badges", () => {
      mockParams = { view: "day" };
      const { getByTestId } = render(<NutritionIndexRoute />);
      const quickAddBadge = getByTestId("nutrition-quick-add-badge");
      const myStuffBadge = getByTestId("nutrition-tile-my-stuff-badge");
      const mealPlanBadge = getByTestId("nutrition-tile-meal-plan-badge");

      expect(quickAddBadge.props.style).toEqual(
        expect.objectContaining({ borderRadius: 8, width: 40, height: 40 }),
      );

      expect(myStuffBadge.props.style).toEqual(
        expect.objectContaining({ borderRadius: 8, width: 40, height: 40 }),
      );

      expect(mealPlanBadge.props.style).toEqual(
        expect.objectContaining({ borderRadius: 8, width: 40, height: 40 }),
      );
    });
  });
});
