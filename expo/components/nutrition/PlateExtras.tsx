/**
 * ─── The plate review's save + feedback extras (native) ─────────────────────
 *
 * The review footer of the web's `SnapPlateModal.tsx` (`ReviewFooter` +
 * `GenerationFeedbackModal`): a "Save as meal" row that stays at the
 * custom-meals cap and opens the upgrade sheet from a `syntheticGate`, and a
 * "send feedback" line that opens the estimate-feedback sheet.
 *
 * The sheet never writes anything itself: `onSaveMeal` / `onSendFeedback`
 * hand the choice back to the screen, which makes the `plateSaveMeal` calls.
 * Until My Stuff exists natively (NP-142) the save confirms IN PLACE instead
 * of opening the meal page.
 */

import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { Check, Lock, Plus, Send, X } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface PlateExtrasProps {
  /** The review's live rows — drives the item count and the save button. */
  activeCount: number;
  /**
   * Saved-meal slots are full. Explanatory only — the server is the gate.
   * Unlike the basket/combine sheets the button STAYS at the cap and opens
   * the upgrade sheet from a synthetic gate.
   */
  mealsAtCap: boolean;
  /** Tapped "Save as meal" while capped. */
  onCappedSave: () => void;
  /** Keep the plate as a reusable meal. Resolves true on success. */
  onSaveMeal: (name: string) => Promise<boolean>;
  /** Report a bad estimate. Resolves true on success. */
  onSendFeedback: (message: string) => Promise<boolean>;
  testID?: string;
}

export function PlateExtras({
  activeCount,
  mealsAtCap,
  onCappedSave,
  onSaveMeal,
  onSendFeedback,
  testID = "plate-extras",
}: PlateExtrasProps) {
  const { colors } = useThemeTokens();
  const [saveOpen, setSaveOpen] = useState(false);
  const [mealName, setMealName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const submitSave = async () => {
    if (!mealName.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const ok = await onSaveMeal(mealName);
      if (ok) {
        // Confirm in place (NP-142): no meal page exists natively yet.
        setSavedName(mealName.trim());
        setSaveOpen(false);
        setMealName("");
      }
    } catch (err) {
      setSaveError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't save meal. Check your connection.",
      );
    } finally {
      setSaving(false);
    }
  };

  const submitFeedback = async () => {
    if (!feedbackText.trim() || sending) return;
    setSending(true);
    setFeedbackError(null);
    try {
      const ok = await onSendFeedback(feedbackText);
      if (ok) {
        setSent(true);
        setFeedbackText("");
      } else {
        setFeedbackError("Could not send feedback. Try again in a moment.");
      }
    } catch {
      setFeedbackError("Could not send feedback. Try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  const closeFeedback = () => {
    setFeedbackOpen(false);
    setFeedbackText("");
    setSent(false);
    setSending(false);
    setFeedbackError(null);
  };

  return (
    <View testID={testID}>
      {savedName ? (
        <View
          testID={`${testID}-saved`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: colors.muted,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginTop: 8,
          }}
        >
          <Check size={16} color={colors.success} />
          <Text className="text-foreground text-xs font-semibold flex-1" numberOfLines={2}>
            Saved &ldquo;{savedName}&rdquo; to your meals
          </Text>
        </View>
      ) : null}
      {saveOpen ? (
        <View testID={`${testID}-save-form`} style={{ flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Input
              testID={`${testID}-save-name`}
              placeholder="Meal name"
              value={mealName}
              onChangeText={(v) => {
                setMealName(v);
                if (saveError) setSaveError(null);
              }}
              accessibilityLabel="Meal name"
              editable={!saving}
              onSubmitEditing={() => void submitSave()}
              returnKeyType="done"
            />
          </View>
          <Button
            testID={`${testID}-save-confirm`}
            onPress={() => void submitSave()}
            disabled={!mealName.trim() || saving}
            loading={saving}
          >
            Save
          </Button>
          <Pressable
            testID={`${testID}-save-cancel`}
            accessibilityRole="button"
            accessibilityLabel="Cancel saving meal"
            disabled={saving}
            onPress={() => {
              setSaveOpen(false);
              setMealName("");
              setSaveError(null);
            }}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
              opacity: saving ? 0.4 : 1,
            }}
          >
            <X size={16} color={colors.foreground} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          testID={`${testID}-save`}
          accessibilityRole="button"
          accessibilityLabel={mealsAtCap ? "Save as meal (Plus)" : "Save as meal"}
          disabled={activeCount === 0}
          onPress={() => (mealsAtCap ? onCappedSave() : setSaveOpen(true))}
          style={{
            marginTop: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 8,
            opacity: activeCount === 0 ? 0.5 : 1,
          }}
        >
          {mealsAtCap ? (
            <Lock size={14} color={colors["muted-foreground"]} />
          ) : (
            <Plus size={14} color={colors["muted-foreground"]} />
          )}
          <Text className="text-muted-foreground text-xs font-semibold">Save as meal</Text>
        </Pressable>
      )}
      {saveError ? (
        <Text
          testID={`${testID}-save-error`}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          className="text-destructive text-xs mt-1 text-center"
        >
          {saveError}
        </Text>
      ) : null}
      <View
        style={{
          marginTop: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.muted,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <Text className="text-muted-foreground text-xs">
          These foods are a best guess. Check portions before logging, and send feedback if
          this estimate missed.
        </Text>
        <Pressable
          testID={`${testID}-feedback-open`}
          accessibilityRole="button"
          accessibilityLabel="Send feedback about this estimate"
          onPress={() => setFeedbackOpen(true)}
          style={{ alignSelf: "flex-start", paddingVertical: 4 }}
        >
          <Text
            className="text-xs font-semibold underline"
            style={{ color: colors.success }}
          >
            Send feedback
          </Text>
        </Pressable>
      </View>

      <BottomSheet
        visible={feedbackOpen}
        onClose={closeFeedback}
        title="Improve this estimate"
        testID={`${testID}-feedback`}
        accessibilityLabel="Improve this estimate"
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
            {sent ? (
              <View
                testID={`${testID}-feedback-sent`}
                style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: colors.muted,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Check size={20} color={colors.success} />
                </View>
                <Text className="text-foreground text-sm font-semibold">Feedback saved</Text>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: colors.muted,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Send size={16} color={colors.success} />
                  </View>
                  <Text className="text-muted-foreground text-xs flex-1">
                    Tell us what was wrong. We will save it with this generated food list.
                  </Text>
                </View>
                <Input
                  testID={`${testID}-feedback-input`}
                  placeholder="Example: It was 6 tacos, not 2, and the chips were a small handful."
                  value={feedbackText}
                  onChangeText={(v) => {
                    setFeedbackText(v);
                    if (feedbackError) setFeedbackError(null);
                  }}
                  multiline
                  numberOfLines={4}
                  maxLength={2000}
                  accessibilityLabel="What was wrong with this estimate"
                  editable={!sending}
                />
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Text className="text-muted-foreground text-xs flex-1">{feedbackText.length}/2000</Text>
                  <Button
                    testID={`${testID}-feedback-send`}
                    onPress={() => void submitFeedback()}
                    disabled={!feedbackText.trim() || sending}
                    loading={sending}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Send size={14} color={colors["primary-foreground"]} />
                      <Text className="text-primary-foreground text-sm font-semibold">Send</Text>
                    </View>
                  </Button>
                </View>
                {feedbackError ? (
                  <Text
                    testID={`${testID}-feedback-error`}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="assertive"
                    className="text-destructive text-xs"
                  >
                    {feedbackError}
                  </Text>
                ) : null}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </BottomSheet>
    </View>
  );
}

export default PlateExtras;
