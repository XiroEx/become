import { useState } from "react";
import { View, TextInput, Pressable } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { Modal } from "@/components/Modal";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface ShiftScheduleModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (days: number) => void | Promise<void>;
  initialDays?: number;
  loading?: boolean;
  testID?: string;
}

/**
 * Native modal to delay / shift the program schedule by N days.
 * Moves all upcoming scheduled workout slots forward.
 */
export function ShiftScheduleModal({
  visible,
  onClose,
  onConfirm,
  initialDays = 3,
  loading = false,
  testID = "shift-schedule-modal",
}: ShiftScheduleModalProps) {
  const { colors } = useThemeTokens();
  const [days, setDays] = useState<number>(initialDays);

  const isValid = days >= 1 && days <= 90;

  const handleConfirm = () => {
    if (isValid && !loading) {
      onConfirm(days);
    }
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Delay Schedule"
      testID={testID}
      accessibilityLabel="Delay Schedule"
    >
      <View style={{ gap: 16 }}>
        <Text className="text-muted-foreground text-sm">
          Shift all upcoming scheduled workouts forward by a number of days.
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            paddingVertical: 8,
          }}
        >
          <Pressable
            testID="shift-days-minus"
            accessibilityRole="button"
            accessibilityLabel="Decrease days"
            onPress={() => setDays((d) => Math.max(1, d - 1))}
            disabled={loading || days <= 1}
            style={{
              padding: 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              opacity: days <= 1 ? 0.4 : 1,
            }}
          >
            <Minus size={18} color={colors.foreground} />
          </Pressable>

          <View style={{ alignItems: "center", minWidth: 80 }}>
            <TextInput
              testID="shift-days-input"
              value={String(days)}
              onChangeText={(t) => {
                const parsed = parseInt(t, 10);
                if (!Number.isNaN(parsed)) {
                  setDays(Math.max(1, Math.min(90, parsed)));
                } else if (t === "") {
                  setDays(1);
                }
              }}
              keyboardType="number-pad"
              style={{
                fontSize: 24,
                fontWeight: "bold",
                color: colors.foreground,
                textAlign: "center",
              }}
            />
            <Text className="text-muted-foreground text-xs font-semibold">
              {days === 1 ? "day" : "days"}
            </Text>
          </View>

          <Pressable
            testID="shift-days-plus"
            accessibilityRole="button"
            accessibilityLabel="Increase days"
            onPress={() => setDays((d) => Math.min(90, d + 1))}
            disabled={loading || days >= 90}
            style={{
              padding: 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              opacity: days >= 90 ? 0.4 : 1,
            }}
          >
            <Plus size={18} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
          <View style={{ flex: 1 }}>
            <Button
              testID="shift-cancel"
              variant="secondary"
              onPress={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              testID="shift-confirm"
              onPress={handleConfirm}
              disabled={loading || !isValid}
            >
              {loading ? "Delaying..." : `Delay ${days} ${days === 1 ? "Day" : "Days"}`}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
