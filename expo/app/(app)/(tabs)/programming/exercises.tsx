import { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Lock, Plus } from "lucide-react-native";
import type { z } from "zod";
import {
  CustomExerciseDeleteResponseSchema,
  CustomExerciseResponseSchema,
  CustomExerciseSubmitResponseSchema,
  CustomExercisesResponseSchema,
  apiFetch,
  type CustomExercise,
} from "@become/api-client";
import { MyExercises } from "@/components/workout/MyExercises";
import { CustomExerciseForm } from "@/components/workout/CustomExerciseForm";
import { BottomSheet } from "@/components/BottomSheet";
import { ScreenState } from "@/components/ScreenState";
import { AllowanceCounter } from "@/components/entitlements/AllowanceCounter";
import { AllowanceLock } from "@/components/entitlements/AllowanceLock";
import {
  syntheticGate,
  useEntitlements,
} from "@/lib/entitlements";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { routeApiError } from "@/lib/errors";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import {
  DEFAULT_CUSTOM_EXERCISE_FORM,
  customExerciseDeletePath,
  customExerciseEditPath,
  customExerciseSubmitPath,
  toCustomExerciseSummary,
  toCustomExerciseWriteBody,
  type CustomExerciseFormValues,
} from "@/lib/workout/customExercises";
import { openWebSignedIn } from "@/lib/web/openWebSignedIn";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

/**
 * MY EXERCISES — the member's own exercises, on the phone (NP-169).
 *
 * Native counterpart of `webapp/app/dashboard/workout/library/ExerciseLibraryClient.tsx`:
 * `GET /api/exercises/custom` lists what the member built on the web or
 * natively, every row edits, deletes and submits for catalogue review, and
 * create posts the same field set the web form sends. Demo upload and trim
 * stay on the web (the gap-analysis records the decision): a row with a demo
 * links out to the library signed in through `openWebSignedIn` (NP-121).
 *
 * THE RULES, kept in the same words as the web:
 *
 *   • create reads `canCreate`, never `allowed` and never `limit - used`.
 *     `allowed` is true for a capped free member on purpose — that is what
 *     lets them edit and DELETE their way back under the cap.
 *   • `enforced === false` (or an unknown snapshot) renders no lock, no
 *     counter and no sheet: `canCreate()` already answers true there.
 *   • a delete frees its slot server-side the moment the row is gone, so the
 *     handler calls the entitlements `refresh()` (NP-049) — without it the 60s
 *     snapshot keeps the create control locked at a cap just cleared.
 *   • choosing the Bodyweight category switches tracking to reps-only (Jon's
 *     bug 6ab18beb, fixed on the web first) — see `applyCategoryChange` in
 *     `lib/workout/customExercises`, applied at pick time in the form.
 */
export default function MyExercisesRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();

  // Refusals route through the same classifier every screen uses: a plan-gate
  // raises the upgrade sheet (NP-052) and anything else comes back as the
  // server's own words. `routeApiError` without a provider would drop the
  // gate, so the sheet is raised here directly.
  const handleFailure = useCallback((err: unknown): string | null => {
    const { handled, message } = routeApiError(err, {
      onPlanGate: (gate) => {
        showUpgradeSheet(gate.gate);
      },
    });
    return handled ? null : message;
  }, []);

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  // `z.infer` spelled out: bare `useFetch(path, schema)` infers `{}` under
  // this repo's zod/TS pairing (every other screen hits the same), so the
  // response type rides along explicitly.
  const custom = useFetch<z.infer<typeof CustomExercisesResponseSchema>>(
    "/api/exercises/custom",
    CustomExercisesResponseSchema,
    {
      ...fetchOpts,
      skip: !token,
    },
  );

  const exercises = useMemo(
    () => ((custom.data?.exercises ?? []) as CustomExercise[]).map(toCustomExerciseSummary),
    [custom.data?.exercises],
  );

  const {
    data: entitlements,
    canCreate,
    refresh: refreshEntitlements,
  } = useEntitlements();
  const mayCreate = canCreate("custom-exercises");

  const [showCreate, setShowCreate] = useState(false);
  const [createValues, setCreateValues] = useState<CustomExerciseFormValues>(
    DEFAULT_CUSTOM_EXERCISE_FORM,
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [submittingSlug, setSubmittingSlug] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // A delete frees its slot server-side at once; coming back from the web
  // library (or from a change on another device) must not paint a stale list
  // or a lock the member just cleared. Re-read on focus. `run` is stable per
  // path (useFetch memoises it), so this fires once per focus.
  const refetchList = custom.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchList();
    }, [refetchList]),
  );
  // The cap, separately: the entitlements snapshot is shared and TTL-cached,
  // so a focus read is cheap when nothing changed and immediate when a delete
  // freed a slot.
  useFocusEffect(
    useCallback(() => {
      void refreshEntitlements().catch(() => {});
    }, [refreshEntitlements]),
  );

  const openCreate = useCallback(() => {
    if (!mayCreate && entitlements && entitlements.enforced !== false) {
      const entitlement = entitlements.features?.["custom-exercises"] ?? null;
      showUpgradeSheet(
        syntheticGate(
          "custom-exercises",
          entitlement?.requiresTier ?? "plus",
          entitlement,
        ),
      );
      return;
    }
    setCreateError(null);
    setCreateValues(DEFAULT_CUSTOM_EXERCISE_FORM);
    setShowCreate(true);
  }, [mayCreate, entitlements]);

  const closeCreate = useCallback(() => {
    if (creating) return;
    setShowCreate(false);
    setCreateError(null);
  }, [creating]);

  const confirmCreate = useCallback(async () => {
    if (!createValues.name.trim()) {
      setCreateError("Name is required");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await apiFetch(
        "/api/exercises/custom",
        CustomExerciseResponseSchema,
        {
          method: "POST",
          body: toCustomExerciseWriteBody(createValues),
          ...fetchOpts,
        },
      );
      setShowCreate(false);
      setCreateValues(DEFAULT_CUSTOM_EXERCISE_FORM);
      await refetchList();
      // A create consumes an inventory slot server-side at once. Re-read now,
      // or the 60s snapshot keeps the create control open at a cap just hit.
      await refreshEntitlements().catch(() => {});
    } catch (err) {
      const message = handleFailure(err);
      if (message) setCreateError(message);
    } finally {
      setCreating(false);
    }
  }, [createValues, fetchOpts, handleFailure, refetchList, refreshEntitlements]);

  const saveExercise = useCallback(
    async (slug: string, values: CustomExerciseFormValues) => {
      if (!values.name.trim()) {
        setActionError("Name is required");
        return;
      }
      setSavingSlug(slug);
      setActionError(null);
      try {
        await apiFetch(
          customExerciseEditPath(slug),
          CustomExerciseResponseSchema,
          {
            method: "PATCH",
            body: toCustomExerciseWriteBody(values),
            ...fetchOpts,
          },
        );
        await refetchList();
      } catch (err) {
        const message = handleFailure(err);
        if (message) setActionError(message);
      } finally {
        setSavingSlug(null);
      }
    },
    [fetchOpts, handleFailure, refetchList],
  );

  const deleteExercise = useCallback(
    async (slug: string) => {
      setDeletingSlug(slug);
      setActionError(null);
      try {
        await apiFetch(
          customExerciseDeletePath(slug),
          CustomExerciseDeleteResponseSchema,
          { method: "DELETE", ...fetchOpts },
        );
        await refetchList();
        // The slot is free the moment the row is gone. Re-read now, or the
        // 60s snapshot keeps the create control locked at a cap just cleared.
        await refreshEntitlements().catch(() => {});
      } catch (err) {
        const message = handleFailure(err);
        if (message) setActionError(message);
      } finally {
        setDeletingSlug(null);
      }
    },
    [refetchList, fetchOpts, handleFailure, refreshEntitlements],
  );

  const submitExercise = useCallback(
    async (slug: string) => {
      setSubmittingSlug(slug);
      setActionError(null);
      try {
        await apiFetch(
          customExerciseSubmitPath(slug),
          CustomExerciseSubmitResponseSchema,
          { method: "POST", ...fetchOpts },
        );
        await refetchList();
      } catch (err) {
        const message = handleFailure(err);
        if (message) setActionError(message);
      } finally {
        setSubmittingSlug(null);
      }
    },
    [fetchOpts, handleFailure, refetchList],
  );

  const withdrawExercise = useCallback(
    async (slug: string) => {
      setSubmittingSlug(slug);
      setActionError(null);
      try {
        await apiFetch(
          customExerciseSubmitPath(slug),
          CustomExerciseSubmitResponseSchema,
          { method: "DELETE", ...fetchOpts },
        );
        await refetchList();
      } catch (err) {
        const message = handleFailure(err);
        if (message) setActionError(message);
      } finally {
        setSubmittingSlug(null);
      }
    },
    [fetchOpts, handleFailure, refetchList],
  );

  const openWebLibrary = useCallback(() => {
    // Demo upload and trim stay on the web (NP-169 defers them): the signed-in
    // hand-off lands on the library's Exercises tab. The handoff allow-list
    // only takes bare paths (no query), so this opens the hub and the member
    // picks the Exercises tab there.
    void openWebSignedIn("/dashboard/workout/hub");
  }, []);

  const retryList = useCallback(() => {
    void refetchList();
  }, [refetchList]);

  const goBack = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="my-exercises-route"
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingTop: 16,
            marginBottom: 4,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <Pressable
              testID="my-exercises-back"
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={goBack}
              style={[minTouchTarget, { justifyContent: "center" }]}
            >
              <Text className="text-primary text-base">‹ Back</Text>
            </Pressable>
            <Text className="text-foreground text-2xl font-bold">My exercises</Text>
          </View>
          <Pressable
            testID="my-exercises-create"
            accessibilityRole="button"
            accessibilityLabel={
              mayCreate
                ? "Create an exercise"
                : "Create an exercise — at your free limit"
            }
            onPress={openCreate}
            style={[
              minTouchTarget,
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: colors.primary,
              },
            ]}
          >
            {mayCreate ? (
              <Plus size={16} color={colors["primary-foreground"]} />
            ) : (
              <Lock size={16} color={colors["primary-foreground"]} />
            )}
            <Text className="text-primary-foreground text-sm font-semibold">Create</Text>
          </Pressable>
        </View>

        <Text
          className="text-muted-foreground text-sm"
          style={{ paddingHorizontal: 16, marginBottom: 8 }}
        >
          Exercises you built yourself — use them in any workout or program.
        </Text>

        {entitlements && entitlements.enforced !== false ? (
          <View style={{ paddingHorizontal: 16, marginBottom: 8, gap: 8 }}>
            <AllowanceCounter
              feature="custom-exercises"
              testID="my-exercises-allowance-counter"
            />
            <AllowanceLock
              feature="custom-exercises"
              onPress={(gate) => showUpgradeSheet(gate)}
              testID="my-exercises-allowance-lock"
            />
          </View>
        ) : null}

        {/* NP-276: the empty state (icon, copy, Create Exercise button) is
            `MyExercises`'s own branch, not `ScreenState`'s plain title/message
            one — `hasData` only needs to be true once loading/error are
            cleared so `ScreenState` always hands off to it. */}
        <ScreenState
          loading={custom.loading}
          error={custom.error}
          hasData={!custom.loading && !custom.error}
          onRetry={retryList}
          testID="my-exercises-screen-state"
        >
          <MyExercises
            exercises={exercises}
            onSave={saveExercise}
            onDelete={deleteExercise}
            onSubmitReview={submitExercise}
            onWithdrawReview={withdrawExercise}
            onOpenWebLibrary={openWebLibrary}
            onCreate={openCreate}
            savingSlug={savingSlug}
            deletingSlug={deletingSlug}
            submittingSlug={submittingSlug}
            actionError={actionError}
          />
        </ScreenState>
      </ScrollView>

      {/* BLOCKER FIX (NP-276): the create card used to be a centred `Modal`
          with no height limit and no scroll — on a phone the title and Name
          field sat under the status bar and Cancel/Create sat below the
          bottom edge, so a custom exercise could not be created natively.
          `BottomSheet` + `sheetStyle={{ maxHeight: "90%" }}` + an inner
          `ScrollView` is the pattern already proven for long native forms
          (`GenerateSheet`, `UpgradeSheet`, `TrainingLogCorrectionSheet`): the
          sheet itself never exceeds the safe area, and scrolling is what
          keeps the title, Cancel and Create reachable regardless of how
          tall the form gets. */}
      <BottomSheet
        testID="my-exercises-create-modal"
        visible={showCreate}
        onClose={closeCreate}
        title="New Custom Exercise"
        sheetStyle={{ maxHeight: "90%" }}
      >
        <ScrollView
          testID="my-exercises-create-form-scroll"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 8 }}
        >
          <CustomExerciseForm
            values={createValues}
            onChange={setCreateValues}
            error={createError}
            submitting={creating}
            submitLabel={creating ? "Creating..." : "Create Exercise"}
            onSubmit={() => void confirmCreate()}
            onCancel={closeCreate}
            testID="my-exercises-create-form"
          />
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

// Re-exported for tests: the create response shape this screen posts to.
export { CustomExerciseResponseSchema };
