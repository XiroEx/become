/* eslint-disable import/first */
import { fireEvent, render, waitFor, within } from "@testing-library/react-native";

/**
 * MY STUFF — THE WEB'S CARD CHROME (NP-270).
 *
 * `myStuffNP142.test.tsx` and `recipes-route.test.tsx` cover the data flow
 * (fetch, save-or-log, unsave). This suite covers the visual parity gap the
 * card describes: a gradient thumbnail, a tag chip, a macro bar and a black
 * primary action on each of the three card types; a hyphenated tag label
 * ("Post-Workout", matching the web); and "New custom food" sitting under
 * the search bar rather than below the list.
 */

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

jest.mock("@/lib/entitlements/store", () => ({
  getEntitlementsSnapshot: () => null,
  getEntitlementsToken: () => "test-jwt",
  loadEntitlements: jest.fn().mockResolvedValue(undefined),
  seedEntitlementsFromCache: jest.fn().mockResolvedValue(undefined),
  subscribeToEntitlements: () => () => {},
}));

const mockCanCreate = jest.fn((_f: string) => true);
jest.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({
    data: null,
    loading: false,
    enforced: false,
    refresh: jest.fn().mockResolvedValue(undefined),
    feature: () => null,
    canCreate: mockCanCreate,
  }),
  syntheticGate: jest.requireActual("@/lib/entitlements").syntheticGate,
}));

jest.mock("@/lib/entitlements/upgradeSheet", () => ({
  showUpgradeSheet: jest.fn(),
}));

jest.mock("@/lib/web/openWebSignedIn", () => ({
  openWebSignedIn: jest.fn().mockResolvedValue("signed-in"),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import MyStuffRoute from "../app/(app)/(tabs)/nutrition/recipes/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const meal = {
  _id: "m1",
  name: "Chicken Bowl",
  imageUrl: undefined,
  items: [{ name: "Chicken" }, { name: "Rice" }],
  tags: ["post-workout"],
  totalNutrition: { calories: 388, protein: 40, carbs: 30, fats: 15 },
};

const recipe = {
  _id: "r1",
  name: "Turkey Chili",
  description: "Hearty",
  servings: 4,
  totalsPerServing: { calories: 223, protein: 25, carbs: 20, fats: 10 },
  ingredients: [{ name: "Turkey" }, { name: "Beans" }],
  instructions: [],
  tags: ["pre-workout"],
};

const food = {
  _id: "f1",
  name: "Greek Yogurt",
  brand: "Chobani",
  category: "Dairy",
  isVerified: true,
  servingSize: 100,
  servingUnit: "g",
  nutrition: { calories: 165, protein: 31, carbs: 0, fats: 4 },
  variants: [
    {
      _id: "v1",
      name: "100 g",
      isDefault: true,
      servingSize: 100,
      servingUnit: "g",
      nutrition: { calories: 165, protein: 31, carbs: 0, fats: 4 },
    },
  ],
};

function respondFor(path: string): unknown {
  if (path.startsWith("/api/meals")) return { meals: [meal], total: 1 };
  if (path.startsWith("/api/nutrition/recipes")) return { recipes: [recipe], total: 1 };
  if (path.startsWith("/api/me/foods")) return { foods: [food] };
  if (path === "/api/tags") return { defaults: ["breakfast"], userTags: ["post-workout", "pre-workout"] };
  if (path === "/api/nutrition/meal-schedule") return { windows: [] };
  return {};
}

describe("My Stuff card chrome (NP-270)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockCanCreate.mockReset();
    mockCanCreate.mockImplementation(() => true);
    mockApiFetch.mockImplementation(async (path: string) => respondFor(path));
  });

  it("a meal card draws a thumbnail, a tag chip, a macro bar and a black 'Log to today'", async () => {
    const { getByTestId, queryByTestId } = render(<MyStuffRoute />);
    await waitFor(() => {
      expect(getByTestId("my-stuff-meal-m1")).toBeTruthy();
    });
    const card = within(getByTestId("my-stuff-meal-m1"));
    // Thumbnail (the web's gradient chef tile).
    expect(getByTestId("my-stuff-meal-m1-thumbnail")).toBeTruthy();
    // Tag chip — hyphenated like the web, not "Post Workout". Scoped to the
    // card itself: the Meals tab's own FILTER chip reuses the same label.
    expect(card.getByText("Post-Workout")).toBeTruthy();
    // The web's exact button label — not just "Log".
    expect(card.getByText("Log to today")).toBeTruthy();
    // Numbers: calories + item count.
    expect(getByTestId("my-stuff-meal-m1-kcal").props.children.join("")).toBe("388 cal");
    // The macro-split bar.
    expect(getByTestId("my-stuff-meal-m1-macro")).toBeTruthy();
    // The primary action opens the log sheet — the Modal only mounts its
    // content once `visible`, so the sheet's own testID is unreachable
    // until the press lands.
    expect(queryByTestId("meal-log-sheet")).toBeNull();
    fireEvent.press(getByTestId("my-stuff-meal-log-m1"));
    await waitFor(() => {
      expect(getByTestId("meal-log-sheet")).toBeTruthy();
    });
  });

  it("a recipe card draws a thumbnail, a tag chip and a macro bar", async () => {
    const { getByTestId, getByText } = render(<MyStuffRoute />);
    fireEvent.press(getByTestId("my-stuff-tab-recipes"));
    await waitFor(() => {
      expect(getByTestId("my-stuff-recipe-r1")).toBeTruthy();
    });
    expect(getByTestId("my-stuff-recipe-r1-thumbnail")).toBeTruthy();
    expect(getByText("Pre-Workout")).toBeTruthy();
    expect(getByTestId("my-stuff-recipe-r1-kcal").props.children.join("")).toBe(
      "223 cal/serving",
    );
    expect(getByTestId("my-stuff-recipe-r1-macro")).toBeTruthy();
  });

  it("a food row draws a thumbnail, a verified tick and the P/C/F line, and opens the detail page", async () => {
    const { getByTestId } = render(<MyStuffRoute />);
    fireEvent.press(getByTestId("my-stuff-tab-foods"));
    await waitFor(() => {
      expect(getByTestId("my-stuff-food-f1")).toBeTruthy();
    });
    expect(getByTestId("my-stuff-food-f1-thumbnail")).toBeTruthy();
    expect(getByTestId("my-stuff-food-f1-verified")).toBeTruthy();
    expect(getByTestId("my-stuff-food-f1-macro").props.children.join("")).toContain(
      "P 31g · C 0g · F 4g",
    );
    fireEvent.press(getByTestId("my-stuff-food-open-f1"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/nutrition/food/f1" as never);
  });

  it("'New custom food' sits right under the search bar, not below the list", async () => {
    const { getByTestId, toJSON } = render(<MyStuffRoute />);
    fireEvent.press(getByTestId("my-stuff-tab-foods"));
    await waitFor(() => {
      expect(getByTestId("my-stuff-food-f1")).toBeTruthy();
    });

    // Walk the rendered tree in document order and record where each
    // testID's node first appears — a stable left-to-right proxy for "what
    // comes before what" that does not depend on pixel layout.
    const order: string[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const n = node as { props?: Record<string, unknown>; children?: unknown[] };
      const testID = n.props?.testID;
      if (typeof testID === "string") order.push(testID);
      (n.children ?? []).forEach(walk);
    };
    walk(toJSON());

    const searchIndex = order.indexOf("my-stuff-search");
    const createFoodIndex = order.indexOf("my-stuff-create-food");
    const listIndex = order.indexOf("my-stuff-food-f1");
    expect(searchIndex).toBeGreaterThan(-1);
    expect(createFoodIndex).toBeGreaterThan(-1);
    expect(listIndex).toBeGreaterThan(-1);
    // Search, then "New custom food", then the list — never after it, which
    // is where it used to sit (below the whole list).
    expect(searchIndex).toBeLessThan(createFoodIndex);
    expect(createFoodIndex).toBeLessThan(listIndex);
  });

  it("the tab strip is a single bordered segmented control, not three separate buttons", async () => {
    const { getByTestId } = render(<MyStuffRoute />);
    const tabs = getByTestId("my-stuff-tabs");
    // One container, not loose siblings — the web's `inline-flex … border`.
    expect(tabs.props.accessibilityRole).toBe("tablist");
    expect(getByTestId("my-stuff-tab-recipes")).toBeTruthy();
    expect(getByTestId("my-stuff-tab-meals")).toBeTruthy();
    expect(getByTestId("my-stuff-tab-foods")).toBeTruthy();
  });

  it("'New custom food' pushes /(tabs)/nutrition/food/new natively", async () => {
    mockPush.mockClear();
    const { getByTestId } = render(<MyStuffRoute />);
    fireEvent.press(getByTestId("my-stuff-tab-foods"));
    await waitFor(() => {
      expect(getByTestId("my-stuff-create-food")).toBeTruthy();
    });
    fireEvent.press(getByTestId("my-stuff-create-food"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/nutrition/food/new" as never);
  });
});
