import React from "react";
import type { StyleProp, TextStyle } from "react-native";
import { Text } from "@/components/Text";
import { resolveToken } from "@/lib/theme/tokens";

/**
 * The fire number's colour (NP-317).
 *
 * `tailwind.config.js` overrides `orange` with a single flat CSS-var colour
 * (no `-100`…`-900` shade scale — see its `colors.orange` entry), so
 * `text-orange-500 dark:text-orange-400` name classes that do not exist.
 * NativeWind silently drops both, and the Text falls back to the default
 * (near-black) ink — invisible on the dark streak card and flat black in
 * light mode, where the web shows the orange flame number. Same class of bug
 * as the onboarding Lose Weight tile (NP-310).
 *
 * The fix is an inline colour instead of the dead classes. `orange` is
 * mode-invariant in `lib/theme/tokens.ts` (`249 115 22` in both light and
 * dark, like `primary`), so resolving it against either mode gives the same
 * value — `"light"` is used here only because `resolveToken` requires one.
 */
const FIRE_ORANGE = resolveToken("orange", "light");

export interface FireNumberProps {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  className?: string;
}

export function FireNumber({ children, style, className = "" }: FireNumberProps) {
  return (
    <Text
      testID="fire-number"
      style={[{ color: FIRE_ORANGE }, style]}
      className={`font-extrabold ${className}`}
    >
      {children}
    </Text>
  );
}

export default FireNumber;
