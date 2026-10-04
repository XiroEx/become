import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Bookmark, ChefHat, ChevronLeft, ScrollText } from "lucide-react-native";
import type { z } from "zod";
import {
  MealScheduleResponseSchema,
  MealsListResponseSchema,
  RecipesListResponseSchema,
  SavedFoodsResponseSchema,
  TagsResponseSchema,
  apiFetch,
  type Food,
  type Meal,
  type Recipe,
} from "@become/api-client";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { ScreenState } from "@/components/ScreenState";
import { MealLogSheet } from "@/components/nutrition/MealLogSheet";
import { SavedFoodLogSheet } from "@/components/nutrition/SavedFoodLogSheet";
import { AllowanceCounter } from "@/components/entitlements/AllowanceCounter";
import { AllowanceLock } from "@/components/entitlements/AllowanceLock";
import {
  syntheticGate,
  useEntitlements,
} from "@/lib/entitlements";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { routeApiError, useApiErrorHandler } from "@/lib/errors";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useDebouncedValue } from "@/lib/programs/useDebouncedValue";
import { defaultVariantOf } from "@/lib/nutrition/foodMath";
import type { MealItemPayload } from "@/lib/nutrition/mealLogActions";
import { logSavedMeal } from "@/lib/nutrition/basketLog";
import {
  logSavedFood,
  saveRecipeAsFood,
  unsaveFood,
} from "@/lib/nutrition/myStuff";
import { defaultTagAt, minutesOfDay, type TagWindow } from "@/lib/nutrition/mealSchedule";
import { openWebSignedIn } from "@/lib/web/openWebSignedIn";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

export type MyStuffTab = "meals" | "recipes" | "foods";

const TABS: { id: MyStuffTab; label: string; testID: string }[] = [
  { id: "meals", label: "Meals", testID: "my-stuff-tab-meals" },
  { id: "recipes", label: "Recipes", testID: "my-stuff-tab-recipes" },
  { id: "foods", label: "Foods", testID: "my-stuff-tab-foods" },
];

function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

function recipeId(r: Recipe): string {
  return String((r._id ?? r.id ?? "") as string);
}

function foodId(f: Food): string {
  return String((f._id ?? f.id ?? "") as string);
}

function mealId(m: Meal): string {
  return String((m._id ?? "") as string);
}

/**
 * MY STUFF — saved meals, my recipes and saved foods, on the phone (NP-142).
 *
 * Native counterpart of `webapp/app/dashboard/meals/page.tsx`: three tabs,
 * search, tag filter (meals tab), log a meal (portion, tag, time via
 * `MealLogSheet`), log a saved food (via `SavedFoodLogSheet`), unsave, and
 * the recipe save-or-log rule — a recipe is never logged directly: the first
 * tap mints a Food through save-as-food (`custom-foods`), the next logs that
 * Food.
 *
 * THE RULES, kept in the same words as the web:
 *
 *   • lists read the same three endpoints: `GET /api/meals`, `GET
 *     /api/nutrition/recipes?mine=true` and `GET /api/me/foods`;
 *   • create buttons read `canCreate`, never `allowed` and never
 *     `limit - used`. `allowed` stays true for a capped free member on
 *     purpose so they can still log, edit and DELETE their way back under
 *     the cap;
 *   • `enforced === false` (or an unknown snapshot) renders no lock, no
 *     counter and no sheet: `canCreate()` already answers true there;
 *   • when a recipe's save-as-food is refused at the custom-foods cap the web
 *     only toasts the server's sentence; native raises the upgrade sheet, as
 *     the plan-gates story requires.
 */
export default function MyStuffRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();
  const handleApiError = useApiErrorHandler();

  const [tab, setTab] = useState<MyStuffTab>("meals");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  const mealsPath = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    if (selectedTag) params.set("tag", selectedTag);
    params.set("limit", "50");
    return `/api/meals?${params.toString()}`;
  }, [debouncedSearch, selectedTag]);

  const recipesPath = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    params.set("mine", "true");
    params.set("limit", "50");
    return `/api/nutrition/recipes?${params.toString()}`;
  }, [debouncedSearch]);

  const meals = useFetch<z.infer<typeof MealsListResponseSchema>>(
    tab === "meals" ? mealsPath : null,
    MealsListResponseSchema,
    { ...fetchOpts, skip: !token || tab !== "meals" },
  );
  const recipes = useFetch<z.infer<typeof RecipesListResponseSchema>>(
    tab === "recipes" ? recipesPath : null,
    RecipesListResponseSchema,
    { ...fetchOpts, skip: !token || tab !== "recipes" },
  );
  const foods = useFetch<z.infer<typeof SavedFoodsResponseSchema>>(
    tab === "foods" ? "/api/me/foods" : null,
    SavedFoodsResponseSchema,
    { ...fetchOpts, skip: !token || tab !== "foods" },
  );
  const tags = useFetch<z.infer<typeof TagsResponseSchema>>(
    "/api/tags",
    TagsResponseSchema,
    { ...fetchOpts, skip: !token },
  );
  const schedule = useFetch<z.infer<typeof MealScheduleResponseSchema>>(
    "/api/meal-schedule",
    MealScheduleResponseSchema,
    { ...fetchOpts, skip: !token },
  );

  const scheduleWindows: TagWindow[] = useMemo(() => {
    const raw = schedule.data?.windows;
    if (!Array.isArray(raw)) return [];
    return (raw as TagWindow[]).map((w) => ({
      tag: w.tag,
      startMinutes: w.startMinutes ?? null,
      endMinutes: w.endMinutes ?? null,
    }));
  }, [schedule.data]);

  const currentDefaultTag = useMemo(
    () => defaultTagAt(scheduleWindows, minutesOfDay(new Date())),
    [scheduleWindows],
  );

  // Filter the Meals tab by the user's OWN category tags only — NOT the
  // default meal-times (breakfast/lunch/dinner/snack). A saved meal isn't
  // intrinsically a breakfast; meal-time is chosen when you log it.
  const allTags = useMemo<string[]>(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of (tags.data?.userTags ?? []) as string[]) {
      const norm = String(t).toLowerCase();
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        out.push(norm);
      }
    }
    return out;
  }, [tags.data?.userTags]);

  const {
    data: entitlements,
    canCreate,
    refresh: refreshEntitlements,
  } = useEntitlements();
  const mayCreateMeals = canCreate("custom-meals");
  const mayCreateFoods = canCreate("custom-foods");
  const enforced = Boolean(entitlements) && entitlements?.enforced !== false;

  const raiseCapSheet = useCallback(
    (feature: "custom-meals" | "custom-foods") => {
      const entitlement = entitlements?.features?.[feature] ?? null;
      showUpgradeSheet(
        syntheticGate(
          feature,
          entitlement?.requiresTier ?? "plus",
          entitlement,
        ),
      );
    },
    [entitlements],
  );

  /** Refusals route through the same classifier every screen uses: a plan-gate
   * raises the upgrade sheet (NP-052) and anything else comes back as the
   * server's own words. `routeApiError` without a provider would drop the
   * gate, so the sheet is raised here directly. */
  const handleFailure = useCallback((err: unknown): string | null => {
    const { handled, message } = routeApiError(err, {
      onPlanGate: (gate) => {
        showUpgradeSheet(gate.gate);
      },
    });
    return handled ? null : message;
  }, []);

  // ── Log a meal (portion, tag, time) ──────────────────────────────────────
  const [mealToLog, setMealToLog] = useState<Meal | null>(null);
  const [mealLogSubmitting, setMealLogSubmitting] = useState(false);
  const [mealLogError, setMealLogError] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  const handleLogSavedMeal = useCallback(
    async (opts: { portion: number; tag: string; untimed: boolean }) => {
      if (!mealToLog || mealLogSubmitting) return;
      setMealLogSubmitting(true);
      setMealLogError(null);
      try {
        await logSavedMeal({
          mealId: mealId(mealToLog),
          portion: opts.portion,
          tag: opts.tag,
          untimed: opts.untimed,
          apiFetch,
          token,
          baseUrl: WEBAPP_BASE_URL,
        });
        const id = mealId(mealToLog);
        setAppliedIds((prev) => new Set(prev).add(id));
        setTimeout(() => {
          setAppliedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 2200);
        setMealToLog(null);
      } catch (err) {
        const fallback = handleApiError(err).message;
        const message = handleFailure(err) ?? fallback;
        if (message) setMealLogError(message);
      } finally {
        setMealLogSubmitting(false);
      }
    },
    [mealToLog, mealLogSubmitting, token, handleFailure, handleApiError],
  );

  // ── Log a saved food ─────────────────────────────────────────────────────
  const [foodToLog, setFoodToLog] = useState<Food | null>(null);
  const [foodLogSubmitting, setFoodLogSubmitting] = useState(false);
  const [foodLogError, setFoodLogError] = useState<string | null>(null);
  const [loggedFoodIds, setLoggedFoodIds] = useState<Set<string>>(new Set());

  const handleLogSavedFood = useCallback(
    async (opts: { item: MealItemPayload; tag: string }) => {
      if (!foodToLog || foodLogSubmitting) return;
      setFoodLogSubmitting(true);
      setFoodLogError(null);
      try {
        await logSavedFood({
          item: opts.item as unknown as Record<string, unknown>,
          tag: opts.tag,
          apiFetch,
          token,
          baseUrl: WEBAPP_BASE_URL,
        });
        const id = foodId(foodToLog);
        setLoggedFoodIds((prev) => new Set(prev).add(id));
        setTimeout(() => {
          setLoggedFoodIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 2200);
        setFoodToLog(null);
      } catch (err) {
        const fallback = handleApiError(err).message;
        const message = handleFailure(err) ?? fallback;
        if (message) setFoodLogError(message);
      } finally {
        setFoodLogSubmitting(false);
      }
    },
    [foodToLog, foodLogSubmitting, token, handleFailure, handleApiError],
  );

  // ── Unsave ───────────────────────────────────────────────────────────────
  const [removingFoodId, setRemovingFoodId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleRemoveFood = useCallback(
    async (id: string) => {
      if (removingFoodId) return;
      setRemovingFoodId(id);
      setActionError(null);
      try {
        await unsaveFood({ foodId: id, apiFetch, token, baseUrl: WEBAPP_BASE_URL });
        await foods.refetch();
      } catch (err) {
        const fallback = handleApiError(err).message;
        const message = handleFailure(err) ?? fallback;
        setActionError(message || "Failed to remove food.");
      } finally {
        setRemovingFoodId(null);
      }
    },
    [removingFoodId, token, foods, handleFailure, handleApiError],
  );

  // ── Recipe save-or-log ───────────────────────────────────────────────────
  // Save-or-Log: recipes are never logged directly. First tap mints (or
  // reuses) a Food from the recipe; once saved, tapping logs that Food via
  // the saved-food sheet.
  const [busyRecipeId, setBusyRecipeId] = useState<string | null>(null);
  const [savedRecipeIds, setSavedRecipeIds] = useState<Set<string>>(new Set());

  const handleRecipeSaveOrLog = useCallback(
    async (recipe: Recipe) => {
      const id = recipeId(recipe);
      if (!id || busyRecipeId) return;
      setBusyRecipeId(id);
      setActionError(null);
      try {
        const result = await saveRecipeAsFood({
          recipeId: id,
          apiFetch,
          token,
          baseUrl: WEBAPP_BASE_URL,
        });
        // A create spends a slot, so the shared snapshot is behind by one.
        if (!result.alreadyExisted) {
          await refreshEntitlements().catch(() => {});
        }
        const wasSaved =
          Boolean(recipe.savedFoodId) ||
          result.alreadyExisted ||
          savedRecipeIds.has(id);
        setSavedRecipeIds((prev) => new Set(prev).add(id));
        if (wasSaved && result.food) {
          setFoodToLog(result.food as unknown as Food);
        } else {
          setActionError("Saved to your Foods — tap again to log it");
        }
        await recipes.refetch();
      } catch (err) {
        // A refusal means the snapshot disagrees with the server; re-read it
        // so the lock on this screen matches what just happened. A plan-gate
        // raises the upgrade sheet; anything else keeps the server's words.
        await refreshEntitlements().catch(() => {});
        const fallback = handleApiError(err).message;
        const message = handleFailure(err) ?? fallback;
        if (message) setActionError(message);
      } finally {
        setBusyRecipeId(null);
      }
    },
    [
      busyRecipeId,
      token,
      recipes,
      refreshEntitlements,
      savedRecipeIds,
      handleFailure,
      handleApiError,
    ],
  );

  // ── Create buttons: canCreate reads, upgrade sheet on a real gate ────────
  const openMealCreate = useCallback(() => {
    if (!mayCreateMeals && enforced) {
      raiseCapSheet("custom-meals");
      return;
    }
    void openWebSignedIn("/dashboard/meals/new");
  }, [mayCreateMeals, enforced, raiseCapSheet]);

  const openRecipeCreate = useCallback(() => {
    void openWebSignedIn("/dashboard/recipes/new");
  }, []);

  const openFoodCreate = useCallback(() => {
    if (!mayCreateFoods && enforced) {
      raiseCapSheet("custom-foods");
      return;
    }
    void openWebSignedIn("/dashboard/foods/new");
  }, [mayCreateFoods, enforced, raiseCapSheet]);

  // Refetch the visible tab when it (or its query) changes. The effect
  // genuinely syncs from navigation/tab state, which lives outside React.
  useEffect(() => {
    if (tab === "meals") void meals.refetch();
    else if (tab === "recipes") void recipes.refetch();
    else void foods.refetch();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from tab/query change
  }, [tab, mealsPath, recipesPath]);

  const filteredFoods = useMemo(() => {
    const list = foods.data?.foods ?? [];
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (f) =>
        String(f.name ?? "").toLowerCase().includes(q) ||
        String(f.brand ?? "").toLowerCase().includes(q),
    );
  }, [foods.data?.foods, debouncedSearch]);

  const mealRows = meals.data?.meals ?? [];
  const recipeRows = recipes.data?.recipes ?? [];

  const activeFetch = tab === "meals" ? meals : tab === "recipes" ? recipes : foods;
  const hasData =
    tab === "meals"
      ? mealRows.length > 0
      : tab === "recipes"
        ? recipeRows.length > 0
        : filteredFoods.length > 0;
  const isEmpty =
    !activeFetch.loading && !activeFetch.error && !hasData;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="my-stuff-route"
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 96 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            testID="my-stuff-back"
            accessibilityRole="button"
            accessibilityLabel="Back to nutrition"
            onPress={() => router.back()}
            style={{ ...minTouchTarget, justifyContent: "center", alignItems: "center" }}
          >
            <ChevronLeft size={22} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text className="text-foreground text-2xl font-bold">My Stuff</Text>
            <Text className="text-muted-foreground text-sm">
              {tab === "recipes"
                ? "Recipes become foods — save one as a food, then log it."
                : tab === "meals"
                  ? "Your saved meals — groups of foods you can log in one tap."
                  : "Your saved foods. Tap to log."}
            </Text>
          </View>
        </View>

        <View
          testID="my-stuff-tabs"
          style={{ flexDirection: "row", gap: 8 }}
          accessibilityRole="tablist"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <Pressable
                key={t.id}
                testID={t.testID}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t.label}
                onPress={() => setTab(t.id)}
                style={{
                  ...minTouchTarget,
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  backgroundColor: active ? colors.primary : colors.muted,
                }}
              >
                <Text
                  className={`text-xs font-semibold ${active ? "text-primary-foreground" : "text-foreground"}`}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Input
          testID="my-stuff-search"
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

        {tab === "meals" && allTags.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <Pressable
              testID="my-stuff-tag-all"
              accessibilityRole="button"
              accessibilityLabel="All tags"
              accessibilityState={{ selected: selectedTag === null }}
              onPress={() => setSelectedTag(null)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: selectedTag === null ? colors.primary : colors.muted,
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
                  accessibilityLabel={titleCaseTag(tag)}
                  accessibilityState={{ selected: active }}
                  onPress={() => setSelectedTag(active ? null : tag)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: active ? colors.primary : colors.muted,
                  }}
                >
                  <Text
                    className={`text-xs font-medium ${active ? "text-primary-foreground" : "text-foreground"}`}
                  >
                    {titleCaseTag(tag)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {tab === "foods" ? (
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
            <Button
              testID="my-stuff-new-food"
              variant="secondary"
              onPress={openFoodCreate}
            >
              New custom food
            </Button>
          </View>
        ) : null}

        {enforced ? (
          <View style={{ gap: 8 }}>
            {tab === "meals" ? (
              <>
                <AllowanceCounter
                  feature="custom-meals"
                  testID="my-stuff-meals-allowance-counter"
                />
                {!mayCreateMeals ? (
                  <AllowanceLock
                    feature="custom-meals"
                    onPress={(gate) => showUpgradeSheet(gate)}
                    testID="my-stuff-meals-allowance-lock"
                  />
                ) : null}
              </>
            ) : tab === "foods" ? (
              <>
                <AllowanceCounter
                  feature="custom-foods"
                  testID="my-stuff-foods-allowance-counter"
                />
                {!mayCreateFoods ? (
                  <AllowanceLock
                    feature="custom-foods"
                    onPress={(gate) => showUpgradeSheet(gate)}
                    testID="my-stuff-foods-allowance-lock"
                  />
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}

        {actionError ? (
          <Text
            testID="my-stuff-notice"
            accessibilityRole="alert"
            className="text-muted-foreground text-xs"
          >
            {actionError}
          </Text>
        ) : null}

        <ScreenState
          loading={activeFetch.loading}
          error={activeFetch.error}
          onRetry={() => void activeFetch.refetch()}
          hasData={hasData}
          empty={isEmpty}
          emptyTitle={
            tab === "recipes"
              ? debouncedSearch
                ? "No recipes match"
                : "No recipes yet"
              : tab === "meals"
                ? debouncedSearch || selectedTag
                  ? "No meals match"
                  : "No saved meals yet"
                : debouncedSearch
                  ? "No favorites match"
                  : "No favorites yet"
          }
          emptyMessage={
            tab === "recipes"
              ? debouncedSearch
                ? "Try a different search."
                : "A recipe is a set of ingredients you save as a food (e.g. Turkey Chili)."
              : tab === "meals"
                ? debouncedSearch || selectedTag
                  ? "Try a different search or clear the filter."
                  : "Save a group of foods as a meal and log it with one tap."
                : debouncedSearch
                  ? "Try a different search."
                  : "Tap the bookmark on any food in the search modal to add it here."
          }
          testID="my-stuff-screen-state"
        >
          {tab === "meals" ? (
            <View testID="my-stuff-meals-list" style={{ gap: 8 }}>
              {mealRows.map((meal) => {
                const id = mealId(meal);
                const applied = appliedIds.has(id);
                return (
                  <View
                    key={id}
                    testID={`my-stuff-meal-${id}`}
                    style={{
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      padding: 14,
                      gap: 6,
                    }}
                  >
                    <View
                      style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                    >
                      <ChefHat size={18} color={colors.primary} />
                      <Text
                        testID={`my-stuff-meal-${id}-name`}
                        className="text-foreground text-sm font-semibold"
                        style={{ flex: 1 }}
                      >
                        {meal.name}
                      </Text>
                    </View>
                    {meal.description ? (
                      <Text className="text-muted-foreground text-xs">
                        {meal.description}
                      </Text>
                    ) : null}
                    <Text
                      testID={`my-stuff-meal-${id}-meta`}
                      className="text-muted-foreground text-xs"
                    >
                      {(meal.items?.length ?? 0)} item
                      {(meal.items?.length ?? 0) === 1 ? "" : "s"}
                      {meal.totalNutrition
                        ? ` · ${Math.round(meal.totalNutrition.calories ?? 0)} kcal`
                        : ""}
                    </Text>
                    <Button
                      testID={`my-stuff-meal-${id}-log`}
                      variant="primary"
                      onPress={() => {
                        setMealLogError(null);
                        setMealToLog(meal);
                      }}
                    >
                      {applied ? "Logged ✓" : "Log"}
                    </Button>
                  </View>
                );
              })}
            </View>
          ) : null}

          {tab === "recipes" ? (
            <View testID="my-stuff-recipes-list" style={{ gap: 8 }}>
              {recipeRows.map((recipe) => {
                const id = recipeId(recipe);
                const saved =
                  Boolean(recipe.savedFoodId) || savedRecipeIds.has(id);
                const busy = busyRecipeId === id;
                return (
                  <View
                    key={id}
                    testID={`my-stuff-recipe-${id}`}
                    style={{
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      padding: 14,
                      gap: 6,
                    }}
                  >
                    <View
                      style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                    >
                      <ScrollText size={18} color={colors.primary} />
                      <Text
                        testID={`my-stuff-recipe-${id}-name`}
                        className="text-foreground text-sm font-semibold"
                        style={{ flex: 1 }}
                      >
                        {recipe.name}
                      </Text>
                    </View>
                    {recipe.description ? (
                      <Text className="text-muted-foreground text-xs">
                        {recipe.description}
                      </Text>
                    ) : null}
                    {recipe.totalsPerServing ? (
                      <Text
                        testID={`my-stuff-recipe-${id}-meta`}
                        className="text-muted-foreground text-xs"
                      >
                        {Math.round(recipe.totalsPerServing.calories ?? 0)} kcal
                        per serving
                      </Text>
                    ) : null}
                    <Button
                      testID={`my-stuff-recipe-${id}-save-or-log`}
                      variant={saved ? "primary" : "secondary"}
                      loading={busy}
                      disabled={busy}
                      onPress={() => void handleRecipeSaveOrLog(recipe)}
                    >
                      {busy ? "Saving…" : saved ? "Log" : "Save"}
                    </Button>
                  </View>
                );
              })}
            </View>
          ) : null}

          {tab === "foods" ? (
            <View testID="my-stuff-foods-list" style={{ gap: 8 }}>
              {filteredFoods.map((food) => {
                const id = foodId(food);
                const logged = loggedFoodIds.has(id);
                const removing = removingFoodId === id;
                const variant = defaultVariantOf(food);
                const kcal = variant?.nutrition?.calories;
                return (
                  <View
                    key={id}
                    testID={`my-stuff-food-${id}`}
                    style={{
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      padding: 14,
                      gap: 6,
                    }}
                  >
                    <View
                      style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                    >
                      <Bookmark size={18} color={colors.primary} />
                      <Text
                        testID={`my-stuff-food-${id}-name`}
                        className="text-foreground text-sm font-semibold"
                        style={{ flex: 1 }}
                      >
                        {food.name}
                      </Text>
                    </View>
                    <Text
                      testID={`my-stuff-food-${id}-meta`}
                      className="text-muted-foreground text-xs"
                    >
                      {typeof kcal === "number" ? `${Math.round(kcal)} kcal` : ""}
                      {food.brand ? ` · ${food.brand}` : ""}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Button
                          testID={`my-stuff-food-${id}-log`}
                          variant="primary"
                          onPress={() => {
                            setFoodLogError(null);
                            setFoodToLog(food);
                          }}
                        >
                          {logged ? "Logged ✓" : "Log"}
                        </Button>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button
                          testID={`my-stuff-food-${id}-unsave`}
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
                );
              })}
            </View>
          ) : null}
        </ScreenState>

        {tab === "meals" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Button
              testID="my-stuff-new-meal"
              variant="primary"
              onPress={openMealCreate}
            >
              New meal
            </Button>
          </View>
        ) : null}
        {tab === "recipes" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Button
              testID="my-stuff-new-recipe"
              variant="primary"
              onPress={openRecipeCreate}
            >
              New recipe
            </Button>
          </View>
        ) : null}
      </ScrollView>

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
