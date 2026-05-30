import type { User } from "@become/api-client";

/**
 * Whether the authed user must be routed through onboarding first.
 *
 * STRICT `=== false`: only users whose `onboardingCompleted` flag is explicitly
 * false are gated. Legacy users predate the flag and have it absent/undefined
 * in MongoDB — they must NOT be redirected (mirrors the webapp AuthGuard). A
 * null user (not loaded yet / signed out) never triggers the gate.
 */
export function needsOnboarding(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.onboardingCompleted === false;
}
