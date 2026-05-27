import { View, Text } from "react-native";
import type { ReactNode } from "react";

export type BadgeVariant =
  | "default"
  | "primary"
  | "muted"
  | "destructive"
  | "accent";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-card border border-border",
  primary: "bg-primary",
  muted: "bg-muted",
  destructive: "bg-destructive",
  accent: "bg-accent",
};

const VARIANT_TEXT_CLASSES: Record<BadgeVariant, string> = {
  default: "text-foreground",
  primary: "text-primary-foreground",
  muted: "text-foreground",
  destructive: "text-destructive-foreground",
  accent: "text-accent-foreground",
};

export interface BadgeProps {
  variant?: BadgeVariant;
  children?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}

export function Badge({
  variant = "default",
  children,
  testID,
  accessibilityLabel,
}: BadgeProps) {
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      className={`rounded-full px-2 py-0.5 self-start ${VARIANT_CLASSES[variant]}`}
    >
      <Text
        testID={testID ? `${testID}-text` : undefined}
        className={`text-xs font-medium ${VARIANT_TEXT_CLASSES[variant]}`}
      >
        {children}
      </Text>
    </View>
  );
}
