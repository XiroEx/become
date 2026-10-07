/**
 * ─── IMPORT FROM TEXT 3/4: THE PASTE-AND-IMPORT SHEET (NP-243) ──────────────
 *
 * Native port of the web's paste UI — `webapp/components/workout/
 * ImportSessionFlow.tsx` (and its program sibling,
 * `webapp/app/dashboard/programs/new/ImportProgramFlow.tsx`) — as ONE
 * reusable bottom sheet rather than two near-identical screens. The caller
 * (the Sessions hub today, the program import of NP-244 next) supplies
 * `onSubmit`, which should be `importSessionFromText` / `importProgramFromText`
 * (`expo/lib/workout/importWorkoutRun.ts`, NP-242) already bound to its own
 * `getToken`.
 *
 * `kind` only changes copy (the loading line and the submit label echo the
 * web's two flows' wording); the sheet itself does not know what an
 * `ImportOutcome`'s `ok` payload contains — the caller handles `ok` BEFORE
 * this sheet sees it (setting the handoff / navigating), and the outcome
 * returned from `onSubmit` is used here only to decide what to show.
 *
 * File upload: the PROGRAM import got it first, in NP-281 — not through
 * `expo-document-picker` but through `expo-file-system`'s own
 * `File.pickFileAsync` (`lib/programs/importProgramFile.ts`), offered as the
 * chooser's second door rather than a button inside this sheet. NP-279 closes
 * the gap for a SESSION import, which has no separate chooser screen (the web
 * flow it mirrors, `ImportSessionFlow.tsx`, puts an icon-only upload button
 * right next to the paste submit button) — so the same `pickProgramTextFile`
 * is offered here directly, inline, for `kind === "session"` only; the
 * program flow keeps its own door and does not render this one too.
 *
 * Android keyboard avoidance (NP-319): this sheet was not on NP-319's own
 * list even though it is rendered inside the same `BottomSheet` `Modal` every
 * other sheet on that list is — without a real Android `behavior` the
 * keyboard covered the paste field AND the submit button with no way to
 * reach either. Wrapped in `KeyboardAvoidingView` +
 * `behavior={Platform.OS === "ios" ? "padding" : "height"}` plus a
 * `ScrollView`, exactly the shape `EstimateSheet.tsx` / `BasketSheet.tsx` use.
 *
 * RULES THAT TRAVEL (from NP-242's own docblock):
 *   • `empty` / `error` render the outcome's own message, with Try again
 *     (back to the paste field) and Cancel (closes the sheet).
 *   • `rate_limited` carries no message of its own (a plain spend-cap
 *     refusal) — the sheet supplies the try-again-later copy.
 *   • `consent` closes the sheet outright: the consent prompt (NP-046) is
 *     already raised by `importSessionFromText`/`importProgramFromText`
 *     itself and takes over the screen — showing anything here on top of it
 *     would be a second prompt.
 *   • `gate` (an entitlement refusal) is not enumerated in the card's own
 *     list of outcomes this sheet renders; the caller is expected to raise
 *     the EXISTING upgrade path (same as NP-242's own docblock says), so this
 *     sheet treats it the same as `consent` — close and let that sheet take
 *     over — rather than inventing a second error state for it.
 *   • `ok` closes the sheet; the caller has already set the handoff and
 *     navigated by the time this sheet sees the resolved outcome.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Upload } from "lucide-react-native";
import { Text } from "@/components/Text";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  pickProgramTextFile,
  type PickedImportFile,
} from "@/lib/programs/importProgramFile";

/**
 * The outcome shape this sheet understands. The real outcomes
 * (`ImportSessionOutcome` / `ImportProgramOutcome` in
 * `expo/lib/workout/importWorkoutRun.ts`) carry extra fields on `ok`
 * (`session` / `program`) this sheet never reads, so they are passed through
 * structurally rather than imported — this file stays usable for either.
 */
export type ImportOutcome =
  | { status: "ok" }
  | { status: "consent" }
  | { status: "gate"; gate?: unknown }
  | { status: "rate_limited" }
  | { status: "empty"; message: string }
  | { status: "error"; message: string };

export interface PasteImportSheetProps {
  visible: boolean;
  kind: "session" | "program";
  onSubmit: (text: string) => Promise<ImportOutcome>;
  onClose: () => void;
  /**
   * The file door, `kind === "session"` only (NP-279) — injected in tests;
   * defaults to the real system file picker, the same one the program
   * chooser's "Upload a file" uses.
   */
  pickFile?: () => Promise<PickedImportFile>;
  testID?: string;
}

// The web's copy, same placeholder in both flows (ImportSessionFlow.tsx /
// ImportProgramFlow.tsx) — a few example lines, not a real prescription.
const PLACEHOLDER = "Bench Press 4x8\nOverhead Press 3x10\nLat Pulldown 3x12\n...";

// NP-242's `rate_limited` carries no message of its own (a deliberately
// upsell-free refusal) — the sheet supplies the plain try-again-later line.
// Exported since NP-281: the program import's FILE door renders the same two
// lines, and two copies of a sentence drift.
export const RATE_LIMITED_MESSAGE =
  "You've used today's import limit. Try again later.";
export const UNEXPECTED_ERROR_MESSAGE =
  "Couldn't reach the import AI. Try again in a minute.";

type Phase = { step: "paste" } | { step: "loading" } | { step: "error"; message: string };

export function PasteImportSheet({
  visible,
  kind,
  onSubmit,
  onClose,
  pickFile = pickProgramTextFile,
  testID = "paste-import-sheet",
}: PasteImportSheetProps) {
  const { colors } = useThemeTokens();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ step: "paste" });

  // A closed sheet reopens blank — reusing it for two imports in a row must
  // not show the previous attempt's pasted text or error line. `visible` is
  // a prop the parent flips, not something this effect derives for render.
  /* eslint-disable react-hooks/set-state-in-effect -- resets local state from the parent's visibility prop, not a value derivable during render */
  useEffect(() => {
    if (!visible) {
      setText("");
      setPhase({ step: "paste" });
    }
  }, [visible]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const close = useCallback(() => {
    setText("");
    setPhase({ step: "paste" });
    onClose();
  }, [onClose]);

  const retry = useCallback(() => {
    setPhase({ step: "paste" });
  }, []);

  // Shared by both doors (paste submit and, for a session, the file upload):
  // one run of `onSubmit`, one place the outcome is turned into a phase.
  const runImport = useCallback(
    async (value: string) => {
      setPhase({ step: "loading" });
      try {
        const outcome = await onSubmit(value);
        // `ok` and `consent` both close the sheet outright — see the module
        // docblock for why `gate` joins them rather than getting its own line.
        if (outcome.status === "ok" || outcome.status === "consent" || outcome.status === "gate") {
          close();
          return;
        }
        if (outcome.status === "rate_limited") {
          setPhase({ step: "error", message: RATE_LIMITED_MESSAGE });
          return;
        }
        setPhase({ step: "error", message: outcome.message });
      } catch {
        setPhase({ step: "error", message: UNEXPECTED_ERROR_MESSAGE });
      }
    },
    [onSubmit, close],
  );

  const submit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || phase.step === "loading") return;
    await runImport(trimmed);
  }, [text, phase.step, runImport]);

  // The file door (NP-279, session only — the program import's own chooser
  // already has one). A cancelled picker is a no-op; every other refusal
  // renders the web's own words, same as `ImportProgramFlow`'s upload.
  const upload = useCallback(async () => {
    if (phase.step === "loading") return;
    const picked = await pickFile();
    if (picked.status === "cancelled") return;
    if (picked.status === "error") {
      setPhase({ step: "error", message: picked.message });
      return;
    }
    await runImport(picked.text);
  }, [phase.step, pickFile, runImport]);

  const loadingLabel = kind === "program" ? "Reading your program…" : "Reading your session…";
  const submitLabel = kind === "program" ? "Import program" : "Import session";

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={kind === "program" ? "Import a program" : "Import a session"}
      testID={testID}
    >
      {/* NP-279/NP-319: real Android (and iOS) keyboard avoidance — this
          sheet sits inside `BottomSheet`'s own `Modal`, where targetSdk 35's
          edge-to-edge resize never reaches, so an Android `behavior` of
          `undefined` left the keyboard covering the paste field AND the
          submit button with no way to reach either. "height" is computed
          from the keyboard-show event, not a window resize, so it works
          inside the sheet too — see EstimateSheet.tsx / BasketSheet.tsx. */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          testID={`${testID}-body`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 8 }}
        >
          {phase.step === "paste" ? (
            <View style={{ gap: 12 }}>
              <Input
                testID={`${testID}-text`}
                label="Paste your workout"
                placeholder={PLACEHOLDER}
                value={text}
                onChangeText={setText}
                multiline
                numberOfLines={8}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityHint="Paste the exercises, one per line"
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    testID={`${testID}-submit`}
                    accessibilityLabel={submitLabel}
                    disabled={!text.trim()}
                    onPress={() => void submit()}
                  >
                    {submitLabel}
                  </Button>
                </View>
                {/* The file door (NP-279) — session only. The program
                    import's own chooser screen already offers "Upload a
                    file" as its second door, so this would be a second
                    affordance for the same thing there. */}
                {kind === "session" ? (
                  <Pressable
                    testID={`${testID}-upload`}
                    accessibilityRole="button"
                    accessibilityLabel="Upload a file instead"
                    accessibilityHint="A .txt or .md file"
                    onPress={() => void upload()}
                    style={[
                      minTouchTarget,
                      {
                        width: 44,
                        height: 44,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Upload size={18} color={colors["muted-foreground"]} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          {phase.step === "loading" ? (
            <View
              testID={`${testID}-loading`}
              style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}
            >
              <ActivityIndicator size="small" color={colors["muted-foreground"]} />
              <Text className="text-muted-foreground text-sm">{loadingLabel}</Text>
            </View>
          ) : null}

          {phase.step === "error" ? (
            <View
              testID={`${testID}-error`}
              style={{ alignItems: "center", gap: 12, paddingVertical: 8 }}
            >
              <Text
                testID={`${testID}-error-message`}
                accessibilityRole="alert"
                className="text-foreground text-sm text-center"
              >
                {phase.message}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  testID={`${testID}-retry`}
                  variant="secondary"
                  accessibilityLabel="Try again"
                  onPress={retry}
                >
                  Try again
                </Button>
                <Button
                  testID={`${testID}-cancel`}
                  variant="ghost"
                  accessibilityLabel="Cancel"
                  onPress={close}
                >
                  Cancel
                </Button>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}
