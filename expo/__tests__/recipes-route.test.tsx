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
import RecipesIndexRoute from "../app/(app)/(tabs)/nutrition/recipes/index";
import RecipeDetailRoute from "../app/(app)/(tabs)/nutrition/recipes/[id]";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const recipe = {
  _id: "r1",
  name: "Protein Oats",
  description: "Quick breakfast",
  servings: 2,
  // Where the web really keeps a recipe's macros (webapp/models/Recipe.ts).
  totalsPerServing: { calories: 210, protein: 17, carbs: 26.5, fats: 3.5 },
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
    mockApiFetch.mockImplementation(async (path: string) => {
      if (String(path).startsWith("/api/nutrition/recipes")) {
        return { recipes: [recipe], total: 1 };
      }
      if (String(path).startsWith("/api/meals")) return { meals: [], total: 0 };
      if (String(path) === "/api/me/foods") return { foods: [] };
      if (String(path) === "/api/tags") {
        return { defaults: [], userTags: [] };
      }
      if (String(path) === "/api/nutrition/meal-schedule") return { windows: [] };
      return {};
    });
  });

  it("GETs /api/nutrition/recipes with baseUrl + token and renders the list", async () => {
    const { getByTestId } = render(<RecipesIndexRoute />);
    // My Stuff (NP-142) defaults to the Meals tab; the member's own recipes
    // live behind the Recipes tab (`GET /api/nutrition/recipes?mine=true`,
    // the web's fetchRecipes).
    fireEvent.press(getByTestId("my-stuff-tab-recipes"));
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls.filter((c) =>
        String(c[0]).startsWith("/api/nutrition/recipes?"),
      );
      expect(calls.length).toBeGreaterThan(0);
    });
    const calls = mockApiFetch.mock.calls.filter((c) =>
      String(c[0]).startsWith("/api/nutrition/recipes?"),
    );
    expect(String(calls[0]![0])).toContain("mine=true");
    const opts = calls[0]![2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);

    await waitFor(() => {
      expect(getByTestId("my-stuff-recipe-r1")).toBeTruthy();
    });
    // The recipe tap rule: an unsaved recipe is saved as a Food first, never
    // logged directly (the web's save-or-log).
    fireEvent.press(getByTestId("my-stuff-recipe-save-or-log-r1"));
    await waitFor(() => {
      const saveCalls = mockApiFetch.mock.calls.filter(
        (c) => String(c[0]) === "/api/nutrition/recipes/r1/save-as-food",
      );
      expect(saveCalls.length).toBeGreaterThan(0);
    });
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
    // The same per-serving figure the web shows for this recipe.
    const kcal = getByTestId("recipe-detail-nutrition-kcal").props.children;
    expect(Array.isArray(kcal) ? kcal.join("") : kcal).toContain("210");
  });
});
