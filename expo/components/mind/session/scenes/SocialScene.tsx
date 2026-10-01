import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { Check, Users } from "lucide-react-native";
import { ACCOUNTABILITY_ACTIONS } from "@become/core";
import { Text } from "@/components/Text";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export function SocialScene({
  move,
  onDone,
  testID = "mind-social-scene",
}: MindSceneProps): React.JSX.Element {
  const { colors } = useThemeTokens();
  const reduced = useReducedMotion();

  const [committed, setCommitted] = useState(false);
  const action = useMemo(
    () =>
      ACCOUNTABILITY_ACTIONS[
        Math.floor(Math.random() * ACCOUNTABILITY_ACTIONS.length)
      ],
    [],
  );

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
        <Users size={24} color={colors.success} />
      </View>

      <Text
        testID={`${testID}-title`}
        className="text-center text-xs uppercase tracking-widest text-muted-foreground"
      >
        {move.title}
      </Text>

      <Text
        testID={`${testID}-action`}
        className="mt-5 max-w-sm text-center text-xl font-semibold leading-relaxed text-foreground"
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
            committed ? "bg-success" : "bg-primary"
          }`}
        >
          <Check
            size={20}
            color={colors["primary-foreground"]}
            strokeWidth={3}
          />
          <Text className="text-base font-bold text-primary-foreground">
            {committed ? "I'm on it." : "I'll do this"}
          </Text>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

export default SocialScene;
