import { useCallback, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ProfileResponseSchema,
  type ProfileResponse,
  GoalProgressResponseSchema,
  LogWeightResponseSchema,
  NutritionGoalsWriteResponseSchema,
  currentTzOffsetMinutes,
  apiFetch,
} from "@become/api-client";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import {
  LEGAL_MINIMUM_AGE,
  defaultIconForGoal,
  type OnboardingProfile,
} from "@/lib/onboarding/steps";
import {
  directionForGoal,
  defaultPaceKg,
  computeNutritionTargets,
  waterGoalOz,
  displayWeight,
} from "@become/core";
import { isFallbackName } from "@/lib/displayName";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { AuthGuard } from "@/lib/auth/AuthGuard";
import { ConsentGate } from "@/components/auth/ConsentGate";
import { useAuth } from "@/lib/auth/useAuth";
import { useMutation } from "@/lib/hooks/useMutation";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { ScreenState } from "@/components/ScreenState";

export interface ProfilePatchInput {
  name?: string;
  profile: OnboardingProfile;
  onboardingCompleted: boolean;
  profileIcon?: string;
}

/**
 * Onboarding route (NP-055 / NP-056). Runs the 5-step wizard (goals, about you,
 * body & nutrition, equipment, review), then PATCHes /api/profile with the exact
 * web payload:
 * {
 *   name,
 *   profile: {
 *     ...answers,
 *     fitnessGoal: goals[0],
 *     fitnessGoals,
 *     nutritionDirection,
 *     weightUnit: unit ?? "lbs"
 *   },
 *   onboardingCompleted: true,
 *   profileIcon: defaultIconForGoal(goals[0])
 * }
 * and seeds the three writes:
 * 1. PUT /api/goals (pace, with numeric tz)
 * 2. POST /api/weight (first weigh-in in display unit, with numeric tz)
 * 3. POST /api/nutrition/goals (calories & macros from shared maths, with numeric tz)
 * clearing the gate, refreshes auth so needsOnboarding() flips false,
 * and heads to Home (/(tabs)/dashboard).
 */
export default function OnboardingRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token, refresh, isAuthed, loading, user } = useAuth();

  const onUnauthed = useCallback(() => {
    router.replace("/login");
  }, [router]);

  const patch = useMutation<ProfilePatchInput, ProfileResponse>(
    "/api/profile",
    ProfileResponseSchema,
    {
      method: "PATCH",
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    },
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [lastPayload, setLastPayload] = useState<{
    name: string;
    profile: OnboardingProfile;
  } | null>(null);

  const initialName = useMemo(() => {
    if (!user) return "";
    return isFallbackName(user.name, user.email) ? "" : (user.name ?? "");
  }, [user]);

  const onComplete = useCallback(
    async ({
      name,
      profile,
    }: {
      name: string;
      profile: OnboardingProfile;
    }) => {
      const goals = profile.fitnessGoals ?? [];
      const primaryGoal = goals[0];
      const nutritionDirection =
        profile.nutritionDirection ?? directionForGoal(primaryGoal);
      const weightUnit = profile.weightUnit ?? "lbs";

      // The age gate: refusal under 13 cannot be submitted
      if (
        typeof profile.age === "number" &&
        profile.age < LEGAL_MINIMUM_AGE
      ) {
        setSubmitError(new Error("age_below_minimum"));
        return;
      }

      setLastPayload({ name, profile });
      setSubmitting(true);
      setSubmitError(null);
      try {
        const patchBody: ProfilePatchInput = {
          ...(name.trim() ? { name: name.trim() } : {}),
          profile: {
            ...profile,
            fitnessGoal: primaryGoal,
            fitnessGoals: goals,
            nutritionDirection,
            weightUnit,
          },
          onboardingCompleted: true,
          profileIcon: defaultIconForGoal(primaryGoal),
        };
        await patch.mutate(patchBody);

        // Seed the three writes with numeric tz (NP-056):
        const tz = currentTzOffsetMinutes();
        const seeds: Promise<unknown>[] = [];

        // 1. The chosen pace lives on the dated Goal, created only with a target weight
        // and direction other than maintain.
        if (profile.targetWeightKg && nutritionDirection !== "maintain") {
          seeds.push(
            apiFetch(
              "/api/goals",
              GoalProgressResponseSchema,
              {
                method: "PUT",
                baseUrl: WEBAPP_BASE_URL,
                getToken: () => token ?? undefined,
                body: {
                  pillar: "nutrition",
                  paceKgPerWeek:
                    profile.paceKgPerWeek ?? defaultPaceKg(nutritionDirection),
                  tz,
                },
              },
            ).catch((err) => {
              console.warn("Failed to seed pace goal:", err);
            }),
          );
        }

        // 2. The first weigh-in is posted in the member's display unit.
        if (profile.currentWeightKg) {
          const seedWeight = displayWeight(profile.currentWeightKg, weightUnit);
          seeds.push(
            apiFetch(
              "/api/weight",
              LogWeightResponseSchema,
              {
                method: "POST",
                baseUrl: WEBAPP_BASE_URL,
                getToken: () => token ?? undefined,
                body: {
                  weight: seedWeight,
                  tz,
                },
              },
            ).catch((err) => {
              console.warn("Failed to seed weight:", err);
            }),
          );
        }

        // 3. Seed TDEE-based nutrition goals if we have enough data.
        // goalType is the NutritionGoal enum ('lose' | 'maintain' | 'gain').
        const seedTargets = computeNutritionTargets({
          currentWeightKg: profile.currentWeightKg,
          heightCm: profile.heightCm,
          age: profile.age,
          biologicalSex: profile.biologicalSex,
          goals,
          direction: nutritionDirection,
          weeklyAvailability: profile.weeklyAvailability,
          activityLevel: profile.activityLevel,
          macroPreset: profile.macroPreset,
          paceKgPerWeek:
            profile.paceKgPerWeek ?? defaultPaceKg(nutritionDirection),
        });

        if (seedTargets) {
          seeds.push(
            apiFetch(
              "/api/nutrition/goals",
              NutritionGoalsWriteResponseSchema,
              {
                method: "POST",
                baseUrl: WEBAPP_BASE_URL,
                getToken: () => token ?? undefined,
                body: {
                  calories: seedTargets.calories,
                  protein: seedTargets.protein,
                  carbs: seedTargets.carbs,
                  fats: seedTargets.fats,
                  waterGoal: waterGoalOz(profile.currentWeightKg),
                  goalType: seedTargets.direction,
                  activityLevel: seedTargets.activityLevel,
                  macroPreset: profile.macroPreset ?? "recommended",
                  tz,
                },
              },
            ).catch((err) => {
              console.warn("Failed to seed nutrition goals:", err);
            }),
          );
        }

        // Await all three seeds before leaving
        await Promise.all(seeds);

        // Re-pull the user so the onboarding gate sees the cleared flag.
        await refresh();
        router.replace("/(tabs)/dashboard");
      } catch (err) {
        setSubmitError(err);
      } finally {
        setSubmitting(false);
      }
    },
    [patch, refresh, router, token],
  );

  return (
    <AuthGuard
      isAuthed={isAuthed}
      loading={loading}
      onUnauthed={onUnauthed}
      testID="onboarding-guard"
    >
      <ConsentGate>
        <ScreenState
          error={submitError}
          hasData={!submitError}
          onRetry={async () => {
            if (lastPayload) {
              await onComplete(lastPayload);
            } else {
              setSubmitError(null);
            }
          }}
          testID="onboarding-screen-state"
        >
          <SafeAreaView
            edges={["top", "bottom"]}
            style={{ flex: 1, backgroundColor: colors.background }}
            testID="onboarding-route"
          >
            <OnboardingFlow
              initialName={initialName}
              onComplete={onComplete}
              submitting={submitting}
            />
          </SafeAreaView>
        </ScreenState>
      </ConsentGate>
    </AuthGuard>
  );
}
