/**
 * NATIVE GUIDED TOUR SPECIFICATION & PROGRESS INVARIANTS (NP-164 / NP-207).
 *
 * Decision recorded on 2026-10-08 (Jon Don, NP-164):
 * Choice (b): A short native coach-mark tour through each main hub of our app
 * (Dashboard, Training, Nutrition, Mind, Profile) with an explicit choice to decline
 * ("nah I'm good" / skip), keeping it simple and non-annoying.
 *
 * Core Rules:
 * 1. Progress key isolation: Native tour uses its own distinct progress key
 *    (`NATIVE_TOUR_PROGRESS_KEY = "native-onboarding"`).
 * 2. Web progress protection: Native NEVER writes the web tour's progress key
 *    (`WEB_TOUR_PROGRESS_KEY = "become-onboarding"`).
 * 3. Non-blocking screens: No native screen or feature (e.g. daily check-in or
 *    program nudge) waits on tour state.
 */

export const WEB_TOUR_PROGRESS_KEY = "become-onboarding" as const;

export const NATIVE_TOUR_PROGRESS_KEY = "native-onboarding" as const;

/**
 * Main hubs included in the native coach-mark tour.
 */
export const NATIVE_TOUR_HUBS = [
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Your daily focus, check-in, active workout, and habit streaks at a glance.",
    tabRoute: "/(app)/(tabs)/dashboard",
  },
  {
    id: "programming",
    title: "Training",
    description: "Browse programs, follow coach workouts, log custom sessions, and track personal records.",
    tabRoute: "/(app)/(tabs)/programming",
  },
  {
    id: "nutrition",
    title: "Nutrition",
    description: "Log meals, view daily macro targets, track hydration, and explore recipes.",
    tabRoute: "/(app)/(tabs)/nutrition",
  },
  {
    id: "mind",
    title: "Mind",
    description: "Mindset sessions, reflections, breathwork, and mental conditioning.",
    tabRoute: "/(app)/(tabs)/mind",
  },
  {
    id: "profile",
    title: "Profile & Settings",
    description: "Manage account settings, body units, reminders, and connected health integrations.",
    tabRoute: "/(app)/(tabs)/profile",
  },
] as const;

/**
 * Validates that an attempted tour progress update is safe to write from native.
 * Throws or returns false if attempting to mutate web tour progress.
 */
export function canWriteNativeTourProgress(progressKey: string): boolean {
  if (progressKey === WEB_TOUR_PROGRESS_KEY) {
    return false;
  }
  return progressKey === NATIVE_TOUR_PROGRESS_KEY;
}

export function assertValidNativeTourProgressKey(progressKey: string): void {
  if (progressKey === WEB_TOUR_PROGRESS_KEY) {
    throw new Error(
      `Violation of NP-164: Native must never write web tour progress key "${WEB_TOUR_PROGRESS_KEY}". Use "${NATIVE_TOUR_PROGRESS_KEY}".`
    );
  }
  if (progressKey !== NATIVE_TOUR_PROGRESS_KEY) {
    throw new Error(
      `Invalid native tour progress key "${progressKey}". Expected "${NATIVE_TOUR_PROGRESS_KEY}".`
    );
  }
}

/**
 * Card metadata for NP-207 (the follow-up implementation card).
 */
export const NP_207_CARD = {
  key: "NP-207",
  title: "Short native coach-mark tour through the main hubs with decline option and separate progress key",
  cluster: "Native onboarding, the guided tour and the post-onboarding trial",
  wave: 4,
  storeV1: false,
  size: "M" as const,
  priority: "P3" as const,
  decisionOrigin: "NP-164",
  progressKey: NATIVE_TOUR_PROGRESS_KEY,
  webProgressKey: WEB_TOUR_PROGRESS_KEY,
  allowsDecline: true,
  blocksScreens: false,
};
