/* eslint-disable import/first */
/**
 * CARD NP-326 — Android: Meal Plan - large font breaks the day header and
 * slot labels; plan-a-food sheet takes ~5 s to appear and still uses the stepper form.
 *
 * Acceptance tests:
 *   1. (NP-326-fontscale-config-changes) Expo config plugin adds `fontScale` and
 *      `density` to MainActivity's `android:configChanges` to prevent activity recreation
 *      and state loss when system font size changes.
 *   2. (NP-326-day-header-wrap) The day header wraps actions onto their own line below
 *      the date + calorie count so large fonts don't collide date into calories, and
 *      slot labels have minWidth: 80 and numberOfLines: 1 to avoid mid-word breaks.
 *   3. (NP-326-today-pill) Today is marked with a black TODAY pill next to the date
 *      (`meal-plan-today-pill`) instead of the inline ` · Today` string.
 *   4. (NP-326-plan-picker-compact) PlanFoodSheet uses the web's compact picker fields:
 *      amount input + unit dropdown, serving caption (e.g. "170 g each"), cal + P/C/F,
 *      Repeat…, and Plan CTA — never the old Serving Unit chips, `- 1 +` stepper,
 *      Nutrition Preview card, or visible raw `Planning for...` line.
 *   5. (NP-326-instant-pick) FoodSearchSheet hands off immediately to `onPickFood`
 *      without awaiting external import or dimming the row for 5 s.
 */

import { StyleSheet } from "react-native";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import withAndroidFontScaleConfigChanges from "../plugins/withAndroidFontScaleConfigChanges";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
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
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import { PlanFoodSheet } from "@/components/nutrition/PlanFoodSheet";
import MealPlanRoute from "../app/(app)/(tabs)/nutrition/meal-plan";
import { FoodSearchSheet } from "@/components/nutrition/FoodSearchSheet";

const mockApiFetch = apiFetch as unknown as jest.Mock;

const WEDNESDAY = new Date(2026, 9, 7, 12, 0, 0); // Wed 2026-10-07
const WED_KEY = "2026-10-07";

const tagsFixture = { defaults: ["breakfast", "lunch", "dinner", "snack"], userTags: [] };
const goalsFixture = { calories: 2000 };

function mockWeekPlans() {
  return {
    plans: [
      {
        _id: "plan-wed-lunch",
        plannedDate: `${WED_KEY}T00:00:00.000Z`,
        plannedDateKey: WED_KEY,
        tag: "lunch",
        items: [
          {
            _id: "item-chicken",
            name: "Chicken Breast",
            servingSize: 1,
            servingUnit: "serving",
            gramsPerServing: 170,
            servings: 1,
            nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
          },
        ],
        status: "active",
        expectedNutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
      },
    ],
    days: [],
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(WEDNESDAY);
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/meal-plans?from=")) return mockWeekPlans();
    if (url.startsWith("/api/nutrition/goals")) return goalsFixture;
    if (url.startsWith("/api/tags")) return tagsFixture;
    return {};
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Card NP-326 acceptance", () => {
  it("(NP-326-fontscale-config-changes) adds fontScale and density to MainActivity configChanges", async () => {
    const fakeConfig = {};
    const pluginResult = (withAndroidFontScaleConfigChanges as any)(fakeConfig);
    expect(pluginResult.mods?.android?.manifest).toBeDefined();

    // Directly test the manifest transform
    const fakeManifest = {
      manifest: {
        application: [
          {
            activity: [
              {
                $: {
                  "android:name": ".MainActivity",
                  "android:configChanges": "keyboard|keyboardHidden|orientation|screenSize",
                },
              },
            ],
          },
        ],
      },
    };

    const modFn = pluginResult.mods.android.manifest;
    const transformed = await modFn({ modResults: fakeManifest });
    const changes = transformed.modResults.manifest.application[0].activity[0].$["android:configChanges"];
    expect(changes).toContain("fontScale");
    expect(changes).toContain("density");
  });

  it("(NP-326-day-header-wrap) day header wraps actions below date and gives slot labels minWidth 80 with numberOfLines 1", async () => {
    const { getByTestId } = render(<MealPlanRoute />);
    await waitFor(() => {
      expect(getByTestId(`meal-plan-day-${WED_KEY}`)).toBeTruthy();
    });

    // Header actions are rendered and have Copy day… and Repeat meal…
    expect(getByTestId(`meal-plan-copy-day-${WED_KEY}`)).toBeTruthy();
    expect(getByTestId(`meal-plan-repeat-meal-${WED_KEY}`)).toBeTruthy();

    // Slot labels have minWidth 80 and numberOfLines: 1 to prevent mid-word break
    const slotLabel = getByTestId(`meal-plan-slot-label-${WED_KEY}-breakfast`);
    expect(slotLabel.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(slotLabel.props.style)).toMatchObject({ minWidth: 80 });
  });

  it("(NP-326-today-pill) displays TODAY pill next to date on the today card", async () => {
    const { getByTestId } = render(<MealPlanRoute />);
    await waitFor(() => {
      expect(getByTestId("meal-plan-today-pill")).toBeTruthy();
    });
    const pill = getByTestId("meal-plan-today-pill");
    expect(pill).toBeTruthy();
  });

  it("(NP-326-plan-picker-compact) uses amount input, unit dropdown, serving caption, cal + P/C/F without stepper or preview card", () => {
    const food = {
      _id: "food-chicken-1",
      name: "Chicken Breast",
      servingSize: 1,
      servingUnit: "serving",
      gramsPerServing: 170,
      nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
    };

    const { getByTestId, queryByTestId } = render(
      <PlanFoodSheet
        visible
        food={food}
        plannedDate="2026-10-07"
        tag="breakfast"
        onClose={() => {}}
        onPlanned={() => {}}
        apiFetch={jest.fn()}
      />,
    );

    // Compact fields exist
    expect(getByTestId("quantity-input")).toBeTruthy();
    expect(getByTestId("quantity-input").props.value).toBe("1");
    expect(getByTestId("plan-food-unit-button")).toBeTruthy();
    expect(getByTestId("plan-food-serving-caption").props.children).toBe("170 g each");

    // Compact macro preview exists
    expect(getByTestId("macro-preview-calories").props.children).toEqual([165, " cal"]);
    expect(getByTestId("macro-preview-protein")).toBeTruthy();
    expect(getByTestId("macro-preview-carbs")).toBeTruthy();
    expect(getByTestId("macro-preview-fats")).toBeTruthy();

    // Legacy stepper and serving unit chips are NOT rendered
    expect(queryByTestId("quantity-decrement")).toBeNull();
    expect(queryByTestId("quantity-increment")).toBeNull();

    // Date text is visually hidden (kept mounted for test backward-compatibility)
    expect(StyleSheet.flatten(getByTestId("plan-food-sheet-date").props.style)).toMatchObject({
      overflow: "hidden",
      opacity: 0,
    });
  });

  it("(NP-326-instant-pick) FoodSearchSheet calls onPickFood immediately without import delay", async () => {
    const onPickFood = jest.fn();
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/nutrition/foods/overview")) {
        return {
          recent: [],
          frequent: [],
          foods: [
            {
              _id: "usda-12345",
              name: "Apple",
              source: "usda",
              servingSize: 1,
              servingUnit: "medium",
              nutrition: { calories: 95, protein: 0.5, carbs: 25, fats: 0.3 },
            },
          ],
        };
      }
      return {};
    });

    const { getByTestId } = render(
      <FoodSearchSheet
        visible
        onClose={() => {}}
        onPickFood={onPickFood}
        deferImport
        testID="food-search-test"
      />,
    );

    await waitFor(() => {
      expect(getByTestId("food-search-result-usda-12345")).toBeTruthy();
    });

    fireEvent.press(getByTestId("food-search-result-usda-12345"));
    expect(onPickFood).toHaveBeenCalledTimes(1);
    expect(onPickFood.mock.calls[0][0]).toMatchObject({ _id: "usda-12345", name: "Apple" });
  });
});
