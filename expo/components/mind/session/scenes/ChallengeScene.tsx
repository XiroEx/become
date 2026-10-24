import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { ArrowRight, Check, Sword } from "lucide-react-native";
import {
  apiFetch,
  MindDisciplineResponseSchema,
} from "@become/api-client";
import { Text } from "@/components/Text";
import { DoneBadge } from "@/components/mind/session/scenes/DoneBadge";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { resolveToken } from "@/lib/theme/tokens";

/**
 * ALWAYS BLACK, LIKE THE WEB. See `WinScene.tsx` — this scene renders
 * straight onto the player's fixed `bg-black` stage, so every colour is
 * pinned to the DARK palette, never the `useThemeTokens()` hook.
 */
const C = {
  "primary-foreground": resolveToken("primary-foreground", "dark"),
  destructive: resolveToken("destructive", "dark"),
  success: resolveToken("success", "dark"),
} as const;

export function ChallengeScene({
  move,
  onDone,
  preview,
  testID = "mind-challenge-scene",
}: MindSceneProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const { token } = useAuth();

  const [text, setText] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [justDone, setJustDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch(
          `/api/mind/discipline?tz=${new Date().getTimezoneOffset()}`,
          MindDisciplineResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        if (!cancelled) {
          setText(
            data.challenge?.challenge ?? "Do one hard thing today, on purpose.",
          );
          setCompleted(Boolean(data.challenge?.completed));
        }
      } catch {
        if (!cancelled) {
          setText("Do one hard thing today, on purpose.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const markDone = async () => {
    if (submitting || completed) return;
    setSubmitting(true);
    if (!preview) {
      try {
        await apiFetch("/api/mind/discipline", MindDisciplineResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          method: "POST",
          body: {
            action: "complete",
            tz: new Date().getTimezoneOffset(),
          },
        });
      } catch {
        /* best-effort: failed write never blocks the session */
      }
    }
    setJustDone(true);
    setTimeout(
      () =>
        onDone({
          q: "Today's hard thing",
          a: text ?? "",
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
      <View className="mb-5 h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15">
        <Sword size={24} color={C.destructive} />
      </View>

      <Text
        testID={`${testID}-title`}
        className="text-center text-xs uppercase tracking-widest text-white/40"
      >
        {move.title}
      </Text>

      {loading ? (
        <View
          testID={`${testID}-loading`}
          className="mt-8 items-center justify-center"
        >
          <ActivityIndicator size="small" color={C.destructive} />
        </View>
      ) : justDone ? (
        <Animated.View
          key="done"
          entering={reduced ? undefined : FadeIn.duration(250)}
          className="mt-6 w-full max-w-sm items-center"
        >
          <DoneBadge tone="challenge" testID={`${testID}-done-badge`} />
          <Text className="mt-4 text-center text-lg font-bold text-white">
            That&apos;s a rep.
          </Text>
          <Text className="mt-1 text-center text-sm font-semibold text-green-300">
            +20 XP
          </Text>
        </Animated.View>
      ) : (
        <Animated.View
          key="task"
          entering={reduced ? undefined : FadeInUp.duration(300)}
          className="w-full max-w-sm items-center"
        >
          <Text
            testID={`${testID}-text`}
            className="mt-5 text-center text-xl font-semibold leading-relaxed text-white"
          >
            {text}
          </Text>

          {completed ? (
            <View className="mt-6 w-full items-center">
              <View className="flex-row items-center gap-1.5">
                <Check size={16} color={C.success} />
                <Text className="text-sm font-semibold text-green-300">
                  Already done today
                </Text>
              </View>

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
            </View>
          ) : (
            <View className="mt-9 w-full gap-3">
              <Pressable
                testID={`${testID}-did-it`}
                accessibilityRole="button"
                accessibilityLabel="I did it"
                disabled={submitting}
                onPress={markDone}
                style={minTouchTarget}
                className={`w-full flex-row items-center justify-center gap-2 rounded-2xl bg-white py-4 ${
                  submitting ? "opacity-60" : ""
                }`}
              >
                {submitting ? (
                  <ActivityIndicator
                    size="small"
                    color={C["primary-foreground"]}
                  />
                ) : (
                  <Check
                    size={20}
                    color={C["primary-foreground"]}
                    strokeWidth={3}
                  />
                )}
                <Text className="text-base font-bold text-black">
                  I did it
                </Text>
              </Pressable>

              <Pressable
                testID={`${testID}-skip`}
                accessibilityRole="button"
                accessibilityLabel="Not today"
                onPress={() => onDone()}
                style={minTouchTarget}
                className="items-center justify-center py-2"
              >
                <Text className="text-sm font-medium text-white/40">
                  Not today
                </Text>
              </Pressable>
            </View>
          )}
        </Animated.View>
      )}
    </ScrollView>
  );
}

export default ChallengeScene;
