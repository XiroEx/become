import { View, Text } from "react-native";
import type { ReactNode } from "react";

export interface CardProps {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}

export function Card({ title, subtitle, children, testID, accessibilityLabel }: CardProps) {
  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="summary"
      className="bg-card rounded-2xl p-4 border border-border"
    >
      {title ? (
        <Text
          testID={testID ? `${testID}-title` : undefined}
          className="text-foreground text-lg font-semibold mb-1"
        >
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text
          testID={testID ? `${testID}-subtitle` : undefined}
          className="text-muted-foreground text-sm mb-2"
        >
          {subtitle}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
