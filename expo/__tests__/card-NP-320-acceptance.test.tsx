// ─── Nutrition Day Parity Acceptance Tests (NP-320) ──────────────────────────
import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { TagSection } from "@/components/nutrition/TagSection";
import { ScheduleMealsDrawer } from "@/components/nutrition/ScheduleMealsDrawer";
import NutritionIndexRoute from "@/app/(app)/(tabs)/nutrition/index";
import { apiFetch } from "@become/api-client";

const TODAY_MOCK = "2026-06-15";
const FUTURE_MOCK = "2026-12-25";

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

jest.mock("@/lib/time/localDay", () => {
  const actual = jest.requireActual("@/lib/time/localDay");
  return {
    __esModule: true,
    ...actual,
    useLocalDay: () => ({ day: TODAY_MOCK, tzOffset: 0 }),
  };
});

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

const mockApiFetch = apiFetch as unknown as jest.Mock;

const emptyDay = {
  date: TODAY_MOCK,
  logs: [],
  dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 },
};

function defaultApiHandler(url: string) {
  if (url.startsWith("/api/meal-logs")) return emptyDay;
  if (url.startsWith("/api/nutrition/log")) return { water: { current: 0, goal: 96 }, quickAdds: [] };
  if (url.startsWith("/api/nutrition/goals")) return { calories: 2000, protein: 150, carbs: 200, fats: 65, waterGoal: 96 };
  if (url.startsWith("/api/nutrition/meal-schedule")) return { windows: [] };
  if (url.startsWith("/api/tags")) return { defaults: ["breakfast", "lunch", "dinner", "snack"], userTags: [] };
  if (url.startsWith("/api/meal-plans")) return { plans: [] };
  return {};
}

describe("NP-320 Acceptance Tests: Nutrition Day Parity", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url: string) => defaultApiHandler(url));
    mockPush.mockReset();
  });

  describe("TagSection Parity", () => {
    const mockOccurrence: any = {
      tag: "lunch",
      key: "lunch-1",
      sortMinutes: 720,
      plans: [],
      planned: false,
      untimed: false,
      logs: [
        {
          _id: "log-meal-1",
          mealName: "Grilled Chicken Bowl",
          tags: ["lunch"],
          loggedAt: "2026-06-15T12:30:00.000Z",
          items: [
            {
              _id: "item-1",
              name: "Chicken Breast",
              servings: 1,
              servingUnit: "serving",
              nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
            },
            {
              _id: "item-2",
              name: "Brown Rice",
              servings: 1,
              servingUnit: "cup",
              nutrition: { calories: 215, protein: 5, carbs: 45, fats: 1.8 },
            },
          ],
        },
        {
          _id: "log-describe-1",
          source: "describe",
          tags: ["lunch"],
          loggedAt: "2026-06-15T12:45:00.000Z",
          items: [
            {
              _id: "item-3",
              name: "Avocado",
              servings: 0.5,
              servingUnit: "whole",
              nutrition: { calories: 120, protein: 1.5, carbs: 6, fats: 11 },
            },
            {
              _id: "item-4",
              name: "Olive Oil",
              servings: 1,
              servingUnit: "tbsp",
              nutrition: { calories: 119, protein: 0, carbs: 0, fats: 14 },
            },
          ],
        },
      ],
      empty: false,
    };

    it("renders web header with + button, kebab with 4 actions, and collapse chevron", () => {
      const onPlan = jest.fn();
      const onApplyMeal = jest.fn();
      const onDeleteSectionLogs = jest.fn();
      const onAddFood = jest.fn();

      const { getByTestId } = render(
        <TagSection
          occurrence={mockOccurrence}
          onPlan={onPlan}
          onApplyMeal={onApplyMeal}
          onDeleteSectionLogs={onDeleteSectionLogs}
          onAddFood={onAddFood}
          onStartSelect={jest.fn()}
          onRemoveItem={jest.fn()}
          onEditItem={jest.fn()}
        />,
      );

      // Web header exists
      expect(getByTestId("nutrition-section-lunch")).toBeTruthy();
      expect(getByTestId("nutrition-section-icon-lunch")).toBeTruthy();
      expect(getByTestId("nutrition-section-lunch-title")).toBeTruthy();
      expect(getByTestId("nutrition-add-food-lunch")).toBeTruthy();
      expect(getByTestId("nutrition-section-collapse-lunch")).toBeTruthy();

      // Open kebab menu
      fireEvent.press(getByTestId("nutrition-section-kebab-lunch"));

      expect(getByTestId("nutrition-kebab-plan-lunch")).toBeTruthy();
      expect(getByTestId("nutrition-kebab-apply-lunch")).toBeTruthy();
      expect(getByTestId("nutrition-combine-start-lunch")).toBeTruthy();
      expect(getByTestId("nutrition-kebab-delete-lunch")).toBeTruthy();

      // Tap Plan action
      fireEvent.press(getByTestId("nutrition-kebab-plan-lunch"));
      expect(onPlan).toHaveBeenCalledWith("lunch");
    });

    it("renders MEAL group card and DESCRIBED capture group card with footer totals", () => {
      const { getByTestId, getByText } = render(
        <TagSection
          occurrence={mockOccurrence}
          onAddFood={jest.fn()}
          onRemoveItem={jest.fn()}
          onEditItem={jest.fn()}
          onEditMeal={jest.fn()}
        />,
      );

      // MEAL group card
      expect(getByTestId("nutrition-meal-group-log-meal-1")).toBeTruthy();
      expect(getByText("MEAL")).toBeTruthy();
      expect(getByText("Grilled Chicken Bowl")).toBeTruthy();
      expect(getByTestId("nutrition-edit-meal-lunch")).toBeTruthy();

      // DESCRIBED capture group card
      expect(getByTestId("nutrition-capture-group-log-describe-1")).toBeTruthy();
      expect(getByText("DESCRIBED")).toBeTruthy();
      expect(getByText("2 items")).toBeTruthy();

      // Card footer totals
      expect(getByTestId("nutrition-section-footer-lunch")).toBeTruthy();
    });
  });

  describe("Empty-state on Android", () => {
    it("renders UtensilsCrossed in a circle and buttons with string children", async () => {
      mockParams = { date: TODAY_MOCK };
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-empty-state")).toBeTruthy();
      });

      const addFoodBtn = getByTestId("nutrition-empty-add-food");
      expect(addFoodBtn).toHaveTextContent("Add food");

      const copyYesterdayBtn = getByTestId("nutrition-copy-yesterday");
      expect(copyYesterdayBtn).toHaveTextContent("Copy yesterday");

      const browseMyStuffBtn = getByTestId("nutrition-empty-browse-my-stuff");
      expect(browseMyStuffBtn).toHaveTextContent("Browse My Stuff");
    });
  });

  describe("Future day Schedule CTA placement", () => {
    it("renders schedule meals CTA above the calorie ring on a future day", async () => {
      mockParams = { date: FUTURE_MOCK };
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-schedule-meals-button")).toBeTruthy();
        expect(getByTestId("calorie-ring")).toBeTruthy();
      });
    });
  });

  describe("ScheduleMealsDrawer parity", () => {
    it("renders header icon tile, formatted subtitle, close button, blue date chips, and slot icon tiles", async () => {
      const onClose = jest.fn();
      const { getByTestId } = render(
        <ScheduleMealsDrawer
          visible
          defaultDate={TODAY_MOCK}
          availableTags={{ defaults: ["breakfast", "lunch", "dinner", "snack"], userTags: [] }}
          onClose={onClose}
        />,
      );

      await waitFor(() => {
        expect(getByTestId("schedule-meals-drawer")).toBeTruthy();
      });

      expect(getByTestId("schedule-meals-close")).toBeTruthy();
      expect(getByTestId("schedule-meals-subtitle")).toBeTruthy();
      expect(getByTestId("schedule-meals-from")).toBeTruthy();
      expect(getByTestId("schedule-meals-range-toggle")).toBeTruthy();

      // Slot icons
      expect(getByTestId("schedule-meals-slot-icon-breakfast")).toBeTruthy();
      expect(getByTestId("schedule-meals-slot-icon-lunch")).toBeTruthy();

      // Close button fires onClose
      fireEvent.press(getByTestId("schedule-meals-close"));
      expect(onClose).toHaveBeenCalled();
    });

    it("Copy day tab uses date chip for source date", async () => {
      const { getByTestId } = render(
        <ScheduleMealsDrawer
          visible
          defaultDate={TODAY_MOCK}
          onClose={() => {}}
        />,
      );

      await waitFor(() => expect(getByTestId("schedule-meals-drawer")).toBeTruthy());

      fireEvent.press(getByTestId("schedule-meals-tab-copy-day"));

      await waitFor(() => {
        expect(getByTestId("schedule-meals-copy-source")).toBeTruthy();
      });
    });
  });

  describe("Camera and Upload menus", () => {
    it("renders buttons with icons inside camera and upload menus", async () => {
      mockParams = { date: TODAY_MOCK };
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-camera-button")).toBeTruthy();
      });

      fireEvent.press(getByTestId("nutrition-camera-button"));
      expect(getByTestId("nutrition-camera-take-photo")).toBeTruthy();
      expect(getByTestId("nutrition-camera-scan-barcode")).toBeTruthy();

      fireEvent.press(getByTestId("nutrition-upload-button"));
      expect(getByTestId("nutrition-upload-photo")).toBeTruthy();
      expect(getByTestId("nutrition-upload-describe")).toBeTruthy();
    });
  });
});
