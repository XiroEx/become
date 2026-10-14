/**
 * THE REST-END ALERT: BOTH CHANNELS, EVERY TIME (NP-082).
 *
 * Driven against the FAKE audio and haptics modules (`__mocks__/expo-audio.js`
 * and `__mocks__/expo-haptics.js`), the way the Health Connect bridge is
 * driven against a fake native module — jest has neither a haptic engine nor
 * an audio session, and the point of the test is the two calls, not the buzz.
 *
 * Jon's decision (NP-028, 2026-10-13): sound AND vibration when the rest
 * ends, in Live and in Track. So the assertions are about BOTH, and about one
 * channel failing never taking the other with it.
 */
import * as Haptics from "expo-haptics";
import * as Audio from "expo-audio";
import { fireRestEndAlert, defaultRestEndAlertDeps } from "@/lib/live/restEndAlert";
import { playRestEndSound, __resetRestSound } from "@/lib/feedback/restSound";

const audio = Audio as unknown as {
  createAudioPlayer: jest.Mock;
  setAudioModeAsync: jest.Mock;
  __restSoundPlayer: { play: jest.Mock; seekTo: jest.Mock };
};

/** Let the lazy `import("expo-audio")` and the seek settle. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  __resetRestSound();
  (Haptics.notificationAsync as unknown as jest.Mock).mockClear();
  audio.createAudioPlayer.mockClear();
  audio.setAudioModeAsync.mockClear();
  audio.__restSoundPlayer.play.mockClear();
  audio.__restSoundPlayer.seekTo.mockClear();
});

describe("fireRestEndAlert — the production defaults", () => {
  it("fires the vibration AND the sound (never one of the two)", async () => {
    fireRestEndAlert();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
    await flush();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(audio.__restSoundPlayer.play).toHaveBeenCalledTimes(1);
  });

  it("the default deps ARE the two feedback wrappers", () => {
    expect(defaultRestEndAlertDeps.haptic).toBeInstanceOf(Function);
    expect(defaultRestEndAlertDeps.playSound).toBe(playRestEndSound);
  });
});

describe("fireRestEndAlert — one channel may not swallow the other", () => {
  it("a phone with no haptic engine still gets the sound", () => {
    const playSound = jest.fn();
    fireRestEndAlert({
      haptic: () => {
        throw new Error("no haptic engine");
      },
      playSound,
    });
    expect(playSound).toHaveBeenCalledTimes(1);
  });

  it("a build with no audio still gets the vibration", () => {
    const haptic = jest.fn();
    fireRestEndAlert({
      haptic,
      playSound: () => {
        throw new Error("no audio module");
      },
    });
    expect(haptic).toHaveBeenCalledTimes(1);
  });

  it("a rejected sound promise never becomes an unhandled rejection", async () => {
    const haptic = jest.fn();
    fireRestEndAlert({
      haptic,
      playSound: () => Promise.reject(new Error("session refused")),
    });
    expect(haptic).toHaveBeenCalledTimes(1);
    await flush();
  });
});

describe("playRestEndSound — the silent-switch choice", () => {
  it("does NOT play over a silenced phone, and does not stop the member's music", async () => {
    await playRestEndSound();
    expect(audio.setAudioModeAsync).toHaveBeenCalledTimes(1);
    const mode = audio.setAudioModeAsync.mock.calls[0]![0];
    // The decision: the ring/silent switch (iOS) and the ringer mode
    // (Android) win. The haptic is the alert on a silenced phone — "both
    // sound and SILENT vibrations", Jon's words.
    expect(mode.playsInSilentMode).toBe(false);
    // A beep that pauses the playlist every 90 s is worse than no beep.
    expect(mode.interruptionMode).toBe("mixWithOthers");
    // No background audio session: the locked phone is the notification's job.
    expect(mode.shouldPlayInBackground).toBe(false);
  });

  it("re-uses one player and rewinds it, so the fifth rest is as audible as the first", async () => {
    await playRestEndSound();
    await playRestEndSound();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(audio.__restSoundPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(audio.__restSoundPlayer.play).toHaveBeenCalledTimes(2);
  });

  it("answers true once it has asked the player to play", async () => {
    await expect(playRestEndSound()).resolves.toBe(true);
  });
});
