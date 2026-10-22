import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { Check, Users } from "lucide-react-native";
import { ACCOUNTABILITY_ACTIONS } from "@become/core";
import { Text } from "@/components/Text";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { onDarkForeground, resolveToken } from "@/lib/theme/tokens";

/**
 * ALWAYS BLACK, LIKE THE WEB. See `WinScene.tsx` — this scene renders
 * straight onto the player's fixed `bg-black` stage, so every colour is
 * pinned to the DARK palette, never the `useThemeTokens()` hook.
 */
const C = {
  "primary-foreground": resolveToken("primary-foreground", "dark"),
  success: resolveToken("success", "dark"),
} as const;

function pickAccountabilityAction(): string {
  return (
    ACCOUNTABILITY_ACTIONS[
      Math.floor(Math.random() * ACCOUNTABILITY_ACTIONS.length)
    ] ?? "Send a one-line update to someone who counts on you."
  );
}

export function SocialScene({
  move,
  onDone,
  testID = "mind-social-scene",
}: MindSceneProps): React.JSX.Element {
  const reduced = useReducedMotion();

  const [committed, setCommitted] = useState(false);
  const [action] = useState(pickAccountabilityAction);

  const commit = () => {
    if (committed) return;
    setCommitted(true);
    setTimeout(
      () =>
        onDone({
          q: "Who I am pulling in",
          a: action,
        }),
      900,
    );
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
      <View className="mb-5 h-12 w-12 items-center justify-center rounded-2xl bg-green-500/15">
        <Users size={24} color={C.success} />
      </View>

      <Text
        testID={`${testID}-title`}
        className="text-center text-xs uppercase tracking-widest text-white/40"
      >
        {move.title}
      </Text>

      <Text
        testID={`${testID}-action`}
        className="mt-5 max-w-sm text-center text-xl font-semibold leading-relaxed text-white"
      >
        {action}
      </Text>

      <Animated.View
        entering={reduced ? undefined : FadeInUp.duration(300)}
        className="w-full max-w-xs items-center"
      >
        <Pressable
          testID={`${testID}-commit`}
          accessibilityRole="button"
          accessibilityLabel={committed ? "I'm on it." : "I'll do this"}
          onPress={commit}
          style={minTouchTarget}
          className={`mt-10 w-full flex-row items-center justify-center gap-2 rounded-2xl py-4 ${
            committed ? "bg-green-500" : "bg-white"
          }`}
        >
          <Check
            size={20}
            color={committed ? onDarkForeground : C["primary-foreground"]}
            strokeWidth={3}
          />
          <Text
            className={`text-base font-bold ${
              committed ? "text-white" : "text-black"
            }`}
          >
            {committed ? "I'm on it." : "I'll do this"}
          </Text>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

export default SocialScene;
