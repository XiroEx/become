/**
 * ─── IMPORT A PROGRAM: THE TWO DOORS (NP-281) ───────────────────────────────
 *
 * Native counterpart of `webapp/app/dashboard/programs/new/
 * ImportProgramFlow.tsx`, step for step: Back, "Import your program", then
 * `Paste text` and `Upload a file` (a `.txt` or `.md`), a reading state, and
 * an error state with Try again — after which the builder opens on the
 * imported program for review, which is the web's own promise ("You'll get a
 * chance to review and edit before saving").
 *
 * Paste reuses `PasteImportSheet` (NP-243) rather than re-implementing the
 * field; the file door is `pickProgramTextFile` (`lib/programs/
 * importProgramFile.ts`) and then the SAME `onImportText` the sheet submits
 * to, so both doors run one import path.
 */

import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { ArrowLeft, FileText, PencilLine, Upload } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import {
  PasteImportSheet,
  RATE_LIMITED_MESSAGE,
  UNEXPECTED_ERROR_MESSAGE,
  type ImportOutcome,
} from "@/components/workout/PasteImportSheet";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  pickProgramTextFile,
  type PickedImportFile,
} from "@/lib/programs/importProgramFile";

export interface ImportProgramFlowProps {
  /**
   * Runs the import (NP-242's `importProgramFromText`, already bound to the
   * caller's token). The CALLER handles `ok` — clearing the stale draft and
   * opening the builder on the imported program — exactly as the paste sheet
   * expects.
   */
  onImportText: (text: string) => Promise<ImportOutcome>;
  /** Back, from the first step: the chooser. */
  onCancel: () => void;
  /** Injected in tests; defaults to the real system file picker. */
  pickFile?: () => Promise<PickedImportFile>;
  testID?: string;
}

type Phase =
  | { step: "choose" }
  | { step: "loading" }
  | { step: "error"; message: string };

export function ImportProgramFlow({
  onImportText,
  onCancel,
  pickFile = pickProgramTextFile,
  testID = "program-import",
}: ImportProgramFlowProps) {
  const { colors } = useThemeTokens();
  const [phase, setPhase] = useState<Phase>({ step: "choose" });
  const [pasting, setPasting] = useState(false);

  /**
   * The file door. A cancelled picker is a no-op (the member is back on the
   * chooser, where they already were); every other refusal renders the web's
   * own words. `ok` is the caller's business — it has already navigated by
   * the time this resolves, so nothing is set on an unmounted screen.
   */
  const upload = useCallback(async () => {
    const picked = await pickFile();
    if (picked.status === "cancelled") return;
    if (picked.status === "error") {
      setPhase({ step: "error", message: picked.message });
      return;
    }
    setPhase({ step: "loading" });
    try {
      const outcome = await onImportText(picked.text);
      if (
        outcome.status === "ok" ||
        outcome.status === "consent" ||
        outcome.status === "gate"
      ) {
        // `consent` / `gate` raise their own full-screen prompt (NP-046 /
        // NP-052); a second message under them would be noise.
        setPhase({ step: "choose" });
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
  }, [onImportText, pickFile]);

  return (
    <View testID={testID} style={{ gap: 16 }}>
      <Pressable
        testID={`${testID}-back`}
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() =>
          phase.step === "choose" ? onCancel() : setPhase({ step: "choose" })
        }
        style={[
          minTouchTarget,
          {
            flexDirection: "row",
            alignItems: "center",
            alignSelf: "flex-start",
            gap: 6,
          },
        ]}
      >
        <ArrowLeft size={16} color={colors["muted-foreground"]} />
        <Text className="text-muted-foreground text-sm">Back</Text>
      </Pressable>

      {phase.step === "choose" ? (
        <View style={{ gap: 16 }}>
          <View style={{ gap: 8 }}>
            <Text className="text-foreground text-2xl font-bold">
              Import your program
            </Text>
            <Text className="text-muted-foreground text-sm">
              Already wrote your program somewhere else — Notes, a text file?
              Paste it in or upload it and we&apos;ll turn it into a program
              you can actually run in the app. You&apos;ll get a chance to
              review and edit before saving.
            </Text>
          </View>

          <View style={{ gap: 12 }}>
            <Pressable
              testID={`${testID}-paste`}
              accessibilityRole="button"
              accessibilityLabel="Paste text"
              accessibilityHint="Copy from Notes and paste it in"
              onPress={() => setPasting(true)}
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
                <PencilLine size={22} color={colors.mindset} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text className="text-foreground text-base font-semibold">
                  Paste text
                </Text>
                <Text className="text-muted-foreground text-sm">
                  Copy from Notes and paste it in
                </Text>
              </View>
            </Pressable>

            <Pressable
              testID={`${testID}-upload`}
              accessibilityRole="button"
              accessibilityLabel="Upload a file"
              accessibilityHint="A .txt or .md file"
              onPress={() => void upload()}
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
                  Upload a file
                </Text>
                <Text className="text-muted-foreground text-sm">
                  A .txt or .md file
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      ) : null}

      {phase.step === "loading" ? (
        <View
          testID={`${testID}-loading`}
          style={{ alignItems: "center", gap: 8, paddingVertical: 32 }}
        >
          <ActivityIndicator size="small" color={colors["muted-foreground"]} />
          <Text className="text-muted-foreground text-sm">
            Reading your program…
          </Text>
        </View>
      ) : null}

      {phase.step === "error" ? (
        <View
          testID={`${testID}-error`}
          style={{ alignItems: "center", gap: 12, paddingVertical: 24 }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.muted,
            }}
          >
            <FileText size={24} color={colors.destructive} />
          </View>
          <Text
            testID={`${testID}-error-message`}
            accessibilityRole="alert"
            className="text-foreground text-sm text-center"
          >
            {phase.message}
          </Text>
          <Button
            testID={`${testID}-retry`}
            accessibilityLabel="Try again"
            onPress={() => setPhase({ step: "choose" })}
          >
            Try again
          </Button>
        </View>
      ) : null}

      <PasteImportSheet
        visible={pasting}
        kind="program"
        onSubmit={onImportText}
        onClose={() => setPasting(false)}
        testID={`${testID}-paste-sheet`}
      />
    </View>
  );
}

export default ImportProgramFlow;
