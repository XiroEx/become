import React from "react";
import { Modal, Pressable, View } from "react-native";
import { Text } from "@/components/Text";
import { useReducedMotion, modalAnimation } from "@/lib/a11y/reducedMotion";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  testID?: string;
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  destructive = false,
  testID = "confirm-modal",
}: ConfirmModalProps) {
  const reduceMotion = useReducedMotion();

  if (!open) return null;

  return (
    <Modal
      visible={open}
      onRequestClose={onCancel}
      transparent
      animationType={modalAnimation("fade", reduceMotion)}
      testID={testID}
    >
      <Pressable
        testID={`${testID}-backdrop`}
        onPress={onCancel}
        accessible={false}
        importantForAccessibility="no"
        className="flex-1 bg-black/60 items-center justify-center px-6"
      >
        <Pressable
          testID={`${testID}-card`}
          accessibilityRole="alert"
          accessibilityViewIsModal
          accessibilityLabel={title}
          onAccessibilityEscape={onCancel}
          onPress={() => {
            /* prevent backdrop close on card press */
          }}
          className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm"
        >
          <Text
            testID={`${testID}-title`}
            accessibilityRole="header"
            className="text-foreground text-lg font-bold mb-2"
          >
            {title}
          </Text>
          {body ? (
            <Text
              testID={`${testID}-body`}
              className="text-muted-foreground text-sm leading-5 mb-5"
            >
              {body}
            </Text>
          ) : null}

          <View className="flex-col gap-2">
            <Pressable
              testID={`${testID}-confirm`}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              onPress={onConfirm}
              className={`py-3 rounded-xl items-center justify-center ${
                destructive ? "bg-destructive" : "bg-primary"
              }`}
            >
              {/* The label takes the FILL's own ink, never a literal white:
                  `primary` is white in dark mode since NP-313, so
                  `text-white` on it was white on white. */}
              <Text
                className={`font-bold text-sm ${
                  destructive
                    ? "text-destructive-foreground"
                    : "text-primary-foreground"
                }`}
              >
                {confirmLabel}
              </Text>
            </Pressable>

            <Pressable
              testID={`${testID}-cancel`}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              onPress={onCancel}
              className="py-3 rounded-xl items-center justify-center bg-muted border border-border"
            >
              <Text className="text-foreground font-semibold text-sm">
                {cancelLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
