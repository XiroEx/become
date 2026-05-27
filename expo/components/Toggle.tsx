import { Pressable, View } from "react-native";

export interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

export function Toggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  testID,
}: ToggleProps) {
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : () => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      className={`w-12 h-7 rounded-full justify-center px-1 ${
        value ? "bg-primary" : "bg-muted"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <View
        testID={testID ? `${testID}-thumb` : undefined}
        className={`w-5 h-5 rounded-full bg-card ${
          value ? "self-end" : "self-start"
        }`}
      />
    </Pressable>
  );
}
