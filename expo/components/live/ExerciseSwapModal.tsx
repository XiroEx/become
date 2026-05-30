import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { Button } from "@/components/Button";
import type { AlternativeCandidate } from "@become/api-client";

export interface ExerciseSwapModalProps {
  visible: boolean;
  /** Name of the exercise being swapped. */
  sourceName?: string;
  alternatives: AlternativeCandidate[];
  loading?: boolean;
  onSelect: (candidate: AlternativeCandidate) => void;
  onClose: () => void;
  testID?: string;
}

/**
 * Presentational swap picker — lists the scored alternatives returned by
 * GET /api/exercises/alternatives and lets the user pick a replacement.
 */
export function ExerciseSwapModal({
  visible,
  sourceName,
  alternatives,
  loading = false,
  onSelect,
  onClose,
  testID = "swap-modal",
}: ExerciseSwapModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        testID={testID}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#0008" }}
      >
        <View
          style={{
            backgroundColor: "#0a0a0a",
            padding: 16,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: "75%",
          }}
        >
          <Text className="text-foreground text-xl font-bold mb-3">
            {sourceName ? `Swap ${sourceName}` : "Swap exercise"}
          </Text>

          {loading ? (
            <Text testID={`${testID}-loading`} className="text-muted-foreground">
              Finding alternatives…
            </Text>
          ) : alternatives.length === 0 ? (
            <Text testID={`${testID}-empty`} className="text-muted-foreground">
              No alternatives found.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 360 }}>
              {alternatives.map((alt) => (
                <Pressable
                  key={alt.slug}
                  testID={`${testID}-option-${alt.slug}`}
                  onPress={() => onSelect(alt)}
                  accessibilityRole="button"
                  accessibilityLabel={`Swap to ${alt.name}`}
                  className="border border-border rounded-xl p-3 mb-2"
                >
                  <Text className="text-foreground font-semibold">{alt.name}</Text>
                  {alt.reasons && alt.reasons.length > 0 ? (
                    <Text className="text-muted-foreground text-xs mt-1">
                      {alt.reasons.slice(0, 2).join(" · ")}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View style={{ height: 8 }} />
          <Button testID={`${testID}-close`} variant="secondary" onPress={onClose}>
            Cancel
          </Button>
        </View>
      </View>
    </Modal>
  );
}
