import type { ReactNode } from "react";
import { View, TextInput } from "react-native";
import { Text } from "@/components/Text";
import type { TextInputProps } from "react-native";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { geistFontFamily } from "@/lib/theme/fonts";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

export interface InputProps extends Omit<TextInputProps, "style"> {
  label?: string;
  error?: string;
  testID?: string;
  leftIcon?: ReactNode;
}

export function Input({
  label,
  error,
  testID,
  accessibilityLabel,
  accessibilityHint,
  leftIcon,
  ...inputProps
}: InputProps) {
  const { colors } = useThemeTokens();
  const labelId = testID ? `${testID}-label` : undefined;
  const errorId = testID ? `${testID}-error` : undefined;
  // The field itself is the one TextInput in the app, and a TextInput is not a
  // Text: `components/Text.tsx` never sees it, so it carries the family here.
  const inputClassName = `bg-card border rounded-xl ${leftIcon ? "pl-10 pr-3" : "px-3"} py-2.5 text-foreground ${
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
      <View style={{ position: "relative", justifyContent: "center" }}>
        {leftIcon ? (
          <View
            testID={testID ? `${testID}-left-icon` : undefined}
            style={{
              position: "absolute",
              left: 12,
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
          style={[
            minTouchTarget,
            { fontFamily: geistFontFamily(inputClassName) },
            leftIcon ? { paddingLeft: 40 } : null,
          ]}
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
