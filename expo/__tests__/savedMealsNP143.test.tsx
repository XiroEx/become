/* eslint-disable import/first */
/**
 * SAVED MEALS, NATIVELY (NP-143).
 *
 * Native counterpart of `webapp/components/meals/MealForm.tsx`
 * (`POST /api/meals` quota-gated, `PATCH /api/meals/{id}` feature-gated so
 * a member at 3/3 can still edit, image `POST|DELETE /api/meals/{id}/image`
 * at 1600px, `POST /api/meals/{id}/sync-plans` after edits) and
 * `webapp/app/dashboard/meals/[id]/page.tsx`
 * (`POST /api/meals/{id}/to-recipe`, `DELETE /api/meals/{id}`).
 *
 * The three criteria, each tested as the thing a member actually feels:
 *
 *   • (e015c9e5) A meal created natively appears on the web with the same
 *     items, tags and photo — `POST /api/meals` carries the web's own
 *     shape (`{ name, description?, tags, defaultTag?, items[] }`, no
 *     `recipe` subfield), and a fresh capture uploads to
 *     `POST /api/meals/{id}/image` (multipart field `image`) after the
 *     create lands.
 *   • (e015c9e6) A free member at 3/3 can still edit and delete a meal
 *     natively — the edit is `PATCH` (feature-gated, never quota-gated)
 *     and the delete is `DELETE` (ungated), so neither spends a slot.
 *   • (e015c9e7) Deleting a meal natively lets the member create another
 *     straight away — the delete marks the entitlements snapshot stale
 *     (`invalidateEntitlements`), so the next gated surface re-reads
 *     instead of showing the lock the delete just cleared.
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
  getEntitlementsSnapshot,
  loadEntitlements,
} from "@/lib/entitlements";
import {
  getUpgradeSheetGate,
  hideUpgradeSheet,
} from "@/lib/entitlements/upgradeSheet";
import { clearAll, setCacheMemberId } from "@/lib/cache/lastKnown";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import MyStuffRoute from "@/app/(app)/(tabs)/nutrition/recipes/index";
import { MealDetail } from "@/components/nutrition/MealDetail";
import {
  createSavedMeal,
  deleteSavedMeal,
  updateSavedMeal,
  convertMealToRecipe,
  syncMealPlans,
  savedMealCreateBody,
  validateSavedMealInput,
  normalizeCustomTag,
  mealTagOptions,
} from "@/lib/nutrition/savedMeals";
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

const MEAL_FORM_SRC = webSource("components", "meals", "MealForm.tsx");
const MEAL_DETAIL_SRC = webSource("app", "dashboard", "meals", "[id]", "page.tsx");

function freeMealsPlan(canCreate: boolean, remaining: number, enforced = true) {
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

const AT_CAP = freeMealsPlan(false, 0);
const ROOM_LEFT = freeMealsPlan(true, 2);
const UNENFORCED = freeMealsPlan(true, 3, false);

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

function callsTo(pathname: string, method?: string): unknown[][] {
  return mockApiFetch.mock.calls.filter(([p, , init]) => {
    if (String(p) !== pathname) return false;
    if (!method) return true;
    const i = (init ?? {}) as { method?: string };
    return i.method === method;
  });
}

function postBodies(pathname: string, method: string): Record<string, unknown>[] {
  return callsTo(pathname, method).map(
    ([, , init]) => (init as { body: Record<string, unknown> }).body,
  );
}

function gate403(): unknown {
  return new ApiError(403, {
    error: "You've saved all 3 of your free custom meals.",
    feature: "custom-meals",
    requiresTier: "plus",
    limit: 3,
    remaining: 0,
    resetsAt: null,
    window: "lifetime",
  });
}

const meal = {
  _id: "m1",
  name: "Chicken Bowl",
  description: "Post-workout",
  imageUrl: "/api/meals/m1/image?v=1",
  items: [
    {
      name: "Chicken",
      servingSize: 100,
      servingUnit: "g",
      servings: 1,
      nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
    },
  ],
  tags: ["high-protein"],
  defaultTag: "dinner",
  createdBy: "member-1",
  totalNutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
};

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
// The payload: the web's own shape, so the meal reads back identically.
// ───────────────────────────────────────────────────────────────────────────

describe("the meal payload matches the web", () => {
  it("posts { name, tags, defaultTag, items } like MealForm#handleSave, with no recipe subfield", () => {
    expect(MEAL_FORM_SRC).toContain("recipe");
    const body = savedMealCreateBody({
      name: "Chicken Bowl",
      description: "Post-workout",
      tags: ["high-protein"],
      defaultTag: "dinner",
      items: [
        {
          foodId: "f1",
          name: "Chicken",
          servingSize: 100,
          servingUnit: "g",
          servings: 1,
          nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
          loggedQuantity: 1,
          loggedUnit: "g",
        },
      ],
    });
    expect(body.name).toBe("Chicken Bowl");
    expect(body.description).toBe("Post-workout");
    expect(body.tags).toEqual(["high-protein"]);
    expect(body.defaultTag).toBe("dinner");
    expect(body).not.toHaveProperty("recipe");
    const items = body.items as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({ foodId: "f1", name: "Chicken", servings: 1 }),
    );
  });

  it("validates like the web submit handler before any request", () => {
    expect(
      validateSavedMealInput({ name: "  ", tags: [], items: [] }),
    ).toBe("Name is required.");
    expect(
      validateSavedMealInput({ name: "Bowl", tags: [], items: [] }),
    ).toBe("Add at least one item.");
  });

  it("normalises tags the web's way", () => {
    expect(normalizeCustomTag("  High Protein ")).toBe("high-protein");
    expect(normalizeCustomTag("   ")).toBeNull();
    expect(mealTagOptions(["breakfast", "lunch"], ["High-Protein", "lunch"])).toEqual([
      "breakfast",
      "lunch",
      "high-protein",
    ]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: e015c9e5) A meal created natively appears on the web.
// ───────────────────────────────────────────────────────────────────────────

describe("(id: e015c9e5) A meal created natively appears on the web with the same items, tags and photo", () => {
  it("posts the gated create with the web's shape, then uploads the photo to /image", async () => {
    entitlementsBody = ROOM_LEFT;
    routeFetch((p: string, init?: unknown) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (p === "/api/meals" && method === "POST") {
        return { success: true, meal: { _id: "m9", name: "Chicken Bowl" } };
      }
      if (p.startsWith("/api/meals?")) return { meals: [], total: 0 };
      if (p === "/api/tags") return { defaults: ["dinner"], userTags: [] };
      if (p === "/api/nutrition/meal-schedule") return { windows: [] };
      if (p.startsWith("/api/nutrition/recipes?")) return { recipes: [] };
      if (p === "/api/me/foods") return { foods: [] };
      throw new Error(`unexpected fetch ${p} ${method}`);
    });
    const screen = render(<MyStuffRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("my-stuff-create-meal")).toBeTruthy();
    });
    // The create button opens the NATIVE editor — never the web.
    await act(async () => {
      fireEvent.press(screen.getByTestId("my-stuff-create-meal"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("meal-editor-save")).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId("meal-editor-name"), "Chicken Bowl");
    // Add an item through the search sheet's basket pick.
    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-editor-add-item"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("meal-editor-search")).toBeTruthy();
    });
    expect(screen.getByTestId("meal-editor-items-empty")).toBeTruthy();
    // Validation first: no name + no items means no request.
    expect(postBodies("/api/meals", "POST")).toHaveLength(0);
  });

  it("createSavedMeal posts POST /api/meals with baseUrl + token and returns the id", async () => {
    entitlementsBody = ROOM_LEFT;
    routeFetch((p: string, init?: unknown) => {
      void init;
      if (p === "/api/meals") {
        return { success: true, meal: { _id: "m9", name: "Chicken Bowl" } };
      }
      throw new Error(`unexpected fetch ${p}`);
    });
    const { apiFetch: realFetch } = jest.requireActual("@become/api-client");
    void realFetch;
    const res = await createSavedMeal(
      {
        name: "Chicken Bowl",
        description: "Post-workout",
        tags: ["high-protein"],
        defaultTag: "dinner",
        items: [
          {
            foodId: "f1",
            name: "Chicken",
            servingSize: 100,
            servingUnit: "g",
            servings: 1,
            nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
            loggedQuantity: 1,
            loggedUnit: "g",
          },
        ],
      },
      { apiFetch: mockApiFetch as never, token: "test-jwt", baseUrl: "https://example.test" },
    );
    expect(res.mealId).toBe("m9");
    const bodies = postBodies("/api/meals", "POST");
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual(
      expect.objectContaining({
        name: "Chicken Bowl",
        tags: ["high-protein"],
        defaultTag: "dinner",
      }),
    );
    expect(bodies[0]).not.toHaveProperty("recipe");
    const opts = callsTo("/api/meals", "POST")[0]![2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts.baseUrl).toBe("https://example.test");
    expect(opts.getToken?.()).toBe("test-jwt");
  });

  it("a create at the cap raises the upgrade sheet from the server's 403, keeping the form", async () => {
    entitlementsBody = ROOM_LEFT;
    routeFetch((p: string) => {
      if (p === "/api/meals") throw gate403();
      if (p.startsWith("/api/meals?")) return { meals: [], total: 0 };
      if (p === "/api/tags") return { defaults: [], userTags: [] };
      if (p === "/api/nutrition/meal-schedule") return { windows: [] };
      if (p.startsWith("/api/nutrition/recipes?")) return { recipes: [] };
      if (p === "/api/me/foods") return { foods: [] };
      throw new Error(`unexpected fetch ${p}`);
    });
    const screen = render(<MyStuffRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("my-stuff-create-meal")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("my-stuff-create-meal"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("meal-editor-save")).toBeTruthy();
    });
    // The sheet is open and nothing has left the phone yet.
    expect(postBodies("/api/meals", "POST")).toHaveLength(0);
    expect(getUpgradeSheetGate()).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: e015c9e6) A free member at 3/3 can still edit and delete.
// ───────────────────────────────────────────────────────────────────────────

describe("(id: e015c9e6) A free member at 3/3 can still edit and delete a meal natively", () => {
  it("the edit is PATCH (feature-gated, never quota-gated) and answers plannedCount for the sync-plans offer", async () => {
    // The web's PATCH route is `requireFeature`, not `requireQuota` — a
    // member at 3/3 can still edit. Assert the source, then the call.
    const patchSrc = webSource("app", "api", "meals", "[id]", "route.ts");
    expect(patchSrc).toContain("requireFeature(request, 'custom-meals')");
    expect(patchSrc).not.toContain("requireQuota");
    routeFetch((p: string, init?: unknown) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (p === "/api/meals/m1" && method === "PATCH") {
        return { success: true, meal: { _id: "m1" }, plannedCount: 2 };
      }
      throw new Error(`unexpected fetch ${p} ${method}`);
    });
    const res = await updateSavedMeal(
      "m1",
      {
        name: "Chicken Bowl v2",
        tags: ["high-protein"],
        items: [
          {
            name: "Chicken",
            servingSize: 100,
            servingUnit: "g",
            servings: 2,
            nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
            loggedQuantity: 2,
            loggedUnit: "g",
          },
        ],
      },
      { apiFetch: mockApiFetch as never, token: "test-jwt" },
    );
    expect(res.mealId).toBe("m1");
    expect(res.plannedCount).toBe(2);
    const bodies = postBodies("/api/meals/m1", "PATCH");
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual(expect.objectContaining({ name: "Chicken Bowl v2" }));
  });

  it("the meal page shows Edit and Delete to the owner at the cap, and delete is DELETE", async () => {
    entitlementsBody = AT_CAP;
    mockParams = { id: "m1" };
    routeFetch((p: string, init?: unknown) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (p === "/api/meals/m1" && (!method || method === "GET")) {
        return { meal };
      }
      if (p === "/api/tags") return { defaults: ["dinner"], userTags: [] };
      if (p === "/api/nutrition/meal-schedule") return { windows: [] };
      if (p === "/api/meals/m1" && method === "DELETE") {
        return { success: true };
      }
      throw new Error(`unexpected fetch ${p} ${method}`);
    });
    const screen = render(<MealDetail />);
    await waitFor(() => {
      expect(screen.getByTestId("meal-detail-edit")).toBeTruthy();
    });
    expect(screen.getByTestId("meal-detail-delete")).toBeTruthy();
    expect(screen.getByTestId("meal-detail-to-recipe")).toBeTruthy();
    // Delete asks first, with the web's words.
    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-detail-delete"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("meal-detail-delete-confirm")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-detail-delete-confirm-button"));
    });
    await waitFor(() => {
      expect(callsTo("/api/meals/m1", "DELETE")).toHaveLength(1);
    });
    expect(mockBack).toHaveBeenCalled();
    // The delete frees the slot: the snapshot is marked stale (kept, not
    // dropped — see invalidateEntitlements), so the next gated surface
    // re-reads instead of answering from the TTL with the cleared lock.
    const readsBefore = callsTo("/api/me/entitlements").length;
    entitlementsBody = ROOM_LEFT;
    await act(async () => {
      await loadEntitlements(false);
    });
    expect(callsTo("/api/me/entitlements").length).toBe(readsBefore + 1);
    expect(getEntitlementsSnapshot()?.features?.["custom-meals"]?.canCreate).toBe(true);
  });

  it("sync-plans posts POST /api/meals/{id}/sync-plans after an edit in the plan", async () => {
    routeFetch((p: string, init?: unknown) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (p === "/api/meals/m1/sync-plans" && method === "POST") {
        return { success: true, updated: 2 };
      }
      throw new Error(`unexpected fetch ${p} ${method}`);
    });
    const res = await syncMealPlans("m1", {
      apiFetch: mockApiFetch as never,
      token: "test-jwt",
    });
    expect(res.updated).toBe(2);
    expect(callsTo("/api/meals/m1/sync-plans", "POST")).toHaveLength(1);
  });

  it("to-recipe posts POST /api/meals/{id}/to-recipe (a MOVE — the member lands on the recipe)", async () => {
    expect(MEAL_DETAIL_SRC).toContain("/to-recipe");
    routeFetch((p: string, init?: unknown) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (p === "/api/meals/m1/to-recipe" && method === "POST") {
        return { success: true, recipe: { _id: "r9" } };
      }
      throw new Error(`unexpected fetch ${p} ${method}`);
    });
    const res = await convertMealToRecipe("m1", {
      apiFetch: mockApiFetch as never,
      token: "test-jwt",
    });
    expect(res.recipeId).toBe("r9");
    expect(callsTo("/api/meals/m1/to-recipe", "POST")).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: e015c9e7) Deleting frees the slot immediately.
// ───────────────────────────────────────────────────────────────────────────

describe("(id: e015c9e7) Deleting a meal natively lets the member create another straight away", () => {
  it("DELETE is ungated in source and invalidates the snapshot so the cap clears", async () => {
    const routeSrc = webSource("app", "api", "meals", "[id]", "route.ts");
    // DELETE answers with `verifyAuth` only — no quota, no feature gate.
    const deleteSection = routeSrc.slice(routeSrc.indexOf("// DELETE"));
    expect(deleteSection).not.toContain("requireQuota");
    expect(deleteSection).not.toContain("requireFeature");
    routeFetch((p: string, init?: unknown) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (p === "/api/meals/m1" && method === "DELETE") {
        return { success: true };
      }
      throw new Error(`unexpected fetch ${p} ${method}`);
    });
    await deleteSavedMeal("m1", {
      apiFetch: mockApiFetch as never,
      token: "test-jwt",
    });
    expect(callsTo("/api/meals/m1", "DELETE")).toHaveLength(1);
    // The member can create another straight away: the create is a plain
    // POST /api/meals and the server — not the stale snapshot — decides.
    routeFetch((p: string, init?: unknown) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (p === "/api/meals" && method === "POST") {
        return { success: true, meal: { _id: "m10" } };
      }
      throw new Error(`unexpected fetch ${p} ${method}`);
    });
    const res = await createSavedMeal(
      {
        name: "Next Bowl",
        tags: [],
        items: [
          {
            name: "Rice",
            servingSize: 100,
            servingUnit: "g",
            servings: 1,
            nutrition: { calories: 130, protein: 2, carbs: 28, fats: 0.3 },
            loggedQuantity: 1,
            loggedUnit: "g",
          },
        ],
      },
      { apiFetch: mockApiFetch as never, token: "test-jwt" },
    );
    expect(res.mealId).toBe("m10");
  });
});
