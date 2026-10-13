import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { Check } from "lucide-react-native";
import { Text } from "@/components/Text";
import { RevealText } from "@/components/mind/session/RevealText";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { lightHaptic, type HapticFn } from "@/lib/feedback/haptics";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export const HOLD_MS = 1600;
export const HOLD_TICK_MS = 50;
export const HOLD_DONE_HOLD_MS = 700;

const RADIUS = 54;
const CIRC = 2 * Math.PI * RADIUS;

export interface IdentitySceneProps extends MindSceneProps {
  haptic?: HapticFn;
}

export function IdentityScene({
  move,
  onDone,
  testID = "mind-identity-scene",
  haptic = lightHaptic,
}: IdentitySceneProps): React.JSX.Element {
  const { colors } = useThemeTokens();
  const reduced = useReducedMotion();

  const sentenceCount = (move.statement || "")
    .split(/[.!?]+/)
    .filter((s) => s.trim()).length;
  const revealSpeed =
    sentenceCount > 3 ? Math.max(0.45, 1 - (sentenceCount - 3) * 0.15) : 1;

  const [ready, setReady] = useState(false);
  const [held, setHeld] = useState(0);
  const [holding, setHolding] = useState(false);
  const [affirmed, setAffirmed] = useState(false);

  // Hold timer: ticks every 50ms while a finger is down until it fills the ring.
  useEffect(() => {
    if (!holding || affirmed) return;
    const t = setInterval(() => {
      setHeld((ms) => {
        const next = ms + HOLD_TICK_MS;
        if (next >= HOLD_MS) {
          setHolding(false);
          setAffirmed(true);
          haptic();
          setTimeout(() => onDone(), HOLD_DONE_HOLD_MS);
          return HOLD_MS;
        }
        return next;
      });
    }, HOLD_TICK_MS);
    return () => clearInterval(t);
  }, [holding, affirmed, onDone, haptic]);

  const press = () => {
    if (affirmed) return;
    setHeld(0);
    setHolding(true);
  };

  const release = () => {
    if (affirmed) return;
    setHolding(false);
    setHeld(0);
  };

  const progress = Math.min(1, held / HOLD_MS);

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        paddingVertical: 32,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-xs uppercase tracking-widest text-muted-foreground">
        {move.title}
      </Text>

      <RevealText
        testID={`${testID}-line`}
        text={`“${move.statement ?? ""}”`}
        onComplete={() => setReady(true)}
        speed={revealSpeed}
        className="mt-6 max-w-sm text-center text-2xl font-bold leading-snug text-foreground"
      />

      <View className="mt-10 min-h-[220px] w-full items-center justify-center">
        {ready ? (
          <Animated.View
            entering={reduced ? undefined : FadeInDown.duration(400)}
            className="items-center"
          >
            <Pressable
              testID={`${testID}-button`}
              accessibilityRole="button"
              accessibilityLabel="Hold to affirm"
              accessibilityHint="Press and hold until the ring fills"
              onPressIn={press}
              onPressOut={release}
              onAccessibilityTap={() => {
                if (affirmed) return;
                setHeld(HOLD_MS);
                setHolding(false);
                setAffirmed(true);
                haptic();
                setTimeout(() => onDone(), HOLD_DONE_HOLD_MS);
              }}
              style={[minTouchTarget, { height: 128, width: 128 }]}
              className="items-center justify-center rounded-full"
            >
              <Svg
                width={128}
                height={128}
                viewBox="0 0 120 120"
                style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
              >
                <Circle
                  cx="60"
                  cy="60"
                  r={RADIUS}
                  fill="none"
                  stroke={colors.border}
                  strokeWidth="6"
                />
                <Circle
                  testID={`${testID}-ring`}
                  cx="60"
                  cy="60"
                  r={RADIUS}
                  fill="none"
                  stroke={affirmed ? colors.success : colors.primary}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * (1 - progress)}
                />
              </Svg>
              <View className="h-24 w-24 items-center justify-center rounded-full bg-muted">
                {affirmed ? (
                  <Check testID={`${testID}-check`} size={36} color={colors.success} />
                ) : (
                  <Text className="px-2 text-center text-xs font-semibold text-foreground">
                    Hold to affirm
                  </Text>
                )}
              </View>
            </Pressable>

            <Text
              testID={`${testID}-status`}
              accessibilityLiveRegion="polite"
              className="mt-6 text-sm text-muted-foreground"
            >
              {affirmed ? "Locked in." : "Press and hold"}
            </Text>

            {!affirmed ? (
              <Pressable
                testID={`${testID}-skip`}
                accessibilityRole="button"
                accessibilityLabel="Skip"
                onPress={() => onDone()}
                style={minTouchTarget}
                className="mt-3 items-center justify-center"
              >
                <Text className="text-sm font-medium text-muted-foreground">
                  Skip
                </Text>
              </Pressable>
            ) : null}
          </Animated.View>
        ) : null}
      </View>
    </ScrollView>
  );
}

export default IdentityScene;
