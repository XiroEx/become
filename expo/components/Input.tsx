import { View, Text, TextInput } from "react-native";
import type { TextInputProps } from "react-native";
import { resolveToken } from "@/lib/theme/tokens";

export interface InputProps extends Omit<TextInputProps, "style"> {
  label?: string;
  error?: string;
  testID?: string;
}

export function Input({
  label,
  error,
  testID,
  accessibilityLabel,
  ...inputProps
}: InputProps) {
  const labelId = testID ? `${testID}-label` : undefined;
  const errorId = testID ? `${testID}-error` : undefined;
  return (
    <View testID={testID ? `${testID}-container` : undefined}>
      {label ? (
        <Text
          testID={labelId}
          className="text-foreground text-sm font-medium mb-1"
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        testID={testID}
        accessibilityLabel={accessibilityLabel ?? label}
        placeholderTextColor={resolveToken("muted-foreground", "dark")}
        className={`bg-card border rounded-xl px-3 py-2.5 text-foreground ${
          error ? "border-destructive" : "border-border"
        }`}
        {...inputProps}
      />
      {error ? (
        <Text
          testID={errorId}
          className="text-destructive text-xs mt-1"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
