import { View, TextInput } from "react-native";
import type { ReactNode } from "react";
import { Text } from "@/components/Text";
import type { StyleProp, TextInputProps, TextStyle } from "react-native";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { geistFontFamily } from "@/lib/theme/fonts";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

export interface InputProps extends Omit<TextInputProps, "style"> {
  label?: string;
  error?: string;
  testID?: string;
  leftIcon?: ReactNode;
  /**
   * Extra styling merged onto the TextInput itself — e.g. a textarea's
   * `minHeight`. Composed with `.filter(Boolean)` below so a caller that
   * does not pass it (the common case) never adds a stray falsy entry to
   * the rendered `style` array.
   */
  style?: StyleProp<TextStyle>;
}

/**
 * A `multiline` field gets the web textarea's own shape (`rows={3}`): tall
 * enough for three lines and top-aligned, not the single-line field's
 * vertically-centred text — otherwise `multiline` alone reads as a fatter
 * single-line box, not a textarea (NP-359).
 */
const MULTILINE_STYLE: TextStyle = {
  minHeight: 80,
  textAlignVertical: "top",
  paddingTop: 10,
};

export function Input({
  label,
  error,
  testID,
  accessibilityLabel,
  accessibilityHint,
  leftIcon,
  style,
  multiline,
  ...inputProps
}: InputProps) {
  const { colors } = useThemeTokens();
  const labelId = testID ? `${testID}-label` : undefined;
  const errorId = testID ? `${testID}-error` : undefined;
  // The field itself is the one TextInput in the app, and a TextInput is not a
  // Text: `components/Text.tsx` never sees it, so it carries the family here.
  const inputClassName = `bg-card border rounded-xl ${
    leftIcon ? "pl-10 pr-4" : "px-3"
  } py-2.5 text-foreground ${
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
          multiline={multiline}
          // 44 points tall, the same minimum every other control in the app
          // holds: the padding alone leaves it a few points short. A
          // `multiline` field grows past that into the textarea shape, and a
          // caller's own `style` has the final word — `.filter(Boolean)`
          // keeps a skipped entry (no multiline, no `style`) from landing a
          // `false` in the rendered array (NP-359: that broke a snapshot).
          style={[
            minTouchTarget,
            { fontFamily: geistFontFamily(inputClassName) },
            multiline && MULTILINE_STYLE,
            style,
          ].filter(Boolean)}
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
