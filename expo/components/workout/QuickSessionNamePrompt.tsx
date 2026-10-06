import React, { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { Dumbbell, X } from "lucide-react-native";
import { Text } from "@/components/Text";
import { isDefaultQuickSessionName } from "@become/core";
import { modalAnimation, useReducedMotion } from "@/lib/a11y/reducedMotion";
import { scrimByMode } from "@/lib/theme/tokens";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface QuickSessionNamePromptProps {
  initialName?: string;
  confirmLabel: string;
  tone?: "surface" | "dark";
  /**
   * The name to save under when the member exits without typing one — the day
   * the work was actually done, e.g. "9/9/26 workout" (see
   * `fallbackQuickSessionName`). Supplied together with `onSkip`; with neither,
   * the prompt keeps its older shape where the only way past it is a name.
   */
  fallbackName?: string;
  onConfirm: (title: string) => void | Promise<void>;
  /**
   * Finish exactly as `onConfirm` would, but under `fallbackName`. Wired to the
   * close button and to dismissal (hardware back / backdrop / VoiceOver
   * scrub), mirroring the web's Escape handling, because "let me out of this
   * box" has to still save the workout — being trapped here was losing
   * finished sessions.
   */
  onSkip?: (title: string) => void | Promise<void>;
  onCancel: () => void;
  testID?: string;
}

/**
 * Native port of `webapp/components/workout/QuickSessionNamePrompt.tsx`.
 *
 * Same contract: the input starts empty when `initialName` is still product
 * copy ("Quick Session", "Workout Now"), Confirm stays disabled while the
 * title is blank, a default name, or a save is in flight, Skip (and the close
 * button) finish under `fallbackName`, Back only dismisses, and a rejected
 * save keeps the prompt open with its error.
 *
 * Built on the raw RN `Modal` + backdrop/card `Pressable` pair, the way
 * `ConfirmModal` (used by `ResumeWorkoutPill`'s confirm dialog) is built.
 */
export function QuickSessionNamePrompt({
  initialName = "",
  confirmLabel,
  tone = "surface",
  fallbackName,
  onConfirm,
  onSkip,
  onCancel,
  testID = "quick-session-name-prompt",
}: QuickSessionNamePromptProps) {
  // Default product copy is not a useful editable starting value. An already
  // meaningful name is retained for defensive reuse of this component.
  const [title, setTitle] = useState(() =>
    isDefaultQuickSessionName(initialName) ? "" : initialName.trim(),
  );
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const { colors, tint } = useThemeTokens();
  // The web's dark tone is a heavier scrim over the same sheet; both tones
  // come from the token file (NP-123), never a hand-written rgba().
  const backdrop = tone === "dark" ? scrimByMode.dark : scrimByMode.light;
  const busy = saving || skipping;
  const canSkip = Boolean(onSkip && fallbackName);
  const confirmDisabled =
    !title.trim() || isDefaultQuickSessionName(title) || busy;

  const skip = useCallback(async () => {
    if (!onSkip || !fallbackName || busy) return;
    setSkipping(true);
    setError(null);
    try {
      await onSkip(fallbackName);
    } catch (cause) {
      // Only on failure: a success unmounts this, and clearing the flag first
      // would flash the buttons back to life on the way out.
      setError(
        cause instanceof Error ? cause.message : "Could not save the workout",
      );
      setSkipping(false);
    }
  }, [busy, fallbackName, onSkip]);

  const submit = useCallback(async () => {
    const next = title.trim();
    if (!next || isDefaultQuickSessionName(next) || busy) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirm(next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the workout name",
      );
      setSaving(false);
    }
  }, [busy, onConfirm, title]);

  const dismiss = useCallback(() => {
    if (busy) return;
    // The web's Escape: "get me out of here" still finishes the workout when
    // there is a name to fall back on, otherwise it returns to the workout.
    if (canSkip) void skip();
    else onCancel();
  }, [busy, canSkip, onCancel, skip]);

  return (
    <Modal
      visible
      onRequestClose={dismiss}
      transparent
      animationType={modalAnimation("fade", reduceMotion)}
      testID={testID}
    >
      {/* Every screen with a TextInput wraps its content in this (IOS_QUIRKS
          "Keyboard avoiding"); this centered Modal had not, so the keyboard
          covered Confirm/Back/Skip the moment the input focused. iOS gets
          `padding` to lift the card above the keyboard; Android's default
          `windowSoftInputMode` already resizes the window. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <Pressable
          testID={`${testID}-backdrop`}
          onPress={dismiss}
          accessible={false}
          importantForAccessibility="no"
          className="flex-1 items-center justify-center px-6"
          style={{ backgroundColor: backdrop }}
        >
          <Pressable
          testID={`${testID}-card`}
          accessibilityRole="alert"
          accessibilityViewIsModal
          accessibilityLabel="Name this workout"
          onAccessibilityEscape={dismiss}
          onPress={() => {
            /* swallow card taps */
          }}
          className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm shadow-2xl"
        >
          {canSkip ? (
            <Pressable
              testID={`${testID}-close`}
              accessibilityRole="button"
              accessibilityLabel={`Close and save as ${fallbackName}`}
              disabled={busy}
              accessibilityState={{ disabled: busy }}
              onPress={() => void skip()}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 18,
                opacity: busy ? 0.5 : 1,
              }}
            >
              <X size={20} color={colors["muted-foreground"]} />
            </Pressable>
          ) : null}

          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: tint("success", 0.15),
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Dumbbell size={20} color={colors.success} />
          </View>

          <Text className="text-[11px] font-bold uppercase tracking-wider text-emerald-500 mb-1">
            Save for next time
          </Text>

          <Text
            testID={`${testID}-title`}
            accessibilityRole="header"
            className="text-foreground text-xl font-bold mb-2"
          >
            Name this workout
          </Text>

          <Text
            testID={`${testID}-description`}
            className="text-muted-foreground text-sm leading-5 mb-5"
          >
            Give this session a name you&apos;ll recognize in your workout
            history.
          </Text>

          <Text className="text-foreground text-xs font-semibold mb-1.5">
            Workout name
          </Text>
          <TextInput
            testID={`${testID}-input`}
            accessibilityLabel="Workout name"
            autoFocus
            maxLength={80}
            value={title}
            onChangeText={setTitle}
            placeholder="Thursday Push"
            placeholderTextColor={colors["muted-foreground"]}
            className="w-full rounded-xl border border-border bg-card px-3.5 py-3 text-base font-semibold text-foreground"
          />

          {error ? (
            <Text
              testID={`${testID}-error`}
              accessibilityRole="alert"
              className="text-destructive text-sm mt-3"
            >
              {error}
            </Text>
          ) : null}

          <View className="flex-col gap-2 mt-4">
            <Pressable
              testID={`${testID}-confirm`}
              accessibilityRole="button"
              accessibilityLabel={saving ? "Saving…" : confirmLabel}
              disabled={confirmDisabled}
              accessibilityState={{ disabled: confirmDisabled }}
              onPress={() => void submit()}
              className="rounded-xl px-4 py-3 bg-emerald-600 active:bg-emerald-700 items-center justify-center"
              style={{ opacity: confirmDisabled ? 0.5 : 1 }}
            >
              <Text className="text-white font-bold text-sm">
                {saving ? "Saving…" : confirmLabel}
              </Text>
            </Pressable>

            <Pressable
              testID={`${testID}-cancel`}
              accessibilityRole="button"
              accessibilityLabel="Back"
              disabled={busy}
              accessibilityState={{ disabled: busy }}
              onPress={onCancel}
              className="rounded-xl px-4 py-3 bg-muted border border-border items-center justify-center"
              style={{ opacity: busy ? 0.5 : 1 }}
            >
              <Text className="text-foreground font-semibold text-sm">Back</Text>
            </Pressable>
          </View>

          {canSkip ? (
            <Pressable
              testID={`${testID}-skip`}
              accessibilityRole="button"
              accessibilityLabel={`Skip, save as \u201c${fallbackName}\u201d`}
              disabled={busy}
              accessibilityState={{ disabled: busy }}
              onPress={() => void skip()}
              className="w-full items-center justify-center px-4 py-2.5 mt-1"
              style={{ opacity: busy ? 0.5 : 1 }}
            >
              <Text className="text-muted-foreground text-sm font-semibold underline">
                {skipping
                  ? "Saving…"
                  : `Skip, save as \u201c${fallbackName}\u201d`}
              </Text>
            </Pressable>
          ) : null}
        </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default QuickSessionNamePrompt;
