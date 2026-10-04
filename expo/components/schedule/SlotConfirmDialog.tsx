import { View } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import type { ScheduledSlot } from "@/lib/schedule/slotStatus";

export interface SlotConfirmDialogProps {
  /** Which confirm is showing. Null hides the dialog. */
  kind: "uncomplete" | null;
  slot: ScheduledSlot | null;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  testID?: string;
}

/**
 * The native confirm for un-completing a slot — the port of the web's
 * `window.confirm('Un-complete this workout? …')` on the calendar's
 * completed cards. A two-tap in-app modal, not `Alert.alert`: `Alert`
 * renders nothing in jest, so a modal is what a test can press (the same
 * reason `components/programs/MyPrograms` gives for its delete confirm).
 */
export function SlotConfirmDialog({
  kind,
  slot,
  loading = false,
  onConfirm,
  onClose,
  testID = "slot-confirm",
}: SlotConfirmDialogProps) {
  if (kind === null || slot === null) {
    return (
      <Modal visible={false} onClose={onClose} testID={testID}>
        <View />
      </Modal>
    );
  }
  return (
    <Modal
      visible
      onClose={onClose}
      title="Un-complete this workout?"
      testID={testID}
    >
      <Text className="text-muted-foreground text-sm mb-4">
        The sets you logged for {slot.dayLabel || `Day ${slot.workoutIndex + 1}`}{" "}
        on {slot.date} will be removed and it returns to scheduled.
      </Text>
      <View style={{ gap: 8 }}>
        <Button
          testID={`${testID}-yes`}
          variant="destructive"
          onPress={onConfirm}
          disabled={loading}
          loading={loading}
        >
          Yes, un-complete it
        </Button>
        <Button
          testID={`${testID}-no`}
          variant="secondary"
          onPress={onClose}
          disabled={loading}
        >
          Keep it completed
        </Button>
      </View>
    </Modal>
  );
}

/** Convenience hook-free state holder is left to the caller (the calendar route). */
