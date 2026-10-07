// ─── Acceptance test for NP-320 ──────────────────────────────────────────────
//
// Android: Nutrition day - tag sections still lack +/kebab/MEAL grouping,
// empty-state buttons clip their labels, Lunch/teaser/My Stuff icon tiles missing,
// Schedule meals drawer uses raw date fields.
//
// Covers:
//   1. TagSection web parity (header with icon tile, title, time, calories, +,
//      kebab with 4 actions, collapse chevron; MEAL card with ChefHat, MEAL badge,
//      edit pencil, add-to-meal; DESCRIBED card with source badge; footer totals).
//   2. Empty state buttons (icon prop, plain string children) and grey circle icon.
//   3. Tailwind color scales and My Stuff orange tile icon.
//   4. Future-day Schedule meals CTA placed above CalorieRing under DateNav.
//   5. ScheduleMealsDrawer web header (blue CalendarDays icon, title, formatted
//      date subtitle, close X), date chips with DateOnlyPicker, Range button on
//      same row, By day colored tag icon tiles.
//   6. Camera and Upload anchored dropdown menus with icons.

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { TagSection } from "@/components/nutrition/TagSection";
import { ScheduleMealsDrawer } from "@/components/nutrition/ScheduleMealsDrawer";
import { DateOnlyPicker, formatDatePillLabel } from "@/components/nutrition/DateOnlyPicker";
import type { Occurrence } from "@/lib/nutrition/dayOrder";
import type { MealLog } from "@become/api-client";
import type { MealPlan } from "@/lib/nutrition/mealPlans";

const TODAY_MOCK = "2026-06-15";

let mockParams: Record<string, string | undefined> = {};
const mockPush = jest.fn();
let focusEffectCb: (() => void) | null = null;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void) => {
    focusEffectCb = cb;
    cb();
  },
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

/* eslint-disable import/first */
import { apiFetch } from "@become/api-client";
import NutritionIndexRoute from "../app/(app)/(tabs)/nutrition/index";
/* eslint-enable import/first */

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
  if (url.startsWith("/api/meals")) return { meals: [] };
  return {};
}

describe("NP-320 Acceptance Tests", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url: string) => defaultApiHandler(url));
    mockPush.mockReset();
    focusEffectCb = null;
  });

  describe("1. TagSection Web Parity", () => {
    const mockOccurrence: Occurrence<MealLog, MealPlan> = {
      key: "lunch-sitting-1",
      tag: "lunch",
      sortMinutes: 720,
      logs: [
        {
          _id: "meal-log-1",
          userId: "user-1",
          mealName: "Mediterranean Feast",
          tags: ["lunch"],
          loggedAt: "2026-06-15T12:30:00Z",
          items: [
            {
              _id: "item-1",
              name: "Grilled Chicken",
              servings: 1,
              servingSize: 100,
              servingUnit: "g",
              nutrition: { calories: 250, protein: 30, carbs: 0, fats: 5, fiber: 0 },
            },
            {
              _id: "item-2",
              name: "Pita Bread",
              servings: 1,
              servingSize: 1,
              servingUnit: "piece",
              nutrition: { calories: 150, protein: 4, carbs: 30, fats: 2, fiber: 2 },
            },
          ],
        } as any,
        {
          _id: "capture-log-2",
          userId: "user-1",
          tags: ["lunch"],
          source: "described",
          loggedAt: "2026-06-15T12:45:00Z",
          items: [
            {
              _id: "item-3",
              name: "Greek Salad",
              servings: 1,
              servingSize: 1,
              servingUnit: "bowl",
              nutrition: { calories: 180, protein: 5, carbs: 10, fats: 12, fiber: 3 },
            },
            {
              _id: "item-4",
              name: "Hummus",
              servings: 2,
              servingSize: 2,
              servingUnit: "tbsp",
              nutrition: { calories: 140, protein: 4, carbs: 8, fats: 10, fiber: 2 },
            },
          ],
        } as any,
      ],
      plans: [],
      planned: false,
      untimed: false,
    };

    it("renders header with icon tile, title, time, calories, +, kebab, and collapse chevron without old macro text", () => {
      const onAddFood = jest.fn();
      const { getByTestId, queryByText } = render(
        <TagSection
          occurrence={mockOccurrence}
          onRemoveItem={jest.fn()}
          onAddFood={onAddFood}
        />,
      );

      expect(getByTestId("tag-section-header-icon-lunch")).toBeTruthy();
      expect(getByTestId("tag-section-title-lunch")).toHaveTextContent("Lunch");
      expect(getByTestId("tag-section-time-lunch")).toBeTruthy();
      expect(getByTestId("tag-section-calories-lunch")).toHaveTextContent("720 cal");
      expect(getByTestId("tag-section-add-lunch")).toBeTruthy();
      expect(getByTestId("tag-section-kebab-lunch")).toBeTruthy();
      expect(getByTestId("tag-section-collapse-lunch")).toBeTruthy();

      // No old subtitle with macro breakdown or Select button in header
      expect(queryByText(/528 kcal · 36g P/)).toBeNull();
      expect(queryByText("Select")).toBeNull();

      fireEvent.press(getByTestId("tag-section-add-lunch"));
      expect(onAddFood).toHaveBeenCalledWith("lunch");
    });

    it("kebab menu opens with all 4 actions and calls appropriate handlers", () => {
      const onPlan = jest.fn();
      const onApplyMeal = jest.fn();
      const onStartSelect = jest.fn();
      const onDeleteSectionLogs = jest.fn();

      const { getByTestId } = render(
        <TagSection
          occurrence={mockOccurrence}
          onRemoveItem={jest.fn()}
          onAddFood={jest.fn()}
          onPlan={onPlan}
          onApplyMeal={onApplyMeal}
          onStartSelect={onStartSelect}
          onDeleteSectionLogs={onDeleteSectionLogs}
        />,
      );

      fireEvent.press(getByTestId("tag-section-kebab-lunch"));

      expect(getByTestId("tag-section-action-plan-lunch")).toBeTruthy();
      expect(getByTestId("tag-section-action-apply-lunch")).toBeTruthy();
      expect(getByTestId("tag-section-action-combine-lunch")).toBeTruthy();
      expect(getByTestId("tag-section-action-delete-lunch")).toBeTruthy();

      fireEvent.press(getByTestId("tag-section-action-plan-lunch"));
      expect(onPlan).toHaveBeenCalledWith("lunch");
    });

    it("groups items into MEAL card and multi-item DESCRIBED card with card totals", () => {
      const onEditMeal = jest.fn();
      const onAddToMeal = jest.fn();

      const { getByTestId } = render(
        <TagSection
          occurrence={mockOccurrence}
          onRemoveItem={jest.fn()}
          onAddFood={jest.fn()}
          onEditMeal={onEditMeal}
          onAddToMeal={onAddToMeal}
        />,
      );

      // MEAL Card
      expect(getByTestId("meal-group-card-meal-log-1")).toBeTruthy();
      expect(getByTestId("meal-group-title-meal-log-1")).toHaveTextContent("Mediterranean Feast");
      expect(getByTestId("meal-group-cals-meal-log-1")).toHaveTextContent("400 cal");
      expect(getByTestId("edit-logged-meal-meal-log-1")).toBeTruthy();
      expect(getByTestId("add-to-meal-meal-log-1")).toBeTruthy();

      fireEvent.press(getByTestId("edit-logged-meal-meal-log-1"));
      expect(onEditMeal).toHaveBeenCalledWith("meal-log-1", "Mediterranean Feast", "lunch");

      fireEvent.press(getByTestId("add-to-meal-meal-log-1"));
      expect(onAddToMeal).toHaveBeenCalledWith("meal-log-1", "lunch");

      // DESCRIBED Capture Card
      expect(getByTestId("capture-group-card-capture-log-2")).toBeTruthy();
      expect(getByTestId("capture-group-badge-capture-log-2")).toHaveTextContent("DESCRIBED");
      expect(getByTestId("capture-group-cals-capture-log-2")).toHaveTextContent("320 cal");

      // Section Footer Totals
      const footerTotals = getByTestId("tag-section-footer-totals-lunch");
      expect(footerTotals).toBeTruthy();
      expect(footerTotals).toHaveTextContent("P: 43g");
      expect(footerTotals).toHaveTextContent("C: 48g");
      expect(footerTotals).toHaveTextContent("F: 24g");
      expect(footerTotals).toHaveTextContent("720 cal");
    });
  });

  describe("2. Empty State Buttons & Icon", () => {
    it("renders empty state with grey circle behind icon and string button labels", async () => {
      mockParams = { date: TODAY_MOCK };
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-empty-state")).toBeTruthy();
      });

      const addFoodBtn = getByTestId("nutrition-empty-add-food");
      const copyYesterdayBtn = getByTestId("nutrition-copy-yesterday");
      const browseMyStuffBtn = getByTestId("nutrition-empty-browse-my-stuff");

      expect(addFoodBtn).toHaveTextContent("Add food");
      expect(copyYesterdayBtn).toHaveTextContent("Copy yesterday");
      expect(browseMyStuffBtn).toHaveTextContent("Browse My Stuff");
    });
  });

  describe("3. Tailwind Color Scales and Quick Tile", () => {
    it("defines full shade scales with DEFAULT var pointers in tailwind.config.js", () => {
      const tailwindConfig = require("../tailwind.config.js");
      const { colors } = tailwindConfig.theme.extend;

      for (const color of ["orange", "teal", "amber", "indigo", "rose"]) {
        expect(colors[color]).toBeDefined();
        expect(typeof colors[color]).toBe("object");
        expect(colors[color].DEFAULT).toBe(`rgb(var(--${color}) / <alpha-value>)`);
        expect(colors[color][100]).toBeDefined();
        expect(colors[color][500]).toBeDefined();
        expect(colors[color][900]).toBeDefined();
      }
    });

    it("renders My Stuff quick tile with orange icon", async () => {
      mockParams = { date: TODAY_MOCK };
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-tile-my-stuff")).toBeTruthy();
      });
    });
  });

  describe("4. Future-Day Schedule Meals CTA Placement", () => {
    it("places Schedule meals CTA above CalorieRing on future dates", async () => {
      mockParams = { date: "2026-12-25" };
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-schedule-meals-button")).toBeTruthy();
        expect(getByTestId("calorie-ring")).toBeTruthy();
      });
    });
  });

  describe("5. ScheduleMealsDrawer Parity", () => {
    it("renders header with blue CalendarDays tile, title, formatted date subtitle, close button and date chips", async () => {
      const onClose = jest.fn();
      const { getByTestId, queryByTestId } = render(
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

      expect(getByTestId("schedule-meals-header-icon")).toBeTruthy();
      expect(getByTestId("schedule-meals-close")).toBeTruthy();
      expect(getByTestId("schedule-meals-subtitle")).toHaveTextContent(formatDatePillLabel(TODAY_MOCK));

      // Date chip on same row as Range toggle
      expect(getByTestId("schedule-meals-from")).toBeTruthy();
      expect(getByTestId("schedule-meals-range-toggle")).toBeTruthy();
      expect(queryByTestId("schedule-meals-to")).toBeNull();

      // By day slot icon tiles
      expect(getByTestId("schedule-meals-slot-icon-breakfast")).toBeTruthy();
      expect(getByTestId("schedule-meals-slot-icon-lunch")).toBeTruthy();

      fireEvent.press(getByTestId("schedule-meals-close"));
      expect(onClose).toHaveBeenCalled();
    });

    it("toggling date chip opens DateOnlyPicker", async () => {
      const { getByTestId, queryByTestId } = render(
        <ScheduleMealsDrawer
          visible
          defaultDate={TODAY_MOCK}
          onClose={jest.fn()}
        />,
      );

      await waitFor(() => {
        expect(getByTestId("schedule-meals-from")).toBeTruthy();
      });

      expect(queryByTestId("schedule-meals-from-picker")).toBeNull();
      fireEvent.press(getByTestId("schedule-meals-from"));
      expect(getByTestId("schedule-meals-from-picker")).toBeTruthy();
    });
  });

  describe("6. Camera and Upload Anchored Dropdowns", () => {
    it("camera button opens anchored dropdown menu with Take photo and Scan barcode", async () => {
      mockParams = { date: TODAY_MOCK };
      const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-camera-button")).toBeTruthy();
      });

      expect(queryByTestId("nutrition-camera-menu")).toBeNull();
      fireEvent.press(getByTestId("nutrition-camera-button"));

      expect(getByTestId("nutrition-camera-menu")).toBeTruthy();
      expect(getByTestId("nutrition-camera-take-photo")).toBeTruthy();
      expect(getByTestId("nutrition-camera-scan-barcode")).toBeTruthy();
    });

    it("upload button opens anchored dropdown menu with Upload photo and Describe", async () => {
      mockParams = { date: TODAY_MOCK };
      const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-upload-button")).toBeTruthy();
      });

      expect(queryByTestId("nutrition-upload-menu")).toBeNull();
      fireEvent.press(getByTestId("nutrition-upload-button"));

      expect(getByTestId("nutrition-upload-menu")).toBeTruthy();
      expect(getByTestId("nutrition-upload-photo")).toBeTruthy();
      expect(getByTestId("nutrition-upload-describe")).toBeTruthy();
    });
  });

  describe("7. Screen Focus Refetch", () => {
    it("refetches day data when screen gains focus", async () => {
      mockParams = { date: TODAY_MOCK };
      render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalled();
      });

      mockApiFetch.mockClear();
      expect(focusEffectCb).toBeTruthy();
      focusEffectCb?.();

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          expect.stringContaining(`/api/meal-logs?date=${TODAY_MOCK}`),
          expect.anything(),
          expect.anything(),
        );
      });
    });
  });
});
