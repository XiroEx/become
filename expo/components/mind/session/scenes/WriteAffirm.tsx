import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { Check, Keyboard } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface WriteAffirmProps {
  statement?: string;
  onDone: () => void;
  testID?: string;
}

export function WriteAffirm({
  statement,
  onDone,
  testID = "mind-write-affirm",
}: WriteAffirmProps): React.JSX.Element {
  const { colors } = useThemeTokens();
  const reduced = useReducedMotion();

  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const valid = text.trim().length >= 3;

  const lock = () => {
    if (!valid || done) return;
    setDone(true);
    setTimeout(onDone, 900);
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
      <View className="mb-5 h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
        <Keyboard size={24} color={colors.primary} />
      </View>

      {done ? (
        <Animated.View
          key="done"
          entering={reduced ? undefined : FadeIn.duration(250)}
          className="w-full max-w-sm items-center"
        >
          <View className="h-16 w-16 items-center justify-center rounded-full bg-success/20">
            <Check size={32} color={colors.success} strokeWidth={3} />
          </View>
          <Text className="mt-4 text-center text-lg font-bold text-foreground">
            Written in.
          </Text>
          <Text className="mt-1 text-center text-sm text-muted-foreground">
            You meant it.
          </Text>
        </Animated.View>
      ) : (
        <Animated.View
          key="entry"
          entering={reduced ? undefined : FadeInUp.duration(300)}
          className="w-full max-w-sm items-center"
        >
          {statement ? (
            <Text
              testID={`${testID}-statement`}
              className="text-center text-xl font-bold leading-snug text-foreground"
            >
              &ldquo;{statement}&rdquo;
            </Text>
          ) : null}
          <Text className="mt-3 text-center text-sm text-muted-foreground">
            Write it — own words are fine.
          </Text>

          <TextInput
            testID={`${testID}-input`}
            value={text}
            onChangeText={setText}
            placeholder="Type it…"
            placeholderTextColor={colors["muted-foreground"]}
            multiline
            numberOfLines={3}
            className="mt-5 w-full rounded-2xl border border-border bg-card p-4 text-center text-base text-foreground"
          />

          <Pressable
            testID={`${testID}-lock-in`}
            accessibilityRole="button"
            accessibilityLabel="Lock it in"
            disabled={!valid}
            onPress={lock}
            style={minTouchTarget}
            className={`mt-6 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4 ${
              !valid ? "opacity-40" : ""
            }`}
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

export default WriteAffirm;
