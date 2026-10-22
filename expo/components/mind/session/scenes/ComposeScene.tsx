import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { Check, SlidersHorizontal } from "lucide-react-native";
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
  success: resolveToken("success", "dark"),
} as const;

export function ComposeScene({
  move,
  onDone,
  testID = "mind-compose-scene",
}: MindSceneProps): React.JSX.Element {
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
      <View className="mb-5 h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
        {locked ? (
          <Check size={24} color={C.success} strokeWidth={3} />
        ) : (
          <SlidersHorizontal size={24} color={C["primary-foreground"]} />
        )}
      </View>

      {!locked ? (
        <Text className="mb-1 text-center text-xs uppercase tracking-widest text-white/40">
          {move.title}
        </Text>
      ) : null}
      {!locked ? (
        <Text className="mb-6 text-center text-sm text-white/50">
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
                className="text-center text-2xl font-bold leading-relaxed text-white"
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
                  ? "border border-white/40 bg-white/10"
                  : val
                    ? "border border-white/10 bg-white/5"
                    : "border border-dashed border-white/15 bg-white/5"
              }`}
            >
              <Text
                className={`text-xl font-bold ${
                  val ? "text-white" : "text-white/30"
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
          <Text className="text-center text-base font-semibold text-green-300">
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
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5"
            >
              <Text className="text-sm font-medium text-white/90">
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
            className="w-full flex-row items-center justify-center gap-2 rounded-2xl bg-white py-4"
          >
            <Check
              size={20}
              color={C["primary-foreground"]}
              strokeWidth={3}
            />
            <Text className="text-base font-bold text-black">
              Lock it in
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </ScrollView>
  );
}

export default ComposeScene;
