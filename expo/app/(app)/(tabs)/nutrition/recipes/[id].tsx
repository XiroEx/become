import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  apiFetch,
  MealScheduleResponseSchema,
  RecipeDetailResponseSchema,
  type Food,
} from "@become/api-client";
import { Text } from "@/components/Text";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Toast } from "@/components/Toast";
import { useToast } from "@/lib/toast/useToast";
import {
  RecipeDetail,
  type RecipeDetailViewModel,
} from "@/components/recipes/RecipeDetail";
import { SavedFoodLogSheet } from "@/components/nutrition/SavedFoodLogSheet";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useApiErrorHandler, routeApiError } from "@/lib/errors";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { invalidateEntitlements } from "@/lib/entitlements/store";
import { useEntitlements } from "@/lib/entitlements";
import {
  convertRecipeToMeal,
  deleteRecipe,
  toRecipeDetailViewModel,
} from "@/lib/nutrition/recipes";
import { saveRecipeAsFood } from "@/lib/nutrition/myStuff";
import { logFoodItem } from "@/lib/nutrition/mealLogActions";
import {
  defaultTagAt,
  minutesOfDay,
} from "@/lib/nutrition/mealSchedule";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * THE RECIPE PAGE, ON THE PHONE (NP-144).
 *
 * Native counterpart of `webapp/app/dashboard/recipes/[id]/page.tsx`:
 *
 *   • the header card (photo, name, prep/cook times, servings, tags, the
 *     per-serving macros from `totalsPerServing` — shown as-is, never
 *     divided again), the ingredients list, the cooking instructions;
 *   • the Save-or-Log CTA — recipes are never logged directly. The first tap
 *     mints (or reuses) a Food through save-as-food (`custom-foods`); once
 *     saved, tapping logs that Food. A refused save-as-food at the
 *     `custom-foods` cap raises the upgrade sheet (plan-gates story) — the
 *     web only toasts the server's sentence;
 *   • the owner actions — To meal (`POST .../to-meal`, `custom-meals`-gated;
 *     a MOVE for the owner, a COPY for anyone else), Edit (the native
 *     editor), Delete with confirmation (`DELETE`, ungated).
 *
 * After a to-meal the member lands on the new meal — the web routes to it —
 * and after a delete they go back to My Stuff.
 */
export default function RecipeDetailRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { token, user } = useAuth();
  const handleApiError = useApiErrorHandler({
    onPlanGate: (gate) => {
      showUpgradeSheet(gate.gate);
    },
  });
  const { refresh: refreshEntitlements } = useEntitlements();

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  const { data, loading } = useFetch(
    id ? `/api/nutrition/recipes/${encodeURIComponent(id)}` : null,
    RecipeDetailResponseSchema,
    { ...fetchOpts, skip: !token || !id },
  );

  const { data: scheduleData } = useFetch(
    "/api/nutrition/meal-schedule",
    MealScheduleResponseSchema,
    { ...fetchOpts, skip: !token },
  );
  const currentDefaultTag = useMemo(() => {
    const raw = scheduleData?.windows;
    const windows = Array.isArray(raw)
      ? raw.map((w) => ({
          tag: w.tag,
          startMinutes: w.startMinutes ?? null,
          endMinutes: w.endMinutes ?? null,
        }))
      : [];
    return defaultTagAt(windows, minutesOfDay(new Date()));
  }, [scheduleData]);

  const currentUserId = user?._id ? String(user._id) : null;

  const [savedFoodId, setSavedFoodId] = useState<string | null>(null);
  const [savingFood, setSavingFood] = useState(false);
  const [converting, setConverting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The web's `showToast` (NP-271) — a floating toast, not a plain line of
  // text sitting at the bottom of the scroll flow.
  const { toast, showToast } = useToast();

  const [foodToLog, setFoodToLog] = useState<Food | null>(null);
  const [foodLogSubmitting, setFoodLogSubmitting] = useState(false);
  const [foodLogError, setFoodLogError] = useState<string | null>(null);

  // The server's `savedFoodId` seeds the Save-or-Log state, like the web's
  // `fetchRecipe` seeding `savedFoodId`.
  useEffect(() => {
    if (data?.savedFoodId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from network response
      setSavedFoodId(String(data.savedFoodId));
    }
  }, [data?.savedFoodId]);

  // Save-or-Log: recipes are never logged directly. First tap mints (or
  // reuses) a Food; once saved, tapping logs that Food.
  const handleSaveOrLog = useCallback(async () => {
    if (!id || savingFood) return;
    setSavingFood(true);
    try {
      const res = await saveRecipeAsFood(id, {
        apiFetch,
        token,
        baseUrl: WEBAPP_BASE_URL,
      });
      const food = (res?.food ?? null) as unknown as Food | null;
      const wasSaved = Boolean(savedFoodId) || Boolean(res?.alreadyExisted);
      const mintedId = food
        ? String(
            (food as { _id?: unknown; id?: unknown })._id ??
              (food as { _id?: unknown; id?: unknown }).id ??
              "",
          )
        : "";
      if (mintedId) setSavedFoodId((prev) => prev ?? mintedId);
      else if (!savedFoodId) setSavedFoodId("saved");
      await refreshEntitlements().catch(() => {});
      if (wasSaved && food) {
        setFoodLogError(null);
        setFoodToLog(food);
      } else {
        // The web's exact toast (`showToast(..., 'success')`).
        showToast("Saved to your Foods — tap again to log it", "success");
      }
    } catch (err) {
      // A plan gate (e.g. the custom-foods cap) raises the upgrade sheet
      // through the handler above; an ordinary refusal keeps the server's
      // own words in the toast. The web only toasts the sentence; native
      // raises the sheet, as the plan-gates story requires.
      const { handled, message } = handleApiError(err);
      if (!handled) showToast(message, "error");
    } finally {
      setSavingFood(false);
    }
  }, [handleApiError, id, refreshEntitlements, savedFoodId, savingFood, showToast, token]);

  // Convert to a meal (loggable group). MOVE for the owner, COPY otherwise —
  // the response says which, so the screen never guesses.
  const handleConvertToMeal = useCallback(async () => {
    if (!id || converting) return;
    setConverting(true);
    try {
      const { mealId, mode } = await convertRecipeToMeal(id, {
        apiFetch,
        token,
        baseUrl: WEBAPP_BASE_URL,
      });
      if (mealId) {
        // A create spends a custom-meals slot — re-read the snapshot so the
        // cap the create just spent shows at once. A MOVE also deletes the
        // recipe, so the snapshot is stale either way.
        await refreshEntitlements().catch(() => {});
        if (mode === "move") invalidateEntitlements();
        showToast(mode === "move" ? "Converted to a meal" : "Saved as a meal", "success");
        router.replace(
          `/(tabs)/nutrition/meals/${encodeURIComponent(mealId)}` as never,
        );
      } else {
        showToast("Could not convert that meal.", "error");
        setConverting(false);
      }
    } catch (err) {
      const routed = routeApiError(err, {
        onPlanGate: (gate) => {
          showUpgradeSheet(gate.gate);
        },
      });
      // A refusal means the snapshot disagrees with the server; re-read it
      // so the lock matches what just happened.
      await refreshEntitlements().catch(() => {});
      if (!routed.handled) showToast(routed.message, "error");
      setConverting(false);
    }
  }, [converting, id, refreshEntitlements, router, showToast, token]);

  const handleDelete = useCallback(async () => {
    if (!id || deleting) return;
    setDeleting(true);
    try {
      await deleteRecipe(id, {
        apiFetch,
        token,
        baseUrl: WEBAPP_BASE_URL,
      });
      setConfirmDelete(false);
      router.back();
    } catch (err) {
      const { handled, message } = handleApiError(err);
      if (!handled) showToast(message, "error");
      setDeleting(false);
    }
  }, [deleting, handleApiError, id, router, showToast, token]);

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
        showToast(`Logged ${foodToLog.name}`, "success");
      } catch (err) {
        const { handled, message } = handleApiError(err);
        if (!handled) setFoodLogError(message);
      } finally {
        setFoodLogSubmitting(false);
      }
    },
    [foodLogSubmitting, foodToLog, handleApiError, showToast, token],
  );

  if (!id) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View style={{ padding: 16 }}>
          <Text className="text-destructive">Missing recipe id</Text>
        </View>
      </SafeAreaView>
    );
  }

  const recipe: RecipeDetailViewModel = data
    ? toRecipeDetailViewModel(data, currentUserId)
    : {
        id,
        name: "Loading…",
        description: "",
        ingredients: [],
        instructions: [],
        perServing: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
        servings: 1,
      };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="recipe-detail-route"
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingTop: 8,
        }}
      >
        <Pressable
          testID="recipe-detail-back"
          accessibilityRole="button"
          accessibilityLabel="Back to recipes"
          onPress={() => router.back()}
          style={{ padding: 6 }}
        >
          <Text className="text-foreground text-base font-semibold">‹ Recipes</Text>
        </Pressable>
        {loading && !data ? (
          <ActivityIndicator testID="recipe-detail-loading" size="small" />
        ) : null}
      </View>

      <RecipeDetail
        recipe={recipe}
        savedFoodId={savedFoodId}
        savingFood={savingFood}
        onSaveOrLogFood={() => void handleSaveOrLog()}
        converting={converting}
        onConvertToMeal={() => void handleConvertToMeal()}
        onEdit={() =>
          router.push(`/(tabs)/nutrition/recipes/${encodeURIComponent(id)}/edit` as never)
        }
        onDelete={() => setConfirmDelete(true)}
      />

      {/* A floating toast (the web's own), not a plain line of scroll-flow text. */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: 0, right: 0, bottom: 24, alignItems: "center" }}
      >
        <Toast toast={toast} testID="recipe-detail-toast" />
      </View>

      {/* Log the saved food (the web's FoodLogSheet). */}
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

      {/* Delete confirm — the web's overlay, verbatim in intent. */}
      <Modal
        visible={confirmDelete}
        onClose={() => {
          if (!deleting) setConfirmDelete(false);
        }}
        title="Delete this recipe?"
        testID="recipe-detail-delete-confirm"
      >
        <Text className="text-muted-foreground text-sm">
          This won&apos;t affect any food you&apos;ve already saved from it.
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
          <View style={{ flex: 1 }}>
            <Button
              testID="recipe-detail-delete-cancel"
              variant="secondary"
              disabled={deleting}
              onPress={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              testID="recipe-detail-delete-confirm-button"
              variant="destructive"
              loading={deleting}
              disabled={deleting}
              onPress={() => void handleDelete()}
            >
              Delete
            </Button>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
