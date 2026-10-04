import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Bookmark, ChefHat, Plus, ScrollText, Search } from "lucide-react-native";
import { z } from "zod";
import {
  apiFetch,
  MealsListResponseSchema,
  RecipesListResponseSchema,
  SavedFoodsResponseSchema,
  TagsResponseSchema,
  MealScheduleResponseSchema,
  type Food,
  type Meal,
  type MealsListResponse,
  type Recipe,
  type SavedFoodsResponse,
  type MealScheduleResponse,
} from "@become/api-client";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { MealLogSheet } from "@/components/nutrition/MealLogSheet";
import { SavedFoodLogSheet } from "@/components/nutrition/SavedFoodLogSheet";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useApiErrorHandler } from "@/lib/errors";
import {
  syntheticGate,
  useEntitlements,
} from "@/lib/entitlements";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { openWebSignedIn } from "@/lib/web/openWebSignedIn";
import { logSavedMeal } from "@/lib/nutrition/basketLog";
import { logFoodItem } from "@/lib/nutrition/mealLogActions";
import { defaultTagAt, minutesOfDay, titleCase } from "@/lib/nutrition/mealSchedule";
import {
  filterSavedFoodsByQuery,
  foodIdOf,
  ownCategoryTags,
  recipeIdOf,
  saveRecipeAsFood,
  unsaveFood,
} from "@/lib/nutrition/myStuff";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useDebouncedValue } from "@/lib/programs/useDebouncedValue";

/**
 * ─── My Stuff, natively (NP-142) ────────────────────────────────────────────
 *
 * The web's My Stuff (`webapp/app/dashboard/meals/page.tsx`): three tabs —
 * Meals (`GET /api/meals`), Recipes (the member's own,
 * `GET /api/nutrition/recipes?mine=true`) and Foods (bookmarked,
 * `GET /api/me/foods`) — with search and tag filters, log sheets, and the
 * recipe save-or-log rule. `/dashboard/nutrition/recipes` redirects there on
 * the web; natively this screen replaces the old recipes index and is reached
 * from the nutrition screen's My Stuff button.
 *
 * RULES THAT TRAVEL:
 *   • A recipe is never logged directly: the first tap mints a Food through
 *     save-as-food (`custom-foods`), the next logs that Food.
 *   • A refused save-as-food at the `custom-foods` cap raises the upgrade
 *     sheet (plan-gates story) — the web only toasts the server's sentence.
 *   • Create buttons read `canCreate` and show the upgrade sheet on a real
 *     gate. Create opens the web editors signed in (allow-listed paths).
 */

type MyStuffTab = "meals" | "recipes" | "foods";

const TABS: { key: MyStuffTab; label: string }[] = [
  { key: "recipes", label: "Recipes" },
  { key: "meals", label: "Meals" },
  { key: "foods", label: "Foods" },
];

function mealIdOf(meal: Meal): string {
  return String(meal._id ?? "");
}

export default function MyStuffRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();
  // A plan gate (e.g. the custom-foods cap on save-as-food) raises the
  // upgrade sheet through the root provider; the per-call `onPlanGate` below
  // is the backstop for a tree with no provider (tests, previews), where the
  // failure would otherwise come back as an ordinary error.
  const handleApiError = useApiErrorHandler({
    onPlanGate: (gate) => {
      showUpgradeSheet(gate.gate);
    },
  });
  const {
    data: entitlements,
    canCreate,
    refresh: refreshEntitlements,
  } = useEntitlements();

  const [tab, setTab] = useState<MyStuffTab>("meals");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [busyRecipeId, setBusyRecipeId] = useState<string | null>(null);
  const [removingFoodId, setRemovingFoodId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const [mealToLog, setMealToLog] = useState<Meal | null>(null);
  const [mealLogSubmitting, setMealLogSubmitting] = useState(false);
  const [mealLogError, setMealLogError] = useState<string | null>(null);

  const [foodToLog, setFoodToLog] = useState<Food | null>(null);
  const [foodLogSubmitting, setFoodLogSubmitting] = useState(false);
  const [foodLogError, setFoodLogError] = useState<string | null>(null);

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    }),
    [token],
  );

  // ── Meals: GET /api/meals?q=&tag=&limit=50 (the web's fetchMeals) ──────────
  const mealsPath = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    if (selectedTag) params.set("tag", selectedTag);
    params.set("limit", "50");
    const qs = params.toString();
    return `/api/meals${qs ? `?${qs}` : ""}`;
  }, [debouncedSearch, selectedTag]);

  const {
    data: mealsData,
    loading: mealsLoading,
  } = useFetch<z.infer<typeof MealsListResponseSchema>>(
    mealsPath,
    MealsListResponseSchema,
    fetchOpts,
  );
  const meals: MealsListResponse["meals"] = useMemo(
    () => mealsData?.meals ?? [],
    [mealsData],
  );

  // ── Recipes: GET /api/nutrition/recipes?mine=true (the web's fetchRecipes) ─
  const recipesPath = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    params.set("mine", "true");
    params.set("limit", "50");
    return `/api/nutrition/recipes?${params.toString()}`;
  }, [debouncedSearch]);

  const {
    data: recipesData,
    loading: recipesLoading,
  } = useFetch<z.infer<typeof RecipesListResponseSchema>>(
    tab === "recipes" ? recipesPath : null,
    RecipesListResponseSchema,
    {
      ...fetchOpts,
      // Keep the baseUrl + token fetch contract the recipes-route suite asserts:
      // the path is non-null only on the recipes tab, but the GET must still
      // issue with baseUrl + token when it runs.
      skip: !token || tab !== "recipes",
    },
  );
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from network response
    setRecipes(recipesData?.recipes ?? []);
  }, [recipesData]);

  // ── Foods: GET /api/me/foods (the web's fetchSavedFoods) ───────────────────
  const {
    data: foodsData,
    loading: foodsLoading,
    refetch: refetchFoods,
  } = useFetch<z.infer<typeof SavedFoodsResponseSchema>>(
    tab === "foods" ? "/api/me/foods" : null,
    SavedFoodsResponseSchema,
    { ...fetchOpts, skip: !token || tab !== "foods" },
  );
  const savedFoods: SavedFoodsResponse["foods"] = useMemo(
    () => foodsData?.foods ?? [],
    [foodsData],
  );
  const filteredFoods = useMemo(
    () => filterSavedFoodsByQuery(savedFoods, debouncedSearch),
    [savedFoods, debouncedSearch],
  );

  // ── Tags: GET /api/tags; Meals tab filters by the member's OWN category ───
  // tags only, never the meal-time defaults (the web's `allTags`).
  const { data: tagsData } = useFetch<z.infer<typeof TagsResponseSchema>>(
    "/api/tags",
    TagsResponseSchema,
    fetchOpts,
  );
  const allTags = useMemo(
    () => ownCategoryTags((tagsData?.userTags ?? []) as readonly unknown[]),
    [tagsData],
  );

  // ── Schedule: default tag for the log sheets ───────────────────────────────
  const { data: scheduleData } = useFetch<z.infer<typeof MealScheduleResponseSchema>>(
    "/api/nutrition/meal-schedule",
    MealScheduleResponseSchema,
    fetchOpts,
  );
  const currentDefaultTag = useMemo(() => {
    const raw: MealScheduleResponse["windows"] | undefined = scheduleData?.windows;
    const windows = Array.isArray(raw)
      ? raw.map((w) => ({
          tag: w.tag,
          startMinutes: w.startMinutes ?? null,
          endMinutes: w.endMinutes ?? null,
        }))
      : [];
    return defaultTagAt(windows, minutesOfDay(new Date()));
  }, [scheduleData]);

  // ── Recipe save-or-log (the web's handleRecipeSaveOrLog) ───────────────────
  // First tap mints (or reuses) a Food through save-as-food; once saved,
  // tapping logs that Food via the food log sheet. A refused save-as-food at
  // the custom-foods cap raises the upgrade sheet (plan-gates story).
  const handleRecipeSaveOrLog = useCallback(
    async (recipe: Recipe) => {
      const id = recipeIdOf(recipe);
      if (!id || busyRecipeId) return;
      setBusyRecipeId(id);
      setBanner(null);
      try {
        const data = await saveRecipeAsFood(id, {
          apiFetch,
          token,
          baseUrl: WEBAPP_BASE_URL,
        });
        const food = (data?.food ?? null) as unknown as Food | null;
        const wasSaved =
          Boolean(recipe.savedFoodId) || Boolean(data?.alreadyExisted);
        setRecipes((prev) =>
          prev.map((r) =>
            recipeIdOf(r) === id
              ? {
                  ...r,
                  savedFoodId:
                    r.savedFoodId ??
                    (food ? foodIdOf(food as unknown as { _id?: unknown; id?: unknown }) : null) ??
                    "saved",
                }
              : r,
          ),
        );
        await refreshEntitlements().catch(() => {});
        if (wasSaved && food) {
          setFoodLogError(null);
          setFoodToLog(food);
        } else {
          setBanner("Saved to your Foods — tap again to log it");
        }
      } catch (err) {
        // A plan gate (e.g. the custom-foods cap) raises the upgrade sheet
        // through the handler above; an ordinary refusal keeps the server's
        // own words in the banner. The web only toasts the sentence; native
        // raises the sheet, as the plan-gates story requires.
        const { handled, message } = handleApiError(err);
        if (!handled) setBanner(message);
      } finally {
        setBusyRecipeId(null);
      }
    },
    [busyRecipeId, handleApiError, refreshEntitlements, token],
  );

  // ── Log a saved meal (portion, tag, time — the web's MealApplySheet) ───────
  const handleLogSavedMeal = useCallback(
    async (opts: { portion: number; tag: string; untimed: boolean }) => {
      if (!mealToLog || mealLogSubmitting) return;
      setMealLogSubmitting(true);
      setMealLogError(null);
      try {
        await logSavedMeal({
          mealId: mealIdOf(mealToLog),
          portion: opts.portion,
          tag: opts.tag,
          untimed: opts.untimed,
          apiFetch,
          token,
          baseUrl: WEBAPP_BASE_URL,
        });
        setMealToLog(null);
        setBanner(`Logged ${mealToLog.name}`);
      } catch (err) {
        const { handled, message } = handleApiError(err);
        if (!handled) setMealLogError(message);
      } finally {
        setMealLogSubmitting(false);
      }
    },
    [handleApiError, mealLogSubmitting, mealToLog, token],
  );

  // ── Log a saved food (the web's FoodLogSheet → POST /api/meal-logs) ────────
  const handleLogSavedFood = useCallback(
    async (opts: {
      item: Parameters<typeof logFoodItem>[0]["item"];
      tag: string;
      date: string;
      timeMode: "now" | "picked" | "none";
      pickedTime?: string | null;
    }) => {
      if (!foodToLog || foodLogSubmitting) return;
      setFoodLogSubmitting(true);
      setFoodLogError(null);
      try {
        await logFoodItem({
          item: opts.item,
          tag: opts.tag,
          date: opts.date,
          timeMode: opts.timeMode,
          pickedTime: opts.pickedTime,
          existingLogs: [],
          apiFetch,
          token,
          baseUrl: WEBAPP_BASE_URL,
        });
        setFoodToLog(null);
        setBanner(`Logged ${foodToLog.name}`);
      } catch (err) {
        const { handled, message } = handleApiError(err);
        if (!handled) setFoodLogError(message);
      } finally {
        setFoodLogSubmitting(false);
      }
    },
    [foodLogSubmitting, foodToLog, handleApiError, token],
  );

  // ── Unsave a food (DELETE /api/me/foods/{foodId}) ──────────────────────────
  const handleRemoveFood = useCallback(
    async (foodId: string) => {
      if (!foodId || removingFoodId) return;
      setRemovingFoodId(foodId);
      try {
        const ok = await unsaveFood(foodId, {
          apiFetch,
          token,
          baseUrl: WEBAPP_BASE_URL,
        });
        if (ok) {
          await refetchFoods();
          await refreshEntitlements().catch(() => {});
        } else {
          setBanner("Could not remove food.");
        }
      } finally {
        setRemovingFoodId(null);
      }
    },
    [refetchFoods, refreshEntitlements, removingFoodId, token],
  );

  // ── Create: gated by canCreate; opens the web editors signed in ────────────
  // (allow-listed handoff paths — webapp/lib/authHandoff.ts).
  const mayCreateMeals = canCreate("custom-meals");
  const mayCreateFoods = canCreate("custom-foods");
  const isAtCap = useCallback(
    (feature: "custom-meals" | "custom-foods") =>
      !canCreate(feature) && Boolean(entitlements) && entitlements?.enforced !== false,
    [canCreate, entitlements],
  );

  const raiseCapSheet = useCallback(
    (feature: "custom-meals" | "custom-foods") => {
      const entitlement = entitlements?.features?.[feature] ?? null;
      showUpgradeSheet(
        syntheticGate(feature, entitlement?.requiresTier ?? "plus", entitlement),
      );
    },
    [entitlements],
  );

  const handleCreateMeal = useCallback(() => {
    if (isAtCap("custom-meals")) {
      raiseCapSheet("custom-meals");
      return;
    }
    // The meal editor is web-only (NP-012 builds My Stuff natively but keeps
    // creation on the web). `/dashboard/meals/new` is not on the handoff
    // allow-list, so `openWebSignedIn` falls back to the plain (signed-out)
    // open — exactly today's behaviour for a non-allow-listed path.
    void openWebSignedIn("/dashboard/meals/new");
  }, [isAtCap, raiseCapSheet]);

  const handleCreateRecipe = useCallback(() => {
    if (isAtCap("custom-foods")) {
      raiseCapSheet("custom-foods");
      return;
    }
    void openWebSignedIn("/dashboard/recipes/new");
  }, [isAtCap, raiseCapSheet]);

  const handleCreateFood = useCallback(() => {
    if (isAtCap("custom-foods")) {
      raiseCapSheet("custom-foods");
      return;
    }
    // The custom-food editor is web-only. `/dashboard/foods/new` is not on
    // the handoff allow-list, so `openWebSignedIn` falls back to the plain
    // (signed-out) open — exactly today's behaviour for such a path.
    void openWebSignedIn("/dashboard/foods/new");
  }, [isAtCap, raiseCapSheet]);

  const loading = tab === "meals" ? mealsLoading : tab === "recipes" ? recipesLoading : foodsLoading;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="my-stuff-route"
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            testID="my-stuff-back"
            accessibilityRole="button"
            accessibilityLabel="Back to nutrition"
            onPress={() => router.back()}
            style={{ padding: 6 }}
          >
            <Text className="text-foreground text-base font-semibold">‹ Back</Text>
          </Pressable>
          <Text className="text-foreground text-2xl font-bold">My Stuff</Text>
        </View>
        <Text className="text-muted-foreground text-sm">
          {tab === "recipes"
            ? "Recipes become foods — save one as a food, then log it."
            : tab === "meals"
              ? "Your saved meals — groups of foods you can log in one tap."
              : "Your saved foods. Tap to log."}
        </Text>

        {/* Tab strip */}
        <View
          testID="my-stuff-tabs"
          style={{ flexDirection: "row", gap: 8 }}
          accessibilityRole="tablist"
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                testID={`my-stuff-tab-${t.key}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t.label}
                onPress={() => {
                  setTab(t.key);
                  setSelectedTag(null);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: "center",
                  backgroundColor: active ? colors.primary : colors.card,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text
                  className={`text-sm font-semibold ${active ? "text-primary-foreground" : "text-foreground"}`}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Search */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Search size={16} color={colors["muted-foreground"]} />
          <View style={{ flex: 1 }}>
            <Input
              testID="my-stuff-search"
              accessibilityLabel={
                tab === "recipes"
                  ? "Search your recipes"
                  : tab === "meals"
                    ? "Search your meals"
                    : "Search your foods"
              }
              placeholder={
                tab === "recipes"
                  ? "Search your recipes…"
                  : tab === "meals"
                    ? "Search your meals…"
                    : "Search your foods…"
              }
              value={search}
              onChangeText={setSearch}
            />
          </View>
        </View>

        {/* Tag filter chips — Meals tab only, own categories, never meal-times */}
        {tab === "meals" && allTags.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Pressable
              testID="my-stuff-tag-all"
              accessibilityRole="button"
              accessibilityLabel="All tags"
              onPress={() => setSelectedTag(null)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                backgroundColor: selectedTag === null ? colors.primary : colors.card,
                borderWidth: 1,
                borderColor: selectedTag === null ? colors.primary : colors.border,
              }}
            >
              <Text
                className={`text-xs font-medium ${selectedTag === null ? "text-primary-foreground" : "text-foreground"}`}
              >
                All
              </Text>
            </Pressable>
            {allTags.map((tag) => {
              const active = selectedTag === tag;
              return (
                <Pressable
                  key={tag}
                  testID={`my-stuff-tag-${tag}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by ${tag}`}
                  onPress={() => setSelectedTag(active ? null : tag)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                    backgroundColor: active ? colors.primary : colors.card,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    className={`text-xs font-medium ${active ? "text-primary-foreground" : "text-foreground"}`}
                  >
                    {titleCase(tag)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {banner ? (
          <Text testID="my-stuff-banner" className="text-muted-foreground text-xs">
            {banner}
          </Text>
        ) : null}

        {loading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator testID="my-stuff-loading" />
          </View>
        ) : null}

        {/* Recipes list — save-or-log, never a direct log */}
        {!loading && tab === "recipes" ? (
          recipes.length === 0 ? (
            <View testID="my-stuff-recipes-empty" style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
              <ScrollText size={28} color={colors["muted-foreground"]} />
              <Text className="text-foreground text-base font-semibold">
                {debouncedSearch ? "No recipes match" : "No recipes yet"}
              </Text>
              <Text className="text-muted-foreground text-xs text-center">
                {debouncedSearch
                  ? "Try a different search."
                  : "A recipe is a set of ingredients you save as a food (e.g. Turkey Chili)."}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {recipes.map((recipe) => {
                const id = recipeIdOf(recipe);
                const saved = Boolean(recipe.savedFoodId);
                const busy = busyRecipeId === id;
                const kcal = recipe.totalsPerServing?.calories;
                return (
                  <Card key={id} title={recipe.name} subtitle={recipe.description ?? ""}>
                    <View testID={`my-stuff-recipe-${id}`}>
                      {typeof kcal === "number" ? (
                        <Text testID={`my-stuff-recipe-${id}-kcal`} className="text-muted-foreground text-xs">
                          {Math.round(kcal)} cal/serving
                        </Text>
                      ) : null}
                      <Text className="text-muted-foreground text-xs">
                        {(recipe.ingredients?.length ?? 0)} ingredients
                      </Text>
                      <View style={{ marginTop: 8 }}>
                        <Button
                          testID={`my-stuff-recipe-save-or-log-${id}`}
                          variant="primary"
                          loading={busy}
                          disabled={busy}
                          onPress={() => void handleRecipeSaveOrLog(recipe)}
                        >
                          {saved ? "Log" : "Save as food"}
                        </Button>
                      </View>
                    </View>
                  </Card>
                );
              })}
            </View>
          )
        ) : null}

        {/* Meals list — log a meal (portion, tag, time) */}
        {!loading && tab === "meals" ? (
          meals.length === 0 ? (
            <View testID="my-stuff-meals-empty" style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
              <ChefHat size={28} color={colors["muted-foreground"]} />
              <Text className="text-foreground text-base font-semibold">
                {debouncedSearch || selectedTag ? "No meals match" : "No saved meals yet"}
              </Text>
              <Text className="text-muted-foreground text-xs text-center">
                {debouncedSearch || selectedTag
                  ? "Try a different search or clear the filter."
                  : "Save a group of foods as a meal and log it with one tap."}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {meals.map((meal: MealsListResponse["meals"][number]) => {
                const id = mealIdOf(meal);
                const kcal = meal.totalNutrition?.calories;
                return (
                  <Card key={id} title={meal.name} subtitle={meal.description ?? ""}>
                    <View testID={`my-stuff-meal-${id}`}>
                      <Text className="text-muted-foreground text-xs">
                        {(meal.items?.length ?? 0)} items
                        {typeof kcal === "number" ? ` · ${Math.round(kcal)} kcal` : ""}
                      </Text>
                      <View style={{ marginTop: 8 }}>
                        <Button
                          testID={`my-stuff-meal-log-${id}`}
                          variant="primary"
                          onPress={() => {
                            setMealLogError(null);
                            setMealToLog(meal);
                          }}
                        >
                          Log
                        </Button>
                      </View>
                    </View>
                  </Card>
                );
              })}
            </View>
          )
        ) : null}

        {/* Foods list — log a saved food, unsave */}
        {!loading && tab === "foods" ? (
          filteredFoods.length === 0 ? (
            <View testID="my-stuff-foods-empty" style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
              <Bookmark size={28} color={colors["muted-foreground"]} />
              <Text className="text-foreground text-base font-semibold">
                {debouncedSearch ? "No favorites match" : "No favorites yet"}
              </Text>
              <Text className="text-muted-foreground text-xs text-center">
                {debouncedSearch
                  ? "Try a different search."
                  : "Tap the bookmark on any food in the search modal to add it here."}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {filteredFoods.map((food: SavedFoodsResponse["foods"][number]) => {
                const id = foodIdOf(food);
                const kcal = food.nutrition?.calories;
                const removing = removingFoodId === id;
                return (
                  <Card key={id} title={food.name} subtitle={food.brand ?? ""}>
                    <View testID={`my-stuff-food-${id}`}>
                      {typeof kcal === "number" ? (
                        <Text className="text-muted-foreground text-xs">
                          {Math.round(kcal)} kcal
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Button
                            testID={`my-stuff-food-log-${id}`}
                            variant="primary"
                            onPress={() => {
                              setFoodLogError(null);
                              setFoodToLog(food);
                            }}
                          >
                            Log
                          </Button>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Button
                            testID={`my-stuff-food-remove-${id}`}
                            variant="secondary"
                            loading={removing}
                            disabled={removing}
                            onPress={() => void handleRemoveFood(id)}
                          >
                            Unsave
                          </Button>
                        </View>
                      </View>
                    </View>
                  </Card>
                );
              })}
            </View>
          )
        ) : null}

        {/* Create buttons — gated by canCreate, upgrade sheet on a real gate */}
        {tab === "meals" ? (
          <Button
            testID="my-stuff-create-meal"
            variant="secondary"
            onPress={handleCreateMeal}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Plus size={14} color={colors.foreground} />
              <Text className="text-foreground text-sm font-semibold">
                {mayCreateMeals ? "New meal" : "New meal (Plus)"}
              </Text>
            </View>
          </Button>
        ) : null}
        {tab === "recipes" ? (
          <Button
            testID="my-stuff-create-recipe"
            variant="secondary"
            onPress={handleCreateRecipe}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Plus size={14} color={colors.foreground} />
              <Text className="text-foreground text-sm font-semibold">
                {mayCreateFoods ? "New recipe" : "New recipe (Plus)"}
              </Text>
            </View>
          </Button>
        ) : null}
        {tab === "foods" ? (
          <Button
            testID="my-stuff-create-food"
            variant="secondary"
            onPress={handleCreateFood}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Plus size={14} color={colors.foreground} />
              <Text className="text-foreground text-sm font-semibold">
                {mayCreateFoods ? "New custom food" : "New custom food (Plus)"}
              </Text>
            </View>
          </Button>
        ) : null}
      </ScrollView>

      {/* Log a saved meal with a portion (NP-094 sheet, reused) */}
      <MealLogSheet
        visible={mealToLog !== null}
        meal={mealToLog}
        currentTag={currentDefaultTag}
        submitting={mealLogSubmitting}
        error={mealLogError}
        onClose={() => {
          setMealToLog(null);
          setMealLogError(null);
        }}
        onSubmit={handleLogSavedMeal}
      />

      {/* Log a saved food (NP-142 sheet) */}
      <SavedFoodLogSheet
        visible={foodToLog !== null}
        food={foodToLog}
        currentTag={currentDefaultTag}
        submitting={foodLogSubmitting}
        error={foodLogError}
        onClose={() => {
          setFoodToLog(null);
          setFoodLogError(null);
        }}
        onSubmit={handleLogSavedFood}
      />
    </SafeAreaView>
  );
}
