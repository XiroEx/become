/* eslint-disable import/first */
/**
 * FOOD PAGE + CUSTOM FOODS (NP-145).
 *
 * Native counterpart of `webapp/app/dashboard/foods/[id]/page.tsx` (bookmark
 * via `/api/me/foods`, bridge edits `PATCH /api/nutrition/foods/{id}` with
 * `variants`, `DELETE`, log sheet) and `webapp/app/dashboard/foods/new`
 * (`POST /api/nutrition/foods`, then bookmark, UpgradeSheet on the gate),
 * gated by the same predicate as both (`webapp/lib/nutrition/foodOwnership.ts`).
 *
 * The three criteria, each tested as the thing a member actually feels:
 *
 *   • (e015c9f1) Edit and Delete appear only on foods the member authored —
 *     `authoredBy`, or `createdBy` on a `source: 'manual'` row, never
 *     `createdBy` alone — matching the web. A catalogue row stamped with the
 *     member's own `createdBy` by the search background import shows neither.
 *   • (e015c9f2) A custom food created natively posts the web's own shape to
 *     `POST /api/nutrition/foods` (`{ name, brand, category, variants }`),
 *     which stamps `authoredBy` server-side — so it counts against
 *     custom-foods and appears on the web — then bookmarks it.
 *   • (e015c9f3) A free member at 3 custom foods sees the upgrade sheet on
 *     create — before the request (the snapshot says so) and after one (a
 *     403 says so), with their form still on the device either way.
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { act } from "react";
import * as fs from "fs";
import * as path from "path";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string | undefined> = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  useLocalSearchParams: () => mockParams,
}));

let mockUser: { _id: string; role?: string } | null = null;

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    token: mockMemberJwt(),
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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch, ApiError } from "@become/api-client";
import {
  configureEntitlementsStore,
  resetEntitlementsSnapshot,
  setEntitlementsToken,
} from "@/lib/entitlements";
import {
  getUpgradeSheetGate,
  hideUpgradeSheet,
} from "@/lib/entitlements/upgradeSheet";
import { clearAll, setCacheMemberId } from "@/lib/cache/lastKnown";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import FoodDetailRoute from "@/app/(app)/(tabs)/nutrition/food/[id]";
import NewFoodRoute from "@/app/(app)/(tabs)/nutrition/food/new";
import {
  foodOwnerIds,
  isFoodAdminRole,
  isFoodOwner,
  isMemberEnteredFood,
} from "@/lib/nutrition/foodOwnership";
import {
  customFoodCreateBody,
  customFoodVariant,
  validateCustomFoodInput,
} from "@/lib/nutrition/customFoods";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const NOW_MS = Date.UTC(2026, 9, 4, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function jwtFor(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Math.floor((NOW_MS + 30 * DAY_MS) / 1000) }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig-${userId}`;
}

/** Prefixed `mock` so the `useAuth` factory above may reach it (jest rule). */
function mockMemberJwt(): string {
  return jwtFor("member-1");
}

const MEMBER_JWT = mockMemberJwt();

const WEBAPP_DIR = path.resolve(__dirname, "..", "..", "webapp");

function webSource(...segments: string[]): string {
  return fs.readFileSync(path.join(WEBAPP_DIR, ...segments), "utf8");
}

const FOOD_OWNERSHIP_SRC = webSource("lib", "nutrition", "foodOwnership.ts");
const NEW_FOOD_SRC = webSource("app", "dashboard", "foods", "new", "page.tsx");
const FOOD_DETAIL_SRC = webSource("app", "dashboard", "foods", "[id]", "page.tsx");

function freePlan(canCreate: boolean, remaining: number, enforced = true) {
  return {
    role: "user",
    tier: "free",
    enforced,
    grandfathered: false,
    subscription: null,
    checkoutAvailable: true,
    features: {
      "custom-foods": {
        allowed: true,
        canCreate,
        requiresTier: "plus",
        limit: 3,
        used: 3 - remaining,
        remaining,
        resetsAt: null,
        window: "lifetime",
      },
    },
  };
}

const AT_CAP = freePlan(false, 0);
const ROOM_LEFT = freePlan(true, 2);
const UNENFORCED = freePlan(true, 3, false);

/** The entitlements answer this test is currently scripting. */
let entitlementsBody: unknown = UNENFORCED;

/** Route `apiFetch` by path; entitlements reads answer from the variable. */
function routeFetch(impl: (path: string, init?: unknown) => unknown) {
  mockApiFetch.mockImplementation(
    async (p: string, _schema: unknown, init?: unknown) => {
      if (p === "/api/me/entitlements") return entitlementsBody;
      return impl(p, init);
    },
  );
}

function postBodies(pathname: string, method: string): Record<string, unknown>[] {
  return mockApiFetch.mock.calls
    .filter(([p, , init]) => {
      const i = (init ?? {}) as { method?: string };
      return p === pathname && i.method === method;
    })
    .map(([, , init]) => (init as { body: Record<string, unknown> }).body);
}

function gate403(): unknown {
  return new ApiError(403, {
    error: "You've saved all 3 of your free custom foods.",
    feature: "custom-foods",
    requiresTier: "plus",
    limit: 3,
    remaining: 0,
    resetsAt: null,
    window: "lifetime",
  });
}

let storage: AsyncStorageLike;

beforeEach(async () => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
  mockApiFetch.mockReset();
  mockParams = {};
  mockUser = { _id: "member-1", role: "user" };
  entitlementsBody = UNENFORCED;
  storage = createMemoryAsyncStorage();
  await AsyncStorage.clear();
  await clearAll(storage);
  setCacheMemberId(null);
  configureEntitlementsStore({ baseUrl: "https://example.test", storage });
  setEntitlementsToken(MEMBER_JWT);
  resetEntitlementsSnapshot();
  hideUpgradeSheet();
  jest.spyOn(Date, "now").mockImplementation(() => NOW_MS);
});

afterEach(async () => {
  jest.restoreAllMocks();
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
  hideUpgradeSheet();
  await clearAll(storage);
  await AsyncStorage.clear();
});

// ───────────────────────────────────────────────────────────────────────────
// The predicate: the same function the server uses, ported verbatim.
// ───────────────────────────────────────────────────────────────────────────

describe("foodOwnership matches the web predicate", () => {
  it("is the same rule the web file states: authoredBy, or createdBy on manual", () => {
    // The web file documents the rule in prose; the native port must keep
    // answering it the same way.
    expect(FOOD_OWNERSHIP_SRC).toContain("authoredBy");
    expect(FOOD_OWNERSHIP_SRC).toContain("source: 'manual'");
    expect(isFoodOwner({ authoredBy: "member-1", source: "manual" }, "member-1")).toBe(true);
    expect(isFoodOwner({ createdBy: "member-1", source: "manual" }, "member-1")).toBe(true);
    // createdBy alone is provenance, not ownership.
    expect(isFoodOwner({ createdBy: "member-1", source: "usda" }, "member-1")).toBe(false);
    expect(
      isFoodOwner({ createdBy: "member-1", source: "openfoodfacts" }, "member-1"),
    ).toBe(false);
    expect(isFoodOwner({ createdBy: "member-1" }, "member-1")).toBe(false);
    expect(isFoodOwner({ authoredBy: "other", source: "manual" }, "member-1")).toBe(false);
    expect(isFoodOwner(null, "member-1")).toBe(false);
    expect(isFoodOwner({ authoredBy: "member-1" }, null)).toBe(false);
  });

  it("attributes the slot to authoredBy first, and knows a manual row", () => {
    expect(foodOwnerIds({ authoredBy: "member-1", source: "usda" })).toEqual([
      "member-1",
    ]);
    expect(
      foodOwnerIds({ createdBy: "member-1", source: "manual" }),
    ).toEqual(["member-1"]);
    expect(isMemberEnteredFood({ source: "manual" })).toBe(true);
    expect(isMemberEnteredFood({ source: "usda" })).toBe(false);
    expect(isFoodAdminRole("admin")).toBe(true);
    expect(isFoodAdminRole("user")).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// The create payload: the web's own shape, so the row counts and reads back.
// ───────────────────────────────────────────────────────────────────────────

describe("the payload the create sends", () => {
  it("posts { name, brand, category, variants } like webapp/app/dashboard/foods/new", () => {
    // The web posts exactly these keys — read from the file, not retyped.
    expect(NEW_FOOD_SRC).toContain("variants: [variant]");
    expect(NEW_FOOD_SRC).toContain("name: name.trim()");
    const body = customFoodCreateBody({
      name: "Grandma's Pancake Mix",
      brand: "Homemade",
      category: "Grain",
      servingSize: 100,
      servingUnit: "g",
      displayLabel: "1 pancake",
      nutrition: { calories: 300, protein: 8, carbs: 55, fats: 6 },
      gramsPerServing: 60,
      bookmark: true,
    });
    expect(body).toEqual({
      name: "Grandma's Pancake Mix",
      brand: "Homemade",
      category: "Grain",
      variants: [
        expect.objectContaining({
          name: "Default",
          isDefault: true,
          servingSize: 100,
          servingUnit: "g",
          displayLabel: "1 pancake",
          gramsPerServing: 60,
          nutrition: expect.objectContaining({
            calories: 300,
            protein: 8,
            carbs: 55,
            fats: 6,
          }),
        }),
      ],
    });
    // Never sends the ledger or the global key: authoredBy is stamped
    // server-side, barcode is admin-only.
    expect(JSON.stringify(body)).not.toContain("authoredBy");
    expect(JSON.stringify(body)).not.toContain("barcode");
  });

  it("validates like the web submit handler before any request", () => {
    const base = {
      name: "Oats",
      category: "Grain",
      servingSize: 100,
      servingUnit: "g",
      nutrition: { calories: 300, protein: 10, carbs: 50, fats: 5 },
    };
    expect(validateCustomFoodInput(base)).toBeNull();
    expect(validateCustomFoodInput({ ...base, name: "  " })).toBe(
      "Name is required.",
    );
    expect(validateCustomFoodInput({ ...base, servingSize: 0 })).toBe(
      "Serving size must be a positive number.",
    );
    expect(
      validateCustomFoodInput({
        ...base,
        nutrition: { calories: NaN, protein: 1, carbs: 1, fats: 1 },
      }),
    ).toBe("Calories, protein, carbs, and fats are required.");
    expect(customFoodVariant({ ...base, displayLabel: "  " })).not.toHaveProperty(
      "displayLabel",
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: e015c9f1) Edit and Delete appear only on foods the member authored.
// ───────────────────────────────────────────────────────────────────────────

const ownedFood = {
  food: {
    _id: "6512c0ffee1234567890abcd",
    name: "Grandma's Pancake Mix",
    brand: "Homemade",
    category: "Grain",
    source: "manual",
    authoredBy: "member-1",
    createdBy: "member-1",
    servingSize: 100,
    servingUnit: "g",
    displayLabel: "1 pancake",
    nutrition: { calories: 300, protein: 8, carbs: 55, fats: 6 },
    variants: [
      {
        _id: "6512c0ffee1234567890abce",
        name: "Default",
        isDefault: true,
        servingSize: 100,
        servingUnit: "g",
        displayLabel: "1 pancake",
        alternateServings: [],
        nutrition: { calories: 300, protein: 8, carbs: 55, fats: 6 },
      },
    ],
  },
};

const catalogueFoodStampedBySearch = {
  food: {
    _id: "6512c0ffee1234567890abcf",
    name: "Chicken Breast",
    source: "usda",
    // The search background import stamped the searching member — provenance.
    createdBy: "member-1",
    servingSize: 100,
    servingUnit: "g",
    nutrition: { calories: 165, protein: 31, carbs: 0, fats: 4 },
    variants: [
      {
        name: "Default",
        isDefault: true,
        servingSize: 100,
        servingUnit: "g",
        alternateServings: [],
        nutrition: { calories: 165, protein: 31, carbs: 0, fats: 4 },
      },
    ],
  },
};

function foodDetailFetch(foodBody: unknown) {
  return (p: string) => {
    if (String(p).startsWith("/api/nutrition/foods/")) return foodBody;
    if (String(p).startsWith("/api/me/foods")) return { foods: [] };
    if (String(p).startsWith("/api/meal-logs")) {
      return { date: "2026-10-04", logs: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 } };
    }
    if (String(p).startsWith("/api/nutrition/log")) return { meals: [], quickAdds: [] };
    throw new Error(`unexpected fetch ${p}`);
  };
}

describe("(id: e015c9f1) Edit and Delete appear only on foods the member authored", () => {
  it("shows Edit and Delete on an owned food, matching the web", async () => {
    expect(FOOD_DETAIL_SRC).toContain("canMutate");
    routeFetch(foodDetailFetch(ownedFood));
    mockParams = { id: "6512c0ffee1234567890abcd" };
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-name").props.children).toBe(
        "Grandma's Pancake Mix",
      );
    });
    expect(screen.getByTestId("nutrition-food-edit")).toBeTruthy();
    expect(screen.getByTestId("nutrition-food-delete")).toBeTruthy();
    // The new schema travels with it: serving label, verified/category slot,
    // per-serving headline, and the bookmark.
    expect(screen.getByTestId("nutrition-food-serving")).toBeTruthy();
    expect(screen.getByTestId("nutrition-food-macros")).toBeTruthy();
    expect(screen.getByTestId("nutrition-food-bookmark")).toBeTruthy();
  });

  it("hides Edit and Delete on a catalogue row stamped with the member's createdBy", async () => {
    routeFetch(foodDetailFetch(catalogueFoodStampedBySearch));
    mockParams = { id: "6512c0ffee1234567890abcf" };
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-name").props.children).toBe(
        "Chicken Breast",
      );
    });
    expect(screen.queryByTestId("nutrition-food-edit")).toBeNull();
    expect(screen.queryByTestId("nutrition-food-delete")).toBeNull();
    expect(screen.queryByTestId("nutrition-food-bridge-single")).toBeNull();
  });

  it("shows them to an admin on anybody's row", async () => {
    mockUser = { _id: "someone-else", role: "admin" };
    routeFetch(foodDetailFetch(catalogueFoodStampedBySearch));
    mockParams = { id: "6512c0ffee1234567890abcf" };
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-name").props.children).toBe(
        "Chicken Breast",
      );
    });
    expect(screen.getByTestId("nutrition-food-edit")).toBeTruthy();
    expect(screen.getByTestId("nutrition-food-delete")).toBeTruthy();
  });

  it("edits through PATCH with the allowlisted fields, and deletes through DELETE", async () => {
    routeFetch(foodDetailFetch(ownedFood));
    mockParams = { id: "6512c0ffee1234567890abcd" };
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-edit")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("nutrition-food-edit"));
    expect(screen.getByTestId("nutrition-food-edit-sheet")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("nutrition-food-edit-name"), "Pancakes v2");
    await act(async () => {
      fireEvent.press(screen.getByTestId("nutrition-food-edit-save"));
    });
    await waitFor(() => {
      expect(
        postBodies("/api/nutrition/foods/6512c0ffee1234567890abcd", "PATCH"),
      ).toHaveLength(1);
    });
    const patch = postBodies(
      "/api/nutrition/foods/6512c0ffee1234567890abcd",
      "PATCH",
    )[0] as Record<string, unknown>;
    expect(patch.name).toBe("Pancakes v2");
    // The ledger never leaves the phone.
    expect(patch).not.toHaveProperty("authoredBy");
    expect(patch).not.toHaveProperty("barcode");

    fireEvent.press(screen.getByTestId("nutrition-food-delete"));
    expect(screen.getByTestId("nutrition-food-delete-confirm")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("nutrition-food-delete-confirm-button"));
    });
    await waitFor(() => {
      const dels = mockApiFetch.mock.calls.filter(
        ([p, , init]) =>
          String(p).startsWith("/api/nutrition/foods/6512c0ffee1234567890abcd") &&
          (init as { method?: string } | undefined)?.method === "DELETE",
      );
      expect(dels).toHaveLength(1);
    });
    expect(mockBack).toHaveBeenCalled();
  });

  it("saves a bridge edit through PATCH with the whole variants array", async () => {
    const twoVariants = {
      food: {
        ...ownedFood.food,
        variants: [
          ownedFood.food.variants[0],
          {
            name: "Cooked",
            servingSize: 150,
            servingUnit: "g",
            alternateServings: [],
            nutrition: { calories: 200, protein: 5, carbs: 40, fats: 4 },
          },
        ],
      },
    };
    routeFetch(foodDetailFetch(twoVariants));
    mockParams = { id: "6512c0ffee1234567890abcd" };
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-variants")).toBeTruthy();
    });
    expect(screen.getByTestId("nutrition-food-variants-title")).toHaveTextContent(
      /Variants \(2\)/,
    );
    fireEvent.changeText(screen.getByTestId("nutrition-food-bridge-0-grams"), "120");
    await act(async () => {
      fireEvent.press(screen.getByTestId("nutrition-food-bridge-0-save"));
    });
    await waitFor(() => {
      expect(
        postBodies("/api/nutrition/foods/6512c0ffee1234567890abcd", "PATCH"),
      ).toHaveLength(1);
    });
    const body = postBodies(
      "/api/nutrition/foods/6512c0ffee1234567890abcd",
      "PATCH",
    )[0] as { variants: { gramsPerServing?: number }[] };
    expect(body.variants[0]?.gramsPerServing).toBe(120);
  });

  it("toggles the bookmark through /api/me/foods", async () => {
    routeFetch(foodDetailFetch(ownedFood));
    mockParams = { id: "6512c0ffee1234567890abcd" };
    const screen = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("nutrition-food-bookmark")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("nutrition-food-bookmark"));
    });
    await waitFor(() => {
      expect(postBodies("/api/me/foods", "POST")).toHaveLength(1);
    });
    expect(postBodies("/api/me/foods", "POST")[0]).toEqual({
      foodId: "6512c0ffee1234567890abcd",
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: e015c9f2) A custom food created natively counts and appears on the web.
// ───────────────────────────────────────────────────────────────────────────

async function fillValidForm(screen: ReturnType<typeof render>) {
  fireEvent.changeText(screen.getByTestId("food-new-name"), "Grandma's Pancake Mix");
  fireEvent.changeText(screen.getByTestId("food-new-macro-calories"), "300");
  fireEvent.changeText(screen.getByTestId("food-new-macro-protein"), "8");
  fireEvent.changeText(screen.getByTestId("food-new-macro-carbs"), "55");
  fireEvent.changeText(screen.getByTestId("food-new-macro-fats"), "6");
}

describe("(id: e015c9f2) A custom food created natively counts against custom-foods and appears on the web", () => {
  it("posts the gated create, bookmarks, and lands on the new food", async () => {
    entitlementsBody = ROOM_LEFT;
    routeFetch((p: string) => {
      if (p === "/api/nutrition/foods") {
        return {
          success: true,
          created: true,
          food: {
            _id: "6512c0ffee1234567890abcd",
            name: "Grandma's Pancake Mix",
            authoredBy: "member-1",
            source: "manual",
          },
        };
      }
      if (String(p).startsWith("/api/me/foods")) return { saved: true };
      if (String(p).startsWith("/api/nutrition/foods/")) return ownedFood;
      throw new Error(`unexpected fetch ${p}`);
    });
    const screen = render(<NewFoodRoute />);
    await fillValidForm(screen);
    await act(async () => {
      fireEvent.press(screen.getByTestId("food-new-save"));
    });

    // The quota-gated create — POST /api/nutrition/foods and nothing under
    // it — with the web's shape. The server stamps `authoredBy`, which is
    // what the custom-foods allowance counts and what the web lists.
    await waitFor(() => {
      expect(postBodies("/api/nutrition/foods", "POST")).toHaveLength(1);
    });
    const body = postBodies("/api/nutrition/foods", "POST")[0] as Record<
      string,
      unknown
    >;
    expect(body.name).toBe("Grandma's Pancake Mix");
    expect(body.category).toBe("Other");
    expect(Array.isArray(body.variants)).toBe(true);
    const variant = (body.variants as Record<string, unknown>[])[0]!;
    expect(variant.nutrition).toEqual(
      expect.objectContaining({ calories: 300, protein: 8, carbs: 55, fats: 6 }),
    );
    // Then the bookmark, like the web's `bookmark` toggle.
    await waitFor(() => {
      expect(postBodies("/api/me/foods", "POST")).toHaveLength(1);
    });
    expect(postBodies("/api/me/foods", "POST")[0]).toEqual({
      foodId: "6512c0ffee1234567890abcd",
    });
    // And the member lands on the new food's own screen.
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalled();
    });
    expect(String(mockReplace.mock.calls[0]![0])).toContain(
      "6512c0ffee1234567890abcd",
    );
  });

  it("shows a validation error without any request when the form is empty", async () => {
    entitlementsBody = ROOM_LEFT;
    routeFetch(() => {
      throw new Error("must not fetch");
    });
    const screen = render(<NewFoodRoute />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("food-new-save"));
    });
    // Disabled with no name — enable by typing a name but no macros, so the
    // submit runs and fails validation instead of fetching.
    fireEvent.changeText(screen.getByTestId("food-new-name"), "Oats");
    await act(async () => {
      fireEvent.press(screen.getByTestId("food-new-save"));
    });
    expect(screen.getByTestId("food-new-error")).toBeTruthy();
    expect(postBodies("/api/nutrition/foods", "POST")).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: e015c9f3) A free member at 3 custom foods sees the upgrade sheet.
// ───────────────────────────────────────────────────────────────────────────

describe("(id: e015c9f3) A free member at 3 custom foods sees the upgrade sheet on create", () => {
  it("raises the sheet before the request when the snapshot says at-cap, keeping the form", async () => {
    entitlementsBody = AT_CAP;
    routeFetch(() => {
      throw new Error("must not fetch: the cap stops the request");
    });
    const screen = render(<NewFoodRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("food-new-allowance-lock")).toBeTruthy();
    });
    await fillValidForm(screen);
    await act(async () => {
      fireEvent.press(screen.getByTestId("food-new-save"));
    });
    // The gate the sheet shows is custom-foods on plus — the server's
    // vocabulary, not ours.
    const gate = getUpgradeSheetGate();
    expect(gate).toEqual(
      expect.objectContaining({ feature: "custom-foods", requiresTier: "plus" }),
    );
    // Nothing left the phone, and the form is still there.
    expect(postBodies("/api/nutrition/foods", "POST")).toHaveLength(0);
    expect(screen.getByTestId("food-new-name").props.value).toBe(
      "Grandma's Pancake Mix",
    );
  });

  it("raises the same sheet from the server's 403 when the snapshot was stale", async () => {
    entitlementsBody = ROOM_LEFT;
    routeFetch((p: string) => {
      if (p === "/api/nutrition/foods") throw gate403();
      if (String(p).startsWith("/api/me/foods")) return { saved: true };
      throw new Error(`unexpected fetch ${p}`);
    });
    const screen = render(<NewFoodRoute />);
    await fillValidForm(screen);
    await act(async () => {
      fireEvent.press(screen.getByTestId("food-new-save"));
    });
    await waitFor(() => {
      expect(getUpgradeSheetGate()).toEqual(
        expect.objectContaining({
          feature: "custom-foods",
          requiresTier: "plus",
        }),
      );
    });
    // The server's own words, verbatim — never the red banner.
    expect(getUpgradeSheetGate()?.error).toContain("free custom foods");
    expect(screen.queryByTestId("food-new-error")).toBeNull();
    expect(screen.getByTestId("food-new-name").props.value).toBe(
      "Grandma's Pancake Mix",
    );
  });
});
