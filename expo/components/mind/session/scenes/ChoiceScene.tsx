import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { ArrowRight } from "lucide-react-native";
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
} as const;

export function ChoiceScene({
  move,
  onDone,
  testID = "mind-choice-scene",
}: MindSceneProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const options = move.options ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const response = picked != null ? options[picked]?.response : undefined;

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
      {picked === null ? (
        <Animated.View
          key="q"
          entering={reduced ? undefined : FadeIn.duration(250)}
          className="w-full max-w-sm items-center"
        >
          <Text
            testID={`${testID}-title`}
            className="text-center text-2xl font-extrabold leading-snug text-white"
          >
            {move.title}
          </Text>
          {move.subtitle ? (
            <Text
              testID={`${testID}-subtitle`}
              className="mt-2 text-center text-white/50"
            >
              {move.subtitle}
            </Text>
          ) : null}

          <View className="mt-7 w-full gap-2.5">
            {options.map((o, i) => (
              <Pressable
                key={i}
                testID={`${testID}-option-${i}`}
                accessibilityRole="button"
                accessibilityLabel={o.label}
                onPress={() => setPicked(i)}
                style={minTouchTarget}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5"
              >
                <Text className="text-left text-base font-medium text-white/90">
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          key="a"
          entering={reduced ? undefined : FadeInUp.duration(300)}
          className="w-full max-w-sm items-center"
        >
          <Text className="text-center text-xs uppercase tracking-widest text-white/40">
            {options[picked]?.label}
          </Text>
          {response ? (
            <Text
              testID={`${testID}-response`}
              className="mt-5 text-center text-xl font-semibold leading-relaxed text-white"
            >
              {response}
            </Text>
          ) : null}

          <Pressable
            testID={`${testID}-continue`}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            onPress={() =>
              onDone(
                picked != null
                  ? { q: move.title, a: options[picked]?.label ?? "" }
                  : undefined,
              )
            }
            style={minTouchTarget}
            className="mt-10 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-white py-4"
          >
            <Text className="text-base font-bold text-black">
              Continue
            </Text>
            <ArrowRight size={20} color={C["primary-foreground"]} />
          </Pressable>
        </Animated.View>
      )}
    </ScrollView>
  );
}

export default ChoiceScene;
