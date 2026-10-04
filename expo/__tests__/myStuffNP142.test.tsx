/* eslint-disable import/first */
/**
 * MY STUFF, ON THE PHONE (NP-142).
 *
 * Native counterpart of `webapp/app/dashboard/meals/page.tsx`: three tabs
 * (meals, my recipes, saved foods) reading the same three endpoints
 * (`GET /api/meals`, `GET /api/nutrition/recipes?mine=true`,
 * `GET /api/me/foods`), the recipe save-or-log rule (first tap mints a Food
 * through save-as-food, the next logs that Food), and the custom-foods cap
 * raising the upgrade sheet (the plan-gates story) instead of the web's
 * toast-only refusal.
 *
 * What is pinned here is the behaviour a member actually feels, against the
 * REAL entitlements store and a stubbed server (the `myPrograms` pattern):
 *
 *   • (e015c9df) My Stuff lists the same meals, recipes and foods as the web
 *     for the same member — the list fetches hit the web's paths and render
 *     the rows;
 *   • (e015c9e0) tapping an unsaved recipe saves it as a Food first, exactly
 *     as the web does — the first tap POSTs save-as-food and toasts the
 *     saved line; the second tap opens the log sheet for the minted Food;
 *   • (e015c9e1) a free member at 3 custom foods sees the upgrade sheet when
 *     a recipe needs saving — the 403 plan-gate raises `showUpgradeSheet`.
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { act } from "react";

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "member@example.com" },
    token: mockMemberJwt(),
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@/lib/web/openWebSignedIn", () => ({
  openWebSignedIn: jest.fn(async () => "signed-in" as const),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

jest.mock("@/lib/entitlements/upgradeSheet", () => ({
  showUpgradeSheet: jest.fn(() => true),
  hideUpgradeSheet: jest.fn(),
  getUpgradeSheetGate: jest.fn(() => null),
  subscribeToUpgradeSheet: jest.fn(() => () => {}),
  isSheetGate: jest.requireActual("@/lib/entitlements/upgradeSheet").isSheetGate,
  toSheetGate: jest.requireActual("@/lib/entitlements/upgradeSheet").toSheetGate,
}));

jest.mock("@/lib/mind/sessionCache", () => ({
  invalidateMindSession: jest.fn(async () => {}),
}));

const mockPush = jest.fn();
const mockBack = jest.fn();

function mockMemberJwt(): string {
  return jwtFor("member-1");
}

import { apiFetch, ApiError } from "@become/api-client";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import {
  configureEntitlementsStore,
  resetEntitlementsSnapshot,
  setEntitlementsToken,
} from "@/lib/entitlements";
import { clearAll, setCacheMemberId } from "@/lib/cache/lastKnown";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import MyStuffRoute from "@/app/(app)/(tabs)/nutrition/recipes/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;
const mockShowUpgradeSheet = showUpgradeSheet as unknown as jest.Mock;

const NOW_MS = Date.UTC(2026, 8, 30, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function jwtFor(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Math.floor((NOW_MS + 30 * DAY_MS) / 1000) }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig-${userId}`;
}

let entitlementsQueue: unknown[] = [];

function scriptEntitlements(...bodies: unknown[]): void {
  entitlementsQueue = [...bodies];
}

function freePlan(customFoodsCanCreate: boolean, enforced = true) {
  return {
    role: "user",
    tier: "free",
    enforced,
    grandfathered: false,
    subscription: null,
    checkoutAvailable: true,
    features: {
      "custom-meals": {
        allowed: true,
        canCreate: true,
        requiresTier: "plus",
        limit: 3,
        used: 0,
        remaining: 3,
        resetsAt: null,
        window: "lifetime",
      },
      "custom-foods": {
        allowed: true,
        canCreate: customFoodsCanCreate,
        requiresTier: "plus",
        limit: 3,
        used: customFoodsCanCreate ? 1 : 3,
        remaining: customFoodsCanCreate ? 2 : 0,
        resetsAt: null,
        window: "lifetime",
      },
    },
  };
}

const MEAL = {
  _id: "meal-1",
  name: "Turkey sandwich",
  description: "Lunch staple",
  items: [{ name: "Turkey" }],
  tags: [],
  totalNutrition: { calories: 420, protein: 30, carbs: 35, fats: 12 },
};

const RECIPE = {
  _id: "recipe-1",
  name: "Turkey Chili",
  description: "Big batch",
  servings: 4,
  ingredients: [],
  instructions: [],
  totalsPerServing: { calories: 310, protein: 28, carbs: 22, fats: 9 },
  tags: [],
};

const SAVED_RECIPE = {
  ...RECIPE,
  savedFoodId: "food-9",
};

const FOOD = {
  _id: "food-9",
  name: "Turkey Chili",
  servingSize: 1,
  servingUnit: "serving",
  nutrition: { calories: 310, protein: 28, carbs: 22, fats: 9 },
  variants: [
    {
      _id: "food-9-var",
      name: "1 serving",
      isDefault: true,
      servingSize: 1,
      servingUnit: "serving",
      nutrition: { calories: 310, protein: 28, carbs: 22, fats: 9 },
    },
  ],
};

let storage: AsyncStorageLike;

beforeEach(async () => {
  mockPush.mockReset();
  mockBack.mockReset();
  mockApiFetch.mockReset();
  mockShowUpgradeSheet.mockClear();
  storage = createMemoryAsyncStorage();
  await clearAll(storage);
  setCacheMemberId(null);
  configureEntitlementsStore({ baseUrl: "https://example.test", storage });
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
  jest.spyOn(Date, "now").mockImplementation(() => NOW_MS);
});

afterEach(async () => {
  jest.restoreAllMocks();
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
  await clearAll(storage);
});

/** Route apiFetch by path. Entitlements answers come from `scriptEntitlements`. */
function routeFetch(impl: (path: string, opts?: { method?: string }) => unknown) {
  mockApiFetch.mockImplementation(async (path: string, _schema: unknown, opts?: { method?: string }) => {
    if (path === "/api/me/entitlements") {
      const body = entitlementsQueue.shift();
      if (body === undefined) {
        throw new Error("no entitlements answer scripted — call scriptEntitlements() first");
      }
      return body;
    }
    return impl(path, opts);
  });
}

function baseServer() {
  return (path: string) => {
    if (path.startsWith("/api/meals")) return { meals: [MEAL], total: 1 };
    if (path.startsWith("/api/nutrition/recipes")) return { recipes: [RECIPE], total: 1 };
    if (path === "/api/me/foods") return { foods: [FOOD] };
    if (path === "/api/tags") return { defaults: ["snack"], userTags: ["high-protein"] };
    if (path === "/api/meal-schedule") return { windows: [] };
    throw new Error(`unexpected fetch ${path}`);
  };
}

describe("(id: e015c9df) My Stuff natively lists the same meals, recipes and foods as the web for the same member", () => {
  it("reads GET /api/meals, GET /api/nutrition/recipes?mine=true and GET /api/me/foods across the three tabs", async () => {
    setEntitlementsToken(mockMemberJwt());
    scriptEntitlements(freePlan(true), freePlan(true), freePlan(true));
    routeFetch(baseServer());

    const screen = render(<MyStuffRoute />);

    // Meals tab first: the web's GET /api/meals row appears.
    await waitFor(() =>
      expect(screen.getByTestId("my-stuff-meal-meal-1-name")).toBeTruthy(),
    );
    expect(
      mockApiFetch.mock.calls.some(([p]) => String(p).startsWith("/api/meals")),
    ).toBe(true);

    // Recipes tab: the member's own recipes via ?mine=true.
    fireEvent.press(screen.getByTestId("my-stuff-tab-recipes"));
    await waitFor(() =>
      expect(screen.getByTestId("my-stuff-recipe-recipe-1-name")).toBeTruthy(),
    );
    const recipeCall = mockApiFetch.mock.calls.find(([p]) =>
      String(p).startsWith("/api/nutrition/recipes"),
    );
    expect(recipeCall).toBeTruthy();
    expect(String(recipeCall![0])).toContain("mine=true");

    // Foods tab: the web's GET /api/me/foods row appears.
    fireEvent.press(screen.getByTestId("my-stuff-tab-foods"));
    await waitFor(() =>
      expect(screen.getByTestId("my-stuff-food-food-9-name")).toBeTruthy(),
    );
    expect(
      mockApiFetch.mock.calls.some(([p]) => String(p) === "/api/me/foods"),
    ).toBe(true);
  });
});

describe("(id: e015c9e0) Tapping an unsaved recipe natively saves it as a Food first, exactly as the web does", () => {
  it("first tap POSTs save-as-food and toasts the saved line; second tap opens the log sheet for the minted Food", async () => {
    setEntitlementsToken(mockMemberJwt());
    scriptEntitlements(freePlan(true), freePlan(true), freePlan(true), freePlan(true));
    routeFetch((path: string, opts?: { method?: string }) => {
      if (path === "/api/nutrition/recipes/recipe-1/save-as-food" && opts?.method === "POST") {
        return { success: true, created: true, alreadyExisted: false, food: FOOD };
      }
      return baseServer()(path);
    });

    const screen = render(<MyStuffRoute />);
    fireEvent.press(screen.getByTestId("my-stuff-tab-recipes"));
    await waitFor(() =>
      expect(screen.getByTestId("my-stuff-recipe-recipe-1-save-or-log")).toBeTruthy(),
    );

    // First tap: mints the Food, exactly the web's POST.
    await act(async () => {
      fireEvent.press(screen.getByTestId("my-stuff-recipe-recipe-1-save-or-log"));
    });
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/nutrition/recipes/recipe-1/save-as-food",
        expect.anything(),
        expect.objectContaining({ method: "POST" }),
      ),
    );
    // The web toasts "Saved to your Foods — tap again to log it".
    await waitFor(() =>
      expect(screen.getByTestId("my-stuff-notice")).toHaveTextContent(
        "Saved to your Foods — tap again to log it",
      ),
    );
    // No log sheet yet: the recipe was not logged directly.
    expect(screen.queryByTestId("saved-food-log-sheet")).toBeNull();

    // Second tap: the recipe is saved now, so the minted Food opens in the log sheet.
    routeFetch((path: string, opts?: { method?: string }) => {
      if (path === "/api/nutrition/recipes/recipe-1/save-as-food" && opts?.method === "POST") {
        return { success: true, created: false, alreadyExisted: true, food: FOOD };
      }
      return baseServer()(path);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("my-stuff-recipe-recipe-1-save-or-log"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("saved-food-log-sheet")).toBeTruthy(),
    );
  });

  it("logging a meal POSTs /api/meals/{id}/log and unsaving DELETEs /api/me/foods/{foodId}", async () => {
    setEntitlementsToken(mockMemberJwt());
    scriptEntitlements(freePlan(true), freePlan(true), freePlan(true));
    routeFetch((path: string, opts?: { method?: string }) => {
      if (path === "/api/meals/meal-1/log" && opts?.method === "POST") {
        return { success: true, log: { _id: "log-1" } };
      }
      if (path === "/api/me/foods/food-9" && opts?.method === "DELETE") {
        return { success: true };
      }
      if (path === "/api/meal-logs" && opts?.method === "POST") {
        return { success: true, log: { _id: "log-2" } };
      }
      return baseServer()(path);
    });

    const screen = render(<MyStuffRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("my-stuff-meal-meal-1-log")).toBeTruthy(),
    );

    // Log the meal: opens the sheet, submits the portion.
    fireEvent.press(screen.getByTestId("my-stuff-meal-meal-1-log"));
    await waitFor(() =>
      expect(screen.getByTestId("meal-log-sheet")).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-log-sheet-submit"));
    });
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/meals/meal-1/log",
        expect.anything(),
        expect.objectContaining({ method: "POST" }),
      ),
    );

    // Unsave the food.
    fireEvent.press(screen.getByTestId("my-stuff-tab-foods"));
    await waitFor(() =>
      expect(screen.getByTestId("my-stuff-food-food-9-unsave")).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("my-stuff-food-food-9-unsave"));
    });
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/me/foods/food-9",
        expect.anything(),
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });
});

describe("(id: e015c9e1) A free member at 3 custom foods sees the upgrade sheet when a recipe needs saving", () => {
  it("a refused save-as-food raises the upgrade sheet instead of only toasting", async () => {
    setEntitlementsToken(mockMemberJwt());
    scriptEntitlements(freePlan(false), freePlan(false), freePlan(false), freePlan(false));
    const gateBody = {
      error: "You've used all 3 of your free custom foods.",
      feature: "custom-foods",
      requiresTier: "plus",
      limit: 3,
      remaining: 0,
      resetsAt: null,
      window: "lifetime",
    };
    routeFetch((path: string, opts?: { method?: string }) => {
      if (path === "/api/nutrition/recipes/recipe-1/save-as-food" && opts?.method === "POST") {
        throw new ApiError(403, gateBody, gateBody.error);
      }
      return baseServer()(path);
    });

    const screen = render(<MyStuffRoute />);
    fireEvent.press(screen.getByTestId("my-stuff-tab-recipes"));
    await waitFor(() =>
      expect(screen.getByTestId("my-stuff-recipe-recipe-1-save-or-log")).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("my-stuff-recipe-recipe-1-save-or-log"));
    });

    await waitFor(() => expect(mockShowUpgradeSheet).toHaveBeenCalled());
    const gate = mockShowUpgradeSheet.mock.calls[0]![0] as { feature?: string };
    expect(gate.feature).toBe("custom-foods");
  });

  it("create buttons read canCreate and show the upgrade sheet on a real gate", async () => {
    setEntitlementsToken(mockMemberJwt());
    scriptEntitlements(freePlan(false), freePlan(false), freePlan(false));
    routeFetch(baseServer());

    const screen = render(<MyStuffRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("my-stuff-meals-allowance-lock")).toBeTruthy(),
    );

    // At the meals cap the create button raises the sheet instead of opening the web.
    fireEvent.press(screen.getByTestId("my-stuff-new-meal"));
    expect(mockShowUpgradeSheet).toHaveBeenCalled();
  });
});

void SAVED_RECIPE;
