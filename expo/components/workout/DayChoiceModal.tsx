import React from "react";
import { Modal, Pressable, View } from "react-native";
import { CalendarClock } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useReducedMotion, modalAnimation } from "@/lib/a11y/reducedMotion";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface DayChoiceModalProps {
  visible: boolean;
  /** YYYY-MM-DD the workout actually started on. */
  originalKey: string;
  /** YYYY-MM-DD "today" is, at the moment of finishing. */
  todayKey: string;
  onChoose: (chosenKey: string) => void;
  onClose?: () => void;
  testID?: string;
}

export function labelFor(dayKey: string): string {
  const parts = dayKey.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  // Noon, local-agnostic: dayKey is already the caller's local calendar day,
  // so there's no timezone left to shift it across when formatting.
  return new Date(y, m - 1, d, 12).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/**
 * Shown once, right at the end of a workout that started on one calendar day
 * and is being finished on another — the exact midnight-crossing case. Without
 * this the workout silently landed on whichever day the FIRST autosave
 * happened to fire on, with no way to say "actually, count this as today."
 */
export function DayChoiceModal({
  visible,
  originalKey,
  todayKey,
  onChoose,
  onClose,
  testID = "day-choice-modal",
}: DayChoiceModalProps) {
  const reduceMotion = useReducedMotion();
  const { colors, scrim, tint } = useThemeTokens();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      transparent
      animationType={modalAnimation("fade", reduceMotion)}
      testID={testID}
    >
      <Pressable
        testID={`${testID}-backdrop`}
        onPress={onClose}
        accessible={false}
        importantForAccessibility="no"
        className="flex-1 items-center justify-end px-4 pb-6 sm:justify-center"
        style={{ backgroundColor: scrim }}
      >
        <Pressable
          testID={`${testID}-card`}
          accessibilityRole="alert"
          accessibilityViewIsModal
          accessibilityLabel="Log this workout as which day?"
          onAccessibilityEscape={onClose}
          onPress={() => {
            /* swallow card taps */
          }}
          className="bg-card border border-border rounded-2xl p-5 w-full max-w-md shadow-2xl"
        >
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
            <CalendarClock size={20} color={colors.success} />
          </View>

          <Text className="text-[11px] font-bold uppercase tracking-wider text-emerald-500 mb-1">
            You went past midnight
          </Text>

          <Text
            testID={`${testID}-title`}
            accessibilityRole="header"
            className="text-foreground text-xl font-bold mb-2"
          >
            Log this workout as which day?
          </Text>

          <Text
            testID={`${testID}-description`}
            className="text-muted-foreground text-sm leading-5 mb-5"
          >
            You started this on {labelFor(originalKey)}. Pick which day it
            should count toward.
          </Text>

          <View className="flex-col gap-2">
            <Pressable
              testID={`${testID}-option-original`}
              accessibilityRole="button"
              accessibilityLabel={`When you started: ${labelFor(originalKey)}`}
              onPress={() => onChoose(originalKey)}
              className="rounded-xl p-4 border border-border bg-emerald-600 active:bg-emerald-700"
            >
              <Text className="text-white font-bold text-base">
                {labelFor(originalKey)}
              </Text>
              <Text className="text-emerald-100 text-xs mt-0.5 font-medium">
                When you started
              </Text>
            </Pressable>

            <Pressable
              testID={`${testID}-option-today`}
              accessibilityRole="button"
              accessibilityLabel={`Today: ${labelFor(todayKey)}`}
              onPress={() => onChoose(todayKey)}
              className="rounded-xl p-4 border border-border bg-muted active:opacity-80"
            >
              <Text className="text-foreground font-bold text-base">
                {labelFor(todayKey)}
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5 font-medium">
                Today
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default DayChoiceModal;
