import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { ArrowRight, Shield } from "lucide-react-native";
import { SABOTAGE_PATTERNS } from "@become/core";
import { Text } from "@/components/Text";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { resolveToken } from "@/lib/theme/tokens";

/**
 * ALWAYS BLACK, LIKE THE WEB. See `WinScene.tsx` — this scene renders
 * straight onto the player's fixed `bg-black` stage, so every colour is
 * pinned to the DARK palette, never the `useThemeTokens()` hook.
 */
const C = {
  "primary-foreground": resolveToken("primary-foreground", "dark"),
  destructive: resolveToken("destructive", "dark"),
} as const;

const WINDOW = 6;

function pickPatterns(): (typeof SABOTAGE_PATTERNS)[number][] {
  const start = Math.floor(Math.random() * SABOTAGE_PATTERNS.length);
  return Array.from(
    { length: Math.min(WINDOW, SABOTAGE_PATTERNS.length) },
    (_, i) => SABOTAGE_PATTERNS[(start + i) % SABOTAGE_PATTERNS.length],
  ).filter((p): p is (typeof SABOTAGE_PATTERNS)[number] => p !== undefined);
}

export function PatternScene({
  move,
  onDone,
  testID = "mind-pattern-scene",
}: MindSceneProps): React.JSX.Element {
  const reduced = useReducedMotion();

  const [selected, setSelected] = useState<number | null>(null);
  const [patterns] = useState(pickPatterns);

  return (
    <ScrollView
      testID={testID}
      className="flex-1 bg-black"
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        paddingVertical: 32,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="mb-5 h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15">
        <Shield size={24} color={C.destructive} />
      </View>

      {selected === null ? (
        <Animated.View
          key="pick"
          entering={reduced ? undefined : FadeIn.duration(250)}
          className="w-full max-w-sm items-center"
        >
          <Text
            testID={`${testID}-title`}
            className="text-center text-2xl font-extrabold text-white"
          >
            {move.title}
          </Text>
          <Text className="mt-2 text-center text-white/50">
            Which one&apos;s running right now?
          </Text>

          <View className="mt-6 w-full gap-2">
            {patterns.map((p, i) => {
              if (!p) return null;
              return (
                <Pressable
                  key={i}
                  testID={`${testID}-pattern-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={p.pattern}
                  onPress={() => setSelected(i)}
                  style={minTouchTarget}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <Text className="text-left text-sm font-medium text-white/90">
                    {p.pattern}
                  </Text>
                </Pressable>
              );
            })}

            <Pressable
              testID={`${testID}-skip`}
              accessibilityRole="button"
              accessibilityLabel="None of these right now"
              onPress={() => onDone()}
              style={minTouchTarget}
              className="mt-2 w-full items-center justify-center"
            >
              <Text className="text-sm font-medium text-white/40">
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
          <Text className="text-center text-xs uppercase tracking-widest text-white/40">
            {selected !== null ? patterns[selected]?.pattern : ""}
          </Text>
          <Text
            testID={`${testID}-override`}
            className="mt-5 text-center text-xl font-semibold leading-relaxed text-white"
          >
            {selected !== null ? patterns[selected]?.override : ""}
          </Text>

          <Pressable
            testID={`${testID}-continue`}
            accessibilityRole="button"
            accessibilityLabel="Override it"
            onPress={() => {
              const cur = selected !== null ? patterns[selected] : undefined;
              onDone(
                cur
                  ? {
                      q: "The pattern I catch myself in",
                      a: cur.pattern,
                    }
                  : undefined,
              );
            }}
            style={minTouchTarget}
            className="mt-10 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-white py-4"
          >
            <Text className="text-base font-bold text-black">
              Override it
            </Text>
            <ArrowRight size={20} color={C["primary-foreground"]} />
          </Pressable>
        </Animated.View>
      )}
    </ScrollView>
  );
}

export default PatternScene;
