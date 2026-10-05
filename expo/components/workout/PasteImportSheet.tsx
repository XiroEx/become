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
 * File upload (`expo-document-picker`) is NOT wired up: it is not yet a
 * dependency of `expo/`, and the card says paste-only in that case. Paste is
 * the only way in; a note under the field says so rather than silently
 * omitting the "Choose a file" button the web has.
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
import { ActivityIndicator, View } from "react-native";
import { Text } from "@/components/Text";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

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
  testID?: string;
}

// The web's copy, same placeholder in both flows (ImportSessionFlow.tsx /
// ImportProgramFlow.tsx) — a few example lines, not a real prescription.
const PLACEHOLDER = "Bench Press 4x8\nOverhead Press 3x10\nLat Pulldown 3x12\n...";

// NP-242's `rate_limited` carries no message of its own (a deliberately
// upsell-free refusal) — the sheet supplies the plain try-again-later line.
const RATE_LIMITED_MESSAGE = "You've used today's import limit. Try again later.";
const UNEXPECTED_ERROR_MESSAGE = "Couldn't reach the import AI. Try again in a minute.";

type Phase = { step: "paste" } | { step: "loading" } | { step: "error"; message: string };

export function PasteImportSheet({
  visible,
  kind,
  onSubmit,
  onClose,
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

  const submit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || phase.step === "loading") return;
    setPhase({ step: "loading" });
    try {
      const outcome = await onSubmit(trimmed);
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
  }, [text, phase.step, onSubmit, close]);

  const loadingLabel = kind === "program" ? "Reading your program…" : "Reading your session…";
  const submitLabel = kind === "program" ? "Import program" : "Import session";

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={kind === "program" ? "Import a program" : "Import a session"}
      testID={testID}
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
          {/* expo-document-picker is not yet a dependency — paste only for
              now (see the module docblock). */}
          <Text
            testID={`${testID}-paste-only-note`}
            className="text-muted-foreground text-xs"
          >
            Paste only for now — file upload is coming in a later update.
          </Text>
          <Button
            testID={`${testID}-submit`}
            accessibilityLabel={submitLabel}
            disabled={!text.trim()}
            onPress={() => void submit()}
          >
            {submitLabel}
          </Button>
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
    </BottomSheet>
  );
}
