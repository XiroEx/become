/* eslint-disable import/first */
/**
 * CARD NP-325 — Android: Food page `Log this food` sheet still showed the
 * old inline form (variant/unit chips, stepper, raw date), the button
 * wasn't sticky, and native added an extra `Save as meal` the web doesn't
 * have.
 *
 * Each acceptance point gets its own test, against what a member actually
 * sees:
 *   1. The sheet body is the web's `FoodLogSheet` layout — header + X,
 *      `ADDING TO` picker, AMOUNT chips + Custom, `Now`/`No time`, a
 *      coloured macro tile, `Log to day` — never the old Variant/Serving
 *      Unit chips, the `- 1 +` stepper, or a raw `Date` text field.
 *   2. `Log this food` is sticky (rendered outside the scrolling content).
 *   3. There is no `Save as meal` button anywhere on this screen.
 *   4. The header reads `Favorites` with a back arrow, and the hero is a
 *      two-stop gradient, not a flat tile.
 */

import { render, waitFor, fireEvent } from "@testing-library/react-native";

const mockBack = jest.fn();
let mockParams: Record<string, string | undefined> = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: mockBack,
  }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "member-1", role: "user" },
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
import { LinearGradient } from "expo-linear-gradient";
import FoodDetailRoute from "@/app/(app)/(tabs)/nutrition/food/[id]";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const chickenFood = {
  food: {
    _id: "6512c0ffee1234567890abcd",
    name: "Chicken Breast",
    category: "Protein",
    source: "manual",
    servingSize: 100,
    servingUnit: "g",
    nutrition: { calories: 165, protein: 31, carbs: 0, fats: 4 },
    variants: [
      {
        _id: "var-1",
        name: "Default",
        isDefault: true,
        servingSize: 100,
        servingUnit: "g",
        nutrition: { calories: 165, protein: 31, carbs: 0, fats: 4 },
      },
    ],
  },
};

function routeFetch(foodBody: unknown) {
  mockApiFetch.mockImplementation(async (p: string) => {
    if (String(p).startsWith("/api/nutrition/foods/")) return foodBody;
    if (String(p).startsWith("/api/me/foods")) return { foods: [] };
    if (String(p).startsWith("/api/tags")) {
      return { defaults: ["breakfast", "lunch", "dinner", "snack"], userTags: ["post-workout"] };
    }
    if (String(p).startsWith("/api/meal-logs")) {
      return { date: "2026-10-07", logs: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 } };
    }
    return { success: true };
  });
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockBack.mockReset();
  mockParams = { id: "6512c0ffee1234567890abcd" };
});

describe("(id: NP-325-sheet) the sheet is the web's FoodLogSheet layout, never the old inline form", () => {
  it("shows a close X, an ADDING TO picker, AMOUNT chips + Custom, Now/No time and a Log to day button", async () => {
    routeFetch(chickenFood);
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-log-open")).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId("nutrition-food-log-open"));

    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-log-sheet-close")).toBeTruthy();
    });
    expect(screen.getByTestId("nutrition-food-log-sheet-tag-current")).toHaveTextContent(
      "ADDING TO",
      { exact: false },
    );
    expect(screen.getByTestId("nutrition-food-log-sheet-amount-preset-primary")).toBeTruthy();
    expect(screen.getByTestId("nutrition-food-log-sheet-amount-custom")).toBeTruthy();
    expect(screen.getByTestId("nutrition-food-log-sheet-time-now")).toBeTruthy();
    expect(screen.getByTestId("nutrition-food-log-sheet-time-none")).toBeTruthy();
    expect(screen.getByTestId("nutrition-food-log-sheet-macros")).toBeTruthy();
    expect(screen.getByTestId("nutrition-food-log-sheet-submit")).toHaveTextContent(
      "Log to day",
    );

    // The OLD inline form this sheet replaces is gone: no variant chips, no
    // serving-unit chips, no stepper, no raw Date field, and no "Pick time".
    expect(screen.queryByTestId("variant-chip-Default")).toBeNull();
    expect(screen.queryByTestId("quantity-decrement")).toBeNull();
    expect(screen.queryByTestId("quantity-increment")).toBeNull();
    expect(screen.queryByTestId("date-input")).toBeNull();
    expect(screen.queryByTestId("time-mode-picked")).toBeNull();
  });

  it("offers the member's own tags, not just the four meal-time defaults", async () => {
    routeFetch(chickenFood);
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-log-open")).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId("nutrition-food-log-open"));
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-log-sheet-tag-toggle")).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId("nutrition-food-log-sheet-tag-toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-log-sheet-tag-post-workout")).toBeTruthy();
    });
  });
});

describe("(id: NP-325-sticky) `Log this food` is sticky, not at the end of the scroll", () => {
  it("renders the sticky bar outside the scrolling content, absolutely positioned", async () => {
    routeFetch(chickenFood);
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-log-open")).toBeTruthy();
    });
    // Walk up from the button to the sticky wrapper and check it is
    // absolutely positioned — the thing that keeps it on screen regardless
    // of scroll position, unlike a plain child of the ScrollView's content.
    const button = screen.getByTestId("nutrition-food-log-open");
    let node = button.parent;
    let found = false;
    for (let i = 0; i < 6 && node; i++) {
      const style = node.props?.style;
      const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
      if (flat && flat.position === "absolute") {
        found = true;
        break;
      }
      node = node.parent;
    }
    expect(found).toBe(true);
  });
});

describe("(id: NP-325-no-save-as-meal) there is no `Save as meal` button on this screen", () => {
  it("never renders a save-as-meal control, open sheet or not", async () => {
    routeFetch(chickenFood);
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-log-open")).toBeTruthy();
    });
    expect(screen.queryByTestId("save-as-meal-open")).toBeNull();
    fireEvent.press(screen.getByTestId("nutrition-food-log-open"));
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-log-sheet-submit")).toBeTruthy();
    });
    expect(screen.queryByTestId("save-as-meal-open")).toBeNull();
  });
});

describe("(id: NP-325-header) the header reads `Favorites` with a back arrow, and the hero is a gradient", () => {
  it("shows an arrow + Favorites label, matching the web's `← Favorites`", async () => {
    routeFetch(chickenFood);
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-back")).toBeTruthy();
    });
    expect(screen.getByTestId("nutrition-food-back")).toHaveTextContent("Favorites");
  });

  it("draws the hero as a two-stop gradient, not a single flat colour", async () => {
    routeFetch(chickenFood);
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-hero")).toBeTruthy();
    });
    const hero = screen.UNSAFE_getByType(LinearGradient);
    const colors = hero.props.colors as string[];
    expect(colors).toHaveLength(2);
    expect(colors[0]).not.toBe(colors[1]);
  });
});
