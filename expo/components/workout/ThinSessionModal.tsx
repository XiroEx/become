/**
 * "FINISH WITH TWO EXERCISES?" — the native thin-session prompt (NP-138).
 *
 * Native port of `webapp/components/workout/ThinSessionModal.tsx`:
 * build-as-you-go makes it easy to start a session with one movement and add
 * the rest as you find the machines free — which also makes it easy to call it
 * a workout after two. This asks once, on the way out, and offers the thing
 * the member probably wanted: one more exercise rather than an early finish.
 *
 * It never blocks. Finish anyway is right there, and once it is used the
 * session stops asking (the caller owns the `alreadyAsked` half of
 * `shouldWarnBeforeFinish`).
 */

import { Modal, Pressable, View } from "react-native";
import { Plus } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { RECOMMENDED_MIN_EXERCISES } from "@become/core";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

export interface ThinSessionModalProps {
  visible: boolean;
  exerciseCount: number;
  onAddExercise: () => void;
  onFinishAnyway: () => void;
  onClose: () => void;
  testID?: string;
}

export function ThinSessionModal({
  visible,
  exerciseCount,
  onAddExercise,
  onFinishAnyway,
  onClose,
  testID = "thin-session-modal",
}: ThinSessionModalProps) {
  const { colors, scrim } = useThemeTokens();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: scrim }}>
        <View
          testID={`${testID}-sheet`}
          style={{
            backgroundColor: colors.card,
            padding: 20,
            paddingBottom: 32,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
          }}
        >
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.muted,
              }}
            >
              <Text className="text-base">⚠️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                testID={`${testID}-title`}
                accessibilityRole="header"
                className="text-foreground text-base font-bold"
              >
                {`Finish with ${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}?`}
              </Text>
              <Text className="text-muted-foreground text-sm" style={{ marginTop: 4 }}>
                {`Most sessions run ${RECOMMENDED_MIN_EXERCISES} or more. You can add one more before you call it — it only takes a moment.`}
              </Text>
            </View>
          </View>

          <Button
            testID={`${testID}-add`}
            onPress={onAddExercise}
            accessibilityLabel="Add an exercise"
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Plus size={16} color={colors["primary-foreground"]} />
              <Text className="text-primary-foreground text-sm font-bold">
                Add an exercise
              </Text>
            </View>
          </Button>
          <View style={{ height: 8 }} />
          <Pressable
            testID={`${testID}-finish`}
            onPress={onFinishAnyway}
            accessibilityRole="button"
            accessibilityLabel="Finish anyway"
            style={[minTouchTarget, { borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted, paddingVertical: 12 }]}
          >
            <Text className="text-foreground text-sm font-semibold">
              Finish anyway
            </Text>
          </Pressable>
          <View style={{ height: 4 }} />
          <Pressable
            testID={`${testID}-keep-going`}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Keep going"
            style={[minTouchTarget, { borderRadius: 12, alignItems: "center", justifyContent: "center", paddingVertical: 8 }]}
          >
            <Text className="text-muted-foreground text-xs underline">
              Keep going
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
