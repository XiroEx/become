import type { ReactNode } from "react";

export interface ConsentGateProps {
  children: ReactNode;
}

/**
 * THE CONSENT SEAM, between AuthGuard and OnboardingGuard.
 *
 * The web signs a member in, then asks for the consents it needs, then runs
 * onboarding (`webapp/app/dashboard/layout.tsx`: AuthGuard → ConsentGate → the
 * AI consent prompt → the tutorial root). The native shell mounts the same
 * three in the same order, and this is the middle one.
 *
 * It renders its children unchanged TODAY on purpose: the consent state, the
 * prompt and the blocking rules are NP-045's, and inventing them here would
 * mean two implementations to reconcile. What this card owns is the ORDER —
 * a member is never asked to consent before we know who they are, and never
 * walked through onboarding before they have consented.
 */
export function ConsentGate({ children }: ConsentGateProps) {
  return <>{children}</>;
}
