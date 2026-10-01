import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { Check, Sparkles } from "lucide-react-native";
import {
  apiFetch,
  MindVisionResponseSchema,
  type MindVision,
} from "@become/api-client";
import { Text } from "@/components/Text";
import { RevealText } from "@/components/mind/session/RevealText";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

const DIM_LABELS: { key: keyof MindVision; label: string }[] = [
  { key: "habits", label: "Habits" },
  { key: "mind", label: "Mind" },
  { key: "body", label: "Body" },
  { key: "relationships", label: "Relationships" },
  { key: "environment", label: "Environment" },
];

export function VisionScene({
  move,
  onDone,
  testID = "mind-vision-scene",
}: MindSceneProps): React.JSX.Element {
  const { colors } = useThemeTokens();
  const reduced = useReducedMotion();
  const { token } = useAuth();

  const [vision, setVision] = useState<MindVision | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch("/api/mind/vision", MindVisionResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        });
        if (!cancelled) setVision(data.vision ?? null);
      } catch {
        /* ignore — preview or network error */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const hasVision = Boolean(
    vision && (vision.completedAt || vision.identityStatement),
  );
  const statement = vision?.identityStatement || move.statement;
  const dims = DIM_LABELS.filter((d) =>
    (vision?.[d.key] as string | undefined)?.trim(),
  );

  const sentenceCount = (statement || "")
    .split(/[.!?]+/)
    .filter((s) => s.trim()).length;
  const revealSpeed =
    sentenceCount > 3 ? Math.max(0.45, 1 - (sentenceCount - 3) * 0.15) : 1;

  const lockIn = () => {
    if (locked) return;
    setLocked(true);
    setTimeout(
      () =>
        onDone(
          statement
            ? { q: "The future self I locked in on", a: statement }
            : undefined,
        ),
      900,
    );
  };

  if (loading) {
    return (
      <View
        testID={`${testID}-loading`}
        className="flex-1 items-center justify-center"
      >
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!hasVision) {
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
        <View className="mb-5 h-12 w-12 items-center justify-center rounded-2xl bg-accent/15">
          <Sparkles size={24} color={colors.accent} />
        </View>
        <Text className="text-center text-2xl font-extrabold text-foreground">
          Paint your vision
        </Text>
        <Text className="mt-2 max-w-xs text-center text-muted-foreground">
          A picture of your best self, clear enough to pull you forward.
        </Text>

        <Pressable
          testID={`${testID}-skip`}
          accessibilityRole="button"
          accessibilityLabel="Skip"
          onPress={() => onDone()}
          style={minTouchTarget}
          className="mt-8 items-center justify-center"
        >
          <Text className="text-sm font-medium text-muted-foreground">
            Skip
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

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
      <View className="mb-4 h-12 w-12 items-center justify-center rounded-2xl bg-accent/15">
        <Sparkles size={24} color={colors.accent} />
      </View>
      <Text
        testID={`${testID}-title`}
        className="text-center text-xs uppercase tracking-widest text-muted-foreground"
      >
        See your future self
      </Text>

      {statement ? (
        <RevealText
          testID={`${testID}-statement`}
          text={`“${statement}”`}
          onComplete={() => setReady(true)}
          speed={revealSpeed}
          className="mt-4 max-w-sm text-center text-2xl font-bold leading-snug text-foreground"
        />
      ) : null}

      {ready || !statement ? (
        <Animated.View
          key="vision-action"
          entering={reduced ? undefined : FadeInUp.duration(300)}
          className="w-full max-w-sm items-center"
        >
          {dims.length > 0 ? (
            <View className="mt-6 w-full space-y-1.5">
              {dims.slice(0, 3).map((d) => (
                <Text key={d.key} className="text-sm text-muted-foreground">
                  <Text className="font-semibold text-foreground">
                    {d.label}:{" "}
                  </Text>
                  {vision?.[d.key] as string}
                </Text>
              ))}
            </View>
          ) : null}

          <Pressable
            testID={`${testID}-lock-in`}
            accessibilityRole="button"
            accessibilityLabel={
              locked ? "That's who I'm becoming." : "I can see it"
            }
            onPress={lockIn}
            style={minTouchTarget}
            className={`mt-10 w-full flex-row items-center justify-center gap-2 rounded-2xl py-4 ${
              locked ? "bg-success" : "bg-primary"
            }`}
          >
            <Check
              size={20}
              color={colors["primary-foreground"]}
              strokeWidth={3}
            />
            <Text className="text-base font-bold text-primary-foreground">
              {locked ? "That's who I'm becoming." : "I can see it"}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </ScrollView>
  );
}

export default VisionScene;
