// NP-210: the rest-timer alert fires BOTH a sound and a vibration, every
// time, on both Live and Track. Jon's decision (NP-028, second reply, 2026-
// 10-13): "there should be the locked screen rest timer asking giving both
// sound and silent vibrations when the timer is done" — not a sound-or-
// silent toggle, and not one view getting it and the other not.
//
// This is the ONE place that fires the alert so neither view can drift onto
// vibration-only (what Live did before this card) or invent its own sound.

/** Same cadence both views used for the vibration-only alert this replaces. */
export const REST_ALERT_VIBRATION_PATTERN = [100, 50, 100];

type VibrateFn = (pattern: number | number[]) => boolean;
type AudioContextCtor = new () => AudioContext;

export interface RestAlertDeps {
  /** Override for tests; defaults to `navigator.vibrate`. */
  vibrate?: VibrateFn;
  /** Override for tests; defaults to `window.AudioContext`/`webkitAudioContext`. */
  AudioContextCtor?: AudioContextCtor;
}

function resolveVibrate(deps?: RestAlertDeps): VibrateFn | undefined {
  if (deps?.vibrate) return deps.vibrate;
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    return navigator.vibrate.bind(navigator);
  }
  return undefined;
}

function resolveAudioContextCtor(deps?: RestAlertDeps): AudioContextCtor | undefined {
  if (deps?.AudioContextCtor) return deps.AudioContextCtor;
  if (typeof window === "undefined") return undefined;
  const win = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return win.AudioContext || win.webkitAudioContext;
}

/** Vibrates using the shared pattern. A no-op where `navigator.vibrate` does
 *  not exist (desktop browsers, etc.) — the sound signal still fires. */
export function vibrateRestAlert(deps?: RestAlertDeps): void {
  resolveVibrate(deps)?.(REST_ALERT_VIBRATION_PATTERN);
}

/** Plays a short two-beep tone via the Web Audio API. A no-op where
 *  AudioContext is unavailable or construction throws (autoplay policy,
 *  unsupported browser) — the vibration signal still fires either way. */
export function playRestAlertSound(deps?: RestAlertDeps): void {
  const Ctor = resolveAudioContextCtor(deps);
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    const beepAt = (offsetSeconds: number) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      const startTime = ctx.currentTime + offsetSeconds;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.25);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.3);
    };
    beepAt(0);
    beepAt(0.2);
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 600);
  } catch {
    // Audio isn't available/allowed here — fall through silently so the
    // vibration signal above is still the alert, never a thrown error.
  }
}

/** Fires the rest-complete alert: vibration AND sound, always both. */
export function fireRestAlert(deps?: RestAlertDeps): void {
  vibrateRestAlert(deps);
  playRestAlertSound(deps);
}
