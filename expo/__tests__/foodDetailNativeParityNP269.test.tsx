/* eslint-disable import/first */
/**
 * FOOD PAGE NATIVE PARITY (NP-269).
 *
 * Full visual pass (native vs web) found five gaps on the food detail
 * screen: no hero image, an inline log form instead of the web's `Log this
 * food` sheet (which also preselected the wrong variant), uncoloured
 * macros, icon-only Save/Delete, and a bridge editor with different
 * fields. Each gets its own test, against the thing a member actually sees
 * rather than an implementation detail.
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { act } from "react";

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
import FoodDetailRoute from "@/app/(app)/(tabs)/nutrition/food/[id]";
import { getTokens } from "@/lib/theme/tokens";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function rgb(triplet: string): string {
  return `rgb(${triplet})`;
}

// A food whose DEFAULT variant ("Grilled") is NOT the first in the array —
// the exact shape that made the picker preselect "Raw" instead.
const grilledDefaultFood = {
  food: {
    _id: "6512c0ffee1234567890abcd",
    name: "Chicken Thigh",
    category: "Protein",
    isVerified: true,
    source: "manual",
    authoredBy: "member-1",
    createdBy: "member-1",
    servingSize: 100,
    servingUnit: "g",
    nutrition: { calories: 120, protein: 22, carbs: 0, fats: 3 },
    variants: [
      {
        _id: "var-raw",
        name: "Raw",
        isDefault: false,
        servingSize: 100,
        servingUnit: "g",
        nutrition: { calories: 120, protein: 22, carbs: 0, fats: 3 },
      },
      {
        _id: "var-grilled",
        name: "Grilled",
        isDefault: true,
        servingSize: 100,
        servingUnit: "g",
        nutrition: { calories: 180, protein: 27, carbs: 0, fats: 7 },
      },
    ],
  },
};

function routeFetch(foodBody: unknown) {
  mockApiFetch.mockImplementation(async (p: string) => {
    if (String(p).startsWith("/api/nutrition/foods/")) return foodBody;
    if (String(p).startsWith("/api/me/foods")) return { foods: [] };
    if (String(p).startsWith("/api/meal-logs")) {
      return { date: "2026-10-05", logs: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 } };
    }
    return { success: true };
  });
}

function postBodies(pathname: string, method: string): Record<string, unknown>[] {
  return mockApiFetch.mock.calls
    .filter(([p, , init]) => {
      const i = (init ?? {}) as { method?: string };
      return p === pathname && i.method === method;
    })
    .map(([, , init]) => (init as { body: Record<string, unknown> }).body);
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockBack.mockReset();
  mockParams = { id: "6512c0ffee1234567890abcd" };
});

describe("the hero (no hero image on native)", () => {
  it("renders the category-tinted thumbnail above the title", async () => {
    routeFetch(grilledDefaultFood);
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-name").props.children).toBe(
        "Chicken Thigh",
      );
    });
    expect(screen.getByTestId("nutrition-food-hero")).toBeTruthy();
  });
});

describe("the `Log this food` sheet replaces the inline form, and defaults to the real default variant", () => {
  it("opens a sheet from a `Log this food` button, with no amount form inline before it's pressed", async () => {
    routeFetch(grilledDefaultFood);
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-log-open")).toBeTruthy();
    });
    // The inline form (quantity stepper, meal tag chips) is not on the page
    // until the sheet opens.
    expect(screen.queryByTestId("quantity-input")).toBeNull();

    fireEvent.press(screen.getByTestId("nutrition-food-log-open"));
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-log-sheet")).toBeTruthy();
    });
    expect(screen.getByTestId("quantity-input")).toBeTruthy();
  });

  it("preselects the variant flagged `isDefault` (Grilled, 180 kcal), not the first in the array (Raw, 120 kcal)", async () => {
    routeFetch(grilledDefaultFood);
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-log-open")).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId("nutrition-food-log-open"));

    await waitFor(() => {
      expect(screen.getByTestId("macro-preview-calories").props.children).toEqual([
        180,
        " kcal",
      ]);
    });
    // The headline above the fold already scaled off the default variant —
    // the sheet agrees with it rather than contradicting it with "Raw".
    expect(screen.getByTestId("nutrition-food-macro-calories").props.children).toBe(
      "180",
    );
  });
});

describe("macros are coloured, matching the web (protein blue, carbs green, fats amber)", () => {
  it("colours the macro tile and the nutrition breakdown rows with the web's own tokens", async () => {
    routeFetch(grilledDefaultFood);
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-macros")).toBeTruthy();
    });
    const light = getTokens("light");
    expect(screen.getByTestId("nutrition-food-macro-protein").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: rgb(light.info) })]),
    );
    expect(screen.getByTestId("nutrition-food-macro-carbs").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: rgb(light.success) })]),
    );
    expect(screen.getByTestId("nutrition-food-macro-fats").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: rgb(light.accent) })]),
    );
    // Calories stays plain foreground — only the three macros are tinted.
    expect(screen.getByTestId("nutrition-food-macro-calories").props.style).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ color: rgb(light.info) })]),
    );
  });
});

describe("the variant list shows a DEFAULT pill, not \"· default\" text", () => {
  it("renders a pill for the default variant", async () => {
    routeFetch(grilledDefaultFood);
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-variants")).toBeTruthy();
    });
    expect(screen.getByTestId("nutrition-food-variant-1-default-pill")).toBeTruthy();
    expect(screen.queryByTestId("nutrition-food-variant-0-default-pill")).toBeNull();
    expect(screen.queryByText("· default")).toBeNull();
  });
});

describe("header: Save/Saved and Delete read as words, not icon-only", () => {
  it("shows a Save label next to the bookmark and a Delete label next to the trash icon", async () => {
    routeFetch(grilledDefaultFood);
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-bookmark-label")).toBeTruthy();
    });
    expect(screen.getByTestId("nutrition-food-bookmark-label").props.children).toBe(
      "Save",
    );
    expect(screen.getByTestId("nutrition-food-delete-label").props.children).toBe(
      "Delete",
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("nutrition-food-bookmark"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-bookmark-label").props.children).toBe(
        "Saved",
      );
    });
  });
});

describe("the owned-food bridge editor uses the web's own fields", () => {
  it("has a 'Weight per serving (optional)' field that parses freeform units and shows a canonical readout", async () => {
    routeFetch(grilledDefaultFood);
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-variants")).toBeTruthy();
    });
    // Both variants are bridge-editable; the web's own field labels appear
    // for each, never the native-only "Grams / serving" trio.
    expect(screen.getAllByText("Weight per serving (optional)")).toHaveLength(2);
    expect(screen.getAllByText("Volume per serving (optional)")).toHaveLength(2);
    expect(screen.queryByText("Grams / serving")).toBeNull();
    expect(screen.queryByText("Save bridge")).toBeNull();

    fireEvent.changeText(screen.getByTestId("nutrition-food-bridge-1-weight"), "3.5 oz");
    fireEvent(screen.getByTestId("nutrition-food-bridge-1-weight"), "blur");

    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-bridge-1-weight-readout")).toHaveTextContent(
        "= 99.2 g",
      );
    });
    await waitFor(() => {
      expect(
        postBodies("/api/nutrition/foods/6512c0ffee1234567890abcd", "PATCH"),
      ).toHaveLength(1);
    });
    const patch = postBodies(
      "/api/nutrition/foods/6512c0ffee1234567890abcd",
      "PATCH",
    )[0] as { variants: { gramsPerServing?: number }[] };
    expect(patch.variants[1]?.gramsPerServing).toBeCloseTo(99.2, 1);
  });
});
