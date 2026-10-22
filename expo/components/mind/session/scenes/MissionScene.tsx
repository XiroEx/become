import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { Check, Pencil, Target } from "lucide-react-native";
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
  "muted-foreground": resolveToken("muted-foreground", "dark"),
  "primary-foreground": resolveToken("primary-foreground", "dark"),
  accent: resolveToken("accent", "dark"),
} as const;

const QUESTION = "What is your one move today?";
const COMMENTARY =
  /^(consider|think about|notice|reflect|ask yourself|try|remember)\b/i;

export function MissionScene({
  move,
  onDone,
  testID = "mind-mission-scene",
}: MindSceneProps): React.JSX.Element {
  const reduced = useReducedMotion();

  const saved = move.prompt?.trim();
  const savedIsAction =
    Boolean(saved) && !saved?.endsWith("?") && !COMMENTARY.test(saved ?? "");

  const [writing, setWriting] = useState(!savedIsAction);
  const [text, setText] = useState("");
  const [locked, setLocked] = useState<string | null>(null);

  const commit = (answer: string) => {
    if (locked || !answer) return;
    setLocked(answer);
    setTimeout(() => onDone({ q: QUESTION, a: answer }), 900);
  };

  if (locked) {
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
        <Animated.View
          key="locked"
          entering={reduced ? undefined : FadeIn.duration(250)}
          className="items-center"
        >
          <View className="mb-5 h-16 w-16 items-center justify-center rounded-full bg-amber-500/20">
            <Check size={32} color={C.accent} strokeWidth={3} />
          </View>
          <Text className="text-center text-sm font-semibold text-amber-300">
            Locked in.
          </Text>
          <Text
            testID={`${testID}-locked-answer`}
            className="mt-3 max-w-sm text-center text-lg font-bold leading-snug text-white"
          >
            {locked}
          </Text>
        </Animated.View>
      </ScrollView>
    );
  }

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
      <View className="mb-5 h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15">
        <Target size={24} color={C.accent} />
      </View>

      <Text
        testID={`${testID}-title`}
        className="text-center text-xs uppercase tracking-widest text-white/40"
      >
        {move.title || "Your one move today"}
      </Text>

      <Text
        testID={`${testID}-question`}
        className="mt-4 max-w-sm text-center text-2xl font-extrabold leading-snug text-white"
      >
        {QUESTION}
      </Text>

      {saved && !savedIsAction ? (
        <Text className="mt-3 max-w-sm text-center text-sm leading-relaxed text-white/50">
          {saved}
        </Text>
      ) : null}

      {writing ? (
        <Animated.View
          key="write"
          entering={reduced ? undefined : FadeInUp.duration(250)}
          className="w-full max-w-sm items-center"
        >
          <TextInput
            testID={`${testID}-input`}
            value={text}
            onChangeText={setText}
            placeholder="e.g. Finish the section I keep pushing"
            placeholderTextColor={C["muted-foreground"]}
            multiline
            numberOfLines={3}
            className="mt-6 w-full rounded-2xl border border-white/15 bg-white/5 p-4 text-center text-base text-white"
          />

          <Pressable
            testID={`${testID}-commit`}
            accessibilityRole="button"
            accessibilityLabel="Lock it in"
            disabled={!text.trim()}
            onPress={() => commit(text.trim())}
            style={minTouchTarget}
            className={`mt-6 w-full max-w-xs flex-row items-center justify-center gap-2 rounded-2xl bg-white py-4 ${
              !text.trim() ? "opacity-40" : ""
            }`}
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

          {savedIsAction ? (
            <Pressable
              testID={`${testID}-use-usual`}
              accessibilityRole="button"
              accessibilityLabel="Use my usual move instead"
              onPress={() => setWriting(false)}
              style={minTouchTarget}
              className="mt-3 items-center justify-center"
            >
              <Text className="text-sm font-medium text-white/40">
                Use my usual move instead
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : (
        <Animated.View
          key="saved"
          entering={reduced ? undefined : FadeInUp.duration(250)}
          className="w-full max-w-sm items-center"
        >
          <Text
            testID={`${testID}-saved-action`}
            className="mt-6 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-center text-lg font-bold leading-snug text-white"
          >
            {saved}
          </Text>

          <Pressable
            testID={`${testID}-commit`}
            accessibilityRole="button"
            accessibilityLabel="That is the move"
            onPress={() => commit(saved ?? "")}
            style={minTouchTarget}
            className="mt-8 w-full max-w-xs flex-row items-center justify-center gap-2 rounded-2xl bg-white py-4"
          >
            <Check
              size={20}
              color={C["primary-foreground"]}
              strokeWidth={3}
            />
            <Text className="text-base font-bold text-black">
              That is the move
            </Text>
          </Pressable>

          <Pressable
            testID={`${testID}-switch-custom`}
            accessibilityRole="button"
            accessibilityLabel="Something else today"
            onPress={() => setWriting(true)}
            style={minTouchTarget}
            className="mt-3 flex-row items-center justify-center gap-1.5"
          >
            <Pencil size={14} color={C["muted-foreground"]} />
            <Text className="text-sm font-medium text-white/50">
              Something else today
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </ScrollView>
  );
}

export default MissionScene;
