import { useCallback } from "react";
import { Stack, useRouter } from "expo-router";
import { AuthGuard } from "@/lib/auth/AuthGuard";
import { ConsentGate } from "@/components/auth/ConsentGate";
import { HealthSyncBridge } from "@/components/health/HealthSyncBridge";
import { MindSessionWarmer } from "@/components/mind/MindSessionWarmer";
import { PushSyncBridge } from "@/components/push/PushSyncBridge";
import { OnboardingGuard } from "@/components/auth/OnboardingGuard";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useStackAnimation } from "@/lib/navigation/screenAnimation";

/**
 * THE GUARDED GROUP. Everything a signed-in member sees is below this file.
 *
 * It is the native copy of `webapp/app/dashboard/layout.tsx`, which wraps
 * every signed-in page in AuthGuard, then the consent gate, then the
 * onboarding check — in that order, for reasons that are not cosmetic:
 *
 *   1. AuthGuard — no session, no screen. It sends an unauthed member to
 *      `/login` and renders nothing in the meantime, so a protected screen
 *      never mounts (and never fires its fetches) without a token.
 *   2. ConsentGate — the seam NP-045 fills. A pass-through today; mounted
 *      here so consent is asked AFTER we know who is asking and BEFORE
 *      onboarding collects anything.
 *   3. OnboardingGuard — `onboardingCompleted === false`, strictly. Legacy
 *      rows predate the flag and must fall straight through
 *      (`lib/auth/onboardingGate.ts`, mirroring
 *      `webapp/components/AuthGuard.tsx:53-68`).
 *
 * Both guards were written months ago and mounted nowhere: AuthGuard was
 * reached only by a type-only import, so every screen in this tree was
 * effectively public and an expired session showed up as empty lists.
 *
 * `/onboarding` deliberately lives OUTSIDE this group (at `app/onboarding.tsx`,
 * with its own AuthGuard): a gate whose destination is behind itself is a
 * redirect loop.
 */
export default function AppGroupLayout() {
  const { colors } = useThemeTokens();
  // The same explicit push as every other Stack in the app, and a cut under
  // reduced motion (NP-340, `lib/navigation/screenAnimation.ts`). Settings,
  // Plan, Becoming and Progress push over the tabs from here.
  const animation = useStackAnimation();
  const router = useRouter();
  const { isAuthed, loading, user } = useAuth();

  const onUnauthed = useCallback(() => {
    router.replace("/login");
  }, [router]);

  const onNeedsOnboarding = useCallback(() => {
    router.replace("/onboarding");
  }, [router]);

  return (
    <AuthGuard
      isAuthed={isAuthed}
      loading={loading}
      onUnauthed={onUnauthed}
      testID="app-guard"
    >
      <ConsentGate>
        <OnboardingGuard
          user={user}
          loading={loading}
          onNeedsOnboarding={onNeedsOnboarding}
        >
          {/* Imports Health-recorded weigh-ins once per launch, if the member
              left that direction on. Renders nothing, and does nothing at all on
              a platform with no health module (iOS until NP-185) — see
              components/health/HealthSyncBridge.tsx. */}
          <HealthSyncBridge />
          {/* Pre-composes the AI Mind session in the background on app open
              and when returning to the foreground (NP-102). Silent and non-blocking. */}
          <MindSessionWarmer />
          {/* Re-registers this device's raw push token on app open and every
              foreground return, and unsubscribes it when the OS permission is
              revoked (NP-065). Renders nothing; background registration never
              re-enables. */}
          <PushSyncBridge />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation,
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="plan" />
            <Stack.Screen name="becoming" />
            <Stack.Screen name="progress" />
          </Stack>
        </OnboardingGuard>
      </ConsentGate>
    </AuthGuard>
  );
}
