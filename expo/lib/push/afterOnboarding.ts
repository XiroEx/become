/**
 * The considered moment for the notification permission ask (NP-065).
 *
 * NP-057 (onboarding review step) calls this AFTER the member finishes
 * onboarding — profile saved, seeds written, optional enrolment attempted —
 * and BEFORE the app routes Home. The web asks for notification permission
 * at this same hand-off, never at first launch.
 *
 * NP-065 owns the real implementation (expo-notifications permission probe +
 * token registration). Until it lands, this is a deliberate no-op so the
 * onboarding hand-off compiles and ships without prompting early.
 *
 * NP-065: replace the body with the real permission ask. Keep the signature
 * (no required args, Promise<void>) so NP-057's call site does not change.
 */
export async function askNotificationPermissionAfterOnboarding(): Promise<void> {
  return undefined;
}

/**
 * Hook for the post-onboarding trial prompt (NP-129).
 *
 * The web will offer a 10-day Plus trial after onboarding once it ships; this
 * is the named seam where the native hand-off will present it. No-op until
 * NP-129 fills it — finishing onboarding must never block on a prompt that
 * does not exist yet.
 */
export async function maybeShowTrialPromptAfterOnboarding(): Promise<void> {
  return undefined;
}
