import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { ArrowRight, Check, Target } from "lucide-react-native";
import { CONTRAST_OBSTACLES, CONTRAST_PLANS } from "@become/core";
import { Text } from "@/components/Text";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

function sample<T>(arr: readonly T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const first = a[i];
    const second = a[j];
    if (first !== undefined && second !== undefined) {
      a[i] = second;
      a[j] = first;
    }
  }
  return a.slice(0, Math.min(n, a.length));
}

export function ContrastScene({
  move,
  onDone,
  testID = "mind-contrast-scene",
}: MindSceneProps): React.JSX.Element {
  const { colors } = useThemeTokens();
  const reduced = useReducedMotion();

  const [step, setStep] = useState(0); // 0 outcome · 1 obstacle · 2 plan · 3 done
  const [obstacle, setObstacle] = useState<string | null>(null);
  const obstacles = useMemo(() => sample(CONTRAST_OBSTACLES, 5), []);
  const plans = useMemo(() => sample(CONTRAST_PLANS, 5), []);
  const outcome =
    move.statement?.trim() ||
    "Today, done well — the version of you you’re building.";

  const finish = () => {
    setStep(3);
    setTimeout(
      () =>
        onDone(
          obstacle
            ? { q: "The obstacle in the way", a: obstacle }
            : undefined,
        ),
      1000,
    );
  };

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
      <View className="mb-5 h-12 w-12 items-center justify-center rounded-2xl bg-success/15">
        <Target size={24} color={colors.success} />
      </View>

      {step === 0 ? (
        <Animated.View
          key="see"
          entering={reduced ? undefined : FadeInUp.duration(300)}
          className="w-full max-w-sm items-center"
        >
          <Text className="text-center text-xs uppercase tracking-widest text-muted-foreground">
            See it
          </Text>
          <Text className="mt-4 text-center text-2xl font-bold leading-snug text-foreground">
            &ldquo;{outcome}&rdquo;
          </Text>
          <Text className="mt-3 text-center text-sm text-muted-foreground">
            Picture it actually happening.
          </Text>
          <Pressable
            testID={`${testID}-obstacle-next`}
            accessibilityRole="button"
            accessibilityLabel="Now, the obstacle"
            onPress={() => setStep(1)}
            style={minTouchTarget}
            className="mt-9 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4"
          >
            <Text className="text-base font-bold text-primary-foreground">
              Now, the obstacle
            </Text>
            <ArrowRight size={20} color={colors["primary-foreground"]} />
          </Pressable>
        </Animated.View>
      ) : null}

      {step === 1 ? (
        <Animated.View
          key="obstacle"
          entering={reduced ? undefined : FadeInUp.duration(300)}
          className="w-full max-w-sm items-center"
        >
          <Text className="text-center text-2xl font-extrabold text-foreground">
            What’s most likely to get in the way?
          </Text>
          <Text className="mt-2 text-center text-muted-foreground">
            Name it honestly — that’s the point.
          </Text>
          <View className="mt-6 w-full gap-2.5">
            {obstacles.map((o, i) => (
              <Pressable
                key={o}
                testID={`${testID}-obstacle-${i}`}
                accessibilityRole="button"
                accessibilityLabel={o}
                onPress={() => {
                  setObstacle(o);
                  setStep(2);
                }}
                style={minTouchTarget}
                className="w-full rounded-2xl border border-border bg-card px-4 py-3.5"
              >
                <Text className="text-left text-base font-medium text-foreground">
                  {o}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      ) : null}

      {step === 2 ? (
        <Animated.View
          key="plan"
          entering={reduced ? undefined : FadeInUp.duration(300)}
          className="w-full max-w-sm items-center"
        >
          <Text className="text-center text-xs uppercase tracking-widest text-muted-foreground">
            When &ldquo;{obstacle}&rdquo; shows up…
          </Text>
          <Text className="mt-3 text-center text-2xl font-extrabold text-foreground">
            …then I will:
          </Text>
          <View className="mt-6 w-full gap-2.5">
            {plans.map((p, i) => (
              <Pressable
                key={p}
                testID={`${testID}-plan-${i}`}
                accessibilityRole="button"
                accessibilityLabel={p}
                onPress={finish}
                style={minTouchTarget}
                className="w-full rounded-2xl border border-border bg-card px-4 py-3.5"
              >
                <Text className="text-left text-base font-medium text-foreground">
                  {p}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      ) : null}

      {step === 3 ? (
        <Animated.View
          key="done"
          entering={reduced ? undefined : FadeIn.duration(250)}
          className="w-full max-w-sm items-center"
        >
          <View className="h-16 w-16 items-center justify-center rounded-full bg-success/20">
            <Check size={32} color={colors.success} strokeWidth={3} />
          </View>
          <Text className="mt-4 text-center text-lg font-bold text-foreground">
            Plan set.
          </Text>
          <Text className="mt-1 text-center text-sm text-muted-foreground">
            You’ve already met the obstacle once — in your head.
          </Text>
        </Animated.View>
      ) : null}
    </ScrollView>
  );
}

export default ContrastScene;
