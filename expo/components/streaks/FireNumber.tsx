import React from "react";
import type { StyleProp, TextStyle } from "react-native";
import { Text } from "@/components/Text";

export interface FireNumberProps {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  className?: string;
}

export function FireNumber({ children, style, className = "" }: FireNumberProps) {
  return (
    <Text
      testID="fire-number"
      style={style}
      className={`text-orange-500 dark:text-orange-400 font-extrabold ${className}`}
    >
      {children}
    </Text>
  );
}

export default FireNumber;
