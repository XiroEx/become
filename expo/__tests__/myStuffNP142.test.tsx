/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
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

jest.mock("@/lib/theme/useThemeTokens", () => ({
  useThemeTokens: () => ({
    mode: "light" as const,
    isDark: false,
    colors: {
      background: "rgb(255 255 255)",
      card: "rgb(255 255 255)",
      foreground: "rgb(0 0 0)",
      border: "rgb(200 200 200)",
      muted: "rgb(240 240 240)",
      "muted-foreground": "rgb(100 100 100)",
      success: "rgb(0 150 0)",
      primary: "rgb(200 0 0)",
      "primary-foreground": "rgb(255 255 255)",
    },
    tint: () => "rgb(240 240 240)",
    scrim: "rgba(0,0,0,0.4)",
    statusBarStyle: "dark" as const,
  }),
}));

jest.mock("@/lib/entitlements/store", () => ({
  getEntitlementsSnapshot: () => null,
  getEntitlementsToken: () => "test-jwt",
  loadEntitlements: jest.fn().mockResolvedValue(undefined),
  seedEntitlementsFromCache: jest.fn().mockResolvedValue(undefined),
  subscribeToEntitlements: () => () => {},
}));

const mockCanCreate = jest.fn((_f: string) => true);
const mockRefresh = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({
    data: null,
    loading: false,
    enforced: false,
    refresh: mockRefresh,
    feature: () => null,
    canCreate: mockCanCreate,
  }),
  syntheticGate: jest.requireActual("@/lib/entitlements").syntheticGate,
}));

const mockShowUpgradeSheet = jest.fn((_gate: unknown) => true);
jest.mock("@/lib/entitlements/upgradeSheet", () => ({
  showUpgradeSheet: (gate: unknown) => mockShowUpgradeSheet(gate),
}));

jest.mock("@/lib/web/openWebSignedIn", () => ({
  openWebSignedIn: jest.fn().mockResolvedValue("signed-in"),
}));

jest.mock("@/lib/errors", () => {
  const actual = jest.requireActual("@/lib/errors");
  return {
    ...actual,
    // Mirror the screen's own wiring: the per-call onPlanGate backstop raises
    // the sheet even with no provider in the tree. The mock registry cannot
    // be read from inside the factory, so the raise is recorded on a shared
    // global the test asserts on.
    useApiErrorHandler:
      (perCallRoutes?: Record<string, unknown>) =>
      (err: unknown): { handled: boolean; message: string } => {
        const { routeApiError: route } = actual as unknown as {
          routeApiError: typeof actual.routeApiError;
        };
        void perCallRoutes;
        const routed = route(err, {
          onPlanGate: (gate: { gate: unknown }) => {
            (globalThis as Record<string, unknown>).__np142SheetGate = gate.gate;
          },
        });
        if (routed.kind === "plan-gate") return { handled: true, message: "" };
        return { handled: false, message: routed.message };
      },
  };
});

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch, ApiError } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import MyStuffRoute from "../app/(app)/(tabs)/nutrition/recipes/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const meal = {
  _id: "m1",
  name: "Chicken Bowl",
  items: [{ name: "Chicken" }],
  tags: ["high-protein"],
  totalNutrition: { calories: 500, protein: 40, carbs: 30, fats: 15 },
};

const recipe = {
  _id: "r1",
  name: "Turkey Chili",
  description: "Hearty",
  servings: 4,
  totalsPerServing: { calories: 320, protein: 25, carbs: 20, fats: 10 },
  ingredients: [{ name: "Turkey" }],
  instructions: [],
  tags: [],
};

const food = {
  _id: "f1",
  name: "Turkey Chili",
  servingSize: 1,
  servingUnit: "serving",
  nutrition: { calories: 320, protein: 25, carbs: 20, fats: 10 },
  variants: [
    {
      _id: "v1",
      name: "1 serving",
      isDefault: true,
      servingSize: 1,
      servingUnit: "serving",
      nutrition: { calories: 320, protein: 25, carbs: 20, fats: 10 },
    },
  ],
};

function callsTo(path: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => String(c[0]) === path);
}

function respondFor(path: string): unknown {
  if (path.startsWith("/api/meals")) return { meals: [meal], total: 1 };
  if (path.startsWith("/api/nutrition/recipes")) return { recipes: [recipe], total: 1 };
  if (path.startsWith("/api/me/foods")) return { foods: [food] };
  if (path === "/api/tags") return { defaults: ["breakfast"], userTags: ["high-protein"] };
  if (path === "/api/nutrition/meal-schedule") return { windows: [] };
  return {};
}

describe("MyStuffRoute (NP-142)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockBack.mockReset();
    mockShowUpgradeSheet.mockReset();
    mockCanCreate.mockReset();
    mockCanCreate.mockImplementation(() => true);
    mockRefresh.mockClear();
    mockApiFetch.mockImplementation(async (path: string) => respondFor(path));
  });

  it("lists the same meals as the web for the same member (GET /api/meals with baseUrl + token)", async () => {
    const { getByTestId } = render(<MyStuffRoute />);
    await waitFor(() => {
      expect(callsTo("/api/meals?limit=50").length).toBeGreaterThan(0);
    });
    const opts = callsTo("/api/meals?limit=50")[0]![2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe("test-jwt");
    await waitFor(() => {
      expect(getByTestId("my-stuff-meal-m1")).toBeTruthy();
    });
  });

  it("lists the member's own recipes via GET /api/nutrition/recipes?mine=true", async () => {
    const { getByTestId } = render(<MyStuffRoute />);
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
    expect(opts.getToken?.()).toBe("test-jwt");
    await waitFor(() => {
      expect(getByTestId("my-stuff-recipe-r1")).toBeTruthy();
    });
  });

  it("lists saved foods via GET /api/me/foods and unsaves via DELETE", async () => {
    const { getByTestId } = render(<MyStuffRoute />);
    fireEvent.press(getByTestId("my-stuff-tab-foods"));
    await waitFor(() => {
      expect(callsTo("/api/me/foods").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(getByTestId("my-stuff-food-f1")).toBeTruthy();
    });
    fireEvent.press(getByTestId("my-stuff-food-remove-f1"));
    await waitFor(() => {
      expect(callsTo("/api/me/foods/f1").length).toBeGreaterThan(0);
    });
    const delOpts = callsTo("/api/me/foods/f1")[0]![2] as { method?: string };
    expect(delOpts).toEqual(expect.objectContaining({ method: "DELETE" }));
  });

  it("tapping an unsaved recipe saves it as a Food first (POST save-as-food), exactly as the web", async () => {
    const { getByTestId } = render(<MyStuffRoute />);
    fireEvent.press(getByTestId("my-stuff-tab-recipes"));
    await waitFor(() => {
      expect(getByTestId("my-stuff-recipe-r1")).toBeTruthy();
    });
    mockApiFetch.mockImplementation(async (path: string, _schema: unknown, init?: { method?: string }) => {
      if (path === "/api/nutrition/recipes/r1/save-as-food" && init?.method === "POST") {
        return { success: true, created: true, alreadyExisted: false, food };
      }
      return respondFor(path);
    });
    fireEvent.press(getByTestId("my-stuff-recipe-save-or-log-r1"));
    await waitFor(() => {
      expect(callsTo("/api/nutrition/recipes/r1/save-as-food").length).toBeGreaterThan(0);
    });
    const postOpts = callsTo("/api/nutrition/recipes/r1/save-as-food")[0]![2] as {
      method?: string;
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(postOpts).toEqual(
      expect.objectContaining({ method: "POST", baseUrl: WEBAPP_BASE_URL }),
    );
    expect(postOpts.getToken?.()).toBe("test-jwt");
    // First tap mints the Food (not yet saved → toast, no log sheet).
    await waitFor(() => {
      expect(getByTestId("my-stuff-banner")).toBeTruthy();
    });
  });

  it("a free member at 3 custom foods sees the upgrade sheet when a recipe needs saving", async () => {
    (globalThis as Record<string, unknown>).__np142SheetGate = null;
    const { getByTestId } = render(<MyStuffRoute />);
    fireEvent.press(getByTestId("my-stuff-tab-recipes"));
    await waitFor(() => {
      expect(getByTestId("my-stuff-recipe-r1")).toBeTruthy();
    });
    mockApiFetch.mockImplementation(async (path: string, _schema: unknown, init?: { method?: string }) => {
      void init;
      if (path === "/api/nutrition/recipes/r1/save-as-food") {
        throw new ApiError(403, {
          error: "You've saved all 3 of your free custom foods.",
          feature: "custom-foods",
          requiresTier: "plus",
          limit: 3,
          remaining: 0,
        });
      }
      return respondFor(path);
    });
    // The screen routes the refusal through `useApiErrorHandler` with an
    // `onPlanGate` backstop that raises the upgrade sheet (the root provider
    // does the same in the app). The mock records the gate globally.
    fireEvent.press(getByTestId("my-stuff-recipe-save-or-log-r1"));
    await waitFor(() => {
      expect((globalThis as Record<string, unknown>).__np142SheetGate).toBeTruthy();
    });
    const gate = (globalThis as Record<string, unknown>).__np142SheetGate as { feature?: string };
    expect(gate).toEqual(
      expect.objectContaining({ feature: "custom-foods", requiresTier: "plus" }),
    );
  });
});
