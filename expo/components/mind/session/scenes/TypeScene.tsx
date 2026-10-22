import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { ArrowRight, Check, Keyboard } from "lucide-react-native";
import { Text } from "@/components/Text";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { resolveToken, tintToken } from "@/lib/theme/tokens";

/**
 * ALWAYS BLACK, LIKE THE WEB. See `WinScene.tsx` — this scene renders
 * straight onto the player's fixed `bg-black` stage, so every colour is
 * pinned to the DARK palette, never the `useThemeTokens()` hook.
 */
const C = {
  "muted-foreground": resolveToken("muted-foreground", "dark"),
  "primary-foreground": resolveToken("primary-foreground", "dark"),
  destructive: resolveToken("destructive", "dark"),
  success: resolveToken("success", "dark"),
  /** Unmatched words — the web's `text-white/25`, derived not written out. */
  dim: tintToken("foreground", "dark", 0.25),
} as const;

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[‘’ʼ'`]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

export function TypeScene({
  move,
  onDone,
  testID = "mind-type-scene",
}: MindSceneProps): React.JSX.Element {
  const reduced = useReducedMotion();

  const statement = (move.statement ?? "").trim();
  const displayWords = useMemo(
    () => statement.split(/\s+/).filter(Boolean),
    [statement],
  );
  const targetWords = useMemo(() => words(statement), [statement]);

  const [text, setText] = useState("");
  const [locked, setLocked] = useState(false);
  const advancedRef = useRef(false);

  const typed = useMemo(() => words(text), [text]);
  const matched = useMemo(() => {
    let n = 0;
    while (
      n < typed.length &&
      n < targetWords.length &&
      typed[n] === targetWords[n]
    ) {
      n++;
    }
    return n;
  }, [typed, targetWords]);

  const complete =
    matched === targetWords.length && typed.length === targetWords.length;
  const hasError = typed.length > matched;

  useEffect(() => {
    if (!complete || advancedRef.current) return;
    advancedRef.current = true;
    setLocked(true);
    const t = setTimeout(() => onDone(), 1100);
    return () => clearTimeout(t);
  }, [complete, onDone]);

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
        <Keyboard size={24} color={C.success} />
      </View>

      {locked ? (
        <Animated.View
          key="done"
          entering={reduced ? undefined : FadeIn.duration(250)}
          className="w-full max-w-sm items-center"
        >
          <View className="h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
            <Check size={32} color={C.success} />
          </View>
          <Text className="mt-4 text-center text-lg font-bold text-white">
            In your own hand.
          </Text>
          <Text className="mt-1 text-center text-sm text-white/50">
            You wrote it. Now own it.
          </Text>
          <Pressable
            testID={`${testID}-continue`}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            onPress={() => onDone()}
            style={minTouchTarget}
            className="mt-8 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-white py-4"
          >
            <Text className="text-base font-bold text-black">
              Continue
            </Text>
            <ArrowRight size={20} color={C["primary-foreground"]} />
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View
          key="entry"
          entering={reduced ? undefined : FadeInUp.duration(300)}
          className="w-full max-w-sm items-center"
        >
          <Text className="text-center text-xs uppercase tracking-widest text-white/40">
            {move.title}
          </Text>

          <Text
            testID={`${testID}-target`}
            className="mt-5 text-center text-xl font-bold leading-snug"
          >
            {displayWords.map((w, i) => (
              <Text
                key={i}
                style={{
                  color: i < matched ? C.success : C.dim,
                }}
              >
                {w}
                {i < displayWords.length - 1 ? " " : ""}
              </Text>
            ))}
          </Text>

          <TextInput
            testID={`${testID}-input`}
            value={text}
            onChangeText={setText}
            multiline
            placeholder="Type it here…"
            placeholderTextColor={C["muted-foreground"]}
            className={`mt-6 w-full rounded-2xl border bg-white/5 p-4 text-center text-base text-white ${
              hasError ? "border-red-400/50" : "border-white/15"
            }`}
          />

          <Text className="mt-3 text-center text-xs text-white/40">
            {hasError
              ? "Almost — check the last word."
              : `${matched} / ${targetWords.length}`}
          </Text>

          <Pressable
            testID={`${testID}-skip`}
            accessibilityRole="button"
            accessibilityLabel="Skip"
            onPress={() => onDone()}
            style={minTouchTarget}
            className="mt-5 items-center justify-center"
          >
            <Text className="text-sm font-medium text-white/40">
              Skip
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </ScrollView>
  );
}

export default TypeScene;
