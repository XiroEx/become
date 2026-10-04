import { Modal, View } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface SlotConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  testID?: string;
}

/**
 * The native stand-in for the web calendar's `window.confirm(...)` gates
 * (`patchWorkout`'s `confirmMsg`): un-complete, skip and pause all ask first,
 * in an in-app dialog a test can press — `Alert.alert` renders nothing in
 * jest, so a modal is what the calendar screen uses.
 */
export function SlotConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  pending = false,
  onConfirm,
  onClose,
  testID = "slot-confirm",
}: SlotConfirmDialogProps) {
  const { scrim, colors } = useThemeTokens();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        testID={testID}
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          backgroundColor: scrim,
        }}
      >
        <View
          style={{
            backgroundColor: colors.card,
            padding: 16,
            borderRadius: 16,
            width: "100%",
            gap: 8,
          }}
        >
          <Text className="text-foreground text-lg font-bold">{title}</Text>
          <Text className="text-muted-foreground text-sm">{message}</Text>
          <View style={{ height: 4 }} />
          <Button
            testID={`${testID}-confirm`}
            variant="destructive"
            disabled={pending}
            loading={pending}
            onPress={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button
            testID={`${testID}-cancel`}
            variant="secondary"
            disabled={pending}
            onPress={onClose}
          >
            Cancel
          </Button>
        </View>
      </View>
    </Modal>
  );
}
