import { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Lock, Plus } from "lucide-react-native";
import type { z } from "zod";
import {
  CustomProgramDeleteResponseSchema,
  CustomProgramsResponseSchema,
  ProgramEnrollResponseSchema,
  type CustomProgram,
} from "@become/api-client";
import { MyPrograms } from "@/components/programs/MyPrograms";
import { EnrollmentModal } from "@/components/programs/EnrollmentModal";
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
import { apiFetch } from "@become/api-client";
import {
  customProgramDeletePath,
  programCreateDestination,
  programEditDestination,
  toCustomProgramSummary,
} from "@/lib/programs/customPrograms";
import { enrollProgram } from "@/lib/programs/enrollment";
import { notifyProgramUpdated } from "@/lib/programs/programEvents";
import { openWebSignedIn } from "@/lib/web/openWebSignedIn";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

/**
 * MY PROGRAMS — the member's own programs, on the phone (NP-135).
 *
 * Native counterpart of `webapp/app/dashboard/programs/mine/MyProgramsClient.tsx`:
 * `GET /api/programs/custom` lists what the member built on the web (plus
 * anything a trainer shared with them), every row enrols, owned rows delete
 * behind a confirm, and create + edit open the web editor signed in through
 * `openWebSignedIn` (NP-121) because the native builder (NP-168/171/172) does
 * not exist yet.
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
 *   • a shared row (`isOwner === false`) enrols but never edits or deletes;
 *     staff-only sharing to members stays on the web entirely.
 */
export default function MyProgramsRoute() {
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
  const custom = useFetch<z.infer<typeof CustomProgramsResponseSchema>>(
    "/api/programs/custom",
    CustomProgramsResponseSchema,
    {
      ...fetchOpts,
      skip: !token,
    },
  );

  const programs = useMemo(
    () => (custom.data?.programs ?? []).map(toCustomProgramSummary),
    [custom.data?.programs],
  );

  const {
    data: entitlements,
    canCreate,
    refresh: refreshEntitlements,
  } = useEntitlements();
  const mayCreate = canCreate("custom-programs");

  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [enrollTarget, setEnrollTarget] = useState<CustomProgram | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // A delete frees its slot server-side at once; coming back from the web
  // creator/editor (or from a delete on another device) must not paint a
  // stale list or a lock the member just cleared. Re-read on focus. `run` is
  // stable per path (useFetch memoises it), so this fires once per focus.
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

  // Create and edit go wherever `programCreateDestination` says (NP-168): the
  // native builder on a build that has the exercise rows (NP-171), the web
  // editor signed in until then. One decision, in one place, for both.
  const openCreate = useCallback(() => {
    if (!mayCreate && entitlements && entitlements.enforced !== false) {
      const entitlement = entitlements.features?.["custom-programs"] ?? null;
      showUpgradeSheet(
        syntheticGate(
          "custom-programs",
          entitlement?.requiresTier ?? "plus",
          entitlement,
        ),
      );
      return;
    }
    const destination = programCreateDestination();
    if (destination.surface === "native") {
      router.push(destination.route);
      return;
    }
    void openWebSignedIn(destination.path);
  }, [mayCreate, entitlements, router]);

  const openEdit = useCallback(
    (id: string) => {
      const destination = programEditDestination(id);
      if (destination.surface === "native") {
        router.push(destination.route);
        return;
      }
      void openWebSignedIn(destination.path);
    },
    [router],
  );

  const requestEnroll = useCallback(
    (id: string) => {
      const list: CustomProgram[] = custom.data?.programs ?? [];
      const raw = list.find((p) => (p.program_id ?? p._id) === id);
      if (raw) setEnrollTarget(raw);
    },
    [custom.data?.programs],
  );

  const confirmEnroll = useCallback(
    async (startDate: string) => {
      if (!enrollTarget) return;
      const id = enrollTarget.program_id ?? enrollTarget._id ?? "";
      setEnrollingId(id);
      setActionError(null);
      try {
        await enrollProgram(fetchOpts, { programId: id, startDate });
        setEnrollTarget(null);
        notifyProgramUpdated();
        router.push(`/(tabs)/programming/${encodeURIComponent(id)}/schedule`);
      } catch (err) {
        const message = handleFailure(err);
        if (message) setActionError(message);
      } finally {
        setEnrollingId(null);
      }
    },
    [enrollTarget, fetchOpts, handleFailure, router],
  );

  const deleteProgram = useCallback(
    async (id: string) => {
      setDeletingId(id);
      setActionError(null);
      try {
        await apiFetch(
          customProgramDeletePath(id),
          CustomProgramDeleteResponseSchema,
          { method: "DELETE", ...fetchOpts },
        );
        notifyProgramUpdated();
        await refetchList();
        // The slot is free the moment the row is gone. Re-read now, or the
        // 60s snapshot keeps the create control locked at a cap just cleared.
        await refreshEntitlements().catch(() => {});
      } catch (err) {
        const message = handleFailure(err);
        if (message) setActionError(message);
      } finally {
        setDeletingId(null);
      }
    },
    [refetchList, fetchOpts, handleFailure, refreshEntitlements],
  );

  const retryList = useCallback(() => {
    void refetchList();
  }, [refetchList]);

  const enrollWeeks = enrollTarget?.duration_weeks ?? 4;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="programming-mine-route"
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
          <Text className="text-foreground text-2xl font-bold">My programs</Text>
          <Pressable
            testID="my-programs-create"
            accessibilityRole="button"
            accessibilityLabel={
              mayCreate
                ? "Create a program on the web"
                : "Create a program — at your free limit"
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
          Programs you built yourself.
        </Text>

        {entitlements && entitlements.enforced !== false ? (
          <View style={{ paddingHorizontal: 16, marginBottom: 8, gap: 8 }}>
            <AllowanceCounter
              feature="custom-programs"
              testID="my-programs-allowance-counter"
            />
            <AllowanceLock
              feature="custom-programs"
              onPress={(gate) => showUpgradeSheet(gate)}
              testID="my-programs-allowance-lock"
            />
          </View>
        ) : null}

        {actionError ? (
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <Text
              testID="my-programs-error"
              accessibilityRole="alert"
              className="text-destructive text-xs"
            >
              {actionError}
            </Text>
          </View>
        ) : null}

        <ScreenState
          loading={custom.loading}
          error={custom.error}
          empty={!custom.loading && !custom.error && programs.length === 0}
          hasData={programs.length > 0}
          onRetry={retryList}
          emptyTitle="No custom programs yet"
          emptyMessage="Build your own training program tailored to your goals."
          testID="my-programs-screen-state"
        >
          <MyPrograms
            programs={programs}
            onEnroll={requestEnroll}
            onDelete={deleteProgram}
            onItemPress={(id) =>
              router.push(`/(tabs)/programming/${encodeURIComponent(id)}`)
            }
            onEdit={openEdit}
            onCreate={openCreate}
            enrollingId={enrollingId}
            deletingId={deletingId}
          />
        </ScreenState>
      </ScrollView>

      <EnrollmentModal
        visible={enrollTarget !== null}
        programName={enrollTarget?.name}
        durationWeeks={
          typeof enrollWeeks === "number" ? enrollWeeks : 4
        }
        onConfirm={(date) => void confirmEnroll(date)}
        onClose={() => (enrollingId ? undefined : setEnrollTarget(null))}
        loading={enrollingId !== null}
        testID="my-programs-enroll-modal"
      />
    </SafeAreaView>
  );
}

// Re-exported for tests: the enrol response shape this screen posts to.
export { ProgramEnrollResponseSchema };
