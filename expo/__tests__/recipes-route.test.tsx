/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

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
import RecipesIndexRoute from "../app/(tabs)/nutrition/recipes/index";
import RecipeDetailRoute from "../app/(tabs)/nutrition/recipes/[id]";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const recipe = {
  _id: "r1",
  name: "Protein Oats",
  description: "Quick breakfast",
  servings: 2,
  nutrition: { calories: 450, protein: 30, carbs: 50, fats: 12 },
  ingredients: [
    { name: "Oats", amount: 80, unit: "g", nutrition: { calories: 300, protein: 10, carbs: 50, fats: 5 } },
  ],
  instructions: ["Mix", "Microwave"],
};

function callsTo(path: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => String(c[0]) === path);
}

describe("RecipesIndexRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockApiFetch.mockResolvedValue({ recipes: [recipe], total: 1 });
  });

  it("GETs /api/nutrition/recipes with baseUrl + token and renders the list", async () => {
    const { getByTestId } = render(<RecipesIndexRoute />);
    await waitFor(() => {
      expect(callsTo("/api/nutrition/recipes").length).toBeGreaterThan(0);
    });
    const opts = callsTo("/api/nutrition/recipes")[0]![2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);

    await waitFor(() => {
      expect(getByTestId("recipes-list-item-r1")).toBeTruthy();
    });
    fireEvent.press(getByTestId("recipes-list-item-r1"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/nutrition/recipes/r1");
  });
});

describe("RecipeDetailRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockParams = { id: "r1" };
    // Detail endpoint returns the recipe doc directly (unwrapped).
    mockApiFetch.mockResolvedValue(recipe);
  });

  it("GETs /api/nutrition/recipes/[id] with baseUrl and renders real data", async () => {
    const { getByTestId } = render(<RecipeDetailRoute />);
    await waitFor(() => {
      expect(callsTo("/api/nutrition/recipes/r1").length).toBeGreaterThan(0);
    });
    const opts = callsTo("/api/nutrition/recipes/r1")[0]![2] as {
      baseUrl?: string;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));

    await waitFor(() => {
      expect(getByTestId("recipe-detail-name").props.children).toBe(
        "Protein Oats",
      );
    });
    const kcal = getByTestId("recipe-detail-nutrition-kcal").props.children;
    expect(Array.isArray(kcal) ? kcal.join("") : kcal).toContain("450");
  });
});
