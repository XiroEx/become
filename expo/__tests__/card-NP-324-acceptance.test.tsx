/* eslint-disable import/first */
/**
 * CARD NP-324 — Android: My Stuff - 'New custom food' opens the web Sign in
 * page in a browser tab instead of the native New custom food screen;
 * saved-food rows don't open the food page.
 *
 * Acceptance tests:
 *   1. (id: NP-324-create-food): 'New custom food' pushes
 *      '/(tabs)/nutrition/food/new' natively (no web hand-off).
 *   2. (id: NP-324-cap-sheet): at the custom-foods cap, 'New custom food'
 *      raises the upgrade sheet and does not navigate.
 *   3. (id: NP-324-saved-food-row): tapping the saved food row opens
 *      '/(tabs)/nutrition/food/<id>'.
 *   4. (id: NP-324-focus-refetch): on screen focus, the foods list is
 *      refetched so newly saved foods return to My Stuff with the new food listed.
 */

import { fireEvent, render, waitFor, act } from "@testing-library/react-native";

const mockPush = jest.fn();
let focusEffectCb: (() => void | (() => void)) | null = null;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => {
    focusEffectCb = cb;
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

const mockRefreshEntitlements = jest.fn().mockResolvedValue(undefined);
let mockAtCap = false;

jest.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({
    data: null,
    loading: false,
    enforced: true,
    refresh: mockRefreshEntitlements,
    feature: () => null,
    canCreate: () => !mockAtCap,
  }),
  syntheticGate: jest.requireActual("@/lib/entitlements").syntheticGate,
}));

const mockShowUpgradeSheet = jest.fn();
jest.mock("@/lib/entitlements/upgradeSheet", () => ({
  showUpgradeSheet: (...args: unknown[]) => mockShowUpgradeSheet(...args),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import MyStuffRoute from "@/app/(app)/(tabs)/nutrition/recipes/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const food1 = {
  _id: "food-1",
  name: "Rolled Oats",
  category: "Carbs",
  servingSize: 40,
  servingUnit: "g",
  nutrition: { calories: 150, protein: 5, carbs: 27, fats: 3 },
};

const food2 = {
  _id: "food-2",
  name: "Greek Yogurt",
  category: "Dairy",
  servingSize: 150,
  servingUnit: "g",
  nutrition: { calories: 130, protein: 15, carbs: 6, fats: 0 },
};

function setupFetch(foodsList = [food1]) {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === "/api/me/foods") {
      return { foods: foodsList };
    }
    if (String(path).startsWith("/api/meals")) {
      return { meals: [] };
    }
    if (String(path).startsWith("/api/nutrition/recipes")) {
      return { recipes: [], total: 0 };
    }
    if (path === "/api/tags") {
      return { defaults: [], userTags: [] };
    }
    if (path === "/api/nutrition/meal-schedule") {
      return { windows: [] };
    }
    return {};
  });
}

beforeEach(() => {
  mockPush.mockReset();
  mockApiFetch.mockReset();
  mockShowUpgradeSheet.mockReset();
  mockRefreshEntitlements.mockReset();
  mockAtCap = false;
  focusEffectCb = null;
});

describe("CARD NP-324 acceptance: My Stuff Foods navigation and parity", () => {
  it("(id: NP-324-create-food) 'New custom food' pushes /(tabs)/nutrition/food/new natively", async () => {
    setupFetch();
    const screen = render(<MyStuffRoute />);
    fireEvent.press(screen.getByTestId("my-stuff-tab-foods"));

    await waitFor(() => {
      expect(screen.getByTestId("my-stuff-create-food")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("my-stuff-create-food"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/nutrition/food/new" as never);
    expect(mockShowUpgradeSheet).not.toHaveBeenCalled();
  });

  it("(id: NP-324-cap-sheet) 'New custom food' raises upgrade sheet when at custom-foods cap", async () => {
    mockAtCap = true;
    setupFetch();
    const screen = render(<MyStuffRoute />);
    fireEvent.press(screen.getByTestId("my-stuff-tab-foods"));

    await waitFor(() => {
      expect(screen.getByTestId("my-stuff-create-food")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("my-stuff-create-food"));
    expect(mockShowUpgradeSheet).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "custom-foods",
      }),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("(id: NP-324-saved-food-row) tapping a saved-food row opens /(tabs)/nutrition/food/<id>", async () => {
    setupFetch([food1]);
    const screen = render(<MyStuffRoute />);
    fireEvent.press(screen.getByTestId("my-stuff-tab-foods"));

    await waitFor(() => {
      expect(screen.getByTestId("my-stuff-food-open-food-1")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("my-stuff-food-open-food-1"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/nutrition/food/food-1" as never);
  });

  it("(id: NP-324-focus-refetch) screen focus refetches saved foods and refreshes entitlements", async () => {
    let currentFoods = [food1];
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/me/foods") {
        return { foods: currentFoods };
      }
      if (String(path).startsWith("/api/meals")) return { meals: [] };
      if (String(path).startsWith("/api/nutrition/recipes")) return { recipes: [], total: 0 };
      if (path === "/api/tags") return { defaults: [], userTags: [] };
      if (path === "/api/nutrition/meal-schedule") return { windows: [] };
      return {};
    });

    const screen = render(<MyStuffRoute />);
    fireEvent.press(screen.getByTestId("my-stuff-tab-foods"));

    await waitFor(() => {
      expect(screen.getByTestId("my-stuff-food-food-1")).toBeTruthy();
      expect(screen.queryByTestId("my-stuff-food-food-2")).toBeNull();
    });

    // Simulate saving a new food while away on food/new, then returning to My Stuff:
    currentFoods = [food1, food2];

    expect(focusEffectCb).toBeDefined();
    await act(async () => {
      focusEffectCb?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId("my-stuff-food-food-2")).toBeTruthy();
    });
    expect(mockRefreshEntitlements).toHaveBeenCalled();
  });
});
