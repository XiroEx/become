import { useState } from "react";
import { View } from "react-native";
import { Modal } from "@/components/Modal";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { DatePicker } from "@/components/programs/DatePicker";
import { suggestStartDate } from "@/lib/programs/enrollment";
import { localDateKey } from "@/lib/time/localDay";

export interface EnrollmentModalProps {
  visible: boolean;
  programName?: string;
  durationWeeks?: number;
  initialDate?: string;
  onConfirm: (startDate: string) => void | Promise<void>;
  onClose: () => void;
  loading?: boolean;
  testID?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getEstimatedCompletion(startDateKey: string, durationWeeks: number): string {
  if (!DATE_RE.test(startDateKey)) return "";
  const parts = startDateKey.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = (parts[1] ?? 1) - 1;
  const d = parts[2] ?? 1;
  const endDate = new Date(y, m, d, 12, 0, 0);
  endDate.setDate(endDate.getDate() + (durationWeeks || 4) * 7);
  return endDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Native enrolment dialog with date picker matching web ProgramDetailClient modal.
 *
 * Rules:
 * - Start dates are local calendar dates (YYYY-MM-DD), never `toISOString()`.
 * - Confirms start date and triggers enrollment before heading to schedule setup.
 */
export function EnrollmentModal({
  visible,
  durationWeeks = 4,
  initialDate,
  onConfirm,
  onClose,
  loading = false,
  testID = "enroll-modal",
}: EnrollmentModalProps) {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return initialDate ?? suggestStartDate(null, new Date());
  });

  const completionText = getEstimatedCompletion(selectedDate, durationWeeks);
  const isDateValid = DATE_RE.test(selectedDate);

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="When do you want to start?"
      testID={testID}
      accessibilityLabel="When do you want to start?"
    >
      <View style={{ gap: 16 }}>
        <Text className="text-muted text-sm">
          Pick a start date for this {durationWeeks}-week program. You can
          schedule it weeks or months ahead.
        </Text>

        <DatePicker
          value={selectedDate}
          onChange={setSelectedDate}
          minDate={localDateKey(new Date())}
          testID={`${testID}-date-picker`}
        />

        {completionText ? (
          <Text
            testID={`${testID}-est-completion`}
            className="text-muted text-center text-xs"
          >
            Est. completion: {completionText}
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <Button
              testID={`${testID}-cancel`}
              variant="secondary"
              onPress={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              testID={`${testID}-confirm`}
              onPress={() => {
                if (isDateValid && !loading) {
                  onConfirm(selectedDate);
                }
              }}
              disabled={loading || !isDateValid}
            >
              {loading ? "Enrolling..." : "Enroll & Set Up"}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
