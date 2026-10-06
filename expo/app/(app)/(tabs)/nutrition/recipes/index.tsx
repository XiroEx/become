import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  BadgeCheck,
  Bookmark,
  ChefHat,
  Plus,
  ScrollText,
  Search,
} from "lucide-react-native";
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
import { FoodThumbnail } from "@/components/nutrition/FoodThumbnail";
import {
  MacroBar,
  MealThumbnail,
  RecipeThumbnail,
  TagChip,
  titleCaseTag,
} from "@/components/nutrition/MyStuffCards";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useApiErrorHandler, routeApiError } from "@/lib/errors";
import {
  syntheticGate,
  useEntitlements,
} from "@/lib/entitlements";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { openWebSignedIn } from "@/lib/web/openWebSignedIn";
import { logSavedMeal } from "@/lib/nutrition/basketLog";
import { logFoodItem } from "@/lib/nutrition/mealLogActions";
import {
  createSavedMeal,
} from "@/lib/nutrition/savedMeals";
import { uploadMealImage } from "@/lib/media/upload";
import {
  MealEditorSheet,
  type MealEditorSubmit,
} from "@/components/nutrition/MealEditorSheet";
import { defaultTagAt, minutesOfDay } from "@/lib/nutrition/mealSchedule";
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
 *     gate. Meal create is native (NP-143): the editor sheet posts
 *     `POST /api/meals` (quota-gated), uploads a fresh photo after the
 *     create, and refreshes entitlements so the cap the create just spent
 *     shows at once. Tapping a meal opens its native page (log, plan,
 *     edit, delete with confirmation, to-recipe, sync-plans after an edit).
 */

type MyStuffTab = "meals" | "recipes" | "foods";

const TABS: { key: MyStuffTab; label: string; Icon: typeof ScrollText }[] = [
  { key: "recipes", label: "Recipes", Icon: ScrollText },
  { key: "meals", label: "Meals", Icon: ChefHat },
  { key: "foods", label: "Foods", Icon: Bookmark },
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

  // ── Native meal create (NP-143): the editor sheet + the gated create ─────
  const [mealEditorOpen, setMealEditorOpen] = useState(false);
  const [mealEditorSaving, setMealEditorSaving] = useState(false);
  const [mealEditorError, setMealEditorError] = useState<string | null>(null);

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
    refetch: refetchMeals,
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
    // Native meal editor (NP-143): the sheet posts `POST /api/meals`
    // itself. The server is still the gate — a 403 that arrives anyway
    // raises the same sheet from the server's own words.
    setMealEditorError(null);
    setMealEditorOpen(true);
  }, [isAtCap, raiseCapSheet]);

  const handleMealEditorSubmit = useCallback(
    async (submit: MealEditorSubmit) => {
      if (mealEditorSaving) return;
      setMealEditorSaving(true);
      setMealEditorError(null);
      try {
        const { mealId } = await createSavedMeal(submit.input, {
          apiFetch,
          token,
          baseUrl: WEBAPP_BASE_URL,
        });
        // A fresh capture uploads after the create (the web's MealForm
        // holds the blob until it has a mealId). Non-fatal — the meal
        // saved fine.
        if (mealId && submit.pendingPhoto) {
          try {
            await uploadMealImage(mealId, {
              uri: submit.pendingPhoto.uri,
              fileName: submit.pendingPhoto.fileName,
              mimeType: submit.pendingPhoto.mimeType,
            });
          } catch {
            // non-fatal
          }
        }
        // A create spends a custom-meals slot — re-read the snapshot so
        // the cap the create just spent shows at once.
        await refreshEntitlements().catch(() => {});
        await refetchMeals();
        setMealEditorOpen(false);
        if (mealId) {
          router.push(
            `/(tabs)/nutrition/meals/${encodeURIComponent(mealId)}` as never,
          );
        } else {
          setBanner("Meal saved");
        }
      } catch (err) {
        const routed = routeApiError(err, {
          onPlanGate: (gate) => {
            showUpgradeSheet(gate.gate);
          },
        });
        // A refusal means the snapshot disagrees with the server; re-read
        // it so the lock matches what just happened.
        await refreshEntitlements().catch(() => {});
        if (!routed.handled) setMealEditorError(routed.message);
        else setMealEditorOpen(false);
      } finally {
        setMealEditorSaving(false);
      }
    },
    [mealEditorSaving, refetchMeals, refreshEntitlements, router, token],
  );

  // The create-body helper lives in `lib/nutrition/savedMeals` beside the
  // editor; the delete side marks the snapshot stale from the meal page.

  const handleCreateRecipe = useCallback(() => {
    if (isAtCap("custom-foods")) {
      raiseCapSheet("custom-foods");
      return;
    }
    // Native recipe editor (NP-144): the create screen posts
    // `POST /api/nutrition/recipes` itself. The server is still the gate —
    // a 403 that arrives anyway raises the same sheet from the server's own
    // words.
    router.push("/(tabs)/nutrition/recipes/new" as never);
  }, [isAtCap, raiseCapSheet, router]);

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
        {/* A single bordered strip with the active segment filled, matching
            the web's `SegmentedControl` (`components/ui/SegmentedControl.tsx`)
            — `inline-flex w-full rounded-xl border bg-white p-0.5`, black
            active segment with its own icon. Native drew three separate
            bordered buttons with no icon and reddened the active one. */}
        <View
          testID="my-stuff-tabs"
          style={{
            flexDirection: "row",
            gap: 2,
            padding: 2,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
          }}
          accessibilityRole="tablist"
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            const Icon = t.Icon;
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
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: active ? colors.primary : "transparent",
                }}
              >
                <Icon
                  size={14}
                  color={active ? colors["primary-foreground"] : colors["muted-foreground"]}
                />
                <Text
                  className={`text-sm font-semibold ${active ? "text-primary-foreground" : "text-muted-foreground"}`}
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

        {/* New custom food — directly under the search bar, My Foods tab
            only, matching the web's placement
            (`app/dashboard/meals/page.tsx`'s `flex justify-end` right after
            the search input). Native used to put this row below the whole
            list instead. */}
        {tab === "foods" ? (
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
            <Button
              testID="my-stuff-create-food"
              variant="secondary"
              size="sm"
              onPress={handleCreateFood}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Plus size={14} color={colors.foreground} />
                <Text className="text-foreground text-xs font-semibold">
                  {mayCreateFoods ? "New custom food" : "New custom food (Plus)"}
                </Text>
              </View>
            </Button>
          </View>
        ) : null}

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
                    {titleCaseTag(tag)}
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
                const firstTag = recipe.tags?.[0];
                const macros = {
                  protein: recipe.totalsPerServing?.protein ?? 0,
                  carbs: recipe.totalsPerServing?.carbs ?? 0,
                  fats: recipe.totalsPerServing?.fats ?? 0,
                };
                return (
                  <Pressable
                    key={id}
                    testID={`my-stuff-recipe-open-${id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Open recipe ${recipe.name}`}
                    onPress={() =>
                      router.push(
                        `/(tabs)/nutrition/recipes/${encodeURIComponent(id)}` as never,
                      )
                    }
                  >
                    {/* The web's RecipeCard: a violet scroll thumbnail, a tag
                        chip, per-serving cal + ingredient count, a macro
                        bar, then "Save as food"/"Log" — native drew only a
                        name and a kcal line with a separate Open button. */}
                    <Card testID={`my-stuff-recipe-${id}`}>
                      <View style={{ flexDirection: "row", gap: 12 }}>
                        <RecipeThumbnail
                          imageUrl={recipe.imageUrl}
                          name={recipe.name}
                          testID={`my-stuff-recipe-${id}-thumbnail`}
                        />
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text
                            className="text-foreground text-base font-semibold"
                            numberOfLines={1}
                          >
                            {recipe.name}
                          </Text>
                          {recipe.description ? (
                            <Text
                              className="text-muted-foreground text-xs"
                              numberOfLines={1}
                            >
                              {recipe.description}
                            </Text>
                          ) : null}
                          {firstTag ? (
                            <TagChip
                              label={titleCaseTag(firstTag)}
                              testID={`my-stuff-recipe-${id}-tag`}
                            />
                          ) : null}
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 8,
                              marginTop: 2,
                            }}
                          >
                            {typeof kcal === "number" ? (
                              <Text
                                testID={`my-stuff-recipe-${id}-kcal`}
                                className="text-foreground text-xs font-semibold"
                              >
                                {Math.round(kcal)} cal/serving
                              </Text>
                            ) : null}
                            <Text className="text-muted-foreground text-xs">
                              {(recipe.ingredients?.length ?? 0)} ingredients
                            </Text>
                            <View style={{ marginLeft: "auto" }}>
                              <MacroBar macros={macros} testID={`my-stuff-recipe-${id}-macro`} />
                            </View>
                          </View>
                        </View>
                      </View>
                      <View style={{ marginTop: 10 }}>
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
                    </Card>
                  </Pressable>
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
                const itemCount = meal.items?.length ?? 0;
                const firstTag = meal.tags?.[0];
                const macros = {
                  protein: meal.totalNutrition?.protein ?? 0,
                  carbs: meal.totalNutrition?.carbs ?? 0,
                  fats: meal.totalNutrition?.fats ?? 0,
                };
                return (
                  <Pressable
                    key={id}
                    testID={`my-stuff-meal-open-${id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${meal.name}`}
                    onPress={() =>
                      router.push(
                        `/(tabs)/nutrition/meals/${encodeURIComponent(id)}` as never,
                      )
                    }
                  >
                    {/* The web's MealCard: an amber chef thumbnail, a tag
                        chip, cal + item count, a macro bar, then a black
                        "Log to today" — native drew only a name and a
                        "N items · N kcal" line with Open + a red Log. */}
                    <Card testID={`my-stuff-meal-${id}`}>
                      <View style={{ flexDirection: "row", gap: 12 }}>
                        <MealThumbnail
                          imageUrl={meal.imageUrl}
                          name={meal.name}
                          testID={`my-stuff-meal-${id}-thumbnail`}
                        />
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text
                            className="text-foreground text-base font-semibold"
                            numberOfLines={1}
                          >
                            {meal.name}
                          </Text>
                          {meal.description ? (
                            <Text
                              className="text-muted-foreground text-xs"
                              numberOfLines={1}
                            >
                              {meal.description}
                            </Text>
                          ) : null}
                          {firstTag ? (
                            <TagChip
                              label={titleCaseTag(firstTag)}
                              testID={`my-stuff-meal-${id}-tag`}
                            />
                          ) : null}
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 8,
                              marginTop: 2,
                            }}
                          >
                            {typeof kcal === "number" ? (
                              <Text
                                testID={`my-stuff-meal-${id}-kcal`}
                                className="text-foreground text-xs font-semibold"
                              >
                                {Math.round(kcal)} cal
                              </Text>
                            ) : null}
                            <Text className="text-muted-foreground text-xs">
                              {itemCount} {itemCount === 1 ? "item" : "items"}
                            </Text>
                            <View style={{ marginLeft: "auto" }}>
                              <MacroBar macros={macros} testID={`my-stuff-meal-${id}-macro`} />
                            </View>
                          </View>
                        </View>
                      </View>
                      <View style={{ marginTop: 10 }}>
                        <Button
                          testID={`my-stuff-meal-log-${id}`}
                          variant="primary"
                          onPress={() => {
                            setMealLogError(null);
                            setMealToLog(meal);
                          }}
                        >
                          Log to today
                        </Button>
                      </View>
                    </Card>
                  </Pressable>
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
                const protein = Math.round(food.nutrition?.protein ?? 0);
                const carbs = Math.round(food.nutrition?.carbs ?? 0);
                const fats = Math.round(food.nutrition?.fats ?? 0);
                const servingLabel =
                  food.displayLabel ||
                  (food.servingSize != null && food.servingUnit
                    ? `${food.servingSize} ${food.servingUnit}`
                    : "");
                const removing = removingFoodId === id;
                return (
                  // The web's SavedFoodCard row: a thumbnail, a verified
                  // tick, "{serving} · {cal} cal", a "P/C/F" grams line, a
                  // black "+" and an amber bookmark — native drew only a
                  // name and a "N kcal" line with text Log/Unsave buttons.
                  <Card key={id} testID={`my-stuff-food-${id}`}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <Pressable
                        testID={`my-stuff-food-open-${id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${food.name}`}
                        onPress={() =>
                          router.push(
                            `/(tabs)/nutrition/food/${encodeURIComponent(id)}` as never,
                          )
                        }
                        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
                      >
                        <View style={{ width: 48, height: 48, borderRadius: 10, overflow: "hidden" }}>
                          <FoodThumbnail
                            testID={`my-stuff-food-${id}-thumbnail`}
                            name={food.name}
                            category={food.category}
                            imageUrl={food.imageUrl}
                            height={48}
                            iconSize={20}
                          />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Text
                              className="text-foreground text-sm font-semibold"
                              numberOfLines={1}
                            >
                              {food.name}
                            </Text>
                            {food.isVerified ? (
                              <View testID={`my-stuff-food-${id}-verified`}>
                                <BadgeCheck size={14} color={colors.success} />
                              </View>
                            ) : null}
                          </View>
                          <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                            {servingLabel}
                            {typeof kcal === "number" ? `${servingLabel ? " · " : ""}${Math.round(kcal)} cal` : ""}
                          </Text>
                          <Text
                            testID={`my-stuff-food-${id}-macro`}
                            className="text-muted-foreground text-[10px] tabular-nums"
                          >
                            P {protein}g · C {carbs}g · F {fats}g
                          </Text>
                        </View>
                      </Pressable>

                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable
                          testID={`my-stuff-food-log-${id}`}
                          accessibilityRole="button"
                          accessibilityLabel="Log to today"
                          onPress={() => {
                            setFoodLogError(null);
                            setFoodToLog(food);
                          }}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: colors.primary,
                          }}
                        >
                          <Plus size={16} color={colors["primary-foreground"]} />
                        </Pressable>
                        <Pressable
                          testID={`my-stuff-food-remove-${id}`}
                          accessibilityRole="button"
                          accessibilityLabel="Remove from My Foods"
                          disabled={removing}
                          onPress={() => void handleRemoveFood(id)}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: 1,
                            borderColor: colors.border,
                            opacity: removing ? 0.6 : 1,
                          }}
                        >
                          {removing ? (
                            <ActivityIndicator size="small" color={colors.accent} />
                          ) : (
                            <Bookmark size={16} color={colors.accent} fill={colors.accent} />
                          )}
                        </Pressable>
                      </View>
                    </View>
                  </Card>
                );
              })}
            </View>
          )
        ) : null}

      </ScrollView>

      {/* Floating + — Meals & Recipes tabs, matching the web's floating
          create button (`app/dashboard/meals/page.tsx`'s
          `fixed bottom-28 right-4 … rounded-full`). Foods has no floating
          button on the web either — a food is added through the search
          modal, and "New custom food" sits under the search bar above.
          Native used to draw an inline "+ New meal"/"+ New recipe" row at
          the bottom of the list instead. */}
      {tab === "meals" ? (
        <Pressable
          testID="my-stuff-create-meal"
          accessibilityRole="button"
          accessibilityLabel={mayCreateMeals ? "Create new meal" : "Create new meal (Plus)"}
          onPress={handleCreateMeal}
          style={{
            position: "absolute",
            bottom: 24,
            right: 16,
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.primary,
          }}
        >
          <Plus size={24} color={colors["primary-foreground"]} />
        </Pressable>
      ) : null}
      {tab === "recipes" ? (
        <Pressable
          testID="my-stuff-create-recipe"
          accessibilityRole="button"
          accessibilityLabel={mayCreateFoods ? "Create new recipe" : "Create new recipe (Plus)"}
          onPress={handleCreateRecipe}
          style={{
            position: "absolute",
            bottom: 24,
            right: 16,
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.primary,
          }}
        >
          <Plus size={24} color={colors["primary-foreground"]} />
        </Pressable>
      ) : null}

      {/* Log a saved meal with a portion (NP-094 sheet, reused) */}
      <MealLogSheet
        visible={mealToLog !== null}
        meal={mealToLog}
        // ADDING TO starts at the MEAL's own default tag, falling back to
        // the time-of-day default — the web's My Stuff list
        // (`defaultTag={applyTargetMeal?.defaultTag || defaultTagNow()}`,
        // `app/dashboard/meals/page.tsx:596`). Native used to ignore the
        // meal's own tag entirely.
        currentTag={mealToLog?.defaultTag || currentDefaultTag}
        availableTags={{
          defaults: tagsData?.defaults ?? [],
          userTags: (tagsData?.userTags ?? []) as string[],
        }}
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

      {/* Native meal create (NP-143): the editor sheet posts POST /api/meals */}
      <MealEditorSheet
        visible={mealEditorOpen}
        availableTags={{
          defaults: tagsData?.defaults ?? [],
          userTags: (tagsData?.userTags ?? []) as string[],
        }}
        submitting={mealEditorSaving}
        error={mealEditorError}
        onClose={() => {
          setMealEditorOpen(false);
          setMealEditorError(null);
        }}
        onSubmit={handleMealEditorSubmit}
      />
    </SafeAreaView>
  );
}
