import { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ProfileResponseSchema,
  type ProfileResponse,
} from "@become/api-client";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import type { OnboardingProfile } from "@/lib/onboarding/steps";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { AuthGuard } from "@/lib/auth/AuthGuard";
import { useAuth } from "@/lib/auth/useAuth";
import { useMutation } from "@/lib/hooks/useMutation";

interface ProfilePatchInput {
  profile: OnboardingProfile;
  onboardingCompleted: boolean;
}

/**
 * Onboarding route. Runs the 4-step questionnaire, then PATCHes
 * /api/profile { profile, onboardingCompleted: true } — clearing the gate — and
 * refreshes the auth user so needsOnboarding() flips false, before heading to
 * the dashboard.
 *
 * IT SITS OUTSIDE THE `(app)` GROUP ON PURPOSE. `(app)/_layout.tsx` mounts
 * OnboardingGuard, which sends a gated member here; if this route were inside
 * that group the guard would redirect to a route behind itself, forever. It
 * still needs a session — the PATCH is authenticated — so it mounts the same
 * AuthGuard, on its own, without the onboarding gate.
 */
export default function OnboardingRoute() {
  const router = useRouter();
  const { token, refresh, isAuthed, loading } = useAuth();

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

  const onComplete = useCallback(
    async (profile: OnboardingProfile) => {
      setSubmitting(true);
      try {
        await patch.mutate({ profile, onboardingCompleted: true });
        // Re-pull the user so the onboarding gate sees the cleared flag.
        await refresh();
        router.replace("/(tabs)/dashboard");
      } catch {
        // Leave the user on the flow so they can retry.
      } finally {
        setSubmitting(false);
      }
    },
    [patch, refresh, router],
  );

  return (
    <AuthGuard
      isAuthed={isAuthed}
      loading={loading}
      onUnauthed={onUnauthed}
      testID="onboarding-guard"
    >
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: "#0a0a0a" }}
        testID="onboarding-route"
      >
        <OnboardingFlow onComplete={onComplete} submitting={submitting} />
      </SafeAreaView>
    </AuthGuard>
  );
}
