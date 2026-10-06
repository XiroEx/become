import { Pressable, ActivityIndicator, View } from "react-native";
import { Text } from "@/components/Text";
import type { ReactNode } from "react";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  MIN_TOUCH_TARGET,
  hitSlopToMinTarget,
  minTouchTarget,
} from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "destructive"
  | "ghost"
  | "inverted"
  | "success";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  children?: ReactNode;
  /**
   * Overrides the accessible name. Omitted, the name is the label TEXT — see
   * `accessibleName` below, which is why it is computed rather than left to
   * React Native: while `loading` the label is replaced by a spinner, and a
   * button whose only child is an ActivityIndicator has no name at all.
   */
  accessibilityLabel?: string;
  /** Spoken after the name, for a button whose effect the name cannot carry. */
  accessibilityHint?: string;
  testID?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary",
  secondary: "bg-muted",
  destructive: "bg-destructive",
  ghost: "bg-transparent border border-border",
  // The web's `bg-zinc-900 dark:bg-white` submit button on the sign-in /
  // sign-up screen (NP-251): foreground on background, which is already the
  // light/dark-inverted pair every other token follows, so no new colour
  // literal is needed to match it.
  inverted: "bg-foreground",
  // The web's teal/emerald CTA (e.g. SnapPlateModal's "Estimate" button) —
  // the brand red (`primary`) is reserved for destructive-adjacent native
  // actions, so a positive confirm that mirrors web's emerald uses the
  // existing `success` token instead of a new colour literal.
  success: "bg-success",
};

const VARIANT_TEXT_CLASSES: Record<ButtonVariant, string> = {
  primary: "text-primary-foreground",
  secondary: "text-foreground",
  destructive: "text-destructive-foreground",
  ghost: "text-foreground",
  inverted: "text-background",
  success: "text-primary-foreground",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5",
  md: "px-4 py-2.5",
  lg: "px-5 py-3.5",
};

const SIZE_TEXT_CLASSES: Record<ButtonSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
};

/**
 * The accessible name, from the children when the caller did not give one.
 * Strings and numbers only: a button whose label is an element gets its name
 * from that element, the way React Native reads a `<Text>` child.
 */
export function accessibleName(
  children: ReactNode,
  accessibilityLabel?: string,
): string | undefined {
  if (accessibilityLabel) return accessibilityLabel;
  const parts: string[] = [];
  const walk = (node: ReactNode): void => {
    if (typeof node === "string") parts.push(node);
    else if (typeof node === "number") parts.push(String(node));
    else if (Array.isArray(node)) node.forEach(walk);
  };
  walk(children);
  const name = parts.join(" ").trim();
  return name.length > 0 ? name : undefined;
}

export function Button({
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  children,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { colors } = useThemeTokens();
  const isInactive = disabled || loading;
  const variantClass = VARIANT_CLASSES[variant];
  const variantTextClass = VARIANT_TEXT_CLASSES[variant];
  const sizeClass = SIZE_CLASSES[size];
  const sizeTextClass = SIZE_TEXT_CLASSES[size];

  // 44 x 44, two ways. `md` and `lg` GROW to it — they are already close, so
  // nothing moves. `sm` is small on purpose (the rest timer's three buttons sit
  // in one bar), so it keeps its size and takes the slop instead.
  const isSmall = size === "sm";

  return (
    <Pressable
      testID={testID}
      onPress={isInactive ? undefined : onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive, busy: loading }}
      accessibilityLabel={accessibleName(children, accessibilityLabel)}
      accessibilityHint={accessibilityHint}
      hitSlop={isSmall ? hitSlopToMinTarget(MIN_TOUCH_TARGET, 32) : undefined}
      style={isSmall ? undefined : minTouchTarget}
      className={`rounded-xl items-center justify-center flex-row ${variantClass} ${sizeClass} ${isInactive ? "opacity-50" : ""}`}
    >
      {loading ? (
        <View testID={testID ? `${testID}-spinner` : undefined}>
          <ActivityIndicator
            size="small"
            color={
              variant === "primary" ||
              variant === "destructive" ||
              variant === "success"
                ? colors["primary-foreground"]
                : variant === "inverted"
                  ? colors.background
                  : colors.foreground
            }
          />
        </View>
      ) : (
        // WRAPPABLE_TEXT, or the label runs off the end of the button at the
        // largest Dynamic Type size: this is a flex ROW, and a Text in a row
        // does not shrink unless it is told to.
        <Text
          style={[WRAPPABLE_TEXT, { textAlign: "center" }]}
          className={`font-semibold ${variantTextClass} ${sizeTextClass}`}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}
