import { useState } from "react";
import { View } from "react-native";
import { Modal } from "@/components/Modal";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { DatePicker } from "@/components/programs/DatePicker";
import { localDateKey } from "@/lib/time/localDay";

export interface ChangeStartDateModalProps {
  visible: boolean;
  initialDate?: string | null;
  onClose: () => void;
  onConfirm: (startDate: string) => void | Promise<void>;
  loading?: boolean;
  testID?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveInitialDate(initialDate?: string | null): string {
  if (initialDate && typeof initialDate === "string") {
    const raw = initialDate.split("T")[0]!;
    if (DATE_RE.test(raw)) return raw;
  }
  return localDateKey();
}

/**
 * Native modal to change an enrolled program's start date.
 * Allows the member to pick any valid local calendar date (YYYY-MM-DD).
 */
export function ChangeStartDateModal({
  visible,
  initialDate,
  onClose,
  onConfirm,
  loading = false,
  testID = "change-start-date-modal",
}: ChangeStartDateModalProps) {
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    resolveInitialDate(initialDate),
  );

  const isValid = DATE_RE.test(selectedDate);

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Change Start Date"
      testID={testID}
      accessibilityLabel="Change Start Date"
    >
      <View style={{ gap: 16 }}>
        <Text className="text-muted-foreground text-sm">
          Pick a new start date for this program. Your schedule will be updated to begin on this date.
        </Text>

        <DatePicker
          value={selectedDate}
          onChange={setSelectedDate}
          testID="change-start-date-date-picker"
        />

        <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
          <View style={{ flex: 1 }}>
            <Button
              testID="change-start-date-cancel"
              variant="secondary"
              onPress={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              testID="change-start-date-save"
              onPress={() => {
                if (isValid && !loading) {
                  onConfirm(selectedDate);
                }
              }}
              disabled={loading || !isValid}
            >
              {loading ? "Saving..." : "Save"}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
