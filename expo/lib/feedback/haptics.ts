import * as Haptics from "expo-haptics";

/**
 * A single physical tap. Injectable so a component that taps can be driven in a
 * test (jest has no haptics engine) and so a later card can change the strength
 * in one place.
 */
export type HapticFn = () => void;

/**
 * THE LIGHTEST TAP THE PHONE HAS (NP-098).
 *
 * The web's breath pacer has no haptics — a browser cannot ask for one. On a
 * phone the phase change IS the instruction ("breathe in, now"), and a member
 * doing it with their eyes shut has nothing else to go on, so every phase
 * boundary gets one light impact.
 *
 * It never throws and never rejects: a simulator has no engine, a member can
 * turn System Haptics off, and web has only the Vibration API. A missing buzz
 * may not take a session down, so the failure is swallowed on purpose.
 */
export function lightHaptic(): void {
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
      /* no engine, or the member turned haptics off */
    });
  } catch {
    /* module unavailable (web, a build without it) */
  }
}

/**
 * CELEBRATION HAPTIC (NP-159).
 *
 * Fires when a member reaches a streak milestone or hits their weight goal.
 * Uses success notification feedback if available, with graceful fallback.
 */
export function celebrationHaptic(): void {
  try {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => {
      /* no engine, or the member turned haptics off */
    });
  } catch {
    /* module unavailable (web, a build without it) */
  }
}

/**
 * SET-COMPLETE TAP (NP-082).
 *
 * Fires when a set is marked done in the live workout — one medium impact,
 * the physical tick that the set landed. Same never-throws contract as the
 * breath tap above: a simulator has no engine and the member can turn
 * System Haptics off.
 */
export function setCompleteHaptic(): void {
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {
      /* no engine, or the member turned haptics off */
    });
  } catch {
    /* module unavailable (web, a build without it) */
  }
}

/**
 * REST-END ALERT (NP-082).
 *
 * Fires when the rest countdown reaches zero — the in-app half of the
 * locked-phone alert (the other half is the local notification in
 * `lib/live/restAlert.ts`). A success notification, matching the web's
 * vibration-at-zero. Never throws, never rejects.
 */
export function restEndHaptic(): void {
  try {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => {
      /* no engine, or the member turned haptics off */
    });
  } catch {
    /* module unavailable (web, a build without it) */
  }
}

/**
 * NEW-PR CELEBRATION (NP-082).
 *
 * Fires when the save reports a personal record — a heavy impact, distinct
 * from the set-complete tap so a record feels like one. Never throws, never
 * rejects.
 */
export function prHaptic(): void {
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {
      /* no engine, or the member turned haptics off */
    });
  } catch {
    /* module unavailable (web, a build without it) */
  }
}
