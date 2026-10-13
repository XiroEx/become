import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { Check, SlidersHorizontal } from "lucide-react-native";
import { Text } from "@/components/Text";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export function ComposeScene({
  move,
  onDone,
  testID = "mind-compose-scene",
}: MindSceneProps): React.JSX.Element {
  const { colors } = useThemeTokens();
  const reduced = useReducedMotion();

  const template = move.compose?.template ?? "{0}";
  const blanks = move.compose?.blanks ?? [["ready"]];

  const segments = useMemo(
    () => template.split(/(\{\d+\})/).filter((s) => s !== ""),
    [template],
  );

  const [picks, setPicks] = useState<(string | null)[]>(() =>
    blanks.map(() => null),
  );
  const [editing, setEditing] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);

  const firstNull = picks.findIndex((p) => p === null);
  const current = editing !== null ? editing : firstNull;
  const allFilled = picks.every((p) => p !== null);

  const choose = (word: string) => {
    if (current < 0 || locked) return;
    setPicks((prev) => {
      const next = [...prev];
      next[current] = word;
      return next;
    });
    setEditing(null);
  };

  const lock = () => {
    if (!allFilled || locked) return;
    setLocked(true);
    setTimeout(() => onDone(), 1100);
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
      <View className="mb-5 h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
        {locked ? (
          <Check size={24} color={colors.success} strokeWidth={3} />
        ) : (
          <SlidersHorizontal size={24} color={colors.primary} />
        )}
      </View>

      {!locked ? (
        <Text className="mb-1 text-center text-xs uppercase tracking-widest text-muted-foreground">
          {move.title}
        </Text>
      ) : null}
      {!locked ? (
        <Text className="mb-6 text-center text-sm text-muted-foreground">
          {move.subtitle ?? "Choose the words that fit."}
        </Text>
      ) : null}

      <View className="w-full max-w-sm flex-row flex-wrap items-center justify-center">
        {segments.map((s, i) => {
          const m = s.match(/^\{(\d+)\}$/);
          if (!m) {
            return (
              <Text
                key={i}
                className="text-center text-2xl font-bold leading-relaxed text-foreground"
              >
                {s}
              </Text>
            );
          }
          const bi = Number(m[1]);
          const val = picks[bi];
          const isCurrent = !locked && bi === current;
          return (
            <Pressable
              key={i}
              testID={`${testID}-blank-${bi}`}
              accessibilityRole="button"
              accessibilityLabel={
                val ? `Blank ${bi + 1}: ${val}` : `Blank ${bi + 1}: empty`
              }
              onPress={!locked ? () => setEditing(bi) : undefined}
              style={minTouchTarget}
              className={`mx-1 my-0.5 rounded-lg px-2.5 py-1 ${
                isCurrent
                  ? "border border-primary bg-primary/20"
                  : val
                    ? "bg-card border border-border"
                    : "border border-dashed border-border bg-muted/40"
              }`}
            >
              <Text
                className={`text-xl font-bold ${
                  val ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {val ?? "_____"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {locked ? (
        <Animated.View
          key="locked"
          entering={reduced ? undefined : FadeIn.duration(250)}
          className="mt-6 items-center"
        >
          <Text className="text-center text-base font-semibold text-success">
            That&apos;s yours. Own it.
          </Text>
        </Animated.View>
      ) : current >= 0 ? (
        <Animated.View
          key={`opts-${current}`}
          entering={reduced ? undefined : FadeInUp.duration(250)}
          className="mt-8 w-full max-w-sm flex-row flex-wrap justify-center gap-2"
        >
          {blanks[current]?.map((opt) => (
            <Pressable
              key={opt}
              testID={`${testID}-option-${opt}`}
              accessibilityRole="button"
              accessibilityLabel={opt}
              onPress={() => choose(opt)}
              style={minTouchTarget}
              className="rounded-2xl border border-border bg-card px-4 py-2.5"
            >
              <Text className="text-sm font-medium text-foreground">
                {opt}
              </Text>
            </Pressable>
          ))}
        </Animated.View>
      ) : (
        <Animated.View
          key="lock"
          entering={reduced ? undefined : FadeInUp.duration(250)}
          className="mt-8 w-full max-w-xs items-center"
        >
          <Pressable
            testID={`${testID}-lock-in`}
            accessibilityRole="button"
            accessibilityLabel="Lock it in"
            onPress={lock}
            style={minTouchTarget}
            className="w-full flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4"
          >
            <Check
              size={20}
              color={colors["primary-foreground"]}
              strokeWidth={3}
            />
            <Text className="text-base font-bold text-primary-foreground">
              Lock it in
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </ScrollView>
  );
}

export default ComposeScene;
