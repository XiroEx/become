import React, { useEffect } from "react";
import {
  Modal as RNModal,
  Pressable,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import {
  celebrationHaptic,
  type HapticFn,
} from "@/lib/feedback/haptics";
import {
  modalAnimation,
  useReducedMotion,
} from "@/lib/a11y/reducedMotion";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export const MILESTONE_LABELS: Record<number, string> = {
  3: "3-Day Streak",
  7: "1-Week Streak",
  14: "2-Week Streak",
  30: "1-Month Streak",
  50: "50-Day Streak",
  100: "100-Day Streak",
  200: "200-Day Streak",
  365: "1-Year Streak",
};

export const MILESTONE_MESSAGES: Record<number, string> = {
  3: "Three days straight. Momentum is building.",
  7: "A full week. Most people quit before this.",
  14: "Two weeks. You're forming a real habit now.",
  30: "One month. This is who you are now.",
  50: "50 days. Undeniable consistency.",
  100: "100 days. You're built different.",
  200: "200 days. You're an inspiration.",
  365: "One full year. Legendary.",
};

export interface StreakMilestoneModalProps {
  visible?: boolean;
  milestone: number | null;
  streakDays: number;
  onClose: () => void;
  haptic?: HapticFn;
  testID?: string;
}

export function StreakMilestoneModal({
  visible,
  milestone,
  streakDays,
  onClose,
  haptic = celebrationHaptic,
  testID = "streak-milestone-modal",
}: StreakMilestoneModalProps) {
  const isOpen = visible !== undefined ? visible : milestone !== null && milestone > 0;
  const reduceMotion = useReducedMotion();
  const { colors, scrim } = useThemeTokens();

  useEffect(() => {
    if (isOpen && milestone) {
      haptic();
    }
  }, [isOpen, milestone, haptic]);

  if (!isOpen || !milestone) {
    return null;
  }

  const label = MILESTONE_LABELS[milestone] ?? `${milestone}-Day Streak`;
  const message =
    MILESTONE_MESSAGES[milestone] ??
    "You're on a serious run. Keep going.";

  return (
    <RNModal
      visible={isOpen}
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
        style={{
          flex: 1,
          backgroundColor: scrim,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 20,
        }}
      >
        <Pressable
          testID={`${testID}-card`}
          accessibilityRole="alert"
          accessibilityViewIsModal
          accessibilityLabel={`${label}! ${streakDays} days in a row.`}
          onAccessibilityEscape={onClose}
          onPress={() => {
            /* swallow card taps so they don't bubble to backdrop */
          }}
          className="w-full max-w-sm rounded-2xl bg-card border border-border overflow-hidden items-center shadow-2xl"
        >
          {/* Top glow accent bar */}
          <View
            testID={`${testID}-top-bar`}
            style={{
              height: 4,
              width: "100%",
              backgroundColor: colors.accent,
            }}
          />

          <View className="w-full px-6 py-7 items-center">
            {/* Fire icon / emoji */}
            <Text
              testID={`${testID}-fire`}
              className="text-6xl text-center mb-3"
              accessibilityLabel="Fire"
            >
              🔥
            </Text>

            <Text
              testID={`${testID}-label`}
              accessibilityRole="header"
              style={{ color: colors.accent }}
              className="text-2xl font-bold mb-1 text-center"
            >
              {label}!
            </Text>

            <Text
              testID={`${testID}-days`}
              className="text-5xl font-black text-foreground text-center mb-1"
            >
              {streakDays}
            </Text>
            <Text className="text-sm text-muted-foreground text-center mb-4">
              days in a row
            </Text>

            <Text
              testID={`${testID}-message`}
              className="text-sm text-foreground/80 text-center leading-relaxed mb-6 px-2"
            >
              {message}
            </Text>

            <Pressable
              testID={`${testID}-button`}
              accessibilityRole="button"
              accessibilityLabel="Let's Keep Going"
              onPress={onClose}
              style={{
                width: "100%",
                borderRadius: 9999,
                backgroundColor: colors.accent,
                paddingVertical: 14,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: colors["accent-foreground"],
                  fontSize: 16,
                  fontWeight: "700",
                }}
              >
                Let&apos;s Keep Going
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

export default StreakMilestoneModal;
