/**
 * The considered moment for the notification permission ask (NP-065).
 *
 * NP-057 (onboarding review step) calls this AFTER the member finishes
 * onboarding — profile saved, seeds written, optional enrolment attempted —
 * and BEFORE the app routes Home. The web asks for notification permission
 * at this same hand-off, never at first launch.
 *
 * The ask runs behind a short in-app explanation (the caller's UI), and a
 * refusal — or a simulator with no token — never blocks landing Home:
 * everything here is caught, and nothing in the app requires notifications.
 */

import { defaultPushDeps, ensurePushRegistration } from "./nativePush";

export interface AfterOnboardingPushDeps {
  getJwt: () => Promise<string | null>;
  ensureRegistration?: () => Promise<unknown>;
}

/**
 * End-of-onboarding registration: probe the OS permission, and if it is
 * already granted (a reinstall, a second account), register the raw device
 * token. When the permission is still undetermined the OS prompt is NOT
 * shown here — the dismissible Home card owns that conversation, with the
 * web's 30-day dismissal for members who have not decided.
 */
export async function askNotificationPermissionAfterOnboarding(
  deps?: AfterOnboardingPushDeps,
): Promise<void> {
  try {
    if (deps?.ensureRegistration) {
      await deps.ensureRegistration();
      return;
    }
    const jwt = await deps?.getJwt?.() ?? null;
    if (!jwt) return;
    await ensurePushRegistration(defaultPushDeps({ jwt }), {
      reenable: false,
    });
  } catch {
    // ignore — permission is optional
  }
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
