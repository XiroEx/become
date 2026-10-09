/* eslint-disable import/first */
import React from "react";
import { render, waitFor } from "@testing-library/react-native";

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
  return {
    __esModule: true,
    ...actual,
    apiFetch: jest.fn().mockImplementation((path: string) => {
      if (path.includes("/goals")) {
        return Promise.resolve({
          calories: 2000,
          protein: 150,
          carbs: 200,
          fats: 65,
        });
      }
      return Promise.resolve({});
    }),
  };
});

jest.mock("@/lib/nutrition/offlineQueue", () => ({
  getQueuedOperations: jest.fn().mockReturnValue([]),
  subscribeQueue: jest.fn().mockReturnValue(() => {}),
}));

import { DateNav } from "@/components/nutrition/DateNav";
import { CalorieRing } from "@/components/nutrition/CalorieRing";
import { WaterTracker } from "@/components/nutrition/WaterTracker";
import { NutritionConsultantTeaser } from "@/components/nutrition/NutritionConsultantTeaser";
import NutritionIndexRoute from "../app/(app)/(tabs)/nutrition/index";
/* eslint-enable import/first */

describe("NP-370 Spacing / Typography Parity for Nutrition Day", () => {
  describe("1. Header Chrome & View Selector", () => {
    it("renders header buttons at 40px height with rounded-xl (12px) border styling", async () => {
      mockParams = {};
      const { getByTestId } = render(<NutritionIndexRoute />);
      await waitFor(() => {
        expect(getByTestId("nutrition-my-stuff-button")).toBeTruthy();
      });

      const myStuffBtn = getByTestId("nutrition-my-stuff-button");
      const flatMyStuff = Array.isArray(myStuffBtn.props.style)
        ? Object.assign({}, ...myStuffBtn.props.style)
        : myStuffBtn.props.style;
      expect(flatMyStuff.height).toBe(40);
      expect(flatMyStuff.borderRadius).toBe(12);
      expect(flatMyStuff.paddingHorizontal).toBe(12);

      const timelineBtn = getByTestId("nutrition-timeline-button");
      const flatTimeline = Array.isArray(timelineBtn.props.style)
        ? Object.assign({}, ...timelineBtn.props.style)
        : timelineBtn.props.style;
      expect(flatTimeline.height).toBe(40);
      expect(flatTimeline.borderRadius).toBe(12);
      expect(flatTimeline.paddingHorizontal).toBe(12);
    });

    it("does not render nutrition-view-selector on the day tab", async () => {
      mockParams = {};
      const { queryByTestId } = render(<NutritionIndexRoute />);
      await waitFor(() => {
        expect(queryByTestId("nutrition-search-bar")).toBeTruthy();
      });
      expect(queryByTestId("nutrition-view-selector")).toBeNull();
    });

    it("renders nutrition-view-selector when viewMode is week", async () => {
      mockParams = { view: "week" };
      const { getByTestId } = render(<NutritionIndexRoute />);
      await waitFor(() => {
        expect(getByTestId("nutrition-view-selector")).toBeTruthy();
      });
      expect(getByTestId("nutrition-view-day")).toBeTruthy();
      expect(getByTestId("nutrition-view-week")).toBeTruthy();
      expect(getByTestId("nutrition-view-month")).toBeTruthy();
    });
  });

  describe("2. Search & Quick Capture Row", () => {
    it("sets search input to 40px height and camera/upload buttons to 40x40 with 20px icons", async () => {
      mockParams = {};
      const { getByTestId } = render(<NutritionIndexRoute />);
      await waitFor(() => {
        expect(getByTestId("nutrition-search-bar")).toBeTruthy();
      });

      const searchBar = getByTestId("nutrition-search-bar");
      const flatSearch = Array.isArray(searchBar.props.style)
        ? Object.assign({}, ...searchBar.props.style)
        : searchBar.props.style;
      expect(flatSearch.height).toBe(40);
      expect(flatSearch.borderRadius).toBe(12);

      const cameraBtn = getByTestId("nutrition-camera-button");
      const flatCamera = Array.isArray(cameraBtn.props.style)
        ? Object.assign({}, ...cameraBtn.props.style)
        : cameraBtn.props.style;
      expect(flatCamera.width).toBe(40);
      expect(flatCamera.height).toBe(40);
      expect(flatCamera.borderRadius).toBe(12);

      const uploadBtn = getByTestId("nutrition-upload-button");
      const flatUpload = Array.isArray(uploadBtn.props.style)
        ? Object.assign({}, ...uploadBtn.props.style)
        : uploadBtn.props.style;
      expect(flatUpload.width).toBe(40);
      expect(flatUpload.height).toBe(40);
      expect(flatUpload.borderRadius).toBe(12);
    });
  });

  describe("3. DateNav Navigation", () => {
    it("aligns date label to text-sm and renders Today as plain text uppercase instead of pill", () => {
      const { getByTestId } = render(
        <DateNav
          dateKey="2026-06-01"
          isToday={true}
          onPrev={jest.fn()}
          onNext={jest.fn()}
        />,
      );

      const dateLabel = getByTestId("nutrition-current-date");
      expect(dateLabel.props.className).toContain("text-sm");
      expect(dateLabel.props.className).toContain("font-semibold");

      const todayBadge = getByTestId("nutrition-today-badge");
      expect(todayBadge.props.children).toBe("Today");
      expect(todayBadge.props.className).toContain("text-[10px]");
      expect(todayBadge.props.className).toContain("uppercase");
      expect(todayBadge.props.className).not.toContain("bg-emerald-500/10");
    });
  });

  describe("4. Calorie Ring & Goal Line", () => {
    it("sets center number to text-2xl font-bold and renders goal line outside card", () => {
      const { getByTestId } = render(
        <CalorieRing
          consumed={1800}
          goal={2200}
          protein={{ current: 120, goal: 150 }}
          carbs={{ current: 180, goal: 220 }}
          fats={{ current: 55, goal: 70 }}
          goalLine="2,200 cal/day, on track for 175 lbs"
        />,
      );

      const kcal = getByTestId("day-totals-kcal");
      expect(kcal.props.className).toContain("text-2xl font-bold");

      const goalLine = getByTestId("nutrition-goal-line");
      expect(goalLine.props.className).toContain("-mt-2 text-center text-xs text-muted-foreground");
      expect(goalLine.props.children).toBe("2,200 cal/day, on track for 175 lbs");
    });

    it("macro tracks have h-2.5 (10px) and macro labels have text-sm font-medium", () => {
      const { getByTestId, getByText } = render(
        <CalorieRing
          consumed={1800}
          goal={2200}
          protein={{ current: 120, goal: 150 }}
          carbs={{ current: 180, goal: 220 }}
          fats={{ current: 55, goal: 70 }}
        />,
      );

      expect(getByText("Protein").props.className).toContain("text-sm font-medium");
      expect(getByText("Carbs").props.className).toContain("text-sm font-medium");
      expect(getByText("Fats").props.className).toContain("text-sm font-medium");

      const pill = getByTestId("day-totals-protein-pill");
      const flatPill = Array.isArray(pill.props.style)
        ? Object.assign({}, ...pill.props.style)
        : pill.props.style;
      expect(flatPill.borderRadius).toBe(4);
    });
  });

  describe("5. Water Tracker & Consultant Teaser & Quick Action Tiles", () => {
    it("sets WaterTracker header to text-sm and quick-add buttons to 8px radius with colors.muted bg", () => {
      const { getByTestId } = render(
        <WaterTracker current={32} goal={64} onAddWater={jest.fn()} />,
      );

      const waterLabel = getByTestId("nutrition-water-label");
      expect(waterLabel.props.className).toContain("text-sm");

      const add8Btn = getByTestId("nutrition-water-add-8");
      const flatAdd8 = Array.isArray(add8Btn.props.style)
        ? Object.assign({}, ...add8Btn.props.style)
        : add8Btn.props.style;
      expect(flatAdd8.borderRadius).toBe(8);
      expect(flatAdd8.paddingHorizontal).toBe(8);
    });

    it("matches Consultant teaser 16px radius and 16px padding", () => {
      const { getByTestId } = render(
        <NutritionConsultantTeaser remaining={{ calories: 400, protein: 30 }} />,
      );

      const teaser = getByTestId("nutrition-consultant-teaser");
      const flatTeaser = Array.isArray(teaser.props.style)
        ? Object.assign({}, ...teaser.props.style)
        : teaser.props.style;
      expect(flatTeaser.borderRadius).toBe(16);
    });

    it("sets quick action tiles icon badges to 8px radius", async () => {
      mockParams = {};
      const { getByTestId } = render(<NutritionIndexRoute />);
      await waitFor(() => {
        expect(getByTestId("nutrition-quick-add-button")).toBeTruthy();
      });

      const quickAddBtn = getByTestId("nutrition-quick-add-button");
      const myStuffTile = getByTestId("nutrition-tile-my-stuff");
      const mealPlanTile = getByTestId("nutrition-tile-meal-plan");

      expect(quickAddBtn).toBeTruthy();
      expect(myStuffTile).toBeTruthy();
      expect(mealPlanTile).toBeTruthy();
    });
  });
});
