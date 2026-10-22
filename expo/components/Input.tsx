import { View, TextInput } from "react-native";
import type { ReactNode } from "react";
import { Text } from "@/components/Text";
import type { TextInputProps } from "react-native";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { geistFontFamily } from "@/lib/theme/fonts";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

export type InputVariant = "default" | "prominent" | "live";

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  testID?: string;
  leftIcon?: ReactNode;
  /**
   * NP-373: Quick Add's Calories field is the web's prominent numeric well
   * (`text-lg font-bold`, `px-4 py-3`) — visually heavier than every optional
   * macro beside it. `"default"` (the existing look) is unchanged; pass
   * `"prominent"` only for that one field, not every Input.
   *
   * `"live"` is the Live step's well — the web's `bg-white/10 … text-center
   * text-lg font-bold placeholder:text-white/30`. Live is dark-pinned
   * (`ForcedThemeMode mode="dark" scopeClassColors`), so the foreground token
   * IS near-white there and `bg-foreground/10` is the web's translucent wash,
   * never an opaque box. The placeholder is the foreground tint at 0.30,
   * drawn from the hook (no literal white anywhere — NP-288's rule).
   */
  variant?: InputVariant;
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
  const { colors, tint } = useThemeTokens();
  const labelId = testID ? `${testID}-label` : undefined;
  const errorId = testID ? `${testID}-error` : undefined;
  const isProminent = variant === "prominent";
  const isLive = variant === "live";
  // The field itself is the one TextInput in the app, and a TextInput is not a
  // Text: `components/Text.tsx` never sees it, so it carries the family here.
  // The Live well has no border — the web's has none — and its wash and ink
  // come from the scoped dark palette, not `bg-card` (opaque, and light-mode
  // white outside the pin).
  const inputClassName = isLive
    ? `rounded-xl bg-foreground/10 ${
        leftIcon ? "pl-10 pr-4" : "px-4"
      } py-3 text-lg font-bold text-foreground`
    : `bg-card border rounded-xl ${
        leftIcon ? "pl-10 pr-4" : isProminent ? "px-4" : "px-3"
      } ${isProminent ? "py-3 text-lg font-bold" : "py-2.5"} text-foreground ${
        error ? "border-destructive" : "border-border"
      }`;
  const labelClassName = isProminent
    ? "text-foreground text-sm font-semibold mb-1"
    : "text-foreground text-sm font-medium mb-1";
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
          className={labelClassName}
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
          placeholderTextColor={
            isLive ? tint("foreground", 0.3) : colors["muted-foreground"]
          }
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
