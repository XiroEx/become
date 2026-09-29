import { View, TextInput } from "react-native";
import { Text } from "@/components/Text";
import type { TextInputProps } from "react-native";
import { resolveToken } from "@/lib/theme/tokens";
import { geistFontFamily } from "@/lib/theme/fonts";

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
  // The field itself is the one TextInput in the app, and a TextInput is not a
  // Text: `components/Text.tsx` never sees it, so it carries the family here.
  const inputClassName = `bg-card border rounded-xl px-3 py-2.5 text-foreground ${
    error ? "border-destructive" : "border-border"
  }`;
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
        className={inputClassName}
        style={{ fontFamily: geistFontFamily(inputClassName) }}
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
