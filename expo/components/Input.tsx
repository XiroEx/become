import { View, TextInput } from "react-native";
import type { ReactNode } from "react";
import { Text } from "@/components/Text";
import type { TextInputProps } from "react-native";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { geistFontFamily } from "@/lib/theme/fonts";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  testID?: string;
  leftIcon?: ReactNode;
  /**
   * NP-373: the web's Quick Add "Calories" field is visually prominent —
   * `text-lg font-bold` in a `px-4 py-3` well — not the compact look every
   * other optional macro field gets, which previously gave Calories the
   * exact same visual weight as Protein/Carbs/Fats. "prominent" is for that
   * one field; every other call site stays "default".
   */
  variant?: "default" | "prominent";
}

export function Input({
  label,
  error,
  testID,
  accessibilityLabel,
  accessibilityHint,
  leftIcon,
  style,
  variant = "default",
  ...inputProps
}: InputProps) {
  const { colors } = useThemeTokens();
  const labelId = testID ? `${testID}-label` : undefined;
  const errorId = testID ? `${testID}-error` : undefined;
  const isProminent = variant === "prominent";
  // The field itself is the one TextInput in the app, and a TextInput is not a
  // Text: `components/Text.tsx` never sees it, so it carries the family here.
  const inputClassName = `bg-card border rounded-xl ${
    leftIcon ? "pl-10 pr-4" : isProminent ? "px-4" : "px-3"
  } ${isProminent ? "py-3" : "py-2.5"} text-foreground ${
    isProminent ? "text-lg font-bold" : ""
  } ${
    error ? "border-destructive" : "border-border"
  }`;
  // THE ERROR IS PART OF THE FIELD, to a screen reader. The red line underneath
  // is a separate element that VoiceOver reaches AFTER the field, which is one
  // swipe too late to explain why focus came back — so it is also spoken as the
  // field's hint, and announced when it appears.
  const hint = error
    ? accessibilityHint
      ? `${accessibilityHint}. ${error}`
      : error
    : accessibilityHint;
  const multilineStyle = inputProps.multiline
    ? { textAlignVertical: "top" as const }
    : null;
  const computedStyle = [
    minTouchTarget,
    { fontFamily: geistFontFamily(inputClassName) },
    multilineStyle,
    style,
  ].filter(Boolean);
  return (
    <View testID={testID ? `${testID}-container` : undefined}>
      {label ? (
        <Text
          testID={labelId}
          className={`text-foreground text-sm mb-1 ${
            isProminent ? "font-semibold" : "font-medium"
          }`}
        >
          {label}
        </Text>
      ) : null}
      <View style={{ position: "relative", justifyContent: "center" }}>
        {leftIcon ? (
          <View
            style={{
              position: "absolute",
              left: 12,
              top: 0,
              bottom: 0,
              justifyContent: "center",
              zIndex: 1,
            }}
            pointerEvents="none"
          >
            {leftIcon}
          </View>
        ) : null}
        <TextInput
          testID={testID}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={hint}
          placeholderTextColor={colors["muted-foreground"]}
          className={inputClassName}
          // 44 points tall, the same minimum every other control in the app
          // holds: the padding alone leaves it a few points short.
          style={computedStyle}
          {...inputProps}
        />
      </View>
      {error ? (
        <Text
          testID={errorId}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          className="text-destructive text-xs mt-1"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
