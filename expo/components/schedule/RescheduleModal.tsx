import { useEffect, useState } from "react";
import { Modal, View, Text } from "react-native";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import type { ScheduledSlot } from "@/lib/schedule/slotStatus";

export interface RescheduleModalProps {
  visible: boolean;
  slot: ScheduledSlot | null;
  onConfirm: (slot: ScheduledSlot, newDate: string) => void;
  onClose: () => void;
  testID?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Move a scheduled workout to a new YYYY-MM-DD date. */
export function RescheduleModal({
  visible,
  slot,
  onConfirm,
  onClose,
  testID = "reschedule-modal",
}: RescheduleModalProps) {
  const [date, setDate] = useState<string>(slot?.date ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDate(slot?.date ?? "");
    setError(null);
  }, [slot]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
          }}
        >
          <Text className="text-foreground text-xl font-bold mb-3">
            Reschedule workout
          </Text>
          <Input
            testID={`${testID}-date`}
            label="New date (YYYY-MM-DD)"
            value={date}
            onChangeText={setDate}
            placeholder="2026-06-01"
            error={error ?? undefined}
          />
          <View style={{ height: 12 }} />
          <Button
            testID={`${testID}-confirm`}
            onPress={() => {
              if (!slot) return;
              if (!DATE_RE.test(date)) {
                setError("Enter a valid date");
                return;
              }
              onConfirm(slot, date);
            }}
          >
            Move workout
          </Button>
          <View style={{ height: 8 }} />
          <Button testID={`${testID}-close`} variant="secondary" onPress={onClose}>
            Cancel
          </Button>
        </View>
      </View>
    </Modal>
  );
}
