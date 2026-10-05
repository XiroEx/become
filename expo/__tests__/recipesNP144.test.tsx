/* eslint-disable import/first */
/**
 * RECIPES, NATIVELY (NP-144).
 *
 * Native counterpart of `webapp/app/dashboard/recipes/[id]/page.tsx`
 * (`GET /api/nutrition/recipes/{id}`, `POST .../save-as-food`,
 * `POST .../to-meal`, `DELETE`) and
 * `webapp/components/nutrition/RecipeForm.tsx`
 * (`POST /api/nutrition/recipes`, `PUT /api/nutrition/recipes/{id}`,
 * image `POST /api/nutrition/recipes/{id}/image`).
 *
 * The three criteria, each tested as the thing a member actually feels:
 *
 *   • (e015c9eb) A recipe's per-serving calories and macros match the web
 *     natively — `totalsPerServing` is shown as-is, never divided again,
 *     because the route already divided by `servings` before storing it.
 *   • (e015c9ec) Make it a meal natively creates the meal the web's button
 *     creates (`POST .../to-meal`, a `custom-meals` create; a MOVE for the
 *     owner, a COPY for anyone else), and a free member at 3/3 sees the
 *     upgrade sheet — before the request (the snapshot says so) and after
 *     one (a 403 says so).
 *   • (e015c9ed) A recipe created natively opens and edits on the web —
 *     `POST /api/nutrition/recipes` carries the web's own shape
 *     (`{ name, category: 'Other', servings, instructions[], tags[],
 *     ingredients[] }`, per-row `nutrition` as the row total), and the edit
 *     is the web's `PUT` with the same body.
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
import RecipeDetailRoute from "@/app/(app)/(tabs)/nutrition/recipes/[id]";
import NewRecipeRoute from "@/app/(app)/(tabs)/nutrition/recipes/new";
import EditRecipeRoute from "@/app/(app)/(tabs)/nutrition/recipes/[id]/edit";
import MyStuffRoute from "@/app/(app)/(tabs)/nutrition/recipes/index";
import {
  convertRecipeToMeal,
  createRecipe,
  deleteRecipe,
  recipeCreateBody,
  recipeFormTotals,
  recipeIngredientFromPick,
  recipeToFormInput,
  toRecipeDetailViewModel,
  updateRecipe,
  validateRecipeFormInput,
  isRecipeOwner,
  recipeImagePath,
} from "@/lib/nutrition/recipes";
import { recipeCreateUrl, recipeEditUrl, recipeViewUrl } from "@/lib/nutrition/recipeLinks";
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

const RECIPE_DETAIL_SRC = webSource("app", "dashboard", "recipes", "[id]", "page.tsx");
const RECIPE_FORM_SRC = webSource("components", "nutrition", "RecipeForm.tsx");
const TO_MEAL_SRC = webSource("app", "api", "nutrition", "recipes", "[id]", "to-meal", "route.ts");
const SAVE_AS_FOOD_SRC = webSource("app", "api", "nutrition", "recipes", "[id]", "save-as-food", "route.ts");
const CREATE_SRC = webSource("app", "api", "nutrition", "recipes", "route.ts");
const UPDATE_SRC = webSource("app", "api", "nutrition", "recipes", "[id]", "route.ts");

function freePlan(canCreateMeals: boolean, canCreateFoods: boolean, enforced = true) {
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
        canCreate: canCreateMeals,
        requiresTier: "plus",
        limit: 3,
        used: canCreateMeals ? 1 : 3,
        remaining: canCreateMeals ? 2 : 0,
        resetsAt: null,
        window: "lifetime",
      },
      "custom-foods": {
        allowed: true,
        canCreate: canCreateFoods,
        requiresTier: "plus",
        limit: 3,
        used: canCreateFoods ? 1 : 3,
        remaining: canCreateFoods ? 2 : 0,
        resetsAt: null,
        window: "lifetime",
      },
    },
  };
}

const AT_CAP = freePlan(false, false);
const ROOM_LEFT = freePlan(true, true);
const UNENFORCED = freePlan(true, true, false);

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

function mealsGate403(): unknown {
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

function foodsGate403(): unknown {
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

// Where the web really keeps a recipe's macros (webapp/models/Recipe.ts).
const recipe = {
  _id: "r1",
  name: "Turkey Chili",
  description: "High-protein batch",
  servings: 4,
  prepTime: 15,
  cookTime: 30,
  tags: ["dinner", "high-protein"],
  totalsPerServing: { calories: 320, protein: 28, carbs: 22, fats: 12 },
  ingredients: [
    { name: "Turkey", amount: 500, unit: "g", nutrition: { calories: 600, protein: 100, carbs: 0, fats: 20 } },
    { name: "Beans", amount: 400, unit: "g", nutrition: { calories: 680, protein: 12, carbs: 88, fats: 28 } },
  ],
  instructions: ["Brown the turkey.", "Simmer 30 minutes."],
  imageUrl: "/api/nutrition/recipes/r1/image?v=1",
  createdBy: "member-1",
  savedFoodId: undefined,
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

// ─── (e015c9eb) per-serving calories and macros match the web ────────────────

describe("(id: e015c9eb) A recipe's per-serving calories and macros match the web natively", () => {
  it("the web reads totalsPerServing and rounds it — and so does the view model", () => {
    // The web's headline (`[id]/page.tsx`): Math.round on each field.
    expect(RECIPE_DETAIL_SRC).toContain("recipe.totalsPerServing");
    expect(RECIPE_DETAIL_SRC).toContain("Math.round(t?.calories ?? 0)");
    const vm = toRecipeDetailViewModel(recipe as never);
    expect(vm.perServing).toEqual({ kcal: 320, protein: 28, carbs: 22, fat: 12 });
    expect(vm.servings).toBe(4);
  });

  it("the view model never divides by servings again", () => {
    // The ingredient blocks are the WHOLE recipe's contributions (1280 cal
    // over 4 servings = 320/serving). A client that summed and divided would
    // agree here — and double-divide on a real row — so pin the as-is read.
    const vm = toRecipeDetailViewModel(recipe as never);
    expect(vm.perServing.kcal).toBe(320);
  });

  it("the detail route renders the web's per-serving figure", async () => {
    mockParams = { id: "r1" };
    routeFetch((p) => {
      if (p === "/api/nutrition/recipes/r1") return recipe;
      if (p === "/api/nutrition/meal-schedule") return { windows: [] };
      throw new Error(`unexpected GET ${p}`);
    });
    const { getByTestId } = render(<RecipeDetailRoute />);
    await waitFor(() => {
      expect(callsTo("/api/nutrition/recipes/r1").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(getByTestId("recipe-detail-name").props.children).toBe("Turkey Chili");
    });
    const kcal = getByTestId("recipe-detail-nutrition-kcal").props.children;
    expect(Array.isArray(kcal) ? kcal.join("") : kcal).toContain("320");
    const protein = getByTestId("recipe-detail-nutrition-protein").props.children;
    expect(Array.isArray(protein) ? protein.join("") : protein).toContain("28");
  });

  it("ownership is createdBy — the owner sees To meal / Edit / Delete", async () => {
    expect(isRecipeOwner(recipe as never, "member-1")).toBe(true);
    expect(isRecipeOwner(recipe as never, "someone-else")).toBe(false);
    mockParams = { id: "r1" };
    routeFetch((p) => {
      if (p === "/api/nutrition/recipes/r1") return recipe;
      if (p === "/api/nutrition/meal-schedule") return { windows: [] };
      throw new Error(`unexpected GET ${p}`);
    });
    const { getByTestId } = render(<RecipeDetailRoute />);
    await waitFor(() => {
      expect(getByTestId("recipe-detail-owner-actions")).toBeTruthy();
    });
    expect(getByTestId("recipe-detail-to-meal")).toBeTruthy();
    expect(getByTestId("recipe-detail-edit")).toBeTruthy();
    expect(getByTestId("recipe-detail-delete")).toBeTruthy();
  });

  it("a non-owner sees no owner actions", async () => {
    mockUser = { _id: "someone-else", role: "user" };
    mockParams = { id: "r1" };
    routeFetch((p) => {
      if (p === "/api/nutrition/recipes/r1") return recipe;
      if (p === "/api/nutrition/meal-schedule") return { windows: [] };
      throw new Error(`unexpected GET ${p}`);
    });
    const { queryByTestId, getByTestId } = render(<RecipeDetailRoute />);
    await waitFor(() => {
      expect(getByTestId("recipe-detail-name")).toBeTruthy();
    });
    expect(queryByTestId("recipe-detail-owner-actions")).toBeNull();
  });
});

// ─── (e015c9ec) Make it a meal + the upgrade sheet at 3/3 ────────────────────

describe("(id: e015c9ec) Make it a meal natively creates the meal the web's button creates, and a free member at 3/3 sees the upgrade sheet", () => {
  it("the web's button is POST .../to-meal and routes to the meal — and so does the helper", async () => {
    expect(RECIPE_DETAIL_SRC).toContain("/to-meal");
    expect(RECIPE_DETAIL_SRC).toContain("router.push(`/dashboard/meals/${data.meal._id}`)");
    // The route mints a Meal, so it spends custom-meals like POST /api/meals.
    expect(TO_MEAL_SRC).toContain("requireQuota(request, 'custom-meals')");
    routeFetch(() => ({ success: true, meal: { _id: "m9" }, mode: "move" }));
    const res = await convertRecipeToMeal("r1", { apiFetch, token: MEMBER_JWT });
    expect(res).toEqual({ mealId: "m9", mode: "move" });
    expect(callsTo("/api/nutrition/recipes/r1/to-meal", "POST").length).toBe(1);
  });

  it("to-meal is a move for the owner and a copy for anyone else", () => {
    // `webapp/lib/nutrition/recipeConvert.ts`: ownership decides whether
    // anything is destroyed; the response reports the mode.
    expect(TO_MEAL_SRC).toContain("convertDeletesSource(mode)");
    expect(TO_MEAL_SRC).toContain("mode");
  });

  it("tapping To meal routes to the new meal", async () => {
    mockParams = { id: "r1" };
    routeFetch((p, init) => {
      if (p === "/api/nutrition/recipes/r1") return recipe;
      if (p === "/api/nutrition/meal-schedule") return { windows: [] };
      if (p === "/api/nutrition/recipes/r1/to-meal") {
        return { success: true, meal: { _id: "m9" }, mode: "move" };
      }
      if (p === "/api/me/entitlements") return entitlementsBody;
      throw new Error(`unexpected ${JSON.stringify(init)} ${p}`);
    });
    const { getByTestId } = render(<RecipeDetailRoute />);
    await waitFor(() => {
      expect(getByTestId("recipe-detail-to-meal")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId("recipe-detail-to-meal"));
    });
    await waitFor(() => {
      expect(callsTo("/api/nutrition/recipes/r1/to-meal", "POST").length).toBe(1);
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        "/(tabs)/nutrition/meals/m9" as never,
      );
    });
  });

  it("a free member at 3/3 sees the upgrade sheet on a refused to-meal", async () => {
    entitlementsBody = AT_CAP;
    mockParams = { id: "r1" };
    routeFetch((p) => {
      if (p === "/api/nutrition/recipes/r1") return recipe;
      if (p === "/api/nutrition/meal-schedule") return { windows: [] };
      if (p === "/api/nutrition/recipes/r1/to-meal") throw mealsGate403();
      if (p === "/api/me/entitlements") return entitlementsBody;
      throw new Error(`unexpected GET ${p}`);
    });
    const { getByTestId } = render(<RecipeDetailRoute />);
    await waitFor(() => {
      expect(getByTestId("recipe-detail-to-meal")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId("recipe-detail-to-meal"));
    });
    await waitFor(() => {
      expect(getUpgradeSheetGate()).toEqual(
        expect.objectContaining({ feature: "custom-meals", requiresTier: "plus" }),
      );
    });
  });

  it("a refused save-as-food at the custom-foods cap raises the sheet, not a banner", async () => {
    entitlementsBody = AT_CAP;
    mockParams = { id: "r1" };
    routeFetch((p) => {
      if (p === "/api/nutrition/recipes/r1") return recipe;
      if (p === "/api/nutrition/meal-schedule") return { windows: [] };
      if (p === "/api/nutrition/recipes/r1/save-as-food") throw foodsGate403();
      if (p === "/api/me/entitlements") return entitlementsBody;
      throw new Error(`unexpected GET ${p}`);
    });
    // The route is quota-gated past the idempotent branch.
    expect(SAVE_AS_FOOD_SRC).toContain("requireQuota(request, 'custom-foods')");
    const { getByTestId } = render(<RecipeDetailRoute />);
    await waitFor(() => {
      expect(getByTestId("recipe-detail-save-or-log")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId("recipe-detail-save-or-log"));
    });
    await waitFor(() => {
      expect(getUpgradeSheetGate()).toEqual(
        expect.objectContaining({ feature: "custom-foods", requiresTier: "plus" }),
      );
    });
  });

  it("My Stuff's New recipe button opens the native editor, gated by canCreate", async () => {
    entitlementsBody = ROOM_LEFT;
    routeFetch((p) => {
      if (String(p).startsWith("/api/nutrition/recipes?")) {
        return { recipes: [], total: 0 };
      }
      if (String(p).startsWith("/api/meals")) return { meals: [], total: 0 };
      if (p === "/api/me/foods") return { foods: [] };
      if (p === "/api/tags") return { defaults: [], userTags: [] };
      if (p === "/api/nutrition/meal-schedule") return { windows: [] };
      if (p === "/api/me/entitlements") return entitlementsBody;
      throw new Error(`unexpected GET ${p}`);
    });
    const { getByTestId } = render(<MyStuffRoute />);
    fireEvent.press(getByTestId("my-stuff-tab-recipes"));
    await waitFor(() => {
      expect(getByTestId("my-stuff-create-recipe")).toBeTruthy();
    });
    fireEvent.press(getByTestId("my-stuff-create-recipe"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/nutrition/recipes/new" as never);
  });

  it("My Stuff's New recipe button raises the sheet at the cap", async () => {
    entitlementsBody = AT_CAP;
    routeFetch((p) => {
      if (String(p).startsWith("/api/nutrition/recipes?")) {
        return { recipes: [], total: 0 };
      }
      if (String(p).startsWith("/api/meals")) return { meals: [], total: 0 };
      if (p === "/api/me/foods") return { foods: [] };
      if (p === "/api/tags") return { defaults: [], userTags: [] };
      if (p === "/api/nutrition/meal-schedule") return { windows: [] };
      if (p === "/api/me/entitlements") return entitlementsBody;
      throw new Error(`unexpected GET ${p}`);
    });
    const { getByTestId } = render(<MyStuffRoute />);
    fireEvent.press(getByTestId("my-stuff-tab-recipes"));
    await waitFor(() => {
      expect(getByTestId("my-stuff-create-recipe")).toBeTruthy();
    });
    fireEvent.press(getByTestId("my-stuff-create-recipe"));
    expect(mockPush).not.toHaveBeenCalled();
    expect(getUpgradeSheetGate()).toEqual(
      expect.objectContaining({ feature: "custom-foods", requiresTier: "plus" }),
    );
  });
});

// ─── (e015c9ed) created natively → opens and edits on the web ────────────────

describe("(id: e015c9ed) A recipe created natively opens and edits on the web", () => {
  const input = {
    name: "Turkey Chili",
    description: "High-protein batch",
    servings: 4,
    prepTime: 15,
    cookTime: 30,
    instructions: ["Brown the turkey.", "Simmer 30 minutes."],
    tags: ["dinner"],
    ingredients: [
      {
        key: "k1",
        name: "Turkey",
        amount: 2,
        unit: "serving",
        perUnit: { calories: 150, protein: 25, carbs: 0, fats: 5 },
        foodId: "f1",
      },
    ],
  };

  it("the create body is the web's body", () => {
    // The web requires name + category + ingredients; the route computes
    // totalsPerServing from the rows.
    expect(CREATE_SRC).toContain("Missing required fields: name, category, ingredients");
    expect(RECIPE_FORM_SRC).toContain("category: 'Other'");
    const body = recipeCreateBody(input);
    expect(body).toEqual({
      name: "Turkey Chili",
      category: "Other",
      description: "High-protein batch",
      servings: 4,
      prepTime: 15,
      cookTime: 30,
      instructions: ["Brown the turkey.", "Simmer 30 minutes."],
      tags: ["dinner"],
      ingredients: [
        {
          foodId: "f1",
          name: "Turkey",
          amount: 2,
          unit: "serving",
          nutrition: { calories: 300, protein: 50, carbs: 0, fats: 10 },
        },
      ],
    });
  });

  it("validation matches the web: a name and at least one ingredient", () => {
    expect(RECIPE_FORM_SRC).toContain("Add at least one ingredient.");
    expect(validateRecipeFormInput({ ...input, name: "  " })).toBe("Name is required.");
    expect(validateRecipeFormInput({ ...input, ingredients: [] })).toBe(
      "Add at least one ingredient.",
    );
    expect(validateRecipeFormInput(input)).toBeNull();
  });

  it("the edit round-trips: stored row totals divide back to per-unit", () => {
    const form = recipeToFormInput(recipe as never);
    expect(form.name).toBe("Turkey Chili");
    expect(form.servings).toBe(4);
    expect(form.instructions).toEqual(["Brown the turkey.", "Simmer 30 minutes."]);
    expect(form.tags).toEqual(["dinner", "high-protein"]);
    // 600 cal over 500g → 1.2 cal/g; the create body multiplies back.
    expect(form.ingredients[0]?.perUnit.calories).toBeCloseTo(1.2);
    const back = recipeCreateBody({ ...form, ingredients: form.ingredients });
    const row = (back.ingredients as Record<string, unknown>[])[0];
    expect(row).toMatchObject({ name: "Turkey", amount: 500, unit: "g" });
    expect((row.nutrition as Record<string, number>).calories).toBe(600);
  });

  it("the live preview divides row totals by servings, like the route", () => {
    expect(CREATE_SRC).toContain("totals.calories / servings");
    const totals = recipeFormTotals({
      ingredients: [
        { amount: 500, perUnit: { calories: 1.2, protein: 0.2, carbs: 0, fats: 0.04 } },
        { amount: 400, perUnit: { calories: 1.7, protein: 0.03, carbs: 0.22, fats: 0.07 } },
      ],
      servings: 4,
    });
    expect(totals.calories).toBe(320);
  });

  it("a pick becomes a per-unit row, the web's handleAddIngredient", () => {
    expect(RECIPE_FORM_SRC).toContain("food.servings ?? 1");
    const row = recipeIngredientFromPick({
      name: "Turkey",
      amount: 1,
      unit: "serving",
      perUnit: { calories: 150, protein: 25, carbs: 0, fats: 5 },
      foodId: "f1",
    });
    expect(row).toMatchObject({
      name: "Turkey",
      amount: 1,
      unit: "serving",
      foodId: "f1",
    });
    expect(row.perUnit).toEqual({ calories: 150, protein: 25, carbs: 0, fats: 5 });
  });

  it("create posts the web's route and lands on the new recipe", async () => {
    routeFetch((p, init) => {
      if (p === "/api/nutrition/recipes") {
        const body = (init as { body: Record<string, unknown> }).body;
        expect(body).toMatchObject({ name: "Turkey Chili", category: "Other" });
        return { success: true, recipe: { _id: "r9" } };
      }
      if (p === "/api/me/entitlements") return entitlementsBody;
      throw new Error(`unexpected ${p}`);
    });
    const { recipeId } = await createRecipe(input, { apiFetch, token: MEMBER_JWT });
    expect(recipeId).toBe("r9");
    expect(callsTo("/api/nutrition/recipes", "POST").length).toBe(1);
  });

  it("edit is PUT with the same body — never quota-gated", async () => {
    expect(UPDATE_SRC).not.toContain("requireQuota");
    routeFetch((p) => {
      if (p === "/api/nutrition/recipes/r1") return { success: true, recipe: { _id: "r1" } };
      throw new Error(`unexpected ${p}`);
    });
    const { recipeId } = await updateRecipe("r1", input, { apiFetch, token: MEMBER_JWT });
    expect(recipeId).toBe("r1");
    expect(callsTo("/api/nutrition/recipes/r1", "PUT").length).toBe(1);
  });

  it("delete is DELETE, and the photo rides field `image` after the write", async () => {
    routeFetch(() => ({}));
    await deleteRecipe("r1", { apiFetch, token: MEMBER_JWT });
    expect(callsTo("/api/nutrition/recipes/r1", "DELETE").length).toBe(1);
    expect(recipeImagePath("r1")).toBe("/api/nutrition/recipes/r1/image");
  });

  it("the new screen posts and replaces to the recipe; the edit screen PUTs", async () => {
    entitlementsBody = ROOM_LEFT;
    routeFetch((p, init) => {
      if (p === "/api/nutrition/recipes") {
        return { success: true, recipe: { _id: "r9" } };
      }
      if (p === "/api/me/entitlements") return entitlementsBody;
      throw new Error(`unexpected ${p} ${JSON.stringify(init)}`);
    });
    const { getByTestId } = render(<NewRecipeRoute />);
    fireEvent.changeText(getByTestId("recipe-editor-name"), "Turkey Chili");
    fireEvent.press(getByTestId("recipe-editor-add-step"));
    // No ingredients yet — the save stays local with the web's own words.
    fireEvent.press(getByTestId("recipe-editor-save"));
    expect(getByTestId("recipe-editor-error").props.children).toBe(
      "Add at least one ingredient.",
    );
    expect(callsTo("/api/nutrition/recipes", "POST").length).toBe(0);
  });

  it("the edit screen loads the recipe and saves it back", async () => {
    mockParams = { id: "r1" };
    routeFetch((p, init) => {
      if (p === "/api/nutrition/recipes/r1") {
        const method = (init as { method?: string } | undefined)?.method;
        if (method === "PUT") return { success: true, recipe: { _id: "r1" } };
        return recipe;
      }
      throw new Error(`unexpected ${p}`);
    });
    const { getByTestId } = render(<EditRecipeRoute />);
    await waitFor(() => {
      expect(getByTestId("recipe-editor-name").props.value).toBe("Turkey Chili");
    });
    fireEvent.press(getByTestId("recipe-editor-save"));
    await waitFor(() => {
      expect(callsTo("/api/nutrition/recipes/r1", "PUT").length).toBe(1);
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        "/(tabs)/nutrition/recipes/r1" as never,
      );
    });
  });

  it("no remaining link points at a missing page", () => {
    // The old helpers pointed at /dashboard/nutrition/recipes/..., which has
    // never been a page. Anything left points at /dashboard/recipes/....
    expect(recipeCreateUrl()).toBe("https://become.redbtn.io/dashboard/recipes/new");
    expect(recipeEditUrl("r1")).toBe("https://become.redbtn.io/dashboard/recipes/r1/edit");
    expect(recipeViewUrl("r1")).toBe("https://become.redbtn.io/dashboard/recipes/r1");
    const linksSrc = fs.readFileSync(
      path.resolve(__dirname, "..", "lib", "nutrition", "recipeLinks.ts"),
      "utf8",
    );
    expect(linksSrc).not.toContain("/dashboard/nutrition/recipes");
  });
});
