import { useCallback, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, PencilLine, Upload } from "lucide-react-native";
import type { z } from "zod";
import { apiFetch, CustomProgramResponseSchema } from "@become/api-client";
import { Text } from "@/components/Text";
import { ProgramBuilder } from "@/components/programs/ProgramBuilder";
import { ImportProgramFlow } from "@/components/programs/ImportProgramFlow";
import type { ImportOutcome } from "@/components/workout/PasteImportSheet";
import { AllowanceCounter } from "@/components/entitlements/AllowanceCounter";
import { AllowanceLock } from "@/components/entitlements/AllowanceLock";
import { syntheticGate, useEntitlements } from "@/lib/entitlements";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { routeApiError } from "@/lib/errors";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { notifyProgramUpdated } from "@/lib/programs/programEvents";
import { importProgramFromText } from "@/lib/workout/importWorkoutRun";
import { importedToBuilderState } from "@/lib/programs/importedToBuilderState";
import type {
  CustomProgramBuilderPayload,
  ProgramBuilderState,
} from "@/lib/programs/programBuilder";
import {
  PROGRAM_CREATE_DRAFT_KEY,
  createProgramDraftStore,
} from "@/lib/programs/programDraft";

/**
 * BUILD A PROGRAM, ON THE PHONE (NP-168).
 *
 * Native counterpart of `webapp/app/dashboard/programs/new` — which renders
 * the chooser in `NewProgramClient.tsx` and then the admin `ProgramCreator`
 * in `user-create` mode — and it posts to the same route:
 * `POST /api/programs/custom`.
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
 *
 * THE CHOOSER (NP-281, NP-244's import behind it): the web does NOT open the
 * builder on this URL — it asks "Create a program: start from a blank
 * program, or import one you already wrote" and only then opens the editor
 * (`entryMode` in `NewProgramClient.tsx`). This screen now does the same, with
 * both of the web's doors into the import (`Paste text`, `Upload a file`) in
 * `ImportProgramFlow`. The custom-programs `canCreate` check still happens
 * before the import is offered — `atCap` hides the import card the same way
 * it already gates Save, and the cap sheet itself is unchanged. On a
 * successful import the stale scratch draft is cleared FIRST
 * (`draft.clear()`) so it cannot win a race with the mapped state —
 * `importedToBuilderState` turns the AI's `ImportedProgram` into
 * `ProgramBuilderState` — and the builder opens with that as `initialState`,
 * seeded before its own draft-read effect ever runs, so it never reads the
 * (now-cleared) disk at all.
 */

type EntryMode = "choose" | "scratch" | "import";

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
  const [entryMode, setEntryMode] = useState<EntryMode>("choose");
  const [importedState, setImportedState] = useState<ProgramBuilderState | null>(
    null,
  );

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

  /**
   * Submits pasted or uploaded text to NP-242's AI run. On `ok` the stale
   * scratch draft is cleared FIRST — it must never win a race with what was
   * just imported — and the mapped state becomes the builder's
   * `initialState`, which is also what opens the builder, so the import is
   * never adopted into whatever a scratch builder already had in React
   * state. A `gate` refusal raises the EXISTING upgrade path, same as the
   * Sessions hub's import does; every other outcome (`consent`,
   * `rate_limited`, `empty`, `error`) is left for the import flow itself to
   * render, and the member stays right here either way.
   */
  const handleImportSubmit = useCallback(
    async (text: string): Promise<ImportOutcome> => {
      const outcome = await importProgramFromText(text, fetchOpts);
      if (outcome.status === "ok") {
        await draft.clear();
        setImportedState(importedToBuilderState(outcome.program));
        setEntryMode("scratch");
      } else if (outcome.status === "gate") {
        showUpgradeSheet(outcome.gate);
      }
      return outcome;
    },
    [draft, fetchOpts],
  );

  /**
   * Leaving the builder by CANCEL throws the local draft away and returns to
   * the chooser. Keeping it is what made "Picked up where you left off" show
   * on a program the member had explicitly walked out of; the draft exists to
   * survive the OS killing the app, not to survive Cancel.
   */
  const onCancelBuilder = useCallback(() => {
    void draft.clear();
    setImportedState(null);
    setEntryMode("choose");
  }, [draft]);

  // The web's own two headings: the chooser is "Create a program" with the
  // line under it, and the editor is the program itself. The import step
  // carries its own heading ("Import your program"), so the page header stays
  // out of its way.
  const headerTitle = entryMode === "scratch" ? "New program" : "Create a program";
  const headerSubtitle =
    entryMode === "choose"
      ? "Start from a blank program, or import one you already wrote."
      : entryMode === "scratch"
        ? "Your phases, your sessions, your program."
        : "";

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="programming-new-route"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* THE HEADER, fixed. It is also the keyboard's OUTSIDE TAP: a tap
            that lands here rather than on a control dismisses it, so Next and
            Save stop hiding under it. `accessible={false}` keeps this out of
            the a11y tree — it is a gesture target, not a button. */}
        <Pressable
          testID="programming-new-dismiss-keyboard"
          // Not a button: a gesture target that the a11y tree skips.
          accessibilityRole="none"
          accessible={false}
          onPress={() => Keyboard.dismiss()}
          style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}
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
                {headerTitle}
              </Text>
              {headerSubtitle ? (
                <Text className="text-muted-foreground text-sm">
                  {headerSubtitle}
                </Text>
              ) : null}
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
        </Pressable>

        {/* THE BUILDER SCROLLS ITSELF (its floating Save has to sit over the
            scroll, not in it), so it is a flex child here rather than another
            ScrollView's content — a `flex: 1` view inside a ScrollView has no
            height at all. The chooser and the import, which are short, keep
            their own scroll. */}
        {entryMode === "scratch" ? (
          <ProgramBuilder
            // Flips when an import lands, forcing a fresh mount: the new
            // instance's `initialState` is non-null from its very first
            // render, so it is seeded before its own draft-read effect ever
            // fires and never reads the (now-cleared) scratch draft at all.
            key={importedState ? "imported" : "scratch"}
            mode="create"
            initialState={importedState}
            draft={draft}
            locked={atCap}
            saving={saving}
            error={error}
            onSubmit={onSubmit}
            onCancel={onCancelBuilder}
            testID="program-builder"
          />
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <Pressable
              testID="programming-new-dismiss-keyboard-body"
              // Not a button: a gesture target that the a11y tree skips.
              accessibilityRole="none"
              accessible={false}
              onPress={() => Keyboard.dismiss()}
              style={{ gap: 16 }}
            >
              {/* ── The chooser, the web's own two cards ─────────────────── */}
              {entryMode === "choose" ? (
                <View testID="programming-new-entry-choice" style={{ gap: 12 }}>
                  <Pressable
                    testID="programming-new-entry-scratch"
                    accessibilityRole="button"
                    accessibilityLabel="Start from scratch"
                    accessibilityHint="Build it step by step in the editor"
                    onPress={() => {
                      setImportedState(null);
                      setEntryMode("scratch");
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 16,
                      borderRadius: 16,
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: colors.muted,
                      }}
                    >
                      <PencilLine size={22} color={colors.foreground} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text className="text-foreground text-base font-semibold">
                        Start from scratch
                      </Text>
                      <Text className="text-muted-foreground text-sm">
                        Build it step by step in the editor
                      </Text>
                    </View>
                  </Pressable>

                  {!atCap ? (
                    <Pressable
                      testID="programming-new-entry-import"
                      accessibilityRole="button"
                      accessibilityLabel="Import a program"
                      accessibilityHint="Paste text, or upload a file"
                      onPress={() => setEntryMode("import")}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        padding: 16,
                        borderRadius: 16,
                        backgroundColor: colors.card,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: colors.muted,
                        }}
                      >
                        <Upload size={22} color={colors.mindset} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text className="text-foreground text-base font-semibold">
                          Import a program
                        </Text>
                        <Text className="text-muted-foreground text-sm">
                          Paste text, or upload a file
                        </Text>
                      </View>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {entryMode === "import" ? (
                <ImportProgramFlow
                  onImportText={handleImportSubmit}
                  onCancel={() => setEntryMode("choose")}
                  testID="programming-new-import"
                />
              ) : null}
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
