import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useAuth } from "@/lib/auth/useAuth";
import { needsOnboarding } from "@/lib/auth/onboardingGate";
import { consumePendingRedirect } from "./+native-intent";

/**
 * THE LAUNCH DECISION — and the only screen that is allowed to make it.
 *
 * This file used to be the theme probe from the bootstrap phase: a flame, a
 * wordmark, and a line about the scaffold being online — a screen no member
 * should ever have been able to reach. It is now the entry
 * route, which the router mounts ONLY when the app was opened on `/` — a
 * launch with no link. A cold start from `/verify?token=…` or
 * `/account/restore?u=…&t=…` never renders it, which is precisely why the
 * launch decision lives here instead of in the root layout: a decision taken
 * in a layout runs on every launch, link or not, and used to replace the
 * linked screen with sign-in.
 *
 * Four destinations, in the order the web uses them:
 *
 *   loading      — the secure-store read or the initial user fetch. Show the
 *                  launch spinner, decide nothing until auth has settled.
 *   signed out   — `/login` (the sign-in screen says why, if there is a why).
 *   onboarding   — `onboardingCompleted === false`, strictly, so legacy rows
 *                  without the flag are never gated.
 *   signed in    — Home (or deep-link destination / Stripe checkout return).
 *
 * The onboarding check here is the fast path for a session whose user is
 * already cached; on a cold start the user arrives from `/api/auth/me` a
 * moment after the token is trusted, and `(app)/_layout.tsx`'s
 * OnboardingGuard catches that case. Consent is the same story: the gate that
 * NP-045 mounts in `(app)/_layout.tsx` runs on whatever this redirect lands
 * on, which is why this file does not try to pre-empt it.
 */
export default function LaunchRoute() {
  const { colors } = useThemeTokens();
  const { status, user } = useAuth();
  const params = useLocalSearchParams<{
    billing?: string;
    checkout?: string;
    session_id?: string;
    portal?: string;
  }>();

  if (status === "loading" || (status === "signed-in" && user === null)) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
        testID="launch-screen"
      >
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
            testID="launch-spinner"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (status !== "signed-in") return <Redirect href="/login" />;
  if (needsOnboarding(user)) return <Redirect href="/onboarding" />;

  // Android deep-link target preservation (NP-308):
  // When an incoming intent is handled via `redirectSystemPath`, its target
  // is tracked in `pendingRedirect` so that if Android mounts the root launch
  // route, the destination is not overwritten by Home.
  const pending = consumePendingRedirect();
  if (pending && pending !== "/" && pending !== "/(tabs)/dashboard") {
    return <Redirect href={pending as any} />;
  }

  // Handle Stripe checkout return query params directly arriving on `/`
  const billing = (params.billing ?? "").toLowerCase();
  const checkout = (params.checkout ?? "").toLowerCase();
  const portal = (params.portal ?? "").toLowerCase();
  const sessionId = params.session_id;

  if (billing === "success" || checkout === "success" || sessionId) {
    const planHref = sessionId
      ? `/plan?billing=success&session_id=${encodeURIComponent(sessionId)}`
      : "/plan?billing=success";
    return <Redirect href={planHref as any} />;
  }

  if (
    billing === "cancelled" ||
    checkout === "cancelled" ||
    billing === "portal-return" ||
    portal === "return"
  ) {
    return <Redirect href="/plan" />;
  }

  return <Redirect href="/(tabs)/dashboard" />;
}
