import React, { useEffect, useMemo } from "react";
import {
  Animated,
  View,
  StyleSheet,
  type DimensionValue,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "@/components/Text";
import { resolveToken, tintToken } from "@/lib/theme/tokens";
import {
  EMBER_BAND,
  FLAME_BAND,
  FLAME_TONGUES as FLAMES,
  percent,
} from "@/lib/streaks/fireNumberLayout";

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

/** The shared `percent()`, in the shape React Native's style types want. */
function pct(fraction: number): DimensionValue {
  return percent(fraction) as `${number}%`;
}

export interface FireNumberProps {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  className?: string;
}

/**
 * A number that is on fire — and the fire NEVER lands on a numeral.
 *
 * The tongues used to hang in a band 6px above the digits' top with 8–13px of
 * flame below that, and the ember bed covered the bottom 40% of the number, so
 * on the dashboard's Super Streak tile the flame was drawn across the digits
 * (found capturing store screenshots, 2026-10-13 — same bug on web).
 *
 * Both decorations now sit in bands OUTSIDE the digits' text box — one at
 * `bottom: "100%"` (above), one at `top: "100%"` (below) — and each band is
 * `overflow: "hidden"`, so a tongue taller than its band is CLIPPED at the
 * digits' edge rather than painted over them. The bands and the tongues are
 * sized in PERCENTAGES of the text's own box (lib/streaks/fireNumberLayout,
 * shared with the web), which is what makes that hold at 1, 2 and 3 digits and
 * at the largest accessibility text size without a number to re-tune.
 */
export function FireNumber({
  children,
  style,
  className = "",
}: FireNumberProps) {
  const emberAnim = useMemo(() => new Animated.Value(0.75), []);
  const tongueAnims = useMemo(
    () => FLAMES.map(() => new Animated.Value(0)),
    [],
  );

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(emberAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(emberAnim, {
          toValue: 0.7,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [emberAnim]);

  useEffect(() => {
    // One loop per tongue, each on its own clock, so the five burn out of step
    // the way the web's staggered CSS keyframes do.
    const loops = tongueAnims.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(FLAMES[i]!.delayMs),
          Animated.timing(value, {
            toValue: 1,
            duration: FLAMES[i]!.durationMs,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [tongueAnims]);

  return (
    <View testID="fire-number-container" style={styles.container}>
      {/* Tongues licking off the top edge, in a clipped band ABOVE the digits */}
      <View
        testID="fire-flames"
        pointerEvents="none"
        style={[styles.flameBand, { height: pct(FLAME_BAND) }]}
      >
        {FLAMES.map((f, i) => (
          <Animated.View
            key={i}
            testID={`fire-lick-${i}`}
            style={{
              position: "absolute",
              left: pct(f.left),
              bottom: 0,
              width: pct(f.width),
              // Taller than the band on purpose — the band clips it, which is
              // what keeps every pixel of flame off the digits.
              height: pct(f.height / FLAME_BAND),
              opacity: tongueAnims[i]!.interpolate({
                inputRange: [0, 0.35, 0.7, 1],
                outputRange: [0.95, 0.8, 0.4, 0],
              }),
              transform: [
                {
                  scaleY: tongueAnims[i]!.interpolate({
                    inputRange: [0, 0.35, 0.7, 1],
                    outputRange: [0.7, 1.5, 1.2, 0.8],
                  }),
                },
              ],
            }}
          >
            <LinearGradient
              colors={[FLAME_AMBER, FIRE_ORANGE, FLAME_BRAND]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        ))}
      </View>

      {/* Embers at the foot of the digits, in a clipped band BELOW them */}
      <Animated.View
        testID="fire-embers"
        pointerEvents="none"
        style={[styles.emberBand, { height: pct(EMBER_BAND), opacity: emberAnim }]}
      >
        <LinearGradient
          colors={[EMBER_GLOW, "transparent"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
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
  // The two bands. `bottom: "100%"` and `top: "100%"` put them wholly outside
  // the digits' box; `overflow: "hidden"` is what holds the fire inside them.
  flameBand: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: "100%",
    overflow: "hidden",
  },
  emberBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "100%",
    overflow: "hidden",
  },
});

export default FireNumber;
