/**
 * ─── The saved-meal page, natively (NP-143) ─────────────────────────────────
 *
 * The native half of `webapp/app/dashboard/meals/[id]/page.tsx`: the header
 * card (photo, name, tags, macro summary), the foods list, the notes, the
 * log sheet (`MealLogSheet`, the web's `MealApplySheet`), and the owner
 * actions — edit (the `MealEditorSheet`), delete with confirmation
 * (`DELETE /api/meals/{id}`, which frees a custom-meals slot immediately),
 * and to-recipe (`POST /api/meals/{id}/to-recipe`, a MOVE — the member
 * lands on the new recipe).
 *
 * After an edit the server answers `plannedCount`; when it is > 0 the
 * screen offers the web's "Update your meal plan?" confirm
 * (`POST /api/meals/{id}/sync-plans`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChefHat, Pencil, Trash2 } from "lucide-react-native";
import { z } from "zod";
import {
  apiFetch,
  MealSchema,
  MealScheduleResponseSchema,
  TagsResponseSchema,
  type Meal,
} from "@become/api-client";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { Text } from "@/components/Text";
import { AuthedImage } from "@/components/media/AuthedImage";
import { MealLogSheet } from "@/components/nutrition/MealLogSheet";
import {
  MealEditorSheet,
  mealToEditorInitial,
  type MealEditorInitial,
  type MealEditorSubmit,
} from "@/components/nutrition/MealEditorSheet";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useApiErrorHandler } from "@/lib/errors";
import { routeApiError } from "@/lib/errors";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import {
  invalidateEntitlements,
} from "@/lib/entitlements/store";
import { useEntitlements } from "@/lib/entitlements";
import {
  deleteMealImage,
  deleteSavedMeal,
  syncMealPlans,
  titleCaseMealTag,
  updateSavedMeal,
} from "@/lib/nutrition/savedMeals";
import { uploadMealImage } from "@/lib/media/upload";
import { logSavedMeal } from "@/lib/nutrition/basketLog";
import {
  defaultTagAt,
  minutesOfDay,
} from "@/lib/nutrition/mealSchedule";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

const MealDetailResponseSchema = z
  .object({ meal: MealSchema })
  .passthrough();

const ToRecipeWriteSchema = z
  .object({ recipe: z.object({ _id: z.string() }).passthrough().optional() })
  .passthrough();

function mealIdOf(meal: Meal): string {
  return String((meal as { _id?: unknown })._id ?? "");
}

export function MealDetail() {
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

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  const {
    data,
    loading,
    refetch: refetchMeal,
  } = useFetch(
    id ? `/api/meals/${encodeURIComponent(id)}` : null,
    MealDetailResponseSchema,
    { ...fetchOpts, skip: !token || !id },
  );
  const meal: Meal | null = data?.meal ?? null;

  const { data: tagsData } = useFetch("/api/tags", TagsResponseSchema, {
    ...fetchOpts,
    skip: !token,
  });
  const availableTags = useMemo(
    () => ({
      defaults: Array.isArray(tagsData?.defaults) ? tagsData.defaults : [],
      userTags: Array.isArray(tagsData?.userTags) ? tagsData.userTags : [],
    }),
    [tagsData],
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

  const { refresh: refreshEntitlements } = useEntitlements();
  const currentUserId = user?._id ? String(user._id) : null;
  const createdBy = meal ? String((meal as { createdBy?: unknown }).createdBy ?? "") : "";
  const isOwner = Boolean(
    currentUserId && createdBy && createdBy === currentUserId,
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitial, setEditorInitial] = useState<MealEditorInitial | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [planSync, setPlanSync] = useState<{ id: string; count: number } | null>(null);
  const [planSyncBusy, setPlanSyncBusy] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const [mealToLog, setMealToLog] = useState<Meal | null>(null);
  const [mealLogSubmitting, setMealLogSubmitting] = useState(false);
  const [mealLogError, setMealLogError] = useState<string | null>(null);

  useEffect(() => {
    if (meal) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from network response
      setEditorInitial(mealToEditorInitial(meal));
    }
  }, [meal]);

  const openEditor = useCallback(() => {
    if (!meal) return;
    setEditorError(null);
    setEditorInitial(mealToEditorInitial(meal));
    setEditorOpen(true);
  }, [meal]);

  const handleEditorSubmit = useCallback(
    async (submit: MealEditorSubmit) => {
      if (!meal || editorSaving) return;
      const mealId = mealIdOf(meal);
      if (!mealId) return;
      setEditorSaving(true);
      setEditorError(null);
      try {
        const { mealId: savedId, plannedCount } = await updateSavedMeal(
          mealId,
          submit.input,
          { apiFetch, token, baseUrl: WEBAPP_BASE_URL },
        );
        // Photo changes ride after the PATCH, like the web's MealForm:
        // a fresh capture uploads (multipart field `image`), a removal
        // deletes the server image. Both are non-fatal to the save.
        if (submit.pendingPhoto) {
          try {
            await uploadMealImage(savedId ?? mealId, {
              uri: submit.pendingPhoto.uri,
              fileName: submit.pendingPhoto.fileName,
              mimeType: submit.pendingPhoto.mimeType,
            });
          } catch {
            // non-fatal: the meal saved fine.
          }
        } else if (submit.photoRemoved) {
          try {
            await deleteMealImage(savedId ?? mealId, {
              apiFetch,
              token,
              baseUrl: WEBAPP_BASE_URL,
            });
          } catch {
            // non-fatal: the meal saved fine.
          }
        }
        await refetchMeal();
        setEditorOpen(false);
        setBanner("Meal updated");
        await refreshEntitlements().catch(() => {});
        // In the meal plan? Offer to propagate the edit to the planned
        // copies (they are snapshots, not live refs).
        if (plannedCount > 0) {
          setPlanSync({ id: savedId ?? mealId, count: plannedCount });
        }
      } catch (err) {
        const { handled, message } = handleApiError(err);
        if (!handled) setEditorError(message);
      } finally {
        setEditorSaving(false);
      }
    },
    [meal, editorSaving, handleApiError, refetchMeal, refreshEntitlements, token],
  );

  const handlePlanSyncAnswer = useCallback(
    async (sync: boolean) => {
      const pending = planSync;
      if (!pending || planSyncBusy) return;
      if (!sync) {
        setPlanSync(null);
        return;
      }
      setPlanSyncBusy(true);
      try {
        await syncMealPlans(pending.id, {
          apiFetch,
          token,
          baseUrl: WEBAPP_BASE_URL,
        });
        setPlanSync(null);
        setBanner("Meal plan updated");
      } catch (err) {
        const { handled, message } = handleApiError(err);
        if (!handled) setBanner(message);
        else setPlanSync(null);
      } finally {
        setPlanSyncBusy(false);
      }
    },
    [planSync, planSyncBusy, handleApiError, token],
  );

  const handleDelete = useCallback(async () => {
    if (!meal || deleting) return;
    const mealId = mealIdOf(meal);
    if (!mealId) return;
    setDeleting(true);
    try {
      await deleteSavedMeal(mealId, {
        apiFetch,
        token,
        baseUrl: WEBAPP_BASE_URL,
      });
      // Deleting frees a custom-meals slot immediately — mark the
      // entitlements snapshot stale so the next gated surface re-reads
      // instead of showing the lock this delete just cleared.
      invalidateEntitlements();
      router.back();
    } catch (err) {
      const { handled, message } = handleApiError(err);
      if (!handled) setBanner(message);
      setDeleting(false);
    }
  }, [meal, deleting, handleApiError, router, token]);

  const handleConvertToRecipe = useCallback(async () => {
    if (!meal || converting) return;
    const mealId = mealIdOf(meal);
    if (!mealId) return;
    setConverting(true);
    try {
      const res = await apiFetch(
        `/api/meals/${encodeURIComponent(mealId)}/to-recipe`,
        ToRecipeWriteSchema,
        {
          method: "POST",
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        },
      );
      const recipeId = res?.recipe?._id ? String(res.recipe._id) : null;
      if (recipeId) {
        // A MOVE, not a copy: the meal is gone server-side. Deleting frees
        // a custom-meals slot, so the snapshot is stale either way.
        invalidateEntitlements();
        setBanner("Converted to a recipe");
        router.replace(
          `/(tabs)/nutrition/recipes/${encodeURIComponent(recipeId)}` as never,
        );
      } else {
        setBanner("Could not convert that meal.");
        setConverting(false);
      }
    } catch (err) {
      const routed = routeApiError(err, {
        onPlanGate: (gate) => {
          showUpgradeSheet(gate.gate);
        },
      });
      if (!routed.handled) setBanner(routed.message);
      setConverting(false);
    }
  }, [meal, converting, router, token]);

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

  // The to-recipe call goes through `apiFetch` directly (its response shape
  // is local to this screen); the shared helper in `savedMeals.ts` owns the
  // documented contract the suite asserts.

  if (!id) {
    return (
      <View testID="meal-detail-missing" style={{ padding: 16 }}>
        <Text className="text-destructive">Missing meal id</Text>
      </View>
    );
  }

  const totalCal = Math.round(meal?.totalNutrition?.calories ?? 0);
  const totalP = Math.round(meal?.totalNutrition?.protein ?? 0);
  const totalC = Math.round(meal?.totalNutrition?.carbs ?? 0);
  const totalF = Math.round(meal?.totalNutrition?.fats ?? 0);

  return (
    <View testID="meal-detail-route" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable
            testID="meal-detail-back"
            accessibilityRole="button"
            accessibilityLabel="Back to meals"
            onPress={() => router.back()}
            style={{ padding: 6 }}
          >
            <Text className="text-foreground text-base font-semibold">‹ Meals</Text>
          </Pressable>
          {isOwner ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Pressable
                testID="meal-detail-to-recipe"
                accessibilityRole="button"
                accessibilityLabel="Convert to a recipe"
                disabled={converting}
                onPress={() => void handleConvertToRecipe()}
                style={{ paddingHorizontal: 8, paddingVertical: 6 }}
              >
                <Text className="text-muted-foreground text-xs font-medium">
                  {converting ? "Converting…" : "To recipe"}
                </Text>
              </Pressable>
              <Pressable
                testID="meal-detail-edit"
                accessibilityRole="button"
                accessibilityLabel="Edit meal"
                onPress={openEditor}
                style={{ paddingHorizontal: 8, paddingVertical: 6 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Pencil size={14} color={colors["muted-foreground"]} />
                  <Text className="text-muted-foreground text-xs font-medium">Edit</Text>
                </View>
              </Pressable>
              <Pressable
                testID="meal-detail-delete"
                accessibilityRole="button"
                accessibilityLabel="Delete meal"
                onPress={() => setConfirmDelete(true)}
                style={{ paddingHorizontal: 8, paddingVertical: 6 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Trash2 size={14} color={colors.destructive} />
                  <Text className="text-destructive text-xs font-medium">Delete</Text>
                </View>
              </Pressable>
            </View>
          ) : null}
        </View>

        {loading && !meal ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator testID="meal-detail-loading" />
          </View>
        ) : !meal ? (
          <View
            testID="meal-detail-missing-meal"
            style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}
          >
            <Text className="text-foreground text-base font-semibold">
              Meal not found.
            </Text>
          </View>
        ) : (
          <>
            <Card title={meal.name} subtitle={meal.description ?? ""}>
              <View testID={`meal-detail-${mealIdOf(meal)}`} style={{ gap: 8 }}>
                {meal.imageUrl ? (
                  <AuthedImage
                    source={meal.imageUrl}
                    accessibilityLabel={`Photo of ${meal.name}`}
                    testID="meal-detail-photo"
                    containerStyle={{ height: 160, borderRadius: 12, overflow: "hidden" }}
                    style={{ height: 160, width: "100%" }}
                  />
                ) : (
                  <View
                    testID="meal-detail-photo-fallback"
                    style={{
                      height: 128,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.muted,
                    }}
                  >
                    <ChefHat size={36} color={colors["muted-foreground"]} />
                  </View>
                )}
                {(meal.tags?.length ?? 0) > 0 ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {(meal.tags ?? []).map((tag) => (
                      <View
                        key={tag}
                        testID={`meal-detail-tag-${tag}`}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 12,
                          backgroundColor: colors.muted,
                        }}
                      >
                        <Text className="text-muted-foreground text-xs font-medium">
                          {titleCaseMealTag(tag)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <View
                  testID="meal-detail-macros"
                  style={{
                    flexDirection: "row",
                    borderRadius: 12,
                    backgroundColor: colors.muted,
                    padding: 10,
                  }}
                >
                  {[
                    { label: "Cal", value: String(totalCal) },
                    { label: "Protein", value: `${totalP}g` },
                    { label: "Carbs", value: `${totalC}g` },
                    { label: "Fats", value: `${totalF}g` },
                  ].map((m) => (
                    <View key={m.label} style={{ flex: 1, alignItems: "center" }}>
                      <Text className="text-foreground text-base font-bold">{m.value}</Text>
                      <Text className="text-muted-foreground text-[10px] uppercase">
                        {m.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </Card>

            <Card title="Foods">
              <View style={{ gap: 0 }}>
                {(meal.items ?? []).map((it, idx) => (
                  <View
                    key={idx}
                    testID={`meal-detail-item-${idx}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingVertical: 10,
                      borderBottomWidth:
                        idx < (meal.items?.length ?? 0) - 1 ? 1 : 0,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        className="text-foreground text-sm font-medium"
                        numberOfLines={1}
                      >
                        {it.name}
                      </Text>
                      <Text
                        className="text-muted-foreground text-xs"
                        numberOfLines={1}
                      >
                        {it.brand ? `${it.brand} · ` : ""}
                        {it.servings} × {it.servingSize}
                        {it.servingUnit}
                      </Text>
                    </View>
                    <Text className="text-foreground text-sm font-semibold">
                      {Math.round((it.nutrition?.calories ?? 0) * (it.servings ?? 1))}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>

            {meal.description ? (
              <Card title="Notes">
                <Text
                  testID="meal-detail-notes"
                  className="text-muted-foreground text-sm"
                >
                  {meal.description}
                </Text>
              </Card>
            ) : null}

            {banner ? (
              <Text testID="meal-detail-banner" className="text-muted-foreground text-xs">
                {banner}
              </Text>
            ) : null}

            <Button
              testID="meal-detail-log"
              variant="primary"
              onPress={() => {
                setMealLogError(null);
                setMealToLog(meal);
              }}
            >
              Apply to log
            </Button>
          </>
        )}
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

      <MealEditorSheet
        visible={editorOpen}
        mealId={id}
        initial={editorInitial}
        availableTags={availableTags}
        submitting={editorSaving}
        error={editorError}
        onClose={() => {
          setEditorOpen(false);
          setEditorError(null);
        }}
        onSubmit={handleEditorSubmit}
      />

      {/* Delete confirm — the web's overlay, verbatim in intent. */}
      <Modal
        visible={confirmDelete}
        onClose={() => {
          if (!deleting) setConfirmDelete(false);
        }}
        title="Delete this meal?"
        testID="meal-detail-delete-confirm"
      >
        <Text className="text-muted-foreground text-sm">
          This won&apos;t affect any logs you&apos;ve already made from it.
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
          <View style={{ flex: 1 }}>
            <Button
              testID="meal-detail-delete-cancel"
              variant="secondary"
              disabled={deleting}
              onPress={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              testID="meal-detail-delete-confirm-button"
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

      {/* In the meal plan? Offer to propagate the edit to the planned copies. */}
      <Modal
        visible={planSync !== null}
        onClose={() => {
          if (!planSyncBusy) setPlanSync(null);
        }}
        title="Update your meal plan?"
        testID="meal-detail-plan-sync"
      >
        <Text className="text-muted-foreground text-sm">
          {planSync
            ? `This meal is in ${planSync.count} upcoming meal-plan slot${planSync.count === 1 ? "" : "s"}. Update the planned ${planSync.count === 1 ? "copy" : "copies"} to match your edit?`
            : ""}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
          <View style={{ flex: 1 }}>
            <Button
              testID="meal-detail-plan-sync-keep"
              variant="secondary"
              disabled={planSyncBusy}
              onPress={() => void handlePlanSyncAnswer(false)}
            >
              Keep plans as-is
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              testID="meal-detail-plan-sync-update"
              variant="primary"
              loading={planSyncBusy}
              disabled={planSyncBusy}
              onPress={() => void handlePlanSyncAnswer(true)}
            >
              Update plans
            </Button>
          </View>
        </View>
      </Modal>
    </View>
  );
}
