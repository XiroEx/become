import { useEffect, type ReactNode } from "react";
import type { User } from "@become/api-client";
import { needsOnboarding } from "@/lib/auth/onboardingGate";

export interface OnboardingGuardProps {
  user: User | null;
  loading: boolean;
  /** Fired (once auth has loaded) when the user must complete onboarding —
   * typically `router.replace('/onboarding')`. */
  onNeedsOnboarding: () => void;
  children: ReactNode;
}

/**
 * Analog of AuthGuard for the onboarding gate. Once auth has loaded, if the
 * user explicitly has `onboardingCompleted === false`, fires
 * `onNeedsOnboarding` and renders nothing (the redirect takes over). Legacy
 * users (flag absent) and completed users fall straight through to children.
 * While auth is loading or the user object has not arrived yet, renders nothing
 * so protected content never flashes before onboarding status is known.
 */
export function OnboardingGuard({
  user,
  loading,
  onNeedsOnboarding,
  children,
}: OnboardingGuardProps) {
  const gated = !loading && needsOnboarding(user);
  useEffect(() => {
    if (gated) onNeedsOnboarding();
  }, [gated, onNeedsOnboarding]);

  if (loading || user === null || gated) return null;
  return <>{children}</>;
}
