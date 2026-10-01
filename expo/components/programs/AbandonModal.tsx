import { useState } from "react";
import { View, TextInput } from "react-native";
import { Modal } from "@/components/Modal";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface AbandonModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  hasProgress: boolean;
  loading?: boolean;
  testID?: string;
}

/**
 * Native confirmation dialog for abandoning a program.
 * Follows the web's typed-word rule: asks the member to type "abandon"
 * when they have logged progress, preventing accidental data loss.
 */
export function AbandonModal({
  visible,
  onClose,
  onConfirm,
  hasProgress,
  loading = false,
  testID = "abandon-modal",
}: AbandonModalProps) {
  const { colors } = useThemeTokens();
  const [confirmText, setConfirmText] = useState("");

  const canConfirm = !hasProgress || confirmText.trim().toLowerCase() === "abandon";

  const handleClose = () => {
    setConfirmText("");
    onClose();
  };

  const handleConfirm = () => {
    if (canConfirm && !loading) {
      onConfirm();
    }
  };

  return (
    <Modal
      visible={visible}
      onClose={handleClose}
      title="Abandon Program?"
      testID={testID}
      accessibilityLabel="Abandon Program?"
    >
      <View style={{ gap: 16 }}>
        <Text className="text-muted-foreground text-sm">
          Are you sure you want to abandon this program?
          {hasProgress ? " You've already made progress on this program." : ""}
        </Text>

        {hasProgress ? (
          <View className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 gap-2">
            <Text className="text-amber-600 dark:text-amber-400 text-xs font-semibold">
              Warning: You have completed workouts in this program. Type &quot;abandon&quot; to confirm.
            </Text>
            <TextInput
              testID="abandon-confirm-input"
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder='Type "abandon" to confirm'
              placeholderTextColor={colors["muted-foreground"]}
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                paddingHorizontal: 12,
                paddingVertical: 8,
                fontSize: 14,
                color: colors.foreground,
              }}
            />
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
          <View style={{ flex: 1 }}>
            <Button
              testID="abandon-cancel"
              variant="secondary"
              onPress={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              testID="abandon-confirm"
              variant="destructive"
              onPress={handleConfirm}
              disabled={loading || !canConfirm}
            >
              {loading ? "Abandoning..." : "Abandon"}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
