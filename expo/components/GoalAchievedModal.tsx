import React, { useEffect } from "react";
import {
  Modal as RNModal,
  Pressable,
  View,
} from "react-native";
import { Trophy } from "lucide-react-native";
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
import type { GoalReached } from "@become/api-client";

export function formatWeightWithUnit(n: number, unit: string): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${s} ${unit}`;
}

export interface GoalAchievedModalProps {
  visible?: boolean;
  reached: GoalReached | null;
  onClose: () => void;
  onSetNextGoal?: () => void;
  haptic?: HapticFn;
  testID?: string;
}

export function GoalAchievedModal({
  visible,
  reached,
  onClose,
  onSetNextGoal,
  haptic = celebrationHaptic,
  testID = "goal-achieved-modal",
}: GoalAchievedModalProps) {
  const isOpen = visible !== undefined ? visible : reached !== null;
  const reduceMotion = useReducedMotion();
  const { colors, tint, scrim } = useThemeTokens();

  useEffect(() => {
    if (isOpen && reached) {
      haptic();
    }
  }, [isOpen, reached, haptic]);

  if (!isOpen || !reached) {
    return null;
  }

  const verb = reached.direction === "lose" ? "lost" : "gained";
  const days = reached.days;
  const timeline =
    days > 0
      ? `${formatWeightWithUnit(reached.totalChange, reached.unit)} ${verb} in ${days} day${days === 1 ? "" : "s"}.`
      : `${formatWeightWithUnit(reached.totalChange, reached.unit)} ${verb}.`;

  const handleSetNext = () => {
    if (onSetNextGoal) {
      onSetNextGoal();
    } else {
      onClose();
    }
  };

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
          accessibilityLabel={`Goal Reached! Current weight ${formatWeightWithUnit(reached.currentWeight, reached.unit)}.`}
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
              backgroundColor: colors.success,
            }}
          />

          <View className="w-full px-6 py-7 items-center">
            {/* Trophy Icon */}
            <View
              testID={`${testID}-trophy-badge`}
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: tint("success", 0.15),
                borderWidth: 3,
                borderColor: tint("success", 0.3),
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Trophy size={36} color={colors.success} />
            </View>

            <Text
              testID={`${testID}-headline`}
              accessibilityRole="header"
              style={{ color: colors.success }}
              className="text-2xl font-bold mb-1 text-center"
            >
              Goal Reached!
            </Text>

            <Text
              testID={`${testID}-current-weight`}
              className="text-5xl font-black text-foreground text-center mb-1"
            >
              {formatWeightWithUnit(reached.currentWeight, reached.unit)}
            </Text>

            <Text
              testID={`${testID}-timeline`}
              className="text-xs text-muted-foreground text-center mb-4"
            >
              {formatWeightWithUnit(reached.startWeight, reached.unit)} &rarr;{" "}
              {formatWeightWithUnit(reached.targetWeight, reached.unit)} &middot;{" "}
              {timeline}
            </Text>

            <Text
              testID={`${testID}-message`}
              className="text-sm text-foreground/80 text-center leading-relaxed mb-6 px-2"
            >
              That&apos;s every meal logged, every workout shown up for. You put
              in the work &mdash; this is what it looks like when it pays off.
            </Text>

            <View className="w-full gap-2">
              <Pressable
                testID={`${testID}-set-next-goal`}
                accessibilityRole="button"
                accessibilityLabel="Set Your Next Goal"
                onPress={handleSetNext}
                style={{
                  width: "100%",
                  borderRadius: 9999,
                  backgroundColor: colors.success,
                  paddingVertical: 14,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: colors["primary-foreground"],
                    fontSize: 16,
                    fontWeight: "700",
                  }}
                >
                  Set Your Next Goal
                </Text>
              </Pressable>

              <Pressable
                testID={`${testID}-keep-going`}
                accessibilityRole="button"
                accessibilityLabel="Keep going"
                onPress={onClose}
                className="w-full rounded-full py-2.5 items-center justify-center"
              >
                <Text className="text-sm font-semibold text-muted-foreground">
                  Keep going
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

export default GoalAchievedModal;
