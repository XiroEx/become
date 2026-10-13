import { useState, useEffect } from "react";
import {
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ArrowRight } from "lucide-react-native";
import {
  apiFetch,
  MindIdentityResponseSchema,
  type MindStartingPoint,
  type MindPrimaryObstacle,
} from "@become/api-client";
import { Text } from "@/components/Text";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { tzOffsetMinutes } from "@/lib/time/localDay";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface IdentityOnboardingProps {
  onComplete: () => void;
  testID?: string;
}

// ─── Step 1 data ─────────────────────────────────────────────────────────────

export const STARTING_POINTS: {
  id: MindStartingPoint;
  headline: string;
  sub: string;
  emoji: string;
}[] = [
  {
    id: "lost",
    headline: "I feel lost",
    sub: "No clear direction. Just know something has to change.",
    emoji: "🌫",
  },
  {
    id: "stuck",
    headline: "I know what I want but I'm stuck",
    sub: "The vision is there. The execution keeps breaking down.",
    emoji: "🔒",
  },
  {
    id: "building",
    headline: "I'm building momentum",
    sub: "Making progress but need a real system behind it.",
    emoji: "🔥",
  },
  {
    id: "leveling_up",
    headline: "I'm ready to go to the next level",
    sub: "Already moving. Need to sharpen everything.",
    emoji: "⚡",
  },
];

// ─── Step 3 data ─────────────────────────────────────────────────────────────

export const OBSTACLES: {
  id: MindPrimaryObstacle;
  headline: string;
  sub: string;
}[] = [
  {
    id: "clarity",
    headline: "No clear direction",
    sub: "I don't fully know what I want or why I want it.",
  },
  {
    id: "discipline",
    headline: "Can't stay consistent",
    sub: "I start strong and fall off. The habits don't stick.",
  },
  {
    id: "motivation",
    headline: "My mindset crashes",
    sub: "Doubt, fear, and low energy knock me off course.",
  },
  {
    id: "environment",
    headline: "My environment pulls me back",
    sub: "The people or situation around me work against me.",
  },
];

export const ONBOARDING_DRAFT_KEY = "become_identity_onboarding_draft";

export const CURRENT_SELF_MAP: Record<MindStartingPoint, string> = {
  lost: "I feel lost — no clear direction, just know something has to change.",
  stuck: "I know what I want but I keep getting stuck — the execution breaks down.",
  building: "I'm building momentum but need a real system behind it.",
  leveling_up: "I'm already moving and ready to go to the next level.",
};

export function IdentityOnboarding({
  onComplete,
  testID = "identity-onboarding",
}: IdentityOnboardingProps) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();

  const [step, setStep] = useState(1);
  const [startingPoint, setStartingPoint] = useState<MindStartingPoint | null>(null);
  const [futureSelf, setFutureSelf] = useState("");
  const [obstacle, setObstacle] = useState<MindPrimaryObstacle | null>(null);
  const [saving, setSaving] = useState(false);
  const [resumedFromDraft, setResumedFromDraft] = useState(false);

  // Restore draft on mount
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(ONBOARDING_DRAFT_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const draft = JSON.parse(raw) as {
            step?: number;
            startingPoint?: MindStartingPoint | null;
            futureSelf?: string;
            obstacle?: MindPrimaryObstacle | null;
          };
          if (draft && (draft.startingPoint || draft.futureSelf || draft.obstacle)) {
            if (draft.step) setStep(draft.step);
            if (draft.startingPoint) setStartingPoint(draft.startingPoint);
            if (draft.futureSelf) setFutureSelf(draft.futureSelf);
            if (draft.obstacle) setObstacle(draft.obstacle);
            setResumedFromDraft(true);
          }
        } catch {
          // ignore corrupt draft
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist draft on every state change
  useEffect(() => {
    const draft = { step, startingPoint, futureSelf, obstacle };
    void AsyncStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft)).catch(
      () => {},
    );
  }, [step, startingPoint, futureSelf, obstacle]);

  async function submit() {
    if (!startingPoint || !futureSelf.trim() || !obstacle) return;
    setSaving(true);
    try {
      await apiFetch("/api/mind/identity", MindIdentityResponseSchema, {
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        method: "PUT",
        body: {
          currentSelf: CURRENT_SELF_MAP[startingPoint],
          futureSelf: futureSelf.trim(),
          primaryObstacle: obstacle,
          startingPoint,
          tz: tzOffsetMinutes(),
        },
      });
      try {
        await AsyncStorage.removeItem(ONBOARDING_DRAFT_KEY);
      } catch {
        // ignore
      }
      onComplete();
    } catch (err) {
      console.error("Error submitting identity onboarding:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Resume banner */}
      {resumedFromDraft ? (
        <View
          testID="identity-draft-banner"
          className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20 p-4"
        >
          <Text className="text-sm font-medium text-blue-800 dark:text-blue-400">
            Picking up where you left off — step {step} of 3
          </Text>
        </View>
      ) : null}

      {/* Progress bar */}
      <View className="mb-6 flex-row gap-2">
        {[1, 2, 3].map((n) => (
          <View
            key={n}
            testID={`identity-progress-bar-step-${n}`}
            className={`h-1.5 flex-1 rounded-full ${
              n <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </View>

      {/* Step 1 */}
      {step === 1 && (
        <View className="flex-1">
          <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Step 1 of 3
          </Text>
          <Text className="text-2xl font-bold text-foreground mb-2">
            Be honest with yourself.
          </Text>
          <Text className="text-sm text-muted-foreground mb-6">
            Where are you right now? Not where you want to be — where you
            actually are.
          </Text>

          <View className="gap-3">
            {STARTING_POINTS.map((s) => {
              const isSelected = startingPoint === s.id;
              return (
                <Pressable
                  key={s.id}
                  testID={`identity-starting-point-${s.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setStartingPoint(s.id)}
                  className={`flex-row items-start gap-4 rounded-2xl border p-4 transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card"
                  }`}
                >
                  <Text style={{ fontSize: 24, marginTop: 2 }}>{s.emoji}</Text>
                  <View className="flex-1">
                    <Text
                      className={`text-base font-bold ${
                        isSelected ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {s.headline}
                    </Text>
                    <Text className="text-xs text-muted-foreground mt-1">
                      {s.sub}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            testID="identity-step-1-continue"
            accessibilityRole="button"
            onPress={() => setStep(2)}
            disabled={!startingPoint}
            className={`mt-6 flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4 px-6 ${
              !startingPoint ? "opacity-30" : "opacity-100"
            }`}
          >
            <Text className="text-base font-bold text-primary-foreground">
              Continue
            </Text>
            <ArrowRight size={18} color={colors["primary-foreground"]} />
          </Pressable>
        </View>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <View className="flex-1">
          <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Step 2 of 3
          </Text>
          <Text className="text-2xl font-bold text-foreground mb-2">
            Who are you becoming?
          </Text>
          <Text className="text-sm text-muted-foreground mb-6">
            Not what you want to have — who you want to be. Write it like
            it&apos;s already happening.
          </Text>

          <View className="rounded-2xl border border-border bg-card p-4 mb-2">
            <TextInput
              testID="identity-future-self-input"
              value={futureSelf}
              onChangeText={setFutureSelf}
              placeholder="I am becoming someone who..."
              placeholderTextColor={colors["muted-foreground"]}
              multiline
              numberOfLines={5}
              maxLength={500}
              style={{
                fontSize: 16,
                color: colors.foreground,
                minHeight: 120,
                textAlignVertical: "top",
              }}
            />
          </View>
          <Text className="text-xs text-muted-foreground text-right mb-6">
            {futureSelf.length}/500
          </Text>

          <View className="flex-row gap-3">
            <Pressable
              testID="identity-step-2-back"
              accessibilityRole="button"
              onPress={() => setStep(1)}
              className="rounded-2xl border border-border bg-card px-6 py-4 justify-center items-center"
            >
              <Text className="text-base font-semibold text-muted-foreground">
                Back
              </Text>
            </Pressable>
            <Pressable
              testID="identity-step-2-continue"
              accessibilityRole="button"
              onPress={() => setStep(3)}
              disabled={futureSelf.trim().length < 10}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4 px-6 ${
                futureSelf.trim().length < 10 ? "opacity-30" : "opacity-100"
              }`}
            >
              <Text className="text-base font-bold text-primary-foreground">
                Continue
              </Text>
              <ArrowRight size={18} color={colors["primary-foreground"]} />
            </Pressable>
          </View>
        </View>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <View className="flex-1">
          <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Step 3 of 3
          </Text>
          <Text className="text-2xl font-bold text-foreground mb-2">
            What&apos;s your biggest obstacle?
          </Text>
          <Text className="text-sm text-muted-foreground mb-6">
            Be real. This determines where the system focuses your energy first.
          </Text>

          <View className="gap-3">
            {OBSTACLES.map((o) => {
              const isSelected = obstacle === o.id;
              return (
                <Pressable
                  key={o.id}
                  testID={`identity-obstacle-${o.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setObstacle(o.id)}
                  className={`rounded-2xl border p-4 transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card"
                  }`}
                >
                  <Text
                    className={`text-base font-bold ${
                      isSelected ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {o.headline}
                  </Text>
                  <Text className="text-xs text-muted-foreground mt-1">
                    {o.sub}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-6 flex-row gap-3">
            <Pressable
              testID="identity-step-3-back"
              accessibilityRole="button"
              onPress={() => setStep(2)}
              className="rounded-2xl border border-border bg-card px-6 py-4 justify-center items-center"
            >
              <Text className="text-base font-semibold text-muted-foreground">
                Back
              </Text>
            </Pressable>
            <Pressable
              testID="identity-submit-button"
              accessibilityRole="button"
              onPress={submit}
              disabled={!obstacle || saving}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4 px-6 ${
                !obstacle || saving ? "opacity-30" : "opacity-100"
              }`}
            >
              {saving ? (
                <>
                  <ActivityIndicator color={colors["primary-foreground"]} />
                  <Text className="text-base font-bold text-primary-foreground ml-2">
                    Building your system...
                  </Text>
                </>
              ) : (
                <>
                  <Text className="text-base font-bold text-primary-foreground">
                    Build my system
                  </Text>
                  <ArrowRight size={18} color={colors["primary-foreground"]} />
                </>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
