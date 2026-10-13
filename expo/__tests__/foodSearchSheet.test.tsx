/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
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
import { FoodSearchSheet } from "@/components/nutrition/FoodSearchSheet";
import NutritionIndexRoute from "@/app/(app)/(tabs)/nutrition/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function callsMatching(prefix: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => String(c[0]).startsWith(prefix));
}

function findCall(path: string, method: string): unknown[] | undefined {
  return mockApiFetch.mock.calls.find(
    (c) =>
      String(c[0]).startsWith(path) &&
      (c[2] as { method?: string } | undefined)?.method === method,
  );
}

const mockOverviewData = {
  foods: [
    {
      _id: "6512c0ffee00000000000001",
      name: "Rolled Oats",
      isSaved: true,
      servingSize: 50,
      servingUnit: "g",
      nutrition: { calories: 375, protein: 13, carbs: 68, fats: 7 },
    },
  ],
  recent: [
    {
      _id: "6512c0ffee00000000000002",
      name: "Greek Yogurt",
      servingSize: 150,
      servingUnit: "g",
      nutrition: { calories: 120, protein: 15, carbs: 6, fats: 2 },
    },
  ],
  frequent: [
    {
      _id: "6512c0ffee00000000000003",
      name: "Chicken Breast",
      servingSize: 100,
      servingUnit: "g",
      nutrition: { calories: 165, protein: 31, carbs: 0, fats: 4 },
    },
  ],
  meals: [
    {
      _id: "6512c0ffee00000000000004",
      name: "High Protein Oatmeal",
      items: [{ name: "Oats" }, { name: "Whey" }],
      totalNutrition: { calories: 450, protein: 35, carbs: 60, fats: 8 },
    },
  ],
};

const usdaHit = {
  _id: "usda-9876543",
  name: "Almond Butter",
  brand: "Nutty",
  source: "usda",
  servingSize: 2,
  servingUnit: "tbsp",
  gramsPerServing: 32,
  nutrition: { calories: 190, protein: 7, carbs: 6, fats: 17 },
};

const importedAlmondButter = {
  success: true,
  created: true,
  food: {
    _id: "6512c0ffee99999999999999",
    name: "Almond Butter",
    brand: "Nutty",
    source: "usda",
    externalId: "9876543",
    servingSize: 2,
    servingUnit: "tbsp",
    gramsPerServing: 32,
    nutrition: { calories: 190, protein: 7, carbs: 6, fats: 17 },
    variants: [
      {
        _id: "6512c0ffee99999999999998",
        name: "Default",
        isDefault: true,
        servingSize: 2,
        servingUnit: "tbsp",
        gramsPerServing: 32,
        nutrition: { calories: 190, protein: 7, carbs: 6, fats: 17 },
      },
    ],
  },
};

describe("FoodSearchSheet — Acceptance Criteria & Parity", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockApiFetch.mockImplementation(async (url: string, _schema: unknown, init?: { method?: string }) => {
      const method = init?.method ?? "GET";
      if (url.startsWith("/api/nutrition/foods/overview")) {
        return mockOverviewData;
      }
      if (url.startsWith("/api/nutrition/foods/recent")) {
        return { foods: mockOverviewData.recent };
      }
      if (url.startsWith("/api/nutrition/foods/frequent")) {
        return { foods: mockOverviewData.frequent };
      }
      if (url.startsWith("/api/me/foods")) {
        if (method === "POST") return { saved: true, alreadyExists: false };
        if (method === "DELETE") return { success: true };
        return { foods: mockOverviewData.foods };
      }
      if (url.startsWith("/api/meals")) {
        return { meals: mockOverviewData.meals };
      }
      if (url.startsWith("/api/nutrition/foods/import") && method === "POST") {
        return importedAlmondButter;
      }
      if (url.startsWith("/api/nutrition/foods")) {
        return { foods: [usdaHit] };
      }
      return {};
    });
  });

  it("(id: e015c8ba) With an empty query the sheet shows Your foods, Recent and Frequent from the same endpoints as the web", async () => {
    const { getByTestId, getByText } = render(
      <FoodSearchSheet visible={true} onClose={() => {}} />,
    );

    // Endpoint parity: calls GET /api/nutrition/foods/overview with auth token
    await waitFor(() => {
      expect(callsMatching("/api/nutrition/foods/overview").length).toBeGreaterThan(0);
    });
    const overviewCall = callsMatching("/api/nutrition/foods/overview")[0]!;
    const opts = overviewCall[2] as { baseUrl?: string; getToken?: () => string | undefined };
    expect(opts.baseUrl).toBe(WEBAPP_BASE_URL);
    expect(opts.getToken?.()).toBe(mockToken);

    // Section headers and foods matching web overview
    await waitFor(() => {
      expect(getByTestId("overview-header-your-foods")).toBeTruthy();
      expect(getByText("Rolled Oats")).toBeTruthy();

      expect(getByTestId("overview-header-recent")).toBeTruthy();
      expect(getByText("Greek Yogurt")).toBeTruthy();

      expect(getByTestId("overview-header-frequent")).toBeTruthy();
      expect(getByText("Chicken Breast")).toBeTruthy();

      expect(getByTestId("overview-header-meals")).toBeTruthy();
      expect(getByText("High Protein Oatmeal")).toBeTruthy();
    });

    // Test filter chips: Foods tab calls /api/me/foods
    fireEvent.press(getByTestId("food-filter-mine"));
    await waitFor(() => {
      expect(callsMatching("/api/me/foods").length).toBeGreaterThan(0);
    });

    // Test filter chips: Recent tab calls /api/nutrition/foods/recent
    fireEvent.press(getByTestId("food-filter-recent"));
    await waitFor(() => {
      expect(callsMatching("/api/nutrition/foods/recent").length).toBeGreaterThan(0);
    });

    // Test filter chips: Frequent tab calls /api/nutrition/foods/frequent
    fireEvent.press(getByTestId("food-filter-frequent"));
    await waitFor(() => {
      expect(callsMatching("/api/nutrition/foods/frequent").length).toBeGreaterThan(0);
    });

    // Test filter chips: Meals tab calls /api/meals?mine=true
    fireEvent.press(getByTestId("food-filter-meals"));
    await waitFor(() => {
      expect(callsMatching("/api/meals?mine=true").length).toBeGreaterThan(0);
    });

    // Tapping the active chip clears filter back to 'all'
    fireEvent.press(getByTestId("food-filter-meals"));
    await waitFor(() => {
      expect(getByTestId("food-search-overview")).toBeTruthy();
    });
  });

  it("(id: e015c8bb) Picking a USDA hit imports it once and it appears in the web's Recent list after logging", async () => {
    const onPickFood = jest.fn();
    const { getByTestId } = render(
      <FoodSearchSheet
        visible={true}
        onClose={() => {}}
        onPickFood={onPickFood}
        debounceMs={0}
      />,
    );

    // Type search query
    fireEvent.changeText(getByTestId("food-search-input"), "almond");

    await waitFor(() => {
      expect(getByTestId("food-search-result-usda-9876543")).toBeTruthy();
    });

    // Pick the USDA hit
    await act(async () => {
      fireEvent.press(getByTestId("food-search-result-usda-9876543"));
    });

    // Verified: imports through ungated POST /api/nutrition/foods/import
    await waitFor(() => {
      expect(findCall("/api/nutrition/foods/import", "POST")).toBeTruthy();
    });
    const importCall = findCall("/api/nutrition/foods/import", "POST")!;
    expect(importCall[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: { source: "usda", externalId: "9876543" },
      }),
    );

    // Verified: handed to picker with real imported Food document and ObjectId
    expect(onPickFood).toHaveBeenCalledTimes(1);
    const pickedFood = onPickFood.mock.calls[0]![0];
    expect(pickedFood._id).toBe("6512c0ffee99999999999999");
    expect(pickedFood.name).toBe("Almond Butter");

    // Picking a food that already has an ObjectId passes through with NO import
    onPickFood.mockClear();
    const realFood = {
      _id: "6512c0ffee11111111111111",
      name: "Existing DB Food",
      source: "manual" as const,
      nutrition: { calories: 100, protein: 10, carbs: 10, fats: 2 },
      variants: [],
    };
    mockApiFetch.mockResolvedValueOnce({ foods: [realFood] });
    fireEvent.changeText(getByTestId("food-search-input"), "existing");

    await waitFor(() => {
      expect(getByTestId("food-search-result-6512c0ffee11111111111111")).toBeTruthy();
    });

    const importsBefore = mockApiFetch.mock.calls.filter(
      (c) => String(c[0]).startsWith("/api/nutrition/foods/import"),
    ).length;

    await act(async () => {
      fireEvent.press(getByTestId("food-search-result-6512c0ffee11111111111111"));
    });

    const importsAfter = mockApiFetch.mock.calls.filter(
      (c) => String(c[0]).startsWith("/api/nutrition/foods/import"),
    ).length;

    // Zero additional import calls (imported exactly once)
    expect(importsAfter).toBe(importsBefore);
    expect(onPickFood).toHaveBeenCalledWith(expect.objectContaining({ _id: "6512c0ffee11111111111111" }));
  });

  it("(id: e015c8bc) Bookmarking a food natively shows it under Foods in My Stuff on the web", async () => {
    const { getByTestId } = render(
      <FoodSearchSheet visible={true} onClose={() => {}} debounceMs={0} />,
    );

    // 1. Bookmarking an existing Food calls POST /api/me/foods { foodId }
    await waitFor(() => {
      expect(getByTestId("food-bookmark-6512c0ffee00000000000002")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("food-bookmark-6512c0ffee00000000000002"));
    });

    await waitFor(() => {
      expect(findCall("/api/me/foods", "POST")).toBeTruthy();
    });
    const saveCall = findCall("/api/me/foods", "POST")!;
    expect(saveCall[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: { foodId: "6512c0ffee00000000000002" },
      }),
    );

    // 2. Toggling bookmark on an already saved food calls DELETE /api/me/foods/{foodId}
    await waitFor(() => {
      expect(getByTestId("food-bookmark-6512c0ffee00000000000001")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("food-bookmark-6512c0ffee00000000000001"));
    });

    await waitFor(() => {
      expect(findCall("/api/me/foods/6512c0ffee00000000000001", "DELETE")).toBeTruthy();
    });

    // 3. Bookmarking an external hit (USDA) imports it first so canonical Food document is saved
    fireEvent.changeText(getByTestId("food-search-input"), "almond");
    await waitFor(() => {
      expect(getByTestId("food-bookmark-usda-9876543")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("food-bookmark-usda-9876543"));
    });

    // Import was called first
    expect(findCall("/api/nutrition/foods/import", "POST")).toBeTruthy();
    // Then save was called with the imported ObjectId
    const lastSaveCall = callsMatching("/api/me/foods").filter(
      (c) => (c[2] as { method?: string } | undefined)?.method === "POST",
    ).pop()!;
    expect(lastSaveCall[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: { foodId: "6512c0ffee99999999999999" },
      }),
    );
  });

  it("handles persistable: false previews: cannot be logged, offers search as web does", async () => {
    const onPickFood = jest.fn();
    const previewFood = {
      _id: "preview-off-123456",
      name: "Unregistered Barcode Item",
      persistable: false,
      nutrition: { calories: 250 },
    };
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.includes("preview")) {
        return { foods: [previewFood] };
      }
      if (url.startsWith("/api/nutrition/foods/overview")) {
        return mockOverviewData;
      }
      return { foods: [] };
    });

    const { getByTestId, getByText } = render(
      <FoodSearchSheet
        visible={true}
        onClose={() => {}}
        onPickFood={onPickFood}
        debounceMs={0}
      />,
    );

    fireEvent.changeText(getByTestId("food-search-input"), "preview");
    await waitFor(() => {
      expect(getByTestId("food-search-result-preview-off-123456")).toBeTruthy();
    });

    // Tapping persistable: false item shows error and does not pick/log
    await act(async () => {
      fireEvent.press(getByTestId("food-search-result-preview-off-123456"));
    });

    expect(onPickFood).not.toHaveBeenCalled();
    expect(
      getByText("This food preview cannot be logged. Try searching for this food by name."),
    ).toBeTruthy();
  });

  it("opens the food search sheet from the search bar, add button and each section's add on nutrition index", async () => {
    const mealLogsFixture = {
      date: "2026-06-01",
      logs: [
        {
          _id: "log-1",
          loggedAt: "2026-06-01T08:00:00.000Z",
          tags: ["breakfast"],
          items: [{ _id: "i1", name: "Oats", servings: 1, servingSize: 50, servingUnit: "g", nutrition: { calories: 300, protein: 10, carbs: 50, fats: 5 } }],
          totalNutrition: { calories: 300, protein: 10, carbs: 50, fats: 5 },
        },
      ],
      dailyTotals: { calories: 300, protein: 10, carbs: 50, fats: 5, fiber: 0 },
    };

    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/meal-logs")) return mealLogsFixture;
      if (url.startsWith("/api/nutrition/foods/overview")) return mockOverviewData;
      if (url.startsWith("/api/nutrition/log")) return { dailyTotals: { calories: 300, protein: 10, carbs: 50, fats: 5, fiber: 0 }, quickAdds: [] };
      if (url.startsWith("/api/nutrition/goals")) return { goals: { calories: 2000, protein: 150, carbs: 200, fats: 65 } };
      if (url.startsWith("/api/goals")) return { nutrition: { calories: 2000, protein: 150, carbs: 200, fats: 65 } };
      if (url.startsWith("/api/nutrition/meal-schedule")) return { windows: [{ tag: "breakfast", startMinutes: 420, endMinutes: 600 }] };
      if (url.startsWith("/api/tags")) return { defaults: ["breakfast", "lunch", "dinner", "snack"], userTags: [] };
      return {};
    });

    const { getByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-search-bar")).toBeTruthy();
      expect(getByTestId("nutrition-add-food-breakfast")).toBeTruthy();
    });

    // 1. Open from search bar
    fireEvent.press(getByTestId("nutrition-search-bar"));
    await waitFor(() => {
      expect(getByTestId("food-search-sheet")).toBeTruthy();
    });

    // Close
    fireEvent.press(getByTestId("food-search-sheet-backdrop"));

    // 2. Open from section's add — the persistent "Find a food" button
    // duplicated the search bar above it and is gone (NP-262).
    fireEvent.press(getByTestId("nutrition-add-food-breakfast"));
    await waitFor(() => {
      expect(getByTestId("food-search-sheet")).toBeTruthy();
    });
  });

  it("(id: NP-261) rows show per-serving calories, the serving text and a BEST MATCH badge; the header has a close X and an ADDING TO pill", async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/nutrition/foods/overview")) {
        return { foods: [], recent: [], frequent: [], meals: [] };
      }
      if (url.startsWith("/api/nutrition/foods")) {
        return {
          foods: [
            {
              _id: "6512c0ffee00000000000055",
              name: "Zest Delites Banana",
              isBestMatch: true,
              servingSize: 100,
              servingUnit: "g",
              alternateServings: [{ label: "1 medium (118 g)", multiplier: 1.18 }],
              nutrition: { calories: 348, protein: 1.1, carbs: 23, fats: 0.4 },
            },
          ],
        };
      }
      return {};
    });

    const onClose = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <FoodSearchSheet
        visible={true}
        onClose={onClose}
        currentTag="breakfast"
        debounceMs={0}
      />,
    );

    // A tag puts an "ADDING TO <TAG>" pill in the header, next to a close X.
    expect(getByTestId("food-search-adding-to")).toBeTruthy();
    expect(getByTestId("food-search-adding-to")).toHaveTextContent("ADDING TO BREAKFAST");

    fireEvent.changeText(getByTestId("food-search-input"), "banana");

    await waitFor(() => {
      expect(getByTestId("food-search-result-6512c0ffee00000000000055")).toBeTruthy();
    });

    // BEST MATCH badge on the crowned top result.
    expect(
      getByTestId("food-search-result-6512c0ffee00000000000055-best-match"),
    ).toBeTruthy();

    // Per-SERVING calories (348 * 1.18, rounded), not the raw 348 per-100 g
    // storage figure — and the serving text under the name.
    const caloriesNode = getByTestId("food-search-result-6512c0ffee00000000000055-calories");
    expect(caloriesNode).toHaveTextContent("411 cal");
    expect(
      getByTestId("food-search-result-6512c0ffee00000000000055-serving"),
    ).toHaveTextContent("1 medium (118 g)");

    // Close X calls onClose.
    fireEvent.press(getByTestId("food-search-close"));
    expect(onClose).toHaveBeenCalledTimes(1);

    // A tag-less sheet (standalone search) still shows the close X, but
    // no ADDING TO pill — there is no tag to name.
    const { getByTestId: getByTestId2, queryByTestId: queryByTestId2 } = render(
      <FoodSearchSheet visible={true} onClose={() => {}} debounceMs={0} />,
    );
    expect(getByTestId2("food-search-close")).toBeTruthy();
    expect(queryByTestId2("food-search-adding-to")).toBeNull();
    expect(queryByTestId("food-search-adding-to")).toBeTruthy();
  });
});

describe("Card NP-321 — FoodSearchSheet header, capture row and badges", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/nutrition/foods/overview")) {
        return { foods: [], recent: [], frequent: [], meals: [] };
      }
      if (url.startsWith("/api/meals")) return { meals: [] };
      return {};
    });
  });

  it("(id: np321-title) renders its own padded title ('Find a food' is no longer flush to the edge) and a Custom shortcut that routes to food/new", async () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <FoodSearchSheet visible={true} onClose={onClose} debounceMs={0} />,
    );
    const title = getByTestId("food-search-sheet-title");
    expect(title).toHaveTextContent("Find a food");
    const titleRowStyle = title.props.style;
    const flat = Array.isArray(titleRowStyle)
      ? Object.assign({}, ...titleRowStyle)
      : titleRowStyle;
    // Not asserting an exact px value (that's the sheet's job) — only that
    // this component no longer renders the title with zero padding.
    expect(flat.paddingHorizontal).not.toBe(0);

    fireEvent.press(getByTestId("food-search-custom-food"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/nutrition/food/new");
  });

  it("(id: np321-placeholder) the search box matches the web's placeholder, not the stale 'Apple, chicken breast…'", () => {
    const { getByPlaceholderText, queryByPlaceholderText } = render(
      <FoodSearchSheet visible={true} onClose={() => {}} debounceMs={0} />,
    );
    expect(
      getByPlaceholderText("Search or describe foods and meals…"),
    ).toBeTruthy();
    expect(queryByPlaceholderText("Apple, chicken breast…")).toBeNull();
  });

  it("(id: np321-capture-row) shows Barcode / Snap / Upload while the box is empty, collapses once typing starts, and Snap/Upload only fire (and close the sheet first) when the caller wires them", async () => {
    const onClose = jest.fn();
    const onSnapPhoto = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <FoodSearchSheet
        visible={true}
        onClose={onClose}
        debounceMs={0}
        onSnapPhoto={onSnapPhoto}
      />,
    );
    expect(getByTestId("food-search-capture-row")).toBeTruthy();
    expect(getByTestId("food-search-barcode-button")).toBeTruthy();
    expect(getByTestId("food-search-snap-button")).toBeTruthy();
    // Upload has no handler here — disabled, but still rendered (same shape
    // as the web's `disabled={!onUpload}`, not a vanishing button).
    expect(getByTestId("food-search-upload-button").props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(getByTestId("food-search-snap-button"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSnapPhoto).toHaveBeenCalledTimes(1);

    fireEvent.changeText(getByTestId("food-search-input"), "banana");
    await waitFor(() => {
      expect(queryByTestId("food-search-capture-row")).toBeNull();
    });
  });

  it("(id: np321-describe) the green describe button only shows once there's text and a handler, and hands the sheet's own query off", () => {
    const onClose = jest.fn();
    const onDescribe = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <FoodSearchSheet
        visible={true}
        onClose={onClose}
        debounceMs={0}
        onDescribe={onDescribe}
      />,
    );
    expect(queryByTestId("food-search-describe-button")).toBeNull();
    fireEvent.changeText(getByTestId("food-search-input"), "two eggs and toast");
    expect(getByTestId("food-search-describe-button")).toBeTruthy();
    fireEvent.press(getByTestId("food-search-describe-button"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDescribe).toHaveBeenCalledWith("two eggs and toast");
  });

  it("(id: np321-reopen-empty) the query does not survive a close/reopen, matching the web starting empty", async () => {
    const { getByTestId, rerender } = render(
      <FoodSearchSheet visible={true} onClose={() => {}} debounceMs={0} />,
    );
    fireEvent.changeText(getByTestId("food-search-input"), "banana");
    expect(getByTestId("food-search-input").props.value).toBe("banana");

    rerender(<FoodSearchSheet visible={false} onClose={() => {}} debounceMs={0} />);
    rerender(<FoodSearchSheet visible={true} onClose={() => {}} debounceMs={0} />);

    await waitFor(() => {
      expect(getByTestId("food-search-input").props.value).toBe("");
    });
  });

  it("(id: np321-bookmark-tip) hints at the bookmark when nothing is saved yet, the web's 'Save foods you eat often' tip", async () => {
    const { getByTestId } = render(
      <FoodSearchSheet visible={true} onClose={() => {}} debounceMs={0} />,
    );
    await waitFor(() => {
      expect(getByTestId("food-search-overview")).toBeTruthy();
    });
    expect(getByTestId("food-search-bookmark-tip")).toHaveTextContent(
      "Save foods you eat often — tap the bookmark on any result to add it here.",
    );
  });

  it("(id: np321-best-match-color) the BEST MATCH badge is a blue tint, not the brand-red primary used elsewhere on the same row", async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/nutrition/foods/overview")) {
        return { foods: [], recent: [], frequent: [], meals: [] };
      }
      if (url.startsWith("/api/nutrition/foods")) {
        return {
          foods: [
            {
              _id: "6512c0ffee00000000000099",
              name: "Zest Delites Banana",
              isBestMatch: true,
              isSaved: true, // so the row's bookmark icon renders in `colors.primary`
              servingSize: 100,
              servingUnit: "g",
              nutrition: { calories: 348, protein: 1.1, carbs: 23, fats: 0.4 },
            },
          ],
        };
      }
      if (url.startsWith("/api/meals")) return { meals: [] };
      return {};
    });
    const { getByTestId } = render(
      <FoodSearchSheet visible={true} onClose={() => {}} debounceMs={0} />,
    );
    fireEvent.changeText(getByTestId("food-search-input"), "banana");

    const rowId = "6512c0ffee00000000000099";
    await waitFor(() => {
      expect(getByTestId(`food-search-result-${rowId}`)).toBeTruthy();
    });

    const badge = getByTestId(`food-search-result-${rowId}-best-match`);
    const badgeStyle = Array.isArray(badge.props.style)
      ? Object.assign({}, ...badge.props.style)
      : badge.props.style;

    // `tint("info", …)` always renders `rgba(r, g, b, a)` (see
    // `lib/theme/tokens.ts`'s `tintToken`) — a flat `colors.primary` (what
    // the badge used to reuse) is a bare `rgb(r g b)`, never this shape.
    expect(String(badgeStyle.backgroundColor)).toMatch(/^rgba\(/);
  });
});

describe("Card NP-371 — single header bar, interactive tag dropdown, capture/chip spacing", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockApiFetch.mockImplementation(async (url: string, _schema: unknown, init?: { method?: string }) => {
      const method = init?.method ?? "GET";
      if (url.startsWith("/api/nutrition/foods/overview")) {
        return { foods: [], recent: [], frequent: [], meals: [] };
      }
      if (url.startsWith("/api/meals") && method === "POST") {
        return { success: true };
      }
      if (url.startsWith("/api/meals")) return { meals: [] };
      return {};
    });
  });

  it("(id: np371-single-header) the title row carries ONE circular ✕ — there is no second close button next to a non-interactive 'ADDING TO' pill", () => {
    const { getByTestId, queryAllByTestId } = render(
      <FoodSearchSheet visible={true} onClose={() => {}} currentTag="breakfast" debounceMs={0} />,
    );
    // Exactly one close button in the whole tree.
    expect(queryAllByTestId("food-search-close")).toHaveLength(1);
    const close = getByTestId("food-search-close");
    const closeStyle = Array.isArray(close.props.style)
      ? Object.assign({}, ...close.props.style)
      : close.props.style;
    // Circular — web parity for `h-8 w-8 rounded-full` (radius === half the box).
    expect(closeStyle.width).toBe(closeStyle.height);
    expect(closeStyle.borderRadius).toBe(closeStyle.width / 2);
  });

  it("(id: np371-tag-dropdown) 'ADDING TO' is now an interactive dropdown: opens a tag grid, and picking one updates the label", () => {
    const { getByTestId, queryByTestId } = render(
      <FoodSearchSheet
        visible={true}
        onClose={() => {}}
        currentTag="breakfast"
        availableTags={{ defaults: ["breakfast", "lunch", "dinner", "snack"], userTags: ["post-workout"] }}
        debounceMs={0}
      />,
    );
    expect(getByTestId("food-search-adding-to")).toHaveTextContent("ADDING TO BREAKFAST");
    expect(queryByTestId("food-search-tag-picker")).toBeNull();

    fireEvent.press(getByTestId("food-search-adding-to"));
    expect(getByTestId("food-search-tag-picker")).toBeTruthy();
    expect(getByTestId("food-search-tag-lunch")).toBeTruthy();
    expect(getByTestId("food-search-tag-post-workout")).toBeTruthy();

    fireEvent.press(getByTestId("food-search-tag-lunch"));
    expect(getByTestId("food-search-adding-to")).toHaveTextContent("ADDING TO LUNCH");
    // The picker closes once a tag is chosen, same as the web dropdown.
    expect(queryByTestId("food-search-tag-picker")).toBeNull();
  });

  it("(id: np371-new-tag) the '+ New tag' input creates and selects a custom tag inline, matching the web's dropdown", () => {
    const { getByTestId } = render(
      <FoodSearchSheet visible={true} onClose={() => {}} currentTag="breakfast" debounceMs={0} />,
    );
    fireEvent.press(getByTestId("food-search-adding-to"));
    expect(getByTestId("food-search-new-tag-add").props.accessibilityState?.disabled ?? false).toBe(true);

    fireEvent.changeText(getByTestId("food-search-new-tag-input"), "Brunch Club");
    fireEvent.press(getByTestId("food-search-new-tag-add"));

    // Normalised the web's way — lowercased, spaces to hyphens.
    expect(getByTestId("food-search-adding-to")).toHaveTextContent("ADDING TO BRUNCH-CLUB");
  });

  it("(id: np371-tag-flows-to-log) the dropdown's chosen tag, not the caller's original currentTag, is what a saved-meal pick logs under", async () => {
    mockApiFetch.mockImplementation(async (url: string, _schema: unknown, init?: { method?: string }) => {
      const method = init?.method ?? "GET";
      if (url.startsWith("/api/nutrition/foods/overview")) {
        return { foods: [], recent: [], frequent: [], meals: [] };
      }
      if (url.startsWith("/api/meals") && method === "POST") return { success: true };
      if (url.startsWith("/api/meals")) {
        return {
          meals: [{ _id: "meal-1", name: "Oat Bowl", items: [{ name: "Oats" }], totalNutrition: { calories: 300 } }],
        };
      }
      return {};
    });
    const { getByTestId } = render(
      <FoodSearchSheet
        visible={true}
        onClose={() => {}}
        currentTag="breakfast"
        availableTags={{ defaults: ["breakfast", "lunch"], userTags: [] }}
        debounceMs={0}
      />,
    );
    fireEvent.press(getByTestId("food-search-adding-to"));
    fireEvent.press(getByTestId("food-search-tag-lunch"));

    fireEvent.press(getByTestId("food-filter-meals"));
    await waitFor(() => {
      expect(getByTestId("meal-result-meal-1")).toBeTruthy();
    });
    fireEvent.press(getByTestId("meal-result-meal-1"));

    await waitFor(() => {
      const logCall = findCall("/api/meals/meal-1/log", "POST");
      expect(logCall).toBeTruthy();
      const body = (logCall?.[2] as { body?: { tags?: string[] } })?.body;
      expect(body?.tags).toEqual(["lunch"]);
    });
  });

  it("(id: np371-capture-radius) Barcode / Snap / Upload are rounded-xl (12px), not the old 10px", () => {
    const { getByTestId } = render(
      <FoodSearchSheet visible={true} onClose={() => {}} debounceMs={0} onSnapPhoto={() => {}} onUpload={() => {}} />,
    );
    for (const id of ["food-search-barcode-button", "food-search-snap-button", "food-search-upload-button"]) {
      const node = getByTestId(id);
      const style = Array.isArray(node.props.style)
        ? Object.assign({}, ...node.props.style)
        : node.props.style;
      expect(style.borderRadius).toBe(12);
    }
  });

  it("(id: np371-overview-headers) overview and search section headers render as shaded strips (bg-muted/90, 11px semibold uppercase tracking-wide), matching the web's sticky header classes", async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/nutrition/foods/overview")) {
        return {
          foods: [
            { _id: "f1", name: "Oats", servingSize: 1, servingUnit: "g", nutrition: { calories: 1, protein: 0, carbs: 0, fats: 0 } },
          ],
          recent: [],
          frequent: [],
          meals: [],
        };
      }
      if (url.startsWith("/api/meals")) return { meals: [] };
      return {};
    });
    const { getByTestId } = render(
      <FoodSearchSheet visible={true} onClose={() => {}} debounceMs={0} />,
    );
    await waitFor(() => {
      expect(getByTestId("overview-header-your-foods")).toBeTruthy();
    });
    const header = getByTestId("overview-header-your-foods");
    expect(header.props.className).toContain("text-[11px]");
    expect(header.props.className).toContain("font-semibold");
    expect(header.props.className).toContain("uppercase");
    expect(header.props.className).toContain("tracking-wide");
    // No more plain `text-xs font-bold` — that was the un-styled transparent row.
    expect(header.props.className).not.toContain("font-bold");

    // Walk up to the wrapping strip (the Text's own host node sits inside
    // one or more intermediate component wrappers before the styled View).
    let headerRow = header.parent;
    while (headerRow && !String(headerRow.props?.className ?? "").includes("bg-muted")) {
      headerRow = headerRow.parent;
    }
    expect(headerRow?.props.className).toContain("bg-muted/90");
    expect(headerRow?.props.className).toContain("px-4");
    expect(headerRow?.props.className).toContain("py-1.5");
  });
});
