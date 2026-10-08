import React, { useEffect, useRef } from "react";
import {
  Animated,
  View,
  StyleSheet,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "@/components/Text";
import { resolveToken, tintToken } from "@/lib/theme/tokens";

/**
 * Flame tongue specs matching web's FLAMES (webapp/components/streaks/FireNumber.tsx).
 * Where each tongue sits across the number, and how it burns.
 */
const FLAMES = [
  { left: "2%", w: 6, h: 10 },
  { left: "22%", w: 8, h: 13 },
  { left: "44%", w: 7, h: 11 },
  { left: "64%", w: 6, h: 9 },
  { left: "84%", w: 5, h: 8 },
];

/**
 * The fire number's colour (NP-317, NP-354).
 *
 * `tailwind.config.js` overrides `orange` with a single flat CSS-var colour
 * (no `-100`…`-900` shade scale — see its `colors.orange` entry), so
 * `text-orange-500 dark:text-orange-400` name classes that do not exist.
 * NativeWind silently drops both, and the Text falls back to the default
 * (near-black) ink — invisible on the dark streak card and flat black in
 * light mode, where the web shows the orange flame number. Same class of bug
 * as the onboarding Lose Weight tile (NP-310).
 *
 * The fix in NP-317 is an inline colour resolving the mode-invariant
 * `orange` token (`249 115 22`).
 *
 * NP-354 adds the flame gradient styling and animated glow matching web:
 * - Embers breathing at the foot of the digits
 * - Tongues licking off the top edge with a flame gradient
 * - Drop-shadow flame glow on the numerals
 */
const FIRE_ORANGE = resolveToken("orange", "light");
const FLAME_AMBER = resolveToken("amber", "light");
const FLAME_BRAND = resolveToken("brand", "light");
const EMBER_GLOW = tintToken("orange", "light", 0.4);
const FLAME_SHADOW = tintToken("orange", "light", 0.75);

export interface FireNumberProps {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  className?: string;
}

export function FireNumber({
  children,
  style,
  className = "",
}: FireNumberProps) {
  const flameAnim = useRef(new Animated.Value(0.75)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(flameAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(flameAnim, {
          toValue: 0.7,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [flameAnim]);

  return (
    <View testID="fire-number-container" style={styles.container}>
      {/* Embers at the foot of the digits */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ember,
          {
            opacity: flameAnim,
          },
        ]}
      >
        <LinearGradient
          colors={["transparent", EMBER_GLOW]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Tongues licking off the top edge */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.flamesContainer,
          {
            opacity: flameAnim,
          },
        ]}
      >
        {FLAMES.map((f, i) => (
          <LinearGradient
            key={i}
            colors={[FLAME_AMBER, FIRE_ORANGE, FLAME_BRAND]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              position: "absolute",
              left: f.left as never,
              bottom: 0,
              width: f.w,
              height: f.h,
              borderRadius: 3,
              opacity: 0.85,
            }}
          />
        ))}
      </Animated.View>

      {/* The digits themselves, with flame glow and solid orange ink */}
      <Text
        testID="fire-number"
        style={[
          {
            color: FIRE_ORANGE,
            textShadowColor: FLAME_SHADOW,
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 8,
          },
          style,
        ]}
        className={`font-extrabold ${className}`}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    alignSelf: "flex-start",
  },
  ember: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "40%",
    borderRadius: 8,
    overflow: "hidden",
  },
  flamesContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: -6,
    height: 14,
    overflow: "visible",
  },
});

export default FireNumber;
