// ─── NP-261: picking a food opens the web's inline quantity picker ─────────
//
// The card: native picked a food straight into the basket with no amount,
// unit or time choice, and printed the per-100 g figure. The fix makes
// `FoodSearchSheet`'s basket mode expand a `QuantityPicker` under the tapped
// row (amount, unit, time, tag) instead of silently logging the default
// serving — "Add to <tag>" fires `onLogItem` (an immediate single log),
// "Build a meal" fires `onAddToBasket` with the member's own chosen
// quantity. When there's no tag to log under (the meal/recipe editors'
// ingredient picker, which only wires up `onAddToBasket`) that single
// action takes the primary slot and stays labelled "Build a meal".

/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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
import { FoodSearchSheet } from "@/components/nutrition/FoodSearchSheet";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const WHEY = {
  _id: "6512c0ffee00000000000071",
  name: "Whey Protein",
  servingSize: 1,
  servingUnit: "scoop",
  gramsPerServing: 32,
  nutrition: { calories: 130, protein: 24, carbs: 3, fats: 2 },
  variants: [],
};

function installHandler() {
  mockApiFetch.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/nutrition/foods/overview")) {
      return { foods: [WHEY], recent: [], frequent: [], meals: [] };
    }
    return {};
  });
}

const resultId = `food-search-result-${WHEY._id}`;

async function openRow(getByTestId: (id: string) => any) {
  await waitFor(() => {
    expect(getByTestId(resultId)).toBeTruthy();
  });
  await act(async () => {
    fireEvent.press(getByTestId(resultId));
  });
  await waitFor(() => {
    expect(getByTestId(`${resultId}-quantity-picker`)).toBeTruthy();
  });
}

describe("Card NP-261 — FoodSearchSheet's inline quantity picker (basket mode)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    installHandler();
  });

  it("expands the picker on tap and 'Add to <tag>' fires onLogItem with the chosen quantity, then collapses the row", async () => {
    const onLogItem = jest.fn();
    const onAddToBasket = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <FoodSearchSheet
        visible={true}
        onClose={() => {}}
        currentTag="breakfast"
        basketMode
        onLogItem={onLogItem}
        onAddToBasket={onAddToBasket}
        debounceMs={0}
      />,
    );

    await openRow(getByTestId);

    // Primary button is "Add to <Tag>" (title case), not the generic "Log Food".
    expect(getByTestId("log-food-button")).toHaveTextContent("Add to Breakfast");

    await act(async () => {
      fireEvent.press(getByTestId("log-food-button"));
    });

    expect(onLogItem).toHaveBeenCalledTimes(1);
    const picked = onLogItem.mock.calls[0]![0];
    expect(picked.food._id).toBe(WHEY._id);
    expect(picked.tag).toBe("breakfast");
    expect(picked.item).toEqual(
      expect.objectContaining({ name: "Whey Protein", servingUnit: "scoop" }),
    );
    expect(onAddToBasket).not.toHaveBeenCalled();

    // The row collapses — no stray picker left open after logging.
    expect(queryByTestId(`${resultId}-quantity-picker`)).toBeNull();
  });

  it("'Build a meal' (the secondary action) fires onAddToBasket instead, leaving onLogItem untouched", async () => {
    const onLogItem = jest.fn();
    const onAddToBasket = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <FoodSearchSheet
        visible={true}
        onClose={() => {}}
        currentTag="breakfast"
        basketMode
        onLogItem={onLogItem}
        onAddToBasket={onAddToBasket}
        debounceMs={0}
      />,
    );

    await openRow(getByTestId);

    const secondary = getByTestId("quantity-picker-secondary-action");
    expect(secondary).toHaveTextContent("Build a meal");

    await act(async () => {
      fireEvent.press(secondary);
    });

    expect(onAddToBasket).toHaveBeenCalledTimes(1);
    expect(onAddToBasket.mock.calls[0]![0].food._id).toBe(WHEY._id);
    expect(onLogItem).not.toHaveBeenCalled();
    expect(queryByTestId(`${resultId}-quantity-picker`)).toBeNull();
  });

  it("without onLogItem (the meal/recipe editors' ingredient picker), the single action is 'Build a meal' and there is no secondary button", async () => {
    const onAddToBasket = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <FoodSearchSheet
        visible={true}
        onClose={() => {}}
        basketMode
        onAddToBasket={onAddToBasket}
        debounceMs={0}
      />,
    );

    await openRow(getByTestId);

    expect(getByTestId("log-food-button")).toHaveTextContent("Build a meal");
    expect(queryByTestId("quantity-picker-secondary-action")).toBeNull();

    await act(async () => {
      fireEvent.press(getByTestId("log-food-button"));
    });

    expect(onAddToBasket).toHaveBeenCalledTimes(1);
  });

  it("tapping the expanded row again collapses the picker without firing either action", async () => {
    const onLogItem = jest.fn();
    const onAddToBasket = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <FoodSearchSheet
        visible={true}
        onClose={() => {}}
        currentTag="snack"
        basketMode
        onLogItem={onLogItem}
        onAddToBasket={onAddToBasket}
        debounceMs={0}
      />,
    );

    await openRow(getByTestId);

    await act(async () => {
      fireEvent.press(getByTestId(resultId));
    });

    await waitFor(() => {
      expect(queryByTestId(`${resultId}-quantity-picker`)).toBeNull();
    });
    expect(onLogItem).not.toHaveBeenCalled();
    expect(onAddToBasket).not.toHaveBeenCalled();
  });
});
