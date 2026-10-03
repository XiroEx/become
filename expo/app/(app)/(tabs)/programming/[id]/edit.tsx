import { useCallback, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import type { z } from "zod";
import { apiFetch, CustomProgramResponseSchema } from "@become/api-client";
import { Text } from "@/components/Text";
import { ProgramBuilder } from "@/components/programs/ProgramBuilder";
import { ScreenState } from "@/components/ScreenState";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { routeApiError } from "@/lib/errors";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { notifyProgramUpdated } from "@/lib/programs/programEvents";
import {
  fromCustomProgram,
  type CustomProgramBuilderPayload,
} from "@/lib/programs/programBuilder";

/**
 * EDIT A PROGRAM YOU BUILT (NP-168).
 *
 * Native counterpart of `webapp/app/dashboard/programs/[programId]/edit`:
 * `GET /api/programs/custom/[programId]` (owner-only) fills the builder,
 * `PUT` saves it back. The web page is the admin `ProgramCreator` in
 * `user-edit` mode and goes to the same two routes.
 *
 * TWO THINGS TRAVEL WITH AN EDIT:
 *
 *   • NO DRAFT. The server's copy is the truth here, exactly as in the web
 *     builder (its edit modes skip both draft effects): a stale local copy
 *     would quietly revert a change made on another device.
 *   • EXERCISES ARE EDITED, NOT JUST CARRIED. The GET answers HYDRATED
 *     exercises and the PUT runs the body back through `dehydrateProgram`, so
 *     the rows the frame used to send back unchanged are now the rows the
 *     member edits (NP-171): search picker, prescription, notes and removal.
 *     Reorder and grouping stay untouched for NP-172.
 */
export default function EditProgramRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { token } = useAuth();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  // `z.infer` spelled out: bare `useFetch(path, schema)` infers `{}` under
  // this repo's zod/TS pairing, as every other screen here notes.
  const program = useFetch<z.infer<typeof CustomProgramResponseSchema>>(
    id ? `/api/programs/custom/${encodeURIComponent(id)}` : null,
    CustomProgramResponseSchema,
    { ...fetchOpts, skip: !token || !id },
  );

  const initialState = useMemo(
    () => (program.data ? fromCustomProgram(program.data) : null),
    [program.data],
  );

  const onSubmit = useCallback(
    async (payload: CustomProgramBuilderPayload) => {
      if (!id) return;
      setSaving(true);
      setError(null);
      try {
        await apiFetch(
          `/api/programs/custom/${encodeURIComponent(id)}`,
          CustomProgramResponseSchema,
          { method: "PUT", body: payload, ...fetchOpts },
        );
        notifyProgramUpdated();
        router.replace(`/(tabs)/programming/${encodeURIComponent(id)}`);
      } catch (err) {
        const { handled, message } = routeApiError(err, {
          onPlanGate: (gate) => {
            showUpgradeSheet(gate.gate);
          },
        });
        if (!handled) setError(message);
      } finally {
        setSaving(false);
      }
    },
    [fetchOpts, id, router],
  );

  const retry = useCallback(() => {
    void program.refetch();
  }, [program]);

  if (!id) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
        testID="programming-edit-route"
      >
        <View style={{ padding: 16 }}>
          <Text testID="programming-edit-missing-id" className="text-destructive">
            Missing program id
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="programming-edit-route"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable
              testID="programming-edit-back"
              accessibilityRole="button"
              accessibilityLabel="Back to the program"
              onPress={() => router.back()}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <ChevronLeft size={20} color={colors.foreground} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text className="text-foreground text-2xl font-bold">
                Edit program
              </Text>
              <Text className="text-muted-foreground text-sm">
                {program.data?.name ?? "Your program"}
              </Text>
            </View>
          </View>

          <ScreenState
            loading={program.loading && !program.data}
            error={program.error}
            hasData={Boolean(initialState)}
            onRetry={retry}
            serverErrorMessage="Couldn't load this program."
            testID="programming-edit-screen-state"
          >
            {initialState ? (
              <ProgramBuilder
                mode="edit"
                initialState={initialState}
                saving={saving}
                error={error}
                onSubmit={onSubmit}
                onCancel={() => router.back()}
                testID="program-builder"
              />
            ) : null}
          </ScreenState>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
