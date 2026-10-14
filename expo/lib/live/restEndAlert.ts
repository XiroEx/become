/**
 * THE REST-END ALERT — BOTH CHANNELS, EVERY TIME (NP-082, porting NP-210).
 *
 * Jon's decision on NP-028 (2026-10-13): when the rest timer ends the alert
 * gives **both sound and vibration**, in Live **and** in Track — not a
 * sound-or-silent choice, and not one view getting it and the other not. The
 * web landed it as `webapp/lib/workout/restAlert.ts` (`fireRestAlert` =
 * vibrate + beep); this is the native twin.
 *
 * Why it is one function and not two calls at the call site: before this,
 * native fired `restEndHaptic()` from `useRestTimer` and nothing else, so
 * "the alert" was a line of code anybody could half-change. One function
 * means neither view can drift onto vibration-only or sound-only.
 *
 * The two channels are INDEPENDENT on purpose: each is wrapped so a phone
 * with no haptic engine still beeps, and a build with no audio module still
 * buzzes. A missing channel is never allowed to swallow the other one.
 *
 * Both impls are injected through `RestEndAlertDeps` so unit tests can drive
 * them, exactly like `lib/health/adapter.ts` takes its platform impls — and
 * the production defaults are the two thin wrappers in `lib/feedback/`.
 */
import { restEndHaptic } from "@/lib/feedback/haptics";
import { playRestEndSound } from "@/lib/feedback/restSound";

export interface RestEndAlertDeps {
  /** The vibration channel. Defaults to expo-haptics' success notification. */
  haptic: () => void;
  /** The sound channel. Defaults to the expo-audio beep. */
  playSound: () => Promise<boolean> | void;
}

export const defaultRestEndAlertDeps: RestEndAlertDeps = {
  haptic: restEndHaptic,
  playSound: playRestEndSound,
};

/**
 * Fire the rest-complete alert: vibration AND sound, always both, in that
 * order (the haptic is instant; the sound may have to load a player). Never
 * throws — a rest alert may not take a live workout down.
 */
export function fireRestEndAlert(
  deps: RestEndAlertDeps = defaultRestEndAlertDeps,
): void {
  try {
    deps.haptic();
  } catch {
    /* no engine, haptics turned off — the sound below is still the alert */
  }
  try {
    const result = deps.playSound();
    if (result && typeof (result as Promise<boolean>).catch === "function") {
      void (result as Promise<boolean>).catch(() => {
        /* no audio in this build — the haptic above was the alert */
      });
    }
  } catch {
    /* ditto */
  }
}
