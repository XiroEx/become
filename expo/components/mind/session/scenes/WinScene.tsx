import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { Trophy } from "lucide-react-native";
import { apiFetch, MindWinCreateResponseSchema } from "@become/api-client";
import { Text } from "@/components/Text";
import { DoneBadge } from "@/components/mind/session/scenes/DoneBadge";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { onDarkForeground, resolveToken } from "@/lib/theme/tokens";

/**
 * ALWAYS BLACK, LIKE THE WEB. This scene renders straight onto the session
 * player's fixed `bg-black` stage (the web's `WinScene` has no surface of its
 * own and never reads `prefers-color-scheme`), so every colour below is
 * pinned to the DARK palette via `resolveToken` — not the `useThemeTokens()`
 * hook — and every surface is a literal dark class, mirroring the web.
 */
const C = {
  foreground: onDarkForeground,
  "muted-foreground": resolveToken("muted-foreground", "dark"),
  "primary-foreground": resolveToken("primary-foreground", "dark"),
  accent: resolveToken("accent", "dark"),
  success: resolveToken("success", "dark"),
} as const;

export function WinScene({
  move,
  onDone,
  preview,
  testID = "mind-win-scene",
}: MindSceneProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const { token } = useAuth();

  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const valid = text.trim().length >= 3;

  const save = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    if (!preview) {
      try {
        await apiFetch("/api/mind/wins", MindWinCreateResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          method: "POST",
          body: {
            win: text.trim(),
            tz: new Date().getTimezoneOffset(),
          },
        });
      } catch {
        /* best-effort: failed write never blocks the session */
      }
    }
    setSaved(true);
    setTimeout(
      () =>
        onDone({
          q: move.prompt ?? move.title,
          a: text.trim(),
        }),
      1100,
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
      <View className="mb-5 h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15">
        <Trophy size={24} color={C.accent} />
      </View>

      {saved ? (
        <Animated.View
          key="saved"
          entering={reduced ? undefined : FadeIn.duration(250)}
          className="w-full max-w-sm items-center"
        >
          <DoneBadge tone="win" testID={`${testID}-done-badge`} />
          <Text className="mt-4 text-center text-lg font-bold text-white">
            Logged.
          </Text>
          <Text className="mt-1 text-center text-sm text-white/50">
            That&apos;s evidence of who you&apos;re becoming.
          </Text>
        </Animated.View>
      ) : (
        <Animated.View
          key="entry"
          entering={reduced ? undefined : FadeInUp.duration(300)}
          className="w-full max-w-sm items-center"
        >
          <Text
            testID={`${testID}-title`}
            className="text-center text-2xl font-extrabold text-white"
          >
            {move.title}
          </Text>
          <Text className="mt-2 text-center text-white/50">
            {move.prompt ?? "Name one thing you did today."}
          </Text>

          <TextInput
            testID={`${testID}-input`}
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={3}
            placeholder="I…"
            placeholderTextColor={C["muted-foreground"]}
            className="mt-6 w-full rounded-2xl border border-white/15 bg-white/5 p-4 text-center text-base text-white"
          />

          <Pressable
            testID={`${testID}-bank-it`}
            accessibilityRole="button"
            accessibilityLabel="Bank it"
            disabled={!valid || submitting}
            onPress={save}
            style={minTouchTarget}
            className={`mt-6 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-white py-4 ${
              !valid || submitting ? "opacity-40" : ""
            }`}
          >
            {submitting ? (
              <ActivityIndicator
                size="small"
                color={C["primary-foreground"]}
              />
            ) : (
              <Trophy size={20} color={C["primary-foreground"]} />
            )}
            <Text className="text-base font-bold text-black">
              Bank it
            </Text>
          </Pressable>

          <Pressable
            testID={`${testID}-skip`}
            accessibilityRole="button"
            accessibilityLabel="Skip"
            onPress={() => onDone()}
            style={minTouchTarget}
            className="mt-3 items-center justify-center"
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

export default WinScene;
