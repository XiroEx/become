import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { ArrowRight, Shield } from "lucide-react-native";
import { SABOTAGE_PATTERNS } from "@become/core";
import { Text } from "@/components/Text";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

const WINDOW = 6;

export function PatternScene({
  move,
  onDone,
  testID = "mind-pattern-scene",
}: MindSceneProps): React.JSX.Element {
  const { colors } = useThemeTokens();
  const reduced = useReducedMotion();

  const [selected, setSelected] = useState<number | null>(null);

  const patterns = useMemo(() => {
    const start = Math.floor(Math.random() * SABOTAGE_PATTERNS.length);
    return Array.from(
      { length: Math.min(WINDOW, SABOTAGE_PATTERNS.length) },
      (_, i) => SABOTAGE_PATTERNS[(start + i) % SABOTAGE_PATTERNS.length],
    );
  }, []);

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
      <View className="mb-5 h-12 w-12 items-center justify-center rounded-2xl bg-destructive/15">
        <Shield size={24} color={colors.destructive} />
      </View>

      {selected === null ? (
        <Animated.View
          key="pick"
          entering={reduced ? undefined : FadeIn.duration(250)}
          className="w-full max-w-sm items-center"
        >
          <Text
            testID={`${testID}-title`}
            className="text-center text-2xl font-extrabold text-foreground"
          >
            {move.title}
          </Text>
          <Text className="mt-2 text-center text-muted-foreground">
            Which one&apos;s running right now?
          </Text>

          <View className="mt-6 w-full gap-2">
            {patterns.map((p, i) => (
              <Pressable
                key={i}
                testID={`${testID}-pattern-${i}`}
                accessibilityRole="button"
                accessibilityLabel={p.pattern}
                onPress={() => setSelected(i)}
                style={minTouchTarget}
                className="w-full rounded-2xl border border-border bg-card px-4 py-3"
              >
                <Text className="text-left text-sm font-medium text-foreground">
                  {p.pattern}
                </Text>
              </Pressable>
            ))}

            <Pressable
              testID={`${testID}-skip`}
              accessibilityRole="button"
              accessibilityLabel="None of these right now"
              onPress={() => onDone()}
              style={minTouchTarget}
              className="mt-2 w-full items-center justify-center"
            >
              <Text className="text-sm font-medium text-muted-foreground">
                None of these right now
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          key="override"
          entering={reduced ? undefined : FadeInUp.duration(300)}
          className="w-full max-w-sm items-center"
        >
          <Text className="text-center text-xs uppercase tracking-widest text-muted-foreground">
            {patterns[selected].pattern}
          </Text>
          <Text
            testID={`${testID}-override`}
            className="mt-5 text-center text-xl font-semibold leading-relaxed text-foreground"
          >
            {patterns[selected].override}
          </Text>

          <Pressable
            testID={`${testID}-continue`}
            accessibilityRole="button"
            accessibilityLabel="Override it"
            onPress={() =>
              onDone(
                selected !== null
                  ? {
                      q: "The pattern I catch myself in",
                      a: patterns[selected].pattern,
                    }
                  : undefined,
              )
            }
            style={minTouchTarget}
            className="mt-10 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4"
          >
            <Text className="text-base font-bold text-primary-foreground">
              Override it
            </Text>
            <ArrowRight size={20} color={colors["primary-foreground"]} />
          </Pressable>
        </Animated.View>
      )}
    </ScrollView>
  );
}

export default PatternScene;
