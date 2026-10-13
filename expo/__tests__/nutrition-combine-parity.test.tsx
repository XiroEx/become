/* eslint-disable import/first */
// ─── Combine logged items into one sitting, natively (NP-175) ────────────────
//
// The web lets a member pick items already logged today and fold them into one
// named sitting, optionally kept as a reusable meal, in ONE server request
// (`webapp/app/dashboard/nutrition/page.tsx:534-560`,
// `webapp/app/api/meal-logs/combine/route.ts`). This suite is the native half.
//
// The fake server below is the route's own behaviour, in the order the route
// does it: the merged log is written FIRST and only then are the picked items
// stripped from their sources, and the `custom-meals` quota is consulted ONLY
// when `saveAsMeal` is true. That ordering is the whole safety story, so the
// tests assert the screen makes exactly one request and never emulates the
// merge with a create plus a handful of deletes.

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { EntitlementsSnapshot } from "@become/core";

const TODAY = "2026-06-02";

let mockParams: Record<string, string | undefined> = {};
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
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

jest.mock("@/lib/time/localDay", () => {
  const actual = jest.requireActual("@/lib/time/localDay");
  return {
    __esModule: true,
    ...actual,
    useLocalDay: () => ({ day: TODAY, tzOffset: 0 }),
  };
});

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

// The snapshot, swapped per test. Everything else in the module stays real:
// the sheet's lock renders the SAME copy the web renders (`@become/core`).
let mockSnapshot: EntitlementsSnapshot | null = null;
const mockRefresh = jest.fn(async () => {});
jest.mock("@/lib/entitlements", () => {
  const actual = jest.requireActual("@/lib/entitlements");
  return {
    ...actual,
    useEntitlements: () => ({
      data: mockSnapshot,
      loading: false,
      enforced: mockSnapshot?.enforced ?? false,
      refresh: mockRefresh,
      feature: (feature: string) =>
        mockSnapshot?.features?.[
          feature as keyof EntitlementsSnapshot["features"]
        ] ?? null,
      canCreate: (feature: string) =>
        mockSnapshot?.features?.[
          feature as keyof EntitlementsSnapshot["features"]
        ]?.canCreate !== false,
    }),
  };
});

import { ApiError, apiFetch } from "@become/api-client";
import {
  defaultCombineName,
  selectableLogItems,
  selectionKey,
  toggleSelection,
} from "@/lib/nutrition/combineItems";
import NutritionIndexRoute from "../app/(app)/(tabs)/nutrition/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

// ─── Fixtures ────────────────────────────────────────────────────────────────

interface FixtureNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
}

interface FixtureItem {
  _id: string;
  name: string;
  servings: number;
  servingSize: number;
  servingUnit: string;
  nutrition: FixtureNutrition;
}

interface FixtureLog {
  _id: string;
  user: string;
  loggedAt: string;
  tags: string[];
  items: FixtureItem[];
  mealName?: string;
  source?: string;
  totalNutrition: FixtureNutrition;
}

const OATS: FixtureItem = {
  _id: "i1",
  name: "Oats",
  servings: 1,
  servingSize: 40,
  servingUnit: "g",
  nutrition: { calories: 150, protein: 5, carbs: 27, fats: 3, fiber: 4 },
};

const WHEY: FixtureItem = {
  _id: "i2",
  name: "Whey Protein",
  servings: 1,
  servingSize: 30,
  servingUnit: "g",
  nutrition: { calories: 120, protein: 24, carbs: 2, fats: 1, fiber: 0 },
};

const BANANA: FixtureItem = {
  _id: "i3",
  name: "Banana",
  servings: 1,
  servingSize: 1,
  servingUnit: "medium",
  nutrition: { calories: 105, protein: 1, carbs: 27, fats: 0, fiber: 3 },
};

function totalsOf(items: readonly FixtureItem[]): FixtureNutrition {
  return items.reduce<FixtureNutrition>(
    (acc, item) => ({
      calories: acc.calories + item.nutrition.calories * item.servings,
      protein: acc.protein + item.nutrition.protein * item.servings,
      carbs: acc.carbs + item.nutrition.carbs * item.servings,
      fats: acc.fats + item.nutrition.fats * item.servings,
      fiber: acc.fiber + item.nutrition.fiber * item.servings,
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 },
  );
}

function freshDay(): FixtureLog[] {
  return [
    {
      _id: "log-a",
      user: "u1",
      loggedAt: `${TODAY}T08:00:00.000Z`,
      tags: ["breakfast"],
      items: [{ ...OATS }, { ...WHEY }],
      source: "search",
      totalNutrition: totalsOf([OATS, WHEY]),
    },
    {
      _id: "log-b",
      user: "u1",
      loggedAt: `${TODAY}T08:05:00.000Z`,
      tags: ["breakfast"],
      items: [{ ...BANANA }],
      source: "search",
      totalNutrition: totalsOf([BANANA]),
    },
  ];
}

/** The three items, as the day shows them before anything is folded. */
const DAY_TOTALS = totalsOf([OATS, WHEY, BANANA]);

const goalsFixture = { calories: 2000, protein: 150, carbs: 200, fats: 65 };
const sideTablesFixture = { water: { current: 16, goal: 64 }, quickAdds: [] };
const scheduleFixture = {
  windows: [
    { tag: "breakfast", startMinutes: 420, endMinutes: 600 },
    { tag: "lunch", startMinutes: 720, endMinutes: 840 },
  ],
};
const tagsFixture = {
  defaults: ["breakfast", "lunch", "dinner", "snack"],
  userTags: [],
};

function freeAt3of3(): EntitlementsSnapshot {
  return {
    role: "member",
    tier: "free",
    enforced: true,
    grandfathered: false,
    subscription: null,
    checkoutAvailable: true,
    features: {
      // `allowed` stays TRUE at the cap on purpose — they may still edit and
      // delete the three meals they own. `canCreate` is the gate.
      "custom-meals": {
        allowed: true,
        canCreate: false,
        requiresTier: "plus",
        limit: 3,
        used: 3,
        remaining: 0,
        resetsAt: null,
        window: "lifetime",
      },
    },
  };
}

// ─── The fake server ─────────────────────────────────────────────────────────

interface CombineBody {
  picks?: { logId: string; itemId: string }[];
  mealName?: string;
  saveAsMeal?: boolean;
}

let day: FixtureLog[] = [];
let savedMeals: string[] = [];
let combineBodies: CombineBody[] = [];
let mealsUsed = 0;
const MEALS_LIMIT = 3;

/** `POST /api/meal-logs/combine`, in the route's own order. */
function combine(body: CombineBody) {
  const picks = Array.isArray(body.picks) ? body.picks : [];
  if (picks.length < 2) {
    throw new ApiError(400, { error: "Pick at least two items to combine" });
  }

  // Saving a reusable meal is the gated half; combining the day's rows is not.
  let mealId: string | null = null;
  if (body.saveAsMeal) {
    if (!body.mealName) {
      throw new ApiError(400, { error: "A meal needs a name" });
    }
    if (mealsUsed >= MEALS_LIMIT) {
      throw new ApiError(403, {
        error: "You have used all 3 of your saved meals.",
        feature: "custom-meals",
        requiresTier: "plus",
        limit: MEALS_LIMIT,
        remaining: 0,
      });
    }
    mealsUsed += 1;
    savedMeals.push(String(body.mealName));
    mealId = `meal-${savedMeals.length}`;
  }

  const picked = picks.map((pick) => {
    const log = day.find((l) => l._id === pick.logId);
    const item = log?.items.find((i) => i._id === pick.itemId);
    if (!log || !item) {
      throw new ApiError(404, { error: "Some items were not found" });
    }
    return { log, item };
  });

  // 1) Write the merged log FIRST, keeping the earliest source time and the
  //    union of tags.
  const items = picked.map(({ item }, idx) => ({
    ...item,
    _id: `merged-item-${idx + 1}`,
  }));
  const sources = [...new Set(picked.map((p) => p.log))];
  const loggedAt = sources
    .map((l) => l.loggedAt)
    .sort()
    .at(0) as string;
  const merged: FixtureLog = {
    _id: "log-merged",
    user: "u1",
    loggedAt,
    tags: [...new Set(sources.flatMap((l) => l.tags))],
    items,
    source: "manual",
    totalNutrition: totalsOf(items),
    ...(body.mealName ? { mealName: String(body.mealName) } : {}),
  };
  day.push(merged);

  // 2) Only now remove what was copied; a log emptied by the move is deleted.
  const removedLogIds: string[] = [];
  for (const log of sources) {
    const taken = new Set(
      picked.filter((p) => p.log === log).map((p) => p.item._id),
    );
    const remaining = log.items.filter((i) => !taken.has(i._id));
    if (remaining.length === 0) {
      day = day.filter((l) => l !== log);
      removedLogIds.push(log._id);
      continue;
    }
    log.items = remaining;
    log.totalNutrition = totalsOf(remaining);
  }

  return { success: true, log: merged, mealId, removedLogIds };
}

function handler(
  url: string,
  _schema?: unknown,
  init?: { method?: string; body?: unknown },
) {
  const method = init?.method ?? "GET";

  if (url.startsWith("/api/meal-logs/combine")) {
    combineBodies.push((init?.body ?? {}) as CombineBody);
    return combine((init?.body ?? {}) as CombineBody);
  }
  if (url.startsWith("/api/meal-logs")) {
    if (method === "GET") {
      const dateMatch = /date=(\d{4}-\d{2}-\d{2})/.exec(url);
      const forToday = (dateMatch?.[1] ?? TODAY) === TODAY;
      const logs = forToday ? day : [];
      return {
        date: dateMatch?.[1] ?? TODAY,
        logs,
        dailyTotals: totalsOf(logs.flatMap((l) => l.items)),
      };
    }
    return { success: true };
  }
  if (url.startsWith("/api/nutrition/log")) return sideTablesFixture;
  if (url.startsWith("/api/nutrition/goals")) return goalsFixture;
  if (url.startsWith("/api/goals")) return { todayKey: TODAY, nutrition: {} };
  if (url.startsWith("/api/nutrition/meal-schedule")) return scheduleFixture;
  if (url.startsWith("/api/tags")) return tagsFixture;
  if (url.startsWith("/api/meal-plans")) return { plans: [], days: [] };
  if (url.startsWith("/api/profile")) return { profile: { planPromoteMode: "manual" } };
  return {};
}

function writeCalls(prefix: string): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith(prefix) &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") !== "GET",
  );
}

/** Start select mode in breakfast and pick the three items. */
async function pickThree(screen: ReturnType<typeof render>) {
  const { getByTestId } = screen;
  await waitFor(() => {
    expect(getByTestId("nutrition-combine-start-breakfast")).toBeTruthy();
  });
  fireEvent.press(getByTestId("nutrition-combine-start-breakfast"));
  for (const itemId of ["i1", "i2", "i3"]) {
    fireEvent.press(getByTestId(`nutrition-item-row-${itemId}`));
  }
  await waitFor(() => {
    expect(getByTestId("nutrition-combine-count-breakfast").props.children).toBe(
      "3 selected",
    );
  });
  await act(async () => {
    fireEvent.press(getByTestId("nutrition-combine-submit-breakfast"));
  });
  await waitFor(() => {
    expect(getByTestId("combine-sheet-submit")).toBeTruthy();
  });
}

describe("Combine logged items natively (NP-175)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(
      async (url: string, schema: unknown, init?: { method?: string; body?: unknown }) =>
        handler(url, schema, init),
    );
    mockParams = { date: TODAY };
    mockPush.mockReset();
    mockRefresh.mockClear();
    mockSnapshot = null;
    day = freshDay();
    savedMeals = [];
    combineBodies = [];
    mealsUsed = 0;
  });

  // ── The helpers, against the web's own rules ──────────────────────────────

  it("offers only rows the route can address, and names a basket the web's way", () => {
    const items = selectableLogItems([
      ...freshDay(),
      // No subdocument id: not addressable as `{ logId, itemId }`, so not
      // selectable (webapp/components/nutrition/TagSection.tsx:314).
      {
        _id: "log-c",
        items: [{ name: "Ghost", servings: 1, nutrition: { calories: 10 } }],
      },
    ]);

    expect(items.map((i) => i.itemId)).toEqual(["i1", "i2", "i3"]);
    expect(items[0]?.key).toBe(selectionKey("log-a", "i1"));
    // Three names read as a name; four stop being one.
    expect(defaultCombineName(items)).toBe("Oats + Whey Protein + Banana");
    expect(defaultCombineName([...items, { ...items[0]!, key: "x" }])).toBe(
      "Oats + Whey Protein +2 more",
    );

    const picked = toggleSelection(new Set<string>(), items[0]!.key);
    expect([...picked]).toEqual([items[0]!.key]);
    expect([...toggleSelection(picked, items[0]!.key)]).toEqual([]);
  });

  // ── (id: e015ca92) ────────────────────────────────────────────────────────

  it("combining three items leaves ONE sitting with the same totals, in one request", async () => {
    const screen = render(<NutritionIndexRoute />);
    const { getByTestId, queryByTestId } = screen;

    // The day starts as three rows across two logs.
    await waitFor(() => {
      expect(getByTestId("nutrition-item-row-i1")).toBeTruthy();
    });
    expect(day).toHaveLength(2);
    const totalsLine = `${DAY_TOTALS.calories} kcal · ${DAY_TOTALS.protein}g P · ${DAY_TOTALS.carbs}g C · ${DAY_TOTALS.fats}g F`;
    expect(screen.getByText(totalsLine)).toBeTruthy();

    await pickThree(screen);

    // The sheet pre-fills the name and offers the save, because nothing is
    // enforced for this member.
    expect(getByTestId("combine-sheet-name")).toBeTruthy();
    expect(getByTestId("combine-sheet-save-toggle")).toBeTruthy();
    expect(getByTestId("combine-sheet-totals").props.children.join("")).toBe(
      `${DAY_TOTALS.calories} kcal · ${DAY_TOTALS.protein}g P · ${DAY_TOTALS.carbs}g C · ${DAY_TOTALS.fats}g F`,
    );

    await act(async () => {
      fireEvent.press(getByTestId("combine-sheet-submit"));
    });

    // ONE request, carrying all three picks.
    await waitFor(() => {
      expect(combineBodies).toHaveLength(1);
    });
    expect(combineBodies[0]?.picks).toEqual([
      { logId: "log-a", itemId: "i1" },
      { logId: "log-a", itemId: "i2" },
      { logId: "log-b", itemId: "i3" },
    ]);
    expect(combineBodies[0]?.mealName).toBe("Oats + Whey Protein + Banana");
    expect(combineBodies[0]?.saveAsMeal).toBe(true);

    // The server did the create-then-strip: one sitting left, same totals.
    expect(day).toHaveLength(1);
    expect(day[0]?._id).toBe("log-merged");
    expect(day[0]?.items.map((i) => i.name)).toEqual([
      "Oats",
      "Whey Protein",
      "Banana",
    ]);
    expect(day[0]?.totalNutrition).toEqual(DAY_TOTALS);
    expect(savedMeals).toEqual(["Oats + Whey Protein + Banana"]);

    // Nothing else was written — no create plus deletes standing in for the
    // atomic merge.
    expect(writeCalls("/api/meal-logs")).toHaveLength(1);

    // And the day still reads the same totals, from the refetch.
    await waitFor(() => {
      expect(queryByTestId("combine-sheet-submit")).toBeNull();
    });
    await waitFor(() => {
      expect(getByTestId("nutrition-item-row-merged-item-1")).toBeTruthy();
    });
    // Same sitting, same header totals as before the fold.
    expect(screen.getByText(totalsLine)).toBeTruthy();
    // Select mode closed itself with the sheet.
    expect(queryByTestId("nutrition-combine-bar-breakfast")).toBeNull();
  });

  // ── (id: e015ca93) ────────────────────────────────────────────────────────

  it("a free member at 3/3 meals can still combine — without saving one", async () => {
    mockSnapshot = freeAt3of3();
    mealsUsed = 3;

    const screen = render(<NutritionIndexRoute />);
    const { getByTestId, queryByTestId } = screen;

    await pickThree(screen);

    // No name field and no toggle: the save is what the cap refuses. The lock
    // explains it in the same words the web uses.
    expect(queryByTestId("combine-sheet-save-toggle")).toBeNull();
    expect(queryByTestId("combine-sheet-name")).toBeNull();
    expect(getByTestId("combine-sheet-lock")).toBeTruthy();
    expect(getByTestId("combine-sheet-lock-headline").props.children).toContain(
      "Saved meals",
    );
    // The button offers the fold, not the save.
    expect(screen.getByText("Combine 3")).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId("combine-sheet-submit"));
    });

    await waitFor(() => {
      expect(combineBodies).toHaveLength(1);
    });
    // `saveAsMeal: false`, so the route never reaches the custom-meals quota.
    expect(combineBodies[0]?.saveAsMeal).toBe(false);
    expect(combineBodies[0]?.mealName).toBeUndefined();
    expect(savedMeals).toEqual([]);
    expect(mealsUsed).toBe(3);
    expect(mockRefresh).not.toHaveBeenCalled();

    // The fold happened anyway: one sitting, same totals, no error shown.
    expect(day).toHaveLength(1);
    expect(day[0]?.totalNutrition).toEqual(DAY_TOTALS);
    expect(queryByTestId("combine-sheet-error")).toBeNull();
    await waitFor(() => {
      expect(queryByTestId("combine-sheet-submit")).toBeNull();
    });
  });

  it("keeps the server's words when a combine is refused, and the day untouched", async () => {
    const screen = render(<NutritionIndexRoute />);
    const { getByTestId } = screen;

    await pickThree(screen);

    mockApiFetch.mockImplementation(
      async (url: string, schema: unknown, init?: { method?: string; body?: unknown }) => {
        if (url.startsWith("/api/meal-logs/combine")) {
          throw new ApiError(404, { error: "Some logs were not found" });
        }
        return handler(url, schema, init);
      },
    );

    await act(async () => {
      fireEvent.press(getByTestId("combine-sheet-submit"));
    });

    await waitFor(() => {
      expect(getByTestId("combine-sheet-error").props.children).toBe(
        "Some logs were not found",
      );
    });
    // The sheet stays open over the still-intact selection.
    expect(getByTestId("nutrition-combine-count-breakfast")).toBeTruthy();
    expect(day).toHaveLength(2);
  });

  it("a second selection starts with a fresh name field", async () => {
    const screen = render(<NutritionIndexRoute />);
    const { getByTestId } = screen;

    await pickThree(screen);
    fireEvent.changeText(getByTestId("combine-sheet-name"), "Breakfast bowl");
    expect(getByTestId("combine-sheet-name").props.value).toBe("Breakfast bowl");

    // Leave this selection without combining, then start another.
    fireEvent.press(getByTestId("combine-sheet-cancel"));
    fireEvent.press(getByTestId("nutrition-combine-cancel-breakfast"));
    await waitFor(() => {
      expect(getByTestId("nutrition-combine-start-breakfast")).toBeTruthy();
    });

    fireEvent.press(getByTestId("nutrition-combine-start-breakfast"));
    fireEvent.press(getByTestId("nutrition-item-row-i1"));
    fireEvent.press(getByTestId("nutrition-item-row-i2"));
    await act(async () => {
      fireEvent.press(getByTestId("nutrition-combine-submit-breakfast"));
    });

    await waitFor(() => {
      expect(getByTestId("combine-sheet-name").props.value).toBe("");
    });
    // And it is pre-filled from the NEW picks.
    expect(getByTestId("combine-sheet-name").props.placeholder).toBe(
      "Oats + Whey Protein",
    );
    expect(combineBodies).toHaveLength(0);
  });

  it("select mode withholds the delete affordance — a pick must never delete a log", async () => {
    const screen = render(<NutritionIndexRoute />);
    const { getByTestId, queryByTestId } = screen;

    await waitFor(() => {
      expect(getByTestId("day-totals-entry-i1-remove")).toBeTruthy();
    });

    fireEvent.press(getByTestId("nutrition-combine-start-breakfast"));
    await waitFor(() => {
      expect(queryByTestId("day-totals-entry-i1-remove")).toBeNull();
    });

    // Cancel puts the row's delete back and drops the selection.
    fireEvent.press(getByTestId("nutrition-item-row-i1"));
    fireEvent.press(getByTestId("nutrition-combine-cancel-breakfast"));
    await waitFor(() => {
      expect(getByTestId("day-totals-entry-i1-remove")).toBeTruthy();
    });
    expect(queryByTestId("nutrition-combine-bar-breakfast")).toBeNull();
    expect(writeCalls("/api/meal-logs")).toHaveLength(0);
  });
});
