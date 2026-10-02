import { useCallback, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import type { z } from "zod";
import { apiFetch, CustomProgramResponseSchema } from "@become/api-client";
import { Text } from "@/components/Text";
import { ProgramBuilder } from "@/components/programs/ProgramBuilder";
import { AllowanceCounter } from "@/components/entitlements/AllowanceCounter";
import { AllowanceLock } from "@/components/entitlements/AllowanceLock";
import { syntheticGate, useEntitlements } from "@/lib/entitlements";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { routeApiError } from "@/lib/errors";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { notifyProgramUpdated } from "@/lib/programs/programEvents";
import type { CustomProgramBuilderPayload } from "@/lib/programs/programBuilder";
import {
  PROGRAM_CREATE_DRAFT_KEY,
  createProgramDraftStore,
} from "@/lib/programs/programDraft";

/**
 * BUILD A PROGRAM, ON THE PHONE (NP-168).
 *
 * Native counterpart of `webapp/app/dashboard/programs/new` — which renders
 * the admin `ProgramCreator` in `user-create` mode — and it posts to the same
 * route: `POST /api/programs/custom`.
 *
 * THE THREE THINGS THIS SCREEN OWNS, and why they are here and not in the
 * builder component:
 *
 *   • THE QUOTA. `custom-programs` is a counted inventory cap (3 on the free
 *     tier). The check is `canCreate`, never `allowed` and never
 *     `limit - used`, and it happens BEFORE the request: a member at the cap
 *     gets the upgrade sheet (NP-052) and keeps their draft, instead of a
 *     round trip that ends in a 403. The server is still the gate — a 403 that
 *     arrives anyway goes through `routeApiError`, which raises the same sheet
 *     from the server's own words.
 *   • THE DRAFT. `createProgramDraftStore` writes to AsyncStorage after every
 *     change and is cleared only once the program exists on the server, so an
 *     app the OS killed mid-build reopens where it was.
 *   • WHERE THE MEMBER LANDS. On a 201 the response carries the
 *     server-minted `program_id`, which is the address of everything else
 *     (rule 2 of the program routes), so the new program's own screen is
 *     where this ends.
 */
export default function NewProgramRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();
  const {
    data: entitlements,
    canCreate,
    refresh: refreshEntitlements,
  } = useEntitlements();
  const mayCreate = canCreate("custom-programs");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  // One store for the life of the screen. The key is the WEB's key, so the
  // concept has one name across both clients.
  const draft = useMemo(
    () => createProgramDraftStore(PROGRAM_CREATE_DRAFT_KEY),
    [],
  );

  /** The cap, explained in the server's vocabulary rather than ours. */
  const raiseCapSheet = useCallback(() => {
    const entitlement = entitlements?.features?.["custom-programs"] ?? null;
    showUpgradeSheet(
      syntheticGate(
        "custom-programs",
        entitlement?.requiresTier ?? "plus",
        entitlement,
      ),
    );
  }, [entitlements]);

  const atCap = !mayCreate && Boolean(entitlements) && entitlements?.enforced !== false;

  const onSubmit = useCallback(
    async (payload: CustomProgramBuilderPayload) => {
      if (atCap) {
        raiseCapSheet();
        return;
      }
      setSaving(true);
      setError(null);
      try {
        // `z.infer` spelled out: a bare `apiFetch(path, schema)` infers `{}`
        // under this repo's zod/TS pairing (every other screen does the same).
        const created = await apiFetch<
          z.infer<typeof CustomProgramResponseSchema>
        >("/api/programs/custom", CustomProgramResponseSchema, {
          method: "POST",
          body: payload,
          ...fetchOpts,
        });
        // The program exists now: the draft has nothing left to protect.
        await draft.clear();
        notifyProgramUpdated();
        // A create spends a slot, so the shared snapshot is behind by one.
        await refreshEntitlements().catch(() => {});
        const id = created.program_id ?? created._id ?? "";
        if (id) {
          router.replace(`/(tabs)/programming/${encodeURIComponent(id)}`);
        } else {
          router.replace("/(tabs)/programming/mine");
        }
      } catch (err) {
        const { handled, message } = routeApiError(err, {
          onPlanGate: (gate) => {
            showUpgradeSheet(gate.gate);
          },
        });
        // A refusal means the snapshot disagrees with the server; re-read it
        // so the lock on this screen matches what just happened.
        await refreshEntitlements().catch(() => {});
        if (!handled) setError(message);
      } finally {
        setSaving(false);
      }
    },
    [atCap, draft, fetchOpts, raiseCapSheet, refreshEntitlements, router],
  );

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="programming-new-route"
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
              testID="programming-new-back"
              accessibilityRole="button"
              accessibilityLabel="Back to my programs"
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
                New program
              </Text>
              <Text className="text-muted-foreground text-sm">
                Your phases, your sessions, your program.
              </Text>
            </View>
          </View>

          {/* With enforcement off there is no counter, no lock and no sheet —
              `canCreate()` already answers true there (NP-049). */}
          {entitlements && entitlements.enforced !== false ? (
            <View style={{ gap: 8 }}>
              <AllowanceCounter
                feature="custom-programs"
                testID="programming-new-allowance-counter"
              />
              <AllowanceLock
                feature="custom-programs"
                onPress={(gate) => showUpgradeSheet(gate)}
                testID="programming-new-allowance-lock"
              />
            </View>
          ) : null}

          <ProgramBuilder
            mode="create"
            draft={draft}
            locked={atCap}
            saving={saving}
            error={error}
            onSubmit={onSubmit}
            onCancel={() => router.back()}
            testID="program-builder"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
