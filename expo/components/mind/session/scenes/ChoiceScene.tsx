import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { ArrowRight } from "lucide-react-native";
import { Text } from "@/components/Text";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export function ChoiceScene({
  move,
  onDone,
  testID = "mind-choice-scene",
}: MindSceneProps): React.JSX.Element {
  const { colors } = useThemeTokens();
  const reduced = useReducedMotion();
  const options = move.options ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const response = picked != null ? options[picked]?.response : undefined;

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
      {picked === null ? (
        <Animated.View
          key="q"
          entering={reduced ? undefined : FadeIn.duration(250)}
          className="w-full max-w-sm items-center"
        >
          <Text
            testID={`${testID}-title`}
            className="text-center text-2xl font-extrabold leading-snug text-foreground"
          >
            {move.title}
          </Text>
          {move.subtitle ? (
            <Text
              testID={`${testID}-subtitle`}
              className="mt-2 text-center text-muted-foreground"
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
                className="w-full rounded-2xl border border-border bg-card px-4 py-3.5"
              >
                <Text className="text-left text-base font-medium text-foreground">
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
          <Text className="text-center text-xs uppercase tracking-widest text-muted-foreground">
            {options[picked]?.label}
          </Text>
          {response ? (
            <Text
              testID={`${testID}-response`}
              className="mt-5 text-center text-xl font-semibold leading-relaxed text-foreground"
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
            className="mt-10 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4"
          >
            <Text className="text-base font-bold text-primary-foreground">
              Continue
            </Text>
            <ArrowRight size={20} color={colors["primary-foreground"]} />
          </Pressable>
        </Animated.View>
      )}
    </ScrollView>
  );
}

export default ChoiceScene;
