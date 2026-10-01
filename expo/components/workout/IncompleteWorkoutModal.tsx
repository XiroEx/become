import React from "react";
import { Modal, Pressable, View } from "react-native";
import {
  AlertCircle,
  Play,
  RotateCcw,
  CheckCircle2,
  SkipForward,
} from "lucide-react-native";
import { Text } from "@/components/Text";
import { useReducedMotion, modalAnimation } from "@/lib/a11y/reducedMotion";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { StaleIncompleteWorkout } from "@become/api-client";

export type ResolveIncompleteAction = "continue" | "restart" | "count" | "skip";

export interface IncompleteWorkoutModalProps {
  visible: boolean;
  stale: StaleIncompleteWorkout;
  loadingAction?: ResolveIncompleteAction | string | null;
  onResolve: (action: ResolveIncompleteAction) => void | Promise<void>;
  onDismiss?: () => void;
  testID?: string;
}

export function IncompleteWorkoutModal({
  visible,
  stale,
  loadingAction,
  onResolve,
  onDismiss,
  testID = "incomplete-workout-modal",
}: IncompleteWorkoutModalProps) {
  const reduceMotion = useReducedMotion();
  const { colors, scrim, tint } = useThemeTokens();

  if (!visible) return null;

  const formattedDate = new Date(stale.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <Modal
      visible={visible}
      onRequestClose={onDismiss}
      transparent
      animationType={modalAnimation("fade", reduceMotion)}
      testID={testID}
    >
      <Pressable
        testID={`${testID}-backdrop`}
        onPress={onDismiss}
        accessible={false}
        importantForAccessibility="no"
        className="flex-1 items-center justify-end px-4 pb-6 sm:justify-center"
        style={{ backgroundColor: scrim }}
      >
        <Pressable
          testID={`${testID}-card`}
          accessibilityRole="alert"
          accessibilityViewIsModal
          accessibilityLabel={`Unfinished workout from ${formattedDate}`}
          onAccessibilityEscape={onDismiss}
          onPress={() => {
            /* swallow card taps */
          }}
          className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        >
          {/* Header banner */}
          <View
            style={{
              backgroundColor: tint("accent", 0.15),
              borderBottomWidth: 1,
              borderBottomColor: tint("accent", 0.25),
              padding: 16,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <AlertCircle
              size={20}
              color={colors.accent}
              style={{ marginTop: 2 }}
            />
            <View style={{ flex: 1 }}>
              <Text
                testID={`${testID}-header`}
                accessibilityRole="header"
                className="text-foreground font-semibold text-sm"
              >
                Unfinished workout from {formattedDate}
              </Text>
              <Text
                testID={`${testID}-subhead`}
                className="text-muted-foreground text-xs mt-0.5"
              >
                {stale.day} · {stale.completedExerciseCount} of{" "}
                {stale.totalExerciseCount} exercises logged
              </Text>
            </View>
          </View>

          {/* Action buttons */}
          <View className="p-4 flex-col gap-2">
            {/* Continue */}
            <Pressable
              testID={`${testID}-continue`}
              accessibilityRole="button"
              accessibilityLabel="Continue where I left off"
              disabled={Boolean(loadingAction)}
              onPress={() => onResolve("continue")}
              className="flex-row items-center gap-3 rounded-xl px-4 py-3 bg-blue-600 active:bg-blue-700"
              style={{ opacity: loadingAction ? 0.6 : 1 }}
            >
              <Play size={18} color={colors["primary-foreground"]} />
              <View className="flex-1">
                <Text className="text-white font-semibold text-sm">
                  {loadingAction === "continue"
                    ? "Loading…"
                    : "Continue where I left off"}
                </Text>
                <Text className="text-blue-100 text-xs mt-0.5">
                  Pick up at the set I stopped on
                </Text>
              </View>
            </Pressable>

            {/* Restart */}
            <Pressable
              testID={`${testID}-restart`}
              accessibilityRole="button"
              accessibilityLabel="Restart this day"
              disabled={Boolean(loadingAction)}
              onPress={() => onResolve("restart")}
              className="flex-row items-center gap-3 rounded-xl px-4 py-3 bg-muted active:opacity-80 border border-border"
              style={{ opacity: loadingAction ? 0.6 : 1 }}
            >
              <RotateCcw size={18} color={colors.foreground} />
              <View className="flex-1">
                <Text className="text-foreground font-semibold text-sm">
                  {loadingAction === "restart"
                    ? "Clearing…"
                    : "Restart this day"}
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  Start {stale.day} fresh from scratch
                </Text>
              </View>
            </Pressable>

            {/* Count */}
            <Pressable
              testID={`${testID}-count`}
              accessibilityRole="button"
              accessibilityLabel="Count it & move on"
              disabled={Boolean(loadingAction)}
              onPress={() => onResolve("count")}
              className="flex-row items-center gap-3 rounded-xl px-4 py-3 bg-muted active:opacity-80 border border-border"
              style={{ opacity: loadingAction ? 0.6 : 1 }}
            >
              <CheckCircle2 size={18} color={colors.success} />
              <View className="flex-1">
                <Text className="text-foreground font-semibold text-sm">
                  {loadingAction === "count"
                    ? "Counting…"
                    : "Count it & move on"}
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  Mark as done, advance to next workout
                </Text>
              </View>
            </Pressable>

            {/* Skip */}
            <Pressable
              testID={`${testID}-skip`}
              accessibilityRole="button"
              accessibilityLabel="Move on without counting it"
              disabled={Boolean(loadingAction)}
              onPress={() => onResolve("skip")}
              className="flex-row items-center gap-3 rounded-xl px-4 py-3 bg-muted active:opacity-80 border border-border"
              style={{ opacity: loadingAction ? 0.6 : 1 }}
            >
              <SkipForward size={18} color={colors["muted-foreground"]} />
              <View className="flex-1">
                <Text className="text-foreground font-semibold text-sm">
                  {loadingAction === "skip"
                    ? "Skipping…"
                    : "Move on without counting it"}
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  Skip this day, go to the next workout
                </Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default IncompleteWorkoutModal;
