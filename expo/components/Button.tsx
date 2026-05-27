import { Pressable, Text, ActivityIndicator, View } from "react-native";
import type { ReactNode } from "react";
import { resolveToken } from "@/lib/theme/tokens";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  children?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary",
  secondary: "bg-muted",
  destructive: "bg-destructive",
  ghost: "bg-transparent border border-border",
};

const VARIANT_TEXT_CLASSES: Record<ButtonVariant, string> = {
  primary: "text-primary-foreground",
  secondary: "text-foreground",
  destructive: "text-destructive-foreground",
  ghost: "text-foreground",
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

export function Button({
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  children,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const isInactive = disabled || loading;
  const variantClass = VARIANT_CLASSES[variant];
  const variantTextClass = VARIANT_TEXT_CLASSES[variant];
  const sizeClass = SIZE_CLASSES[size];
  const sizeTextClass = SIZE_TEXT_CLASSES[size];

  return (
    <Pressable
      testID={testID}
      onPress={isInactive ? undefined : onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive, busy: loading }}
      accessibilityLabel={accessibilityLabel}
      className={`rounded-xl items-center justify-center flex-row ${variantClass} ${sizeClass} ${isInactive ? "opacity-50" : ""}`}
    >
      {loading ? (
        <View testID={testID ? `${testID}-spinner` : undefined}>
          <ActivityIndicator
            size="small"
            color={resolveToken(
              variant === "primary" || variant === "destructive"
                ? "primary-foreground"
                : "foreground",
              "dark",
            )}
          />
        </View>
      ) : (
        <Text className={`font-semibold ${variantTextClass} ${sizeTextClass}`}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}
