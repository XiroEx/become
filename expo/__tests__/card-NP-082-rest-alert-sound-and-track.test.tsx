/**
 * ─── NATIVE REST ALERT: SOUND **AND** VIBRATION, AND TRACK'S OWN TIMER ──────
 *
 * Board card 6acec793eabd988f96d40a34 ("Native: rest alert gives sound AND
 * vibration at zero, and Track gets its own rest timer"), the native half of
 * the web's NP-210 (`e243ddb8` on main). Acceptance ids are in the test
 * names:
 *
 *   96d40a35 — Live's rest alert fires BOTH sound and vibration at zero, on
 *              iOS and Android
 *   96d40a36 — Track has its own rest timer on the SAME duration rule as
 *              Live (no second rule)
 *   96d40a37 — the rule and the both-channels alert are unit-tested against a
 *              fake audio/haptics module (also `restEndAlert.test.ts` and
 *              `restDuration.test.ts`)
 *
 * The decision being implemented (Jon, NP-028, 2026-10-13): "there should be
 * the locked screen rest timer ... giving both sound and silent vibrations
 * when the timer is done[,] for both live and track". Before this, native
 * fired a haptic alone — the mirror image of the web's `navigator.vibrate`
 * bug — and the flat `DEFAULT_REST_SEC = 90` in `LiveWorkoutClient.tsx` was a
 * second rest rule for any set not found in the flow.
 */
import { act, fireEvent, render } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import * as Audio from "expo-audio";
import * as Notifications from "expo-notifications";
import * as fs from "fs";
import * as path from "path";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import { getRestDuration, restGroupContext } from "@/lib/live/restDuration";
import type { RestEndAlertDeps } from "@/lib/live/restEndAlert";
import { defaultRestAlertDeps } from "@/lib/live/restAlert";
import { __resetRestSound } from "@/lib/feedback/restSound";

const audio = Audio as unknown as {
  createAudioPlayer: jest.Mock;
  setAudioModeAsync: jest.Mock;
  __restSoundPlayer: { play: jest.Mock; seekTo: jest.Mock };
};
const notifications = Notifications as unknown as {
  scheduleNotificationAsync: jest.Mock;
};

/** A clock plus the single interval the rest timer registers. */
function mockClock() {
  let nowMs = 1_000_000;
  let fn: (() => void) | null = null;
  const setI = ((cb: () => void) => {
    fn = cb;
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as unknown as typeof setInterval;
  const clearI = (() => {
    fn = null;
  }) as unknown as typeof clearInterval;
  return {
    setI,
    clearI,
    now: () => nowMs,
    /** Advance the wall clock and let the display interval read it. */
    advance(ms: number) {
      act(() => {
        nowMs += ms;
        fn?.();
      });
    },
  };
}

/** Records which channels fired, in order. */
function recordingAlert(): RestEndAlertDeps & { fired: string[] } {
  const fired: string[] = [];
  return {
    fired,
    haptic: () => fired.push("vibration"),
    playSound: () => {
      fired.push("sound");
    },
  };
}

/** One heavy-compound exercise with an explicit 5 s rest, two sets. */
const BENCH: LiveWorkoutViewModel = {
  programId: "p",
  workoutTitle: "Push A",
  exercises: [
    { slug: "bench", name: "Bench Press", sets: 2, restSec: 5, trackingType: "reps_weight" },
  ],
};

beforeEach(() => {
  __resetRestSound();
  (Haptics.notificationAsync as unknown as jest.Mock).mockClear();
  audio.createAudioPlayer.mockClear();
  audio.__restSoundPlayer.play.mockClear();
  notifications.scheduleNotificationAsync.mockClear();
});

describe("96d40a35: the alert at zero is sound AND vibration", () => {
  it("Live fires both channels when the countdown reaches zero", () => {
    const clock = mockClock();
    const alert = recordingAlert();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={BENCH}
        initialView="live"
        restTimerSetInterval={clock.setI}
        restTimerClearInterval={clock.clearI}
        restTimerNow={clock.now}
        restEndAlertDeps={alert}
      />,
    );
    fireEvent.press(getByTestId("live-workout-live-complete"));
    expect(getByTestId("live-workout-rest-time").props.children).toBe("0:05");
    expect(alert.fired).toEqual([]);
    clock.advance(5_000);
    // BOTH, in one go — never vibration-only (what native did before) and
    // never sound-only.
    expect(alert.fired).toEqual(["vibration", "sound"]);
  });

  it("Track fires the same two channels — one alert, both views", () => {
    const clock = mockClock();
    const alert = recordingAlert();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={BENCH}
        initialView="track"
        restTimerSetInterval={clock.setI}
        restTimerClearInterval={clock.clearI}
        restTimerNow={clock.now}
        restEndAlertDeps={alert}
      />,
    );
    fireEvent.press(getByTestId("live-workout-bench-set-0-complete"));
    clock.advance(5_000);
    expect(alert.fired).toEqual(["vibration", "sound"]);
  });

  it("with the PRODUCTION wiring it reaches expo-haptics and expo-audio", async () => {
    const clock = mockClock();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={BENCH}
        initialView="live"
        restTimerSetInterval={clock.setI}
        restTimerClearInterval={clock.clearI}
        restTimerNow={clock.now}
      />,
    );
    fireEvent.press(getByTestId("live-workout-live-complete"));
    (Haptics.notificationAsync as unknown as jest.Mock).mockClear();
    clock.advance(5_000);
    // The vibration channel: expo-haptics' success notification.
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
    // The sound channel: the expo-audio player, asked for the rest-end asset.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(audio.__restSoundPlayer.play).toHaveBeenCalledTimes(1);
  });

  it("neither channel is gated on the platform, so iOS and Android both get both", () => {
    // There is no `Platform.OS` branch anywhere in the alert: the same two
    // calls run on both phones. Asserting it on the source is the only way
    // jest can speak for a device it does not have.
    const libDir = path.resolve(__dirname, "..", "lib");
    const sources = [
      path.join(libDir, "live", "restEndAlert.ts"),
      path.join(libDir, "feedback", "restSound.ts"),
      path.join(libDir, "feedback", "haptics.ts"),
    ].map((file) => fs.readFileSync(file, "utf8"));
    for (const source of sources) {
      expect(source).not.toMatch(/Platform\.OS/);
    }
    // And the one asset both platforms play is in the repo.
    const wav = fs.readFileSync(
      path.resolve(__dirname, "..", "assets", "sounds", "rest-end.wav"),
    );
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(34)).toBe(16); // 16-bit
  });

  it("the locked-phone notification asks for sound too (iOS played nothing before)", async () => {
    await defaultRestAlertDeps.schedule(Date.now() + 90_000);
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const request = notifications.scheduleNotificationAsync.mock.calls[0]![0];
    expect(request.content.sound).toBe(true);
    // Android's sound and vibration come from the channel, which already
    // declares both — the alert must stay on it.
    expect(request.trigger.channelId).toBe("rest-timer");
  });

  it("a rest the MEMBER skipped is not a rest that ended — no alert", () => {
    const clock = mockClock();
    const alert = recordingAlert();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={BENCH}
        initialView="track"
        restTimerSetInterval={clock.setI}
        restTimerClearInterval={clock.clearI}
        restTimerNow={clock.now}
        restEndAlertDeps={alert}
      />,
    );
    fireEvent.press(getByTestId("live-workout-bench-set-0-complete"));
    fireEvent.press(getByTestId("live-workout-rest-skip"));
    // The web's `skipRest` fires no alert either: the member is already
    // lifting, and beeping at them for pressing Skip is noise.
    expect(alert.fired).toEqual([]);
  });
});

describe("96d40a36: Track's own rest timer, on Live's rule", () => {
  /** Heavy compound work with NO explicit rest: the rule says 3 min. */
  const SMART: LiveWorkoutViewModel = {
    programId: "p",
    workoutTitle: "Push A",
    exercises: [
      { slug: "squat", name: "Back Squat", sets: 2, trackingType: "reps_weight" },
    ],
  };

  it("completing a set in Track starts Track's rest bar", () => {
    const clock = mockClock();
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={BENCH}
        initialView="track"
        restTimerSetInterval={clock.setI}
        restTimerClearInterval={clock.clearI}
        restTimerNow={clock.now}
      />,
    );
    expect(queryByTestId("live-workout-rest")).toBeNull();
    fireEvent.press(getByTestId("live-workout-bench-set-0-complete"));
    expect(getByTestId("live-workout-rest")).toBeTruthy();
    expect(getByTestId("live-workout-rest-time").props.children).toBe("0:05");
    // …and it counts down, pauses and skips like Live's.
    clock.advance(2_000);
    expect(getByTestId("live-workout-rest-time").props.children).toBe("0:03");
    fireEvent.press(getByTestId("live-workout-rest-pause"));
    expect(getByTestId("live-workout-rest-resume")).toBeTruthy();
  });

  it("Track rests the rule's smart default — 3 min for heavy work, not a flat 90 s", () => {
    const clock = mockClock();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={SMART}
        initialView="track"
        restTimerSetInterval={clock.setI}
        restTimerClearInterval={clock.clearI}
        restTimerNow={clock.now}
      />,
    );
    fireEvent.press(getByTestId("live-workout-squat-set-0-complete"));
    expect(getByTestId("live-workout-rest-time").props.children).toBe("3:00");
    // The number came from the shared rule, not from this component.
    expect(
      getRestDuration(SMART.exercises[0]!, restGroupContext(SMART.exercises, 0)),
    ).toBe(180);
  });

  it("Track and Live rest the same exercise for the same time", () => {
    const render1 = mockClock();
    const track = render(
      <LiveWorkoutClient
        workout={SMART}
        initialView="track"
        restTimerSetInterval={render1.setI}
        restTimerClearInterval={render1.clearI}
        restTimerNow={render1.now}
      />,
    );
    fireEvent.press(track.getByTestId("live-workout-squat-set-0-complete"));
    const trackTime = track.getByTestId("live-workout-rest-time").props.children;

    const render2 = mockClock();
    const live = render(
      <LiveWorkoutClient
        workout={SMART}
        initialView="live"
        restTimerSetInterval={render2.setI}
        restTimerClearInterval={render2.clearI}
        restTimerNow={render2.now}
      />,
    );
    fireEvent.press(live.getByTestId("live-workout-live-complete"));
    expect(live.getByTestId("live-workout-rest-time").props.children).toBe(trackTime);
  });

  it("inside a superset Track rests between ROUNDS, not between exercises", () => {
    const superset: LiveWorkoutViewModel = {
      programId: "p",
      workoutTitle: "Pull A",
      exercises: [
        {
          slug: "row",
          name: "Row",
          sets: 2,
          trackingType: "reps_weight",
          groupId: "g1",
          groupType: "superset",
          groupRest: "60s",
        },
        {
          slug: "curl",
          name: "Curl",
          sets: 2,
          trackingType: "reps_weight",
          groupId: "g1",
          groupType: "superset",
          groupRest: "60s",
        },
      ],
    };
    const clock = mockClock();
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={superset}
        initialView="track"
        restTimerSetInterval={clock.setI}
        restTimerClearInterval={clock.clearI}
        restTimerNow={clock.now}
      />,
    );
    // First member of the round: straight on to the next exercise, no rest.
    fireEvent.press(getByTestId("live-workout-row-set-0-complete"));
    expect(queryByTestId("live-workout-rest")).toBeNull();
    // The round's last member: the group's 60 s.
    fireEvent.press(getByTestId("live-workout-curl-set-0-complete"));
    expect(getByTestId("live-workout-rest-time").props.children).toBe("1:00");
  });

  it("the component no longer owns a rule of its own", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "..", "components", "live", "LiveWorkoutClient.tsx"),
      "utf8",
    );
    // No second copy of the rule, and no flat default standing in for it.
    expect(source).not.toMatch(/const DEFAULT_REST_SEC/);
    expect(source).not.toMatch(/function smartRestDefault/);
    expect(source).toMatch(/from "@\/lib\/live\/restDuration"/);
  });
});
