import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { ArrowLeft, BadgeCheck, Bookmark, Check, Pencil, Trash2 } from "lucide-react-native";
import { z } from "zod";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  apiFetch,
  FoodDetailResponseSchema,
  MealLogsDayResponseSchema,
  SavedFoodsResponseSchema,
  TagsResponseSchema,
} from "@become/api-client";
import type { Food, FoodVariant } from "@become/api-client";
import { FoodLogSheet, type FoodLogSheetSubmitOptions } from "@/components/nutrition/FoodLogSheet";
import { FoodThumbnail } from "@/components/nutrition/FoodThumbnail";
import { BridgeFieldGroup, type BridgeValues } from "@/components/nutrition/BridgeFieldGroup";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { defaultVariantOf } from "@/lib/nutrition/foodMath";
import {
  scalePerServingNutrition,
  type IFoodNutrition,
} from "@become/core";
import {
  importExternalFood,
  parseExternalFoodId,
  parseFoodRowParam,
} from "@/lib/nutrition/foodImport";
import {
  removeFoodBookmark,
  saveFoodBookmark,
} from "@/lib/nutrition/foodBookmarks";
import {
  isFoodAdminRole,
  isFoodOwner,
} from "@/lib/nutrition/foodOwnership";
import { invalidateEntitlements } from "@/lib/entitlements/store";
import { useApiErrorHandler } from "@/lib/errors";
import { useLocalDay } from "@/lib/time/localDay";
import { withTz } from "@/lib/nutrition/localDay";
import { logFoodItem } from "@/lib/nutrition/mealLogActions";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/** Whatever the PATCH/DELETE routes answer — success-shaped, never read. */
const FoodWriteResponseSchema = z.object({}).passthrough();

/**
 * THE FOOD PAGE, ON THE PHONE (NP-145).
 *
 * Native counterpart of `webapp/app/dashboard/foods/[id]/page.tsx`:
 *
 *   • the hero — name, brand, verified badge, category, and the serving the
 *     per-serving macros are per (`displayLabel`, else
 *     `servingSize servingUnit`), scaled through
 *     `scalePerServingNutrition` exactly like the web's headline;
 *   • the variants list (only when there is more than one), each with its own
 *     per-serving calories;
 *   • the bookmark toggle (`POST /api/me/foods`, `DELETE
 *     /api/me/foods/{id}`), seeded from `GET /api/me/foods`;
 *   • the sticky `Log this food` button, which opens `FoodLogSheet`
 *     (`@/components/nutrition/FoodLogSheet`, NP-325) — the native port of
 *     the web's own `FoodLogSheet` sheet;
 *   • the owner/admin half: bridge edits (`PATCH
 *     /api/nutrition/foods/{id}` with `variants`), an edit sheet for the
 *     allowlisted fields (`name`, `brand`, `category`, `variants`), and
 *     delete — shown ONLY when `isFoodOwner` (or an admin) says so.
 *
 * OWNERSHIP IS `authoredBy`, OR `createdBy` ON A `source: 'manual'` ROW —
 * never `createdBy` alone (`@/lib/nutrition/foodOwnership`, the native port
 * of the web predicate the PATCH and DELETE routes both call). A client that
 * hid its controls behind `createdBy === me` offered Edit and Delete on
 * catalogue rows the server answers 403 on.
 *
 * Deleting frees a `custom-foods` inventory slot, so the handler marks the
 * entitlements snapshot stale (`invalidateEntitlements`) — the delete-side
 * counterpart to a forced refresh, which lets a screen with no gate call it
 * without issuing entitlement requests.
 */

function servingLabelFor(variant: {
  displayLabel?: string | null;
  servingSize?: number | null;
  servingUnit?: string | null;
}): string {
  if (variant.displayLabel && variant.displayLabel.trim().length > 0) {
    return variant.displayLabel;
  }
  const size = variant.servingSize ?? "";
  const unit = variant.servingUnit ?? "";
  return `${size} ${unit}`.trim() || "1 serving";
}

function round1(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Mirrors the web's `getDefaultTagForNow` (`webapp/app/dashboard/foods/[id]/page.tsx`). */
function getDefaultTagForNow(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 14) return "lunch";
  if (h >= 17 && h < 21) return "dinner";
  return "snack";
}

export default function FoodDetailRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { day: today, tzOffset } = useLocalDay();
  const params = useLocalSearchParams<{
    id?: string;
    row?: string;
    tag?: string;
    date?: string;
  }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { token, user } = useAuth();
  const handleApiError = useApiErrorHandler();

  // A `usda-*` / `off-*` id is synthetic — no Food document exists for it, so
  // GET /api/nutrition/foods/[id] answers 404 (it looks up by ObjectId or
  // slug). Those hits are resolved through the ungated import instead, which
  // is what the web does before logging one.
  const external = useMemo(() => parseExternalFoodId(id), [id]);
  const fallbackRow = useMemo(
    () => parseFoodRowParam(params.row),
    [params.row],
  );

  const {
    data,
    loading: foodLoading,
    refetch: refetchFood,
  } = useFetch(
    id && !external ? `/api/nutrition/foods/${encodeURIComponent(id)}` : null,
    FoodDetailResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    },
  );

  const [importedFood, setImportedFood] = useState<Food | null>(null);
  const [importFailed, setImportFailed] = useState<boolean>(false);

  useEffect(() => {
    if (!external || !token) return;
    let cancelled = false;
    importExternalFood({
      ref: external,
      fallback: fallbackRow,
      getToken: () => token,
    })
      .then((resFood) => {
        if (!cancelled) setImportedFood(resFood);
      })
      .catch(() => {
        if (!cancelled) setImportFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [external, fallbackRow, token]);

  const food = importedFood ?? data?.food ?? null;

  // Bookmark state, seeded from the member's saved foods like the web's
  // `fetchMeAndSavedStatus`.
  const [isSaved, setIsSaved] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id || external) return;
    let cancelled = false;
    void (async () => {
      try {
        const saved = await apiFetch("/api/me/foods", SavedFoodsResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token,
        });
        if (cancelled) return;
        const list = Array.isArray(saved.foods) ? saved.foods : [];
        setIsSaved(
          list.some((f) => String(f._id ?? f.id ?? "") === String(id)),
        );
      } catch {
        // non-fatal: the toggle still works, it just starts unsaved.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, id, external]);

  // Fetch today's meal logs for smart-append
  const activeDate = params.date ?? today;
  const mealLogsPath = withTz(`/api/meal-logs?date=${activeDate}`, tzOffset);
  const { data: logsData } = useFetch(
    mealLogsPath,
    MealLogsDayResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );
  const existingLogs = useMemo(() => logsData?.logs ?? [], [logsData?.logs]);

  // Every tag the member can file a log under (the web's `availableTags`) —
  // the log sheet's `ADDING TO` picker offers these, not just the four
  // meal-time defaults the old inline form was stuck with.
  const { data: tagsData } = useFetch("/api/tags", TagsResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
  });
  const availableTags = useMemo(
    () => ({
      defaults: tagsData?.defaults ?? [],
      userTags: tagsData?.userTags ?? [],
    }),
    [tagsData],
  );

  const defaultVariant = useMemo(() => defaultVariantOf(food), [food]);
  const variants: FoodVariant[] = useMemo(() => {
    if (food && Array.isArray(food.variants) && food.variants.length > 0) {
      return food.variants;
    }
    return [];
  }, [food]);

  // THE SAME PREDICATE THE SERVER USES — the native port of
  // `webapp/lib/nutrition/foodOwnership.ts`, which PATCH and DELETE on
  // /api/nutrition/foods/[id] both call. `createdBy === me` was the old rule
  // and it is provenance, not ownership: the food search route's background
  // import stamps it with whoever's search pulled a USDA/OpenFoodFacts row
  // in, so merely searching for "chicken breast" put Edit and Delete on
  // screen for every catalogue row it materialised — both of which the route
  // now 403s. Ownership is `authoredBy`, OR `createdBy` on a
  // `source: 'manual'` row.
  //
  // Admin stays a SEPARATE disjunct here exactly as it is on the route: a
  // role question does not belong inside an ownership predicate.
  const currentUserId = user?._id ? String(user._id) : null;
  const isOwner = isFoodOwner(food, currentUserId);
  const canMutate =
    isFoodAdminRole(user?.role) || isOwner;

  // The web's sticky black `Log this food` button opens a sheet (NP-269,
  // NP-325) — `ADDING TO <tag>`, AMOUNT chips, a coloured macro tile,
  // `Log to day` — rather than rendering the amount/tag/time/date form
  // inline on the page. Defaults to the food's own default variant
  // (`defaultVariantOf`, never index 0) and a time-of-day tag, same as the
  // web. There is no `Save as meal` here — the web food page has none.
  const [logSheetOpen, setLogSheetOpen] = useState(false);
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  // Bridge editing (owners and admins only): the two canonical numbers per
  // variant, edited through the web's own fields (`BridgeFieldGroup` —
  // "Weight per serving (optional)" / "Volume per serving (optional)",
  // freeform units, commit on blur) and saved with the whole `variants`
  // array — the allowlisted field the route accepts.
  const [savingBridge, setSavingBridge] = useState<number | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  const handleBridgeSave = useCallback(
    async (variantIndex: number, next: BridgeValues) => {
      if (!food || savingBridge !== null) return;
      const target = variants[variantIndex];
      if (!target) return;
      const grams = next.gramsPerServing;
      const ml = next.mlPerServing;
      const noChange =
        (target.gramsPerServing ?? null) === (grams ?? null) &&
        (target.mlPerServing ?? null) === (ml ?? null);
      if (noChange) return;
      const updated: FoodVariant[] = variants.map((v, i) =>
        i === variantIndex
          ? {
              ...v,
              ...(grams != null
                ? { gramsPerServing: grams }
                : { gramsPerServing: undefined }),
              ...(ml != null
                ? { mlPerServing: ml }
                : { mlPerServing: undefined }),
            }
          : v,
      );
      setSavingBridge(variantIndex);
      setBridgeError(null);
      try {
        await apiFetch(
          `/api/nutrition/foods/${encodeURIComponent(String(food._id ?? food.id ?? id))}`,
          FoodWriteResponseSchema,
          {
            method: "PATCH",
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
            body: { variants: updated },
          },
        );
        await refetchFood();
      } catch (err) {
        const { handled, message } = handleApiError(err);
        if (!handled) setBridgeError(message);
      } finally {
        setSavingBridge(null);
      }
    },
    [
      food,
      variants,
      savingBridge,
      token,
      id,
      refetchFood,
      handleApiError,
    ],
  );

  // Edit sheet (owners and admins only): the member-allowlisted fields —
  // `name`, `brand`, `category`, `variants` — never `authoredBy` (the
  // allowance ledger), `barcode`, or the verification fields.
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const openEdit = useCallback(() => {
    if (!food) return;
    setEditName(food.name ?? "");
    setEditBrand(food.brand ?? "");
    setEditCategory(food.category ?? "");
    setEditError(null);
    setEditOpen(true);
  }, [food]);

  const handleEditSave = useCallback(async () => {
    if (!food || savingEdit) return;
    const name = editName.trim();
    if (!name) {
      setEditError("Name is required.");
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      await apiFetch(
        `/api/nutrition/foods/${encodeURIComponent(String(food._id ?? food.id ?? id))}`,
        FoodWriteResponseSchema,
        {
          method: "PATCH",
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          body: {
            name,
            brand: editBrand.trim(),
            category: editCategory.trim() || undefined,
          },
        },
      );
      setEditOpen(false);
      await refetchFood();
    } catch (err) {
      const { handled, message } = handleApiError(err);
      if (!handled) setEditError(message);
    } finally {
      setSavingEdit(false);
    }
  }, [
    food,
    savingEdit,
    editName,
    editBrand,
    editCategory,
    token,
    id,
    refetchFood,
    handleApiError,
  ]);

  // Delete (owners and admins only), with the confirm step the web has.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    if (!food || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch(
        `/api/nutrition/foods/${encodeURIComponent(String(food._id ?? food.id ?? id))}`,
        FoodWriteResponseSchema,
        {
          method: "DELETE",
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        },
      );
      // This is the route that actually frees a `custom-foods` inventory slot
      // (the bookmark delete only unbookmarks, and correctly frees nothing).
      // Mark the entitlements snapshot stale so the next gated surface
      // re-reads instead of showing the lock this delete just cleared for up
      // to the 60s TTL. Invalidate rather than refresh: this page renders no
      // gate and must not start fetching entitlements.
      invalidateEntitlements();
      setConfirmDelete(false);
      router.back();
    } catch (err) {
      const { handled, message } = handleApiError(err);
      if (!handled) setDeleteError(message);
      setDeleting(false);
    }
  }, [food, deleting, token, id, router, handleApiError]);

  const handleBookmarkToggle = useCallback(async () => {
    if (!food || bookmarking) return;
    const foodId = String(food._id ?? food.id ?? "");
    if (!foodId || external) return;
    setBookmarking(true);
    setBookmarkError(null);
    try {
      if (isSaved) {
        const ok = await removeFoodBookmark(foodId, () => token ?? undefined);
        if (ok) {
          setIsSaved(false);
        } else {
          setBookmarkError("Could not remove bookmark.");
        }
      } else {
        const ok = await saveFoodBookmark(foodId, () => token ?? undefined);
        if (ok) {
          setIsSaved(true);
        } else {
          setBookmarkError("Could not save bookmark.");
        }
      }
    } finally {
      setBookmarking(false);
    }
  }, [food, bookmarking, isSaved, external, token]);

  // Submit via the `Log this food` sheet (NP-325) — the single
  // `POST /api/meal-logs` call the sheet itself never makes.
  const handleFoodLogSubmit = useCallback(
    async (result: FoodLogSheetSubmitOptions) => {
      if (!food || logSubmitting) return;
      setLogSubmitting(true);
      setLogError(null);
      try {
        await logFoodItem({
          item: result.item,
          tag: result.tag,
          date: result.date,
          timeMode: result.timeMode,
          pickedTime: result.pickedTime,
          existingLogs,
          apiFetch,
          token,
          baseUrl: WEBAPP_BASE_URL,
        });
        setLogSheetOpen(false);
        router.back();
      } catch (err) {
        const { handled, message } = handleApiError(err);
        if (!handled) setLogError(message);
      } finally {
        setLogSubmitting(false);
      }
    },
    [food, logSubmitting, existingLogs, token, router, handleApiError],
  );

  if (!id) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View style={{ padding: 16 }}>
          <Text className="text-destructive">Missing food id</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Per-serving headline nutrition, scaled exactly like the web's
  // `scalePerServingNutrition(defaultVariant)`.
  const headline: IFoodNutrition | null = defaultVariant
    ? scalePerServingNutrition({
        servingUnit: defaultVariant.servingUnit,
        servingSize: defaultVariant.servingSize,
        gramsPerServing: defaultVariant.gramsPerServing,
        mlPerServing: defaultVariant.mlPerServing,
        nutrition: {
          calories: defaultVariant.nutrition.calories ?? 0,
          protein: defaultVariant.nutrition.protein ?? 0,
          carbs: defaultVariant.nutrition.carbs ?? 0,
          fats: defaultVariant.nutrition.fats ?? 0,
          fiber: defaultVariant.nutrition.fiber,
          sugar: defaultVariant.nutrition.sugar,
          sodium: defaultVariant.nutrition.sodium,
          saturatedFat: defaultVariant.nutrition.saturatedFat,
        },
      })
    : null;

  const loading = foodLoading && !food && !importFailed;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="nutrition-food-route"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        testID="nutrition-food-route-kav"
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 20 }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Pressable
              testID="nutrition-food-back"
              accessibilityRole="button"
              accessibilityLabel="Back to Favorites"
              onPress={() => router.back()}
              hitSlop={8}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, padding: 4 }}
            >
              <ArrowLeft size={16} color={colors["muted-foreground"]} />
              {/* Web's back link reads `← Favorites` — native showed a bare
                  `Back` with no arrow and no label (NP-325). */}
              <Text className="text-muted-foreground text-sm font-medium">
                Favorites
              </Text>
            </Pressable>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              {!external ? (
                <Pressable
                  testID="nutrition-food-bookmark"
                  accessibilityRole="button"
                  accessibilityLabel={isSaved ? "Remove bookmark" : "Bookmark food"}
                  accessibilityState={{ selected: isSaved }}
                  disabled={bookmarking}
                  onPress={() => void handleBookmarkToggle()}
                  hitSlop={8}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    padding: 6,
                    opacity: bookmarking ? 0.5 : 1,
                  }}
                >
                  <Bookmark
                    size={16}
                    color={isSaved ? colors.primary : colors["muted-foreground"]}
                    fill={isSaved ? colors.primary : "transparent"}
                  />
                  {/* Web's header reads "Save" / "Saved" next to the icon — the
                      icon-only button it replaces gave a sighted member no
                      word for what tapping it does until they'd already
                      tapped it once. */}
                  <Text
                    testID="nutrition-food-bookmark-label"
                    className="text-xs font-medium"
                    style={{ color: isSaved ? colors.primary : colors["muted-foreground"] }}
                  >
                    {isSaved ? "Saved" : "Save"}
                  </Text>
                </Pressable>
              ) : null}
              {canMutate && food ? (
                <>
                  <Pressable
                    testID="nutrition-food-edit"
                    accessibilityRole="button"
                    accessibilityLabel="Edit food"
                    onPress={openEdit}
                    hitSlop={8}
                    style={{ padding: 6 }}
                  >
                    <Pencil size={18} color={colors["muted-foreground"]} />
                  </Pressable>
                  <Pressable
                    testID="nutrition-food-delete"
                    accessibilityRole="button"
                    accessibilityLabel="Delete food"
                    onPress={() => {
                      setDeleteError(null);
                      setConfirmDelete(true);
                    }}
                    hitSlop={8}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4, padding: 6 }}
                  >
                    <Trash2 size={16} color={colors.destructive} />
                    <Text
                      testID="nutrition-food-delete-label"
                      className="text-xs font-medium"
                      style={{ color: colors.destructive }}
                    >
                      Delete
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>

          {loading ? (
            <View testID="nutrition-food-loading" style={{ paddingVertical: 32, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}

          {/* The hero — image or large category-tinted thumbnail, full width
              above the title. Web (`FoodThumbnail` on
              `webapp/app/dashboard/foods/[id]/page.tsx`) has always drawn
              one; native drew nothing at all. */}
          {food ? (
            <FoodThumbnail
              testID="nutrition-food-hero"
              name={food.name}
              category={food.category}
              imageUrl={food.imageUrl}
            />
          ) : null}

          {/* Title block — name/brand on the left, verified + category
              stacked on the right, matching the web's
              `flex items-start justify-between` (native had them below the
              title, full width, instead of beside it). */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                testID="nutrition-food-name"
                className="text-foreground text-2xl font-bold"
              >
                {food?.name ?? "Food"}
              </Text>
              {food?.brand ? (
                <Text
                  testID="nutrition-food-brand"
                  className="text-muted-foreground text-sm"
                  style={{ marginTop: 2 }}
                >
                  {food.brand}
                </Text>
              ) : null}
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              {food?.isVerified ? (
                <View
                  testID="nutrition-food-verified"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    borderRadius: 12,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    backgroundColor: colors.muted,
                  }}
                >
                  <BadgeCheck size={14} color={colors.success} />
                  <Text className="text-foreground text-[10px] font-semibold">
                    Verified
                  </Text>
                </View>
              ) : null}
              {food?.category ? (
                <View
                  testID="nutrition-food-category"
                  style={{
                    borderRadius: 12,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    backgroundColor: colors.muted,
                  }}
                >
                  <Text className="text-muted-foreground text-[10px] font-medium">
                    {food.category}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {defaultVariant ? (
            <Text
              testID="nutrition-food-serving"
              className="text-muted-foreground text-xs"
            >
              Per {servingLabelFor(defaultVariant)}
              {food?.source && food.source !== "manual"
                ? ` · Source: ${String(food.source).toUpperCase()}`
                : ""}
            </Text>
          ) : null}

          {bookmarkError ? (
            <Text testID="nutrition-food-bookmark-error" className="text-destructive text-xs">
              {bookmarkError}
            </Text>
          ) : null}

          {headline ? (
            <View
              testID="nutrition-food-macros"
              style={{
                flexDirection: "row",
                borderRadius: 12,
                padding: 10,
                backgroundColor: colors.muted,
              }}
            >
              {[
                { label: "Cal", value: String(Math.round(headline.calories)), testID: "nutrition-food-macro-calories", color: colors.foreground },
                // Protein blue, carbs green, fats amber — the web's
                // `text-blue-600`/`text-green-600`/`text-amber-600` (and the
                // dark variants). `info`/`success`/`accent` are these exact
                // tokens — `lib/theme/tokens.ts` names `info` for precisely
                // this tile. Native drew every value in plain foreground.
                { label: "Protein", value: `${round1(headline.protein)}g`, testID: "nutrition-food-macro-protein", color: colors.info },
                { label: "Carbs", value: `${round1(headline.carbs)}g`, testID: "nutrition-food-macro-carbs", color: colors.success },
                { label: "Fats", value: `${round1(headline.fats)}g`, testID: "nutrition-food-macro-fats", color: colors.accent },
              ].map((m) => (
                <View key={m.label} style={{ flex: 1, alignItems: "center" }}>
                  <Text
                    testID={m.testID}
                    className="text-base font-bold"
                    style={{ color: m.color }}
                  >
                    {m.value}
                  </Text>
                  <Text className="text-muted-foreground text-[10px] uppercase">
                    {m.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {headline ? (
            <View
              testID="nutrition-food-nutrition"
              style={{
                gap: 2,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 12,
                backgroundColor: colors.card,
              }}
            >
              <Text className="text-foreground text-sm font-semibold">
                Nutrition (per serving)
              </Text>
              {[
                { label: "Calories", value: `${round1(headline.calories)}`, color: colors.foreground },
                { label: "Protein", value: `${round1(headline.protein)} g`, color: colors.info },
                { label: "Carbohydrates", value: `${round1(headline.carbs)} g`, color: colors.success },
                ...(headline.fiber != null
                  ? [{ label: "Fiber", value: `${round1(headline.fiber)} g`, color: colors.foreground }]
                  : []),
                ...(headline.sugar != null
                  ? [{ label: "Sugar", value: `${round1(headline.sugar)} g`, color: colors.foreground }]
                  : []),
                { label: "Fats", value: `${round1(headline.fats)} g`, color: colors.accent },
                ...(headline.saturatedFat != null
                  ? [{ label: "Saturated fat", value: `${round1(headline.saturatedFat)} g`, color: colors.foreground }]
                  : []),
                ...(headline.sodium != null
                  ? [{ label: "Sodium", value: `${round1(headline.sodium)} mg`, color: colors.foreground }]
                  : []),
              ].map((row) => (
                <View
                  key={row.label}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 6,
                  }}
                >
                  <Text className="text-muted-foreground text-sm">{row.label}</Text>
                  <Text className="text-sm font-semibold" style={{ color: row.color }}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {variants.length > 1 ? (
            <View
              testID="nutrition-food-variants"
              style={{
                gap: 4,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 12,
                backgroundColor: colors.card,
              }}
            >
              <Text
                testID="nutrition-food-variants-title"
                className="text-foreground text-sm font-semibold"
              >
                Variants ({variants.length})
              </Text>
              {variants.map((v, idx) => {
                const vn: IFoodNutrition = scalePerServingNutrition({
                  servingUnit: v.servingUnit,
                  servingSize: v.servingSize,
                  gramsPerServing: v.gramsPerServing,
                  mlPerServing: v.mlPerServing,
                  nutrition: {
                    calories: v.nutrition.calories ?? 0,
                    protein: v.nutrition.protein ?? 0,
                    carbs: v.nutrition.carbs ?? 0,
                    fats: v.nutrition.fats ?? 0,
                    fiber: v.nutrition.fiber,
                    sugar: v.nutrition.sugar,
                    sodium: v.nutrition.sodium,
                    saturatedFat: v.nutrition.saturatedFat,
                  },
                });
                return (
                  <View
                    key={v._id ?? idx}
                    testID={`nutrition-food-variant-${idx}`}
                    style={{
                      paddingVertical: 8,
                      borderBottomWidth: idx < variants.length - 1 ? 1 : 0,
                      borderBottomColor: colors.border,
                      gap: 6,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={{ flex: 0 }}>
                          <Text className="text-foreground text-sm font-medium">
                            {v.name}
                          </Text>
                          <Text className="text-muted-foreground text-xs">
                            {servingLabelFor(v)}
                          </Text>
                        </View>
                        {v.isDefault ? (
                          // A `DEFAULT` pill, matching the web's
                          // `rounded bg-zinc-100 ... uppercase` badge — native
                          // used to say " · default" as plain trailing text.
                          <View
                            testID={`nutrition-food-variant-${idx}-default-pill`}
                            style={{
                              borderRadius: 4,
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              backgroundColor: colors.muted,
                            }}
                          >
                            <Text className="text-muted-foreground text-[9px] font-medium uppercase">
                              Default
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text
                        testID={`nutrition-food-variant-${idx}-calories`}
                        className="text-foreground text-sm font-semibold"
                      >
                        {Math.round(vn.calories)} cal
                      </Text>
                    </View>
                    {canMutate ? (
                      <View style={{ gap: 6 }}>
                        <BridgeFieldGroup
                          testID={`nutrition-food-bridge-${idx}`}
                          value={{ gramsPerServing: v.gramsPerServing, mlPerServing: v.mlPerServing }}
                          onChange={(next) => void handleBridgeSave(idx, next)}
                          servingUnit={v.servingUnit}
                        />
                        {savingBridge === idx ? (
                          <Text className="text-muted-foreground text-[11px]">Saving…</Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {canMutate && variants.length <= 1 && defaultVariant ? (
            <View
              testID="nutrition-food-bridge-single"
              style={{
                gap: 8,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 12,
                backgroundColor: colors.card,
              }}
            >
              <Text className="text-foreground text-sm font-semibold">
                Bridge values
              </Text>
              <Text className="text-muted-foreground text-[11px]">
                Optional — lets the picker convert between mass and volume for
                this food.
              </Text>
              <BridgeFieldGroup
                testID="nutrition-food-bridge-single-fields"
                value={{
                  gramsPerServing: (defaultVariant as FoodVariant).gramsPerServing,
                  mlPerServing: (defaultVariant as FoodVariant).mlPerServing,
                }}
                onChange={(next) => void handleBridgeSave(0, next)}
                servingUnit={(defaultVariant as FoodVariant).servingUnit}
              />
              {savingBridge === 0 ? (
                <Text className="text-muted-foreground text-[11px]">Saving…</Text>
              ) : null}
            </View>
          ) : null}

          {bridgeError ? (
            <Text testID="nutrition-food-bridge-error" className="text-destructive text-xs">
              {bridgeError}
            </Text>
          ) : null}

          {importFailed || (food && !defaultVariant) ? (
            <Text testID="nutrition-food-error" className="text-destructive">
              Could not load this food. Try searching for it again.
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {food ? (
        // Sticky, above the tab bar, exactly like the web's `fixed
        // bottom-28` CTA (NP-325) — native used to leave this at the END of
        // the scroll, below the fold, instead of always on screen. Opens a
        // sheet (`ADDING TO <tag>`, AMOUNT chips, a coloured macro tile,
        // `Log to day`) rather than the amount/tag/time/date form this page
        // used to render inline. There is no `Save as meal` underneath it —
        // the web food page has none.
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 16,
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Button
            testID="nutrition-food-log-open"
            variant="inverted"
            icon={<Check size={16} />}
            onPress={() => setLogSheetOpen(true)}
          >
            Log this food
          </Button>
        </View>
      ) : null}

      <FoodLogSheet
        visible={logSheetOpen}
        food={food}
        defaultTag={params.tag ?? getDefaultTagForNow()}
        availableTags={availableTags}
        date={params.date ?? today}
        submitting={logSubmitting}
        error={logError}
        onClose={() => {
          if (!logSubmitting) setLogSheetOpen(false);
        }}
        onSubmit={handleFoodLogSubmit}
      />

      <Modal
        visible={editOpen}
        onClose={() => {
          if (!savingEdit) setEditOpen(false);
        }}
        title="Edit food"
        testID="nutrition-food-edit-sheet"
      >
        <View style={{ gap: 12 }}>
          <Input
            testID="nutrition-food-edit-name"
            label="Name *"
            value={editName}
            onChangeText={(v) => setEditName(v)}
          />
          <Input
            testID="nutrition-food-edit-brand"
            label="Brand"
            value={editBrand}
            onChangeText={(v) => setEditBrand(v)}
          />
          <Input
            testID="nutrition-food-edit-category"
            label="Category"
            value={editCategory}
            onChangeText={(v) => setEditCategory(v)}
          />
          {editError ? (
            <Text testID="nutrition-food-edit-error" className="text-destructive text-sm">
              {editError}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                testID="nutrition-food-edit-cancel"
                variant="ghost"
                disabled={savingEdit}
                onPress={() => setEditOpen(false)}
              >
                Cancel
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID="nutrition-food-edit-save"
                loading={savingEdit}
                disabled={savingEdit}
                onPress={() => void handleEditSave()}
              >
                {savingEdit ? "Saving…" : "Save"}
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={confirmDelete}
        onClose={() => {
          if (!deleting) setConfirmDelete(false);
        }}
        title="Delete this food?"
        testID="nutrition-food-delete-confirm"
      >
        <View style={{ gap: 12 }}>
          <Text className="text-muted-foreground text-sm">
            Past logs that used this food keep their snapshot — they won&apos;t
            change.
          </Text>
          {deleteError ? (
            <Text testID="nutrition-food-delete-error" className="text-destructive text-sm">
              {deleteError}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                testID="nutrition-food-delete-cancel"
                variant="ghost"
                disabled={deleting}
                onPress={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID="nutrition-food-delete-confirm-button"
                variant="destructive"
                loading={deleting}
                disabled={deleting}
                onPress={() => void handleDelete()}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
