/**
 * THE AUDIBLE HALF OF THE REST ALERT (NP-082, porting the web's NP-210).
 *
 * Jon, NP-028 (2026-10-13, second reply): "there should be the locked screen
 * rest timer ... giving both sound and silent vibrations when the timer is
 * done[,] for both live and track". Native had the vibration
 * (`restEndHaptic`) and no sound at all — the same bug the web shipped from
 * the other end (`navigator.vibrate` alone). This is the sound: one short
 * two-beep asset (`assets/sounds/rest-end.wav`, written by
 * `scripts/generate-rest-alert-sound.mjs` from the web's own 880 Hz numbers).
 *
 * SILENT SWITCH / DO NOT DISTURB — the choice, deliberately:
 * `playsInSilentMode: false`. On iOS the ring/silent switch silences the
 * beep; on Android expo-audio suppresses playback while the ringer is silent
 * or on vibrate. A member who has silenced their phone still gets the
 * HAPTIC, which is precisely the "silent vibrations" half of the decision —
 * the alert is never lost, only its volume is the member's to control. We do
 * not route around the switch and do not claim an exemption: an app that
 * beeps through a silenced phone in a quiet gym gets uninstalled. The
 * locked-phone notification (`lib/live/restAlert.ts`) asks for sound of its
 * own, where the OS — including Do Not Disturb and the member's per-channel
 * settings — decides, as it should.
 *
 * The module and the asset are resolved ONCE, at import, each inside a
 * try/catch: a build without expo-audio (web, Expo Go) degrades to "no sound"
 * instead of crashing, and nothing is `require`d while a rest is ending —
 * which matters under jest, where a timer that fires after the environment is
 * torn down would otherwise try to load a module out of a dead registry.
 * Under jest this picks up `__mocks__/expo-audio.js`, which is what makes the
 * both-channels behaviour testable at all.
 *
 * Nothing here throws or rejects: if audio is unavailable the haptic is still
 * the alert, which is `lib/live/restEndAlert.ts`'s contract.
 */
import type { AudioPlayer } from "expo-audio";

/** Just the two functions this file calls, so a partial module is detectable. */
interface AudioModule {
  setAudioModeAsync: (
    mode: Partial<import("expo-audio").AudioMode>,
  ) => Promise<void>;
  createAudioPlayer: (source: unknown) => AudioPlayer;
}

const audioModule: AudioModule | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-audio") as Partial<AudioModule>;
    if (
      typeof mod.createAudioPlayer !== "function" ||
      typeof mod.setAudioModeAsync !== "function"
    ) {
      return null;
    }
    return mod as AudioModule;
  } catch {
    return null;
  }
})();

const restEndSource: unknown = (() => {
  try {
    return require("../../assets/sounds/rest-end.wav");
  } catch {
    return null;
  }
})();

/** Memoised: one player per process, replayed at the end of every rest. */
let playerPromise: Promise<AudioPlayer | null> | null = null;

async function loadPlayer(): Promise<AudioPlayer | null> {
  if (!audioModule || restEndSource === null) return null;
  try {
    await audioModule.setAudioModeAsync({
      // The member's silent switch / ringer wins. See the note above.
      playsInSilentMode: false,
      // Don't stop their music for a beep.
      interruptionMode: "mixWithOthers",
      // The in-app beep is a foreground cue; a locked phone is the
      // notification's job, not a background audio session.
      shouldPlayInBackground: false,
      allowsRecording: false,
    });
    return audioModule.createAudioPlayer(restEndSource);
  } catch {
    // The session was refused, or this build cannot decode the asset.
    return null;
  }
}

/**
 * Play the rest-end beep. Resolves once the sound has been asked for — never
 * throws, never rejects, and answers `false` when this build has no audio
 * (in which case the haptic was the whole alert).
 */
export async function playRestEndSound(): Promise<boolean> {
  try {
    playerPromise ??= loadPlayer();
    const player = await playerPromise;
    if (!player) return false;
    // A player that already played sits at the end of the clip; rewind so the
    // fifth rest of the session is as audible as the first.
    try {
      await player.seekTo(0);
    } catch {
      /* a fresh player may refuse a seek — play it anyway */
    }
    player.play();
    return true;
  } catch {
    return false;
  }
}

/** @internal Tests only — the memo would otherwise leak between cases. */
export function __resetRestSound(): void {
  playerPromise = null;
}
