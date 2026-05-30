/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: mockToken,
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
import { WEBAPP_BASE_URL } from "@/lib/config";
import NutritionSearchRoute from "../app/(tabs)/nutrition/search";
import FoodDetailRoute from "../app/(tabs)/nutrition/food/[id]";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function callsStarting(path: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => String(c[0]).startsWith(path));
}
function findCall(path: string, method: string): unknown[] | undefined {
  return mockApiFetch.mock.calls.find(
    (c) =>
      String(c[0]).startsWith(path) &&
      (c[2] as { method?: string }).method === method,
  );
}

describe("NutritionSearchRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockApiFetch.mockResolvedValue({
      foods: [
        { _id: "db1", name: "Oats", source: "manual", nutrition: { calories: 380 } },
        { id: "usda-9", name: "Banana", source: "usda", calories: 89 },
      ],
    });
  });

  it("debounces, then GETs /api/nutrition/foods?q=… with baseUrl + token", async () => {
    const { getByTestId } = render(<NutritionSearchRoute />);
    fireEvent.changeText(getByTestId("food-search-input"), "banana");
    // Debounce not elapsed → no request yet.
    expect(callsStarting("/api/nutrition/foods").length).toBe(0);

    await waitFor(() => {
      expect(callsStarting("/api/nutrition/foods").length).toBeGreaterThan(0);
    });
    const call = callsStarting("/api/nutrition/foods")[0]!;
    expect(String(call[0])).toBe("/api/nutrition/foods?q=banana");
    const opts = call[2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);

    await waitFor(() => {
      expect(getByTestId("food-search-result-usda-9")).toBeTruthy();
    });
  });
});

describe("FoodDetailRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockParams = { id: "usda-9" };
    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (String(path).startsWith("/api/nutrition/foods/") && !method) {
        return Promise.resolve({
          food: {
            _id: "usda-9",
            name: "Banana",
            category: "fruit",
            source: "usda",
            nutrition: { calories: 89, protein: 1, carbs: 23, fats: 0 },
          },
        });
      }
      return Promise.resolve({ success: true });
    });
  });

  it("GETs the food detail and, on save, POSTs save-food then add-to-log", async () => {
    const { getByTestId } = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(
        callsStarting("/api/nutrition/foods/usda-9").length,
      ).toBeGreaterThan(0);
    });
    expect(getByTestId("nutrition-food-name").props.children).toBe("Banana");

    // Pick a meal and confirm.
    fireEvent.press(getByTestId("save-as-meal-open"));
    fireEvent.press(getByTestId("save-as-meal-option-lunch"));
    await act(async () => {
      fireEvent.press(getByTestId("save-as-meal-confirm"));
    });

    // USDA food → save-food POST fires first.
    await waitFor(() => {
      expect(findCall("/api/nutrition/foods", "POST")).toBeTruthy();
    });
    const save = findCall("/api/nutrition/foods", "POST")!;
    expect(save[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: {
          name: "Banana",
          category: "fruit",
          nutrition: { calories: 89, protein: 1, carbs: 23, fats: 0 },
          source: "usda",
        },
      }),
    );

    // …then add-to-log POST.
    await waitFor(() => {
      expect(findCall("/api/nutrition/log", "POST")).toBeTruthy();
    });
    const add = findCall("/api/nutrition/log", "POST")!;
    const body = (add[2] as { body?: Record<string, unknown> }).body!;
    expect(body.mealType).toBe("lunch");
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.food).toEqual(
      expect.objectContaining({
        name: "Banana",
        nutrition: { calories: 89, protein: 1, carbs: 23, fats: 0 },
      }),
    );
  });
});
