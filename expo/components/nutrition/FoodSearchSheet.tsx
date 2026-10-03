import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  apiFetch,
  FoodOverviewResponseSchema,
  FoodSearchResponseSchema,
  SavedFoodsResponseSchema,
  MealsListResponseSchema,
  type Food,
  type Meal,
  type FoodOverviewResponse,
} from "@become/api-client";
import {
  BadgeCheck,
  Bookmark,
  ChefHat,
  Clock,
  Flag,
  ScanBarcode,
  Star,
  X,
  AlertCircle,
} from "lucide-react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { BottomSheet } from "@/components/BottomSheet";
import { FlagFoodSheet } from "@/components/nutrition/FlagFoodSheet";
import { BarcodeScanner } from "@/components/nutrition/BarcodeScanner";
import {
  BARCODE_LOOKUP_FAILED_MESSAGE,
  lookupBarcode,
} from "@/lib/nutrition/barcodeLookup";
import { foodDetailHref, narrowFoodSource } from "@/lib/nutrition/foodSearch";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useDebouncedValue } from "@/lib/programs/useDebouncedValue";
import {
  isObjectIdString,
  importExternalIfNeeded,
} from "@/lib/nutrition/foodImport";
import {
  saveFoodBookmark,
  removeFoodBookmark,
} from "@/lib/nutrition/foodBookmarks";

export type FoodSearchTabId = "all" | "mine" | "meals" | "recent" | "frequent";

const TABS: { id: Exclude<FoodSearchTabId, "all">; label: string; Icon: typeof Bookmark; testID: string }[] = [
  { id: "mine", label: "Foods", Icon: Bookmark, testID: "food-filter-mine" },
  { id: "meals", label: "Meals", Icon: ChefHat, testID: "food-filter-meals" },
  { id: "recent", label: "Recent", Icon: Clock, testID: "food-filter-recent" },
  { id: "frequent", label: "Frequent", Icon: Star, testID: "food-filter-frequent" },
];

const SOURCE_LABEL: Record<string, string> = {
  custom: "Custom",
  usda: "USDA",
  off: "OFF",
};

export interface FoodSearchSheetProps {
  visible: boolean;
  onClose: () => void;
  currentTag?: string;
  onPickFood?: (food: Food) => void;
  onPickMeal?: (meal: Meal) => void;
  /**
   * Basket mode (NP-094): picking a food adds it to the basket instead of
   * opening the quantity picker. The screen owns the basket and the log call.
   */
  basketMode?: boolean;
  /** Rows collected so far, for the basket bar count. */
  basketCount?: number;
  onAddToBasket?: (food: Food) => void;
  /** Open the basket sheet over what is collected. */
  onOpenBasket?: () => void;
  debounceMs?: number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  /** Open on the barcode scanner instead of the name search (camera menu). */
  initialBarcodeOpen?: boolean;
  /** Injection point for the barcode lookup; the app leaves it unset. */
  lookupBarcodeImpl?: typeof lookupBarcode;
  testID?: string;
}

export function FoodSearchSheet({
  visible,
  onClose,
  currentTag,
  onPickFood,
  onPickMeal,
  basketMode = false,
  basketCount = 0,
  onAddToBasket,
  onOpenBasket,
  debounceMs = 300,
  setTimeoutImpl,
  clearTimeoutImpl,
  initialBarcodeOpen = false,
  lookupBarcodeImpl = lookupBarcode,
  testID = "food-search-sheet",
}: FoodSearchSheetProps) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const router = useRouter();

  const [query, setQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<FoodSearchTabId>("all");
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(false);

  const [overview, setOverview] = useState<FoodOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState<boolean>(false);

  const [results, setResults] = useState<Food[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const [mealResults, setMealResults] = useState<Meal[]>([]);
  const [mealsLoading, setMealsLoading] = useState<boolean>(false);

  const [savedFoodIds, setSavedFoodIds] = useState<Set<string>>(new Set());
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [importingRowId, setImportingRowId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // "Something look wrong?" (NP-174). The flag sheet needs the food's own
  // nutrition basis for its log-correction panel; the search row only shows
  // the flattened default variant, which is exactly that basis.
  const [flagFood, setFlagFood] = useState<Food | null>(null);

  // Barcode scan (NP-088): the web's `handleBarcodeDetected` — look the code
  // up on the server and open the quantity picker on a real food. A miss or
  // a preview shows the web's message with a Search by name button; logging
  // goes through the same pick path as a searched food (no `source` added).
  const [scannerOpen, setScannerOpen] = useState<boolean>(false);
  const [barcodeLoading, setBarcodeLoading] = useState<boolean>(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  // The camera menu opens the sheet straight onto the scanner.
  useEffect(() => {
    if (visible && initialBarcodeOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from open intent
      setScannerOpen(true);
    }
  }, [visible, initialBarcodeOpen]);

  const debouncedQuery = useDebouncedValue(
    query,
    debounceMs,
    setTimeoutImpl,
    clearTimeoutImpl,
  );

  const authBase = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  // Fetch overview (four short lists behind empty query)
  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const data = await apiFetch(
        "/api/nutrition/foods/overview",
        FoodOverviewResponseSchema,
        authBase,
      );
      setOverview(data);
      setMealResults(data.meals ?? []);
      const savedIds = new Set<string>();
      for (const f of data.foods ?? []) {
        if (f._id) savedIds.add(String(f._id));
      }
      setSavedFoodIds(savedIds);
    } catch {
      setOverview(null);
    } finally {
      setOverviewLoading(false);
    }
  }, [authBase]);

  // Fetch meals (by query or all user's meals)
  const fetchMeals = useCallback(
    async (searchQuery: string, all = false) => {
      const trimmed = searchQuery.trim();
      if (!all && trimmed.length < 2) {
        setMealResults([]);
        return;
      }
      setMealsLoading(true);
      try {
        const url = all
          ? "/api/meals?mine=true&limit=50"
          : `/api/meals?q=${encodeURIComponent(trimmed)}&limit=10`;
        const data = await apiFetch(url, MealsListResponseSchema, authBase);
        setMealResults(Array.isArray(data.meals) ? data.meals : []);
      } catch {
        setMealResults([]);
      } finally {
        setMealsLoading(false);
      }
    },
    [authBase],
  );

  // Fetch food results for specific tab or debounced search
  const fetchResults = useCallback(
    async (searchQuery: string, tab: FoodSearchTabId, verified: boolean) => {
      setLoading(true);
      try {
        let url: string;
        let filterClientSide = false;

        if (tab === "recent") {
          url = "/api/nutrition/foods/recent";
          filterClientSide = verified;
        } else if (tab === "frequent") {
          url = "/api/nutrition/foods/frequent";
          filterClientSide = verified;
        } else if (tab === "mine") {
          url = "/api/me/foods";
          filterClientSide = verified;
        } else {
          const trimmed = searchQuery.trim();
          url = `/api/nutrition/foods?q=${encodeURIComponent(trimmed)}${
            verified ? "&verifiedOnly=true" : ""
          }`;
        }

        const schema = tab === "all" ? FoodSearchResponseSchema : SavedFoodsResponseSchema;
        const data = await apiFetch(url, schema, authBase);
        const foods: Food[] = Array.isArray(data.foods) ? data.foods : [];
        const finalFoods = filterClientSide
          ? foods.filter((f) => f.isVerified === true)
          : foods;
        setResults(finalFoods);

        if (tab === "mine") {
          const ids = new Set<string>();
          for (const f of foods) {
            if (f._id) ids.add(String(f._id));
          }
          setSavedFoodIds(ids);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [authBase],
  );

  // Fetch from server when activeTab, debounced query, or verified filter changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!visible) return;

    if (activeTab === "meals") {
      fetchMeals(debouncedQuery, debouncedQuery.trim().length < 2);
      return;
    }

    if (
      activeTab === "recent" ||
      activeTab === "frequent" ||
      activeTab === "mine"
    ) {
      fetchResults("", activeTab, verifiedOnly);
      return;
    }

    // Default tab ('all') with empty or short query -> overview
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < 2) {
      fetchOverview();
      return;
    }

    // Default tab ('all') with query -> debounced search for foods and meals in parallel
    fetchResults(trimmed, "all", verifiedOnly);
    fetchMeals(trimmed, false);
  }, [
    visible,
    activeTab,
    debouncedQuery,
    verifiedOnly,
    fetchOverview,
    fetchResults,
    fetchMeals,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Bookmark toggle
  const handleToggleSave = async (food: Food) => {
    const rowId = String(food._id ?? food.id ?? "");
    if (!rowId || savingRowId === rowId) return;
    setSavingRowId(rowId);

    try {
      let foodId = rowId;
      let isExternal = !isObjectIdString(rowId);
      const currentlySaved = !isExternal && savedFoodIds.has(foodId);

      if (currentlySaved) {
        // Optimistic remove
        setSavedFoodIds((prev) => {
          const next = new Set(prev);
          next.delete(foodId);
          return next;
        });
        const ok = await removeFoodBookmark(foodId, () => token ?? undefined);
        if (!ok) {
          // Revert on failure
          setSavedFoodIds((prev) => new Set(prev).add(foodId));
          setErrorMessage("Could not remove food");
        } else if (activeTab === "mine") {
          setResults((prev) =>
            prev.filter((r) => String(r._id ?? r.id) !== rowId),
          );
        }
        return;
      }

      // Save: if external, import first
      if (isExternal) {
        const imported = await importExternalIfNeeded(
          food,
          () => token ?? undefined,
        );
        foodId = imported.foodId;
        isExternal = !isObjectIdString(foodId);
        if (isExternal) {
          setErrorMessage(
            imported.error
              ? `Could not save: ${imported.error}`
              : "Could not save",
          );
          return;
        }
      }

      // Optimistic add
      setSavedFoodIds((prev) => new Set(prev).add(foodId));
      const ok = await saveFoodBookmark(foodId, () => token ?? undefined);
      if (!ok) {
        // Revert on failure
        setSavedFoodIds((prev) => {
          const next = new Set(prev);
          next.delete(foodId);
          return next;
        });
        setErrorMessage("Could not save food");
      }
    } finally {
      setSavingRowId(null);
    }
  };

  // Picking a food: runs import step if external before handing off.
  // `useCallback` (not a bare async fn) because the barcode path below
  // awaits the same pick — a searched food and a scanned food log identically.
  // In basket mode the pick goes straight into the basket (the quantity is
  // the food's default serving; the day screen's item editor can adjust it
  // after the log lands).
  const handlePickFood = useCallback(
    async (food: Food) => {
      if (food.persistable === false) {
        setErrorMessage(
          "This food preview cannot be logged. Try searching for this food by name.",
        );
        return;
      }

      const id = String(food._id ?? food.id ?? "");
      let targetFood: Food = food;

      if (!isObjectIdString(id)) {
        setImportingRowId(id);
        try {
          const result = await importExternalIfNeeded(
            food,
            () => token ?? undefined,
          );
          if (result.error || !result.foodId || !isObjectIdString(result.foodId)) {
            setErrorMessage(
              result.error ? `Import failed: ${result.error}` : "Import failed",
            );
            return;
          }
          if (result.food) {
            targetFood = result.food;
          } else {
            targetFood = { ...food, _id: result.foodId };
          }
        } finally {
          setImportingRowId(null);
        }
      }

      if (basketMode && onAddToBasket) {
        onAddToBasket(targetFood);
        return;
      }

      onClose();
      if (onPickFood) {
        onPickFood(targetFood);
      } else {
        router.push(foodDetailHref(targetFood._id, targetFood));
      }
    },
    [basketMode, onAddToBasket, onClose, onPickFood, router, token],
  );

  // Barcode scan (NP-088): the web's `handleBarcodeDetected` — look the code
  // up on the server and open the quantity picker on a real food. A miss or
  // a preview shows the web's message with a Search by name button; logging
  // goes through the same pick path as a searched food (no `source` added).
  const handleBarcodeDetected = useCallback(
    async (code: string) => {
      setScannerOpen(false);
      setBarcodeLoading(true);
      setBarcodeError(null);
      try {
        const result = await lookupBarcodeImpl(code, () => token ?? undefined);
        if (result.status === "found") {
          await handlePickFood(result.food);
          return;
        }
        setBarcodeError(result.message);
      } catch {
        setBarcodeError(BARCODE_LOOKUP_FAILED_MESSAGE);
      } finally {
        setBarcodeLoading(false);
      }
    },
    [handlePickFood, lookupBarcodeImpl, token],
  );

  // Picking a meal — the web's `MealApplySheet` log path
  // (`POST /api/meals/{id}/log` with `portion`, `tags`, `loggedAt`,
  // `untimed`). The portion/tag/time choice lives in the screen's
  // MealLogSheet; the sheet only hands the meal over. Without a handler the
  // sheet logs one portion under the current tag itself, so the standalone
  // search route keeps working.
  const handlePickMeal = async (meal: Meal) => {
    if (onPickMeal) {
      onClose();
      onPickMeal(meal);
      return;
    }
    try {
      await apiFetch(
        `/api/meals/${encodeURIComponent(meal._id)}/log`,
        FoodOverviewResponseSchema.partial(),
        {
          method: "POST",
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          body: {
            portion: 1,
            tags: [(currentTag ?? "snack").toLowerCase()],
            untimed: false,
          },
        },
      );
      onClose();
    } catch {
      setErrorMessage("Failed to log meal");
    }
  };

  const isOverview = activeTab === "all" && query.trim().length < 2;

  const renderFoodRow = (food: Food) => {
    const id = String(food._id ?? food.id ?? "");
    const isSaved = savedFoodIds.has(id) || food.isSaved === true;
    const source = narrowFoodSource(food.source);
    const calories = food.nutrition?.calories;
    const isImporting = importingRowId === id;

    return (
      <Pressable
        key={id}
        testID={`food-search-result-${id}`}
        onPress={() => handlePickFood(food)}
        accessibilityRole="button"
        accessibilityLabel={`Pick ${food.name}`}
        disabled={isImporting}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          opacity: isImporting ? 0.6 : 1,
        }}
      >
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text className="text-foreground font-semibold">{food.name}</Text>
            {food.isVerified ? (
              <BadgeCheck size={14} color={colors.success} />
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            {food.brand ? (
              <Text className="text-muted-foreground text-xs">{food.brand}</Text>
            ) : null}
            {calories != null ? (
              <Text className="text-muted-foreground text-xs">
                {Math.round(calories)} kcal
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            testID={`food-search-result-${id}-source`}
            style={{
              borderRadius: 12,
              paddingHorizontal: 8,
              paddingVertical: 2,
              backgroundColor:
                source === "custom"
                  ? colors.primary
                  : source === "usda"
                    ? colors.muted
                    : colors.accent,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "600",
                color:
                  source === "custom"
                    ? colors["primary-foreground"]
                    : source === "usda"
                      ? colors.foreground
                      : colors["accent-foreground"],
              }}
            >
              {SOURCE_LABEL[source] ?? "Custom"}
            </Text>
          </View>

          {isObjectIdString(id) ? (
            <Pressable
              testID={`food-flag-${id}`}
              accessibilityRole="button"
              accessibilityLabel={`Report ${food.name}`}
              accessibilityHint="Something look wrong? Report this food without changing your entry"
              onPress={(e) => {
                e?.stopPropagation?.();
                setFlagFood(food);
              }}
              hitSlop={8}
              style={{ padding: 4 }}
            >
              <Flag size={18} color={colors["muted-foreground"]} />
            </Pressable>
          ) : null}
          <Pressable
            testID={`food-bookmark-${id}`}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? "Remove bookmark" : "Bookmark food"}
            onPress={(e) => {
              e?.stopPropagation?.();
              void handleToggleSave(food);
            }}
            hitSlop={8}
            style={{ padding: 4 }}
          >
            <Bookmark
              size={18}
              color={isSaved ? colors.primary : colors["muted-foreground"]}
              fill={isSaved ? colors.primary : "transparent"}
            />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  const renderMealRow = (meal: Meal) => {
    const id = String(meal._id);
    const calories = meal.totalNutrition?.calories;
    const itemCount = meal.items?.length ?? 0;

    return (
      <Pressable
        key={id}
        testID={`meal-result-${id}`}
        onPress={() => handlePickMeal(meal)}
        accessibilityRole="button"
        accessibilityLabel={`Pick meal ${meal.name}`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text className="text-foreground font-semibold">{meal.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            <Text className="text-muted-foreground text-xs">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </Text>
            {calories != null ? (
              <Text className="text-muted-foreground text-xs">
                · {Math.round(calories)} kcal
              </Text>
            ) : null}
          </View>
        </View>
        <ChefHat size={18} color={colors.primary} />
      </Pressable>
    );
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Find a food"
      testID={testID}
      sheetStyle={{ height: "85%", maxHeight: "90%", paddingHorizontal: 0 }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {/* Search Input + barcode button */}
        <View
          style={{
            paddingHorizontal: 16,
            marginBottom: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <View style={{ flex: 1 }}>
            <Input
              testID="food-search-input"
              placeholder="Apple, chicken breast…"
              autoCapitalize="none"
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                if (errorMessage) setErrorMessage(null);
              }}
            />
          </View>
          <Pressable
            testID="food-search-barcode-button"
            accessibilityRole="button"
            accessibilityLabel="Scan barcode"
            onPress={() => {
              setBarcodeError(null);
              setScannerOpen(true);
            }}
            hitSlop={8}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ScanBarcode size={18} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Barcode loading / miss feedback — the web's message + Search by name */}
        {barcodeLoading ? (
          <View
            testID="food-search-barcode-loading"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginHorizontal: 16,
              marginBottom: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: colors.muted,
            }}
          >
            <ActivityIndicator color={colors.primary} size="small" />
            <Text className="text-muted-foreground text-xs">
              Looking up barcode…
            </Text>
          </View>
        ) : null}
        {barcodeError && !barcodeLoading ? (
          <View
            testID="food-search-barcode-error"
            style={{
              marginHorizontal: 16,
              marginBottom: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.destructive,
              backgroundColor: colors.card,
              gap: 8,
            }}
          >
            <Text className="text-destructive text-xs">{barcodeError}</Text>
            <Pressable
              testID="food-search-barcode-search-name"
              accessibilityRole="button"
              accessibilityLabel="Search by name"
              onPress={() => setBarcodeError(null)}
              hitSlop={8}
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: colors.muted,
              }}
            >
              <Text className="text-foreground text-xs font-semibold">
                Search by name
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Filter Chips Bar (Horizontal scroll, no All chip) */}
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ alignItems: "center", gap: 8 }}
          >
            {/* Verified-only toggle (active when query is typed) */}
            {query.trim().length > 0 ? (
              <>
                <Pressable
                  testID="food-search-verified-toggle"
                  accessibilityRole="button"
                  accessibilityState={{ selected: verifiedOnly }}
                  onPress={() => setVerifiedOnly((v) => !v)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: verifiedOnly
                      ? colors.success
                      : colors.muted,
                  }}
                >
                  <BadgeCheck
                    size={14}
                    color={verifiedOnly ? colors["primary-foreground"] : colors["muted-foreground"]}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "500",
                      color: verifiedOnly
                        ? colors["primary-foreground"]
                        : colors["muted-foreground"],
                    }}
                  >
                    Verified
                  </Text>
                </Pressable>
                <View
                  style={{
                    width: 1,
                    height: 18,
                    backgroundColor: colors.border,
                    marginHorizontal: 2,
                  }}
                />
              </>
            ) : null}

            {/* The 4 filter chips */}
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              const Icon = tab.Icon;
              return (
                <Pressable
                  key={tab.id}
                  testID={tab.testID}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() =>
                    setActiveTab((prev) => (prev === tab.id ? "all" : tab.id))
                  }
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: active
                      ? colors.foreground
                      : colors.muted,
                  }}
                >
                  <Icon
                    size={14}
                    color={active ? colors.background : colors["muted-foreground"]}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "500",
                      color: active ? colors.background : colors["muted-foreground"],
                    }}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Error message banner */}
        {errorMessage ? (
          <View
            testID="food-search-error"
            className="mx-4 mb-2.5 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 flex-row items-center justify-between"
          >
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <AlertCircle size={16} color={colors.destructive} />
              <Text className="text-destructive text-xs flex-1">{errorMessage}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss error"
              onPress={() => setErrorMessage(null)}
              hitSlop={8}
            >
              <X size={14} color={colors.destructive} />
            </Pressable>
          </View>
        ) : null}

        {/* Content list */}
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {loading || overviewLoading || mealsLoading ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}

          {/* OVERVIEW MODE (Empty query + all tab) */}
          {isOverview ? (
            <View testID="food-search-overview">
              {overview?.foods && overview.foods.length > 0 ? (
                <View>
                  <View
                    style={{
                      backgroundColor: colors.muted,
                      paddingHorizontal: 16,
                      paddingVertical: 6,
                    }}
                  >
                    <Text
                      testID="overview-header-your-foods"
                      className="text-xs font-bold uppercase text-muted-foreground"
                    >
                      Your foods
                    </Text>
                  </View>
                  {overview.foods.map(renderFoodRow)}
                </View>
              ) : null}

              {overview?.recent && overview.recent.length > 0 ? (
                <View>
                  <View
                    style={{
                      backgroundColor: colors.muted,
                      paddingHorizontal: 16,
                      paddingVertical: 6,
                    }}
                  >
                    <Text
                      testID="overview-header-recent"
                      className="text-xs font-bold uppercase text-muted-foreground"
                    >
                      Recent
                    </Text>
                  </View>
                  {overview.recent.map(renderFoodRow)}
                </View>
              ) : null}

              {overview?.frequent && overview.frequent.length > 0 ? (
                <View>
                  <View
                    style={{
                      backgroundColor: colors.muted,
                      paddingHorizontal: 16,
                      paddingVertical: 6,
                    }}
                  >
                    <Text
                      testID="overview-header-frequent"
                      className="text-xs font-bold uppercase text-muted-foreground"
                    >
                      Frequent
                    </Text>
                  </View>
                  {overview.frequent.map(renderFoodRow)}
                </View>
              ) : null}

              {mealResults && mealResults.length > 0 ? (
                <View>
                  <View
                    style={{
                      backgroundColor: colors.muted,
                      paddingHorizontal: 16,
                      paddingVertical: 6,
                    }}
                  >
                    <Text
                      testID="overview-header-meals"
                      className="text-xs font-bold uppercase text-muted-foreground"
                    >
                      Meals
                    </Text>
                  </View>
                  {mealResults.map(renderMealRow)}
                </View>
              ) : null}

              {!overviewLoading &&
              (!overview?.foods?.length) &&
              (!overview?.recent?.length) &&
              (!overview?.frequent?.length) &&
              (!mealResults.length) ? (
                <Text
                  testID="food-search-empty"
                  className="text-muted-foreground text-center py-10"
                >
                  Type at least 2 characters to search
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* SEARCH MODE (Query >= 2 on All tab) */}
          {activeTab === "all" && !isOverview ? (
            <View testID="food-search-results">
              {mealResults.length > 0 ? (
                <View>
                  <View
                    style={{
                      backgroundColor: colors.muted,
                      paddingHorizontal: 16,
                      paddingVertical: 6,
                    }}
                  >
                    <Text
                      testID="search-header-meals"
                      className="text-xs font-bold uppercase text-muted-foreground"
                    >
                      Meals
                    </Text>
                  </View>
                  {mealResults.map(renderMealRow)}
                </View>
              ) : null}

              {results.length > 0 ? (
                <View>
                  {results.some((f) => savedFoodIds.has(String(f._id ?? f.id)) || f.isSaved) ? (
                    <>
                      <View
                        style={{
                          backgroundColor: colors.muted,
                          paddingHorizontal: 16,
                          paddingVertical: 6,
                        }}
                      >
                        <Text
                          testID="search-header-foods"
                          className="text-xs font-bold uppercase text-muted-foreground"
                        >
                          Foods
                        </Text>
                      </View>
                      {results
                        .filter((f) => savedFoodIds.has(String(f._id ?? f.id)) || f.isSaved)
                        .map(renderFoodRow)}
                      <View
                        style={{
                          backgroundColor: colors.muted,
                          paddingHorizontal: 16,
                          paddingVertical: 6,
                        }}
                      >
                        <Text
                          testID="search-header-other"
                          className="text-xs font-bold uppercase text-muted-foreground"
                        >
                          Other Results
                        </Text>
                      </View>
                      {results
                        .filter((f) => !savedFoodIds.has(String(f._id ?? f.id)) && !f.isSaved)
                        .map(renderFoodRow)}
                    </>
                  ) : (
                    results.map(renderFoodRow)
                  )}
                </View>
              ) : null}

              {!loading && !mealsLoading && results.length === 0 && mealResults.length === 0 ? (
                <Text
                  testID="food-search-empty"
                  className="text-muted-foreground text-center py-10"
                >
                  No foods found
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* MEALS TAB */}
          {activeTab === "meals" ? (
            <View testID="food-search-meals-tab">
              {mealResults.length > 0 ? (
                mealResults.map(renderMealRow)
              ) : !mealsLoading ? (
                <Text
                  testID="food-search-empty"
                  className="text-muted-foreground text-center py-10"
                >
                  No meals found
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* FOODS (MINE) TAB */}
          {activeTab === "mine" ? (
            <View testID="food-search-mine-tab">
              {results.length > 0 ? (
                results.map(renderFoodRow)
              ) : !loading ? (
                <Text
                  testID="food-search-empty"
                  className="text-muted-foreground text-center py-10"
                >
                  No saved foods yet.
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* RECENT TAB */}
          {activeTab === "recent" ? (
            <View testID="food-search-recent-tab">
              {results.length > 0 ? (
                results.map(renderFoodRow)
              ) : !loading ? (
                <Text
                  testID="food-search-empty"
                  className="text-muted-foreground text-center py-10"
                >
                  No recent foods
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* FREQUENT TAB */}
          {activeTab === "frequent" ? (
            <View testID="food-search-frequent-tab">
              {results.length > 0 ? (
                results.map(renderFoodRow)
              ) : !loading ? (
                <Text
                  testID="food-search-empty"
                  className="text-muted-foreground text-center py-10"
                >
                  No frequent foods
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Flag sheet (NP-174): report the catalogue row, never edits it. */}
      {flagFood ? (
        <FlagFoodSheet
          visible={flagFood !== null}
          foodId={String(flagFood._id ?? flagFood.id ?? "")}
          foodName={flagFood.name}
          token={token}
          currentNutrition={
            flagFood.nutrition
              ? {
                  calories: flagFood.nutrition.calories ?? 0,
                  protein: flagFood.nutrition.protein ?? 0,
                  carbs: flagFood.nutrition.carbs ?? 0,
                  fats: flagFood.nutrition.fats ?? 0,
                  fiber: flagFood.nutrition.fiber ?? 0,
                }
              : undefined
          }
          onClose={() => setFlagFood(null)}
        />
      ) : null}

      {/* Barcode scanner (NP-088): full-screen camera view over the sheet. */}
      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => void handleBarcodeDetected(code)}
        testID="food-search-barcode-scanner"
      />

      {/* Basket bar (NP-094): the collected rows stay visible while the next
          item is picked — the whole point of the basket. */}
      {basketMode && basketCount > 0 ? (
        <View
          testID="food-search-basket-bar"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginHorizontal: 16,
            marginBottom: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: colors.primary,
          }}
        >
          <Text
            testID="food-search-basket-count"
            className="text-primary-foreground text-xs font-semibold flex-1"
          >
            {basketCount} item{basketCount === 1 ? "" : "s"} in basket
          </Text>
          <Text
            testID="food-search-basket-open"
            accessibilityRole="button"
            accessibilityLabel="Review basket"
            onPress={onOpenBasket}
            className="text-primary-foreground text-xs font-bold"
          >
            Review
          </Text>
        </View>
      ) : null}
    </BottomSheet>
  );
}
