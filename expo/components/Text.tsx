/* eslint-disable no-restricted-imports -- the one file allowed to reach for React Native's Text */
import { Text as RNText } from "react-native";
import type { TextProps as RNTextProps } from "react-native";
import { geistFontFamily } from "@/lib/theme/fonts";

export type TextProps = RNTextProps;

/**
 * THE APP'S TEXT — React Native's, with Geist on it.
 *
 * Every screen and every component imports Text from here (ESLint's
 * `no-restricted-imports` fails the build on `import { Text } from
 * "react-native"`), because React Native has no cascade: a `<Text>` with no
 * `fontFamily` renders in the system font no matter what
 * `tailwind.config.js` says, and the web's Geist would have reached only the
 * handful of elements that happened to carry a `font-*` class.
 *
 * The family is resolved from the same two inputs the web's CSS uses — the
 * family class (`font-mono` / `font-sans`) and the weight class
 * (`font-semibold`) or their inline equivalents — and applied as an INLINE
 * style, which is NativeWind's highest-precedence source short of
 * `!important`. That is deliberate: `font-mono font-bold` has to resolve to
 * ONE face (`GeistMono-Bold`), and CSS cannot express that because
 * `font-family` and `font-weight` are two properties. A caller's own
 * `style={{ fontFamily }}` still wins — it sits after ours in the array.
 */
export function Text({ className, style, ...rest }: TextProps) {
  return (
    <RNText
      {...rest}
      className={className}
      style={[{ fontFamily: geistFontFamily(className, style) }, style]}
    />
  );
}
