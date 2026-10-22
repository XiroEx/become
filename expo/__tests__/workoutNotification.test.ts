/**
 * ─── The Android ongoing workout notification control module (NP-200) ──────
 *
 * `expo-notifications` is not driven for real here (its native module does
 * not exist under Jest — `__mocks__/expo-notifications.js` stands in, same
 * arrangement as the rest-alert suite) — these tests drive
 * `startWorkoutNotification` / `updateWorkoutNotification` /
 * `endWorkoutNotification` with a recording fake native wrapper.
 */
import {
  createWorkoutNotificationHandle,
  endWorkoutNotification,
  formatClockTime,
  formatRestRemaining,
  startWorkoutNotification,
  updateWorkoutNotification,
  WORKOUT_NOTIFICATION_CHANNEL_ID,
  WORKOUT_NOTIFICATION_ID,
  workoutNotificationBody,
  workoutNotificationTitle,
  type WorkoutNotificationNative,
  type WorkoutNotificationProps,
} from "@/lib/live/liveActivity/workoutNotification";

const EXERCISE_PROPS: WorkoutNotificationProps = {
  workoutTitle: "Upper Body",
  exerciseName: "Bench Press",
  setLabel: "Set 1 of 4",
  phase: "exercise",
  restEndsAtMs: null,
  restTotalSec: null,
};

function restProps(endsAtMs: number): WorkoutNotificationProps {
  return {
    ...EXERCISE_PROPS,
    phase: "rest",
    restEndsAtMs: endsAtMs,
    restTotalSec: 90,
  };
}

interface Scheduled {
  identifier: string;
  content: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
    sticky?: boolean;
    autoDismiss?: boolean;
    sound?: boolean;
  };
  trigger: { channelId: string };
}

interface Recording {
  native: WorkoutNotificationNative;
  scheduled: Scheduled[];
  dismissed: string[];
  channelsEnsured: number;
  granted: boolean;
}

function recordingNative(granted = true): Recording {
  const rec: Partial<Recording> = {
    scheduled: [],
    dismissed: [],
    channelsEnsured: 0,
    granted,
  };
  rec.native = {
    schedule: async (request) => {
      rec.scheduled!.push(request);
      return request.identifier;
    },
    dismiss: async (identifier) => {
      rec.dismissed!.push(identifier);
    },
    isGranted: async () => rec.granted!,
    ensureChannel: async () => {
      rec.channelsEnsured! += 1;
    },
  };
  return rec as Recording;
}

describe("workout notification copy", () => {
  it("titles the row with the workout", () => {
    expect(workoutNotificationTitle(EXERCISE_PROPS)).toBe("Upper Body");
  });

  it("bodies the row with the exercise and position while lifting", () => {
    expect(workoutNotificationBody(EXERCISE_PROPS, 1_000_000)).toBe(
      "Bench Press · Set 1 of 4",
    );
  });

  it("bodies the row with the rest countdown while resting", () => {
    const nowMs = 1_000_000;
    // Re-posted only on a change, so it names the length and the end time,
    // never a countdown that would freeze.
    expect(workoutNotificationBody(restProps(nowMs + 90_000), nowMs)).toBe(
      `Bench Press · Set 1 of 4 · Rest 1:30, back at ${formatClockTime(nowMs + 90_000)}`,
    );
  });

  it("formats the remaining rest as m:ss", () => {
    expect(formatRestRemaining(90_000)).toBe("1:30");
    expect(formatRestRemaining(5_000)).toBe("0:05");
    expect(formatRestRemaining(0)).toBe("0:00");
    expect(formatRestRemaining(-1_000)).toBe("0:00");
  });
});

describe("startWorkoutNotification", () => {
  it("posts exactly once per handle, on its own channel, as an ongoing row", async () => {
    const rec = recordingNative();
    const handle = createWorkoutNotificationHandle();
    await startWorkoutNotification(handle, EXERCISE_PROPS, rec.native, 1_000_000);
    expect(rec.scheduled).toHaveLength(1);
    expect(rec.scheduled[0]?.identifier).toBe(WORKOUT_NOTIFICATION_ID);
    expect(rec.scheduled[0]?.trigger).toEqual({
      channelId: WORKOUT_NOTIFICATION_CHANNEL_ID,
    });
    expect(rec.scheduled[0]?.content.title).toBe("Upper Body");
    expect(rec.scheduled[0]?.content.body).toBe("Bench Press · Set 1 of 4");
    // Ongoing: cannot be swiped away, and a tap must not clear it either.
    expect(rec.scheduled[0]?.content.sticky).toBe(true);
    expect(rec.scheduled[0]?.content.autoDismiss).toBe(false);
    // Silent: the rest-end alert is the alarm; this row is a glance.
    expect(rec.scheduled[0]?.content.sound).toBe(false);
    expect(handle.showing).toBe(true);

    // A second start on the SAME handle is a no-op — one live workout owns
    // one row.
    await startWorkoutNotification(
      handle,
      restProps(1_090_000),
      rec.native,
      1_000_000,
    );
    expect(rec.scheduled).toHaveLength(1);
  });

  it("ensures its own channel before posting", async () => {
    const rec = recordingNative();
    const handle = createWorkoutNotificationHandle();
    await startWorkoutNotification(handle, EXERCISE_PROPS, rec.native, 1_000_000);
    expect(rec.channelsEnsured).toBe(1);
  });

  it("does nothing when there is no native wrapper (iOS, Expo Go, Jest default)", async () => {
    const handle = createWorkoutNotificationHandle();
    await startWorkoutNotification(handle, EXERCISE_PROPS, null, 1_000_000);
    expect(handle.showing).toBe(false);
  });

  it("never prompts — stays silent when the permission is not already granted", async () => {
    const rec = recordingNative(false);
    const handle = createWorkoutNotificationHandle();
    await startWorkoutNotification(handle, EXERCISE_PROPS, rec.native, 1_000_000);
    expect(rec.scheduled).toEqual([]);
    expect(handle.showing).toBe(false);
  });

  it("never throws when the native module itself throws", async () => {
    const rec = recordingNative();
    const throwing: WorkoutNotificationNative = {
      ...rec.native,
      schedule: async () => {
        throw new Error("no native module");
      },
    };
    const handle = createWorkoutNotificationHandle();
    await expect(
      startWorkoutNotification(handle, EXERCISE_PROPS, throwing, 1_000_000),
    ).resolves.toBeUndefined();
    expect(handle.showing).toBe(false);
  });
});

describe("updateWorkoutNotification", () => {
  it("re-schedules the same identifier with the new description", async () => {
    const rec = recordingNative();
    const handle = createWorkoutNotificationHandle();
    await startWorkoutNotification(handle, EXERCISE_PROPS, rec.native, 1_000_000);

    const endsAt = 1_000_000 + 90_000;
    await updateWorkoutNotification(handle, restProps(endsAt), rec.native, 1_000_000);
    expect(rec.scheduled).toHaveLength(2);
    // Same identifier = the row is replaced in place, never stacked.
    expect(rec.scheduled[1]?.identifier).toBe(WORKOUT_NOTIFICATION_ID);
    expect(rec.scheduled[1]?.content.body).toBe(
      `Bench Press · Set 1 of 4 · Rest 1:30, back at ${formatClockTime(endsAt)}`,
    );
    // The instant carried to the row is `endsAt`, verbatim — never a value
    // recomputed here: the row and the in-app timer name the same instant.
    expect(rec.scheduled[1]?.content.body).toContain("1:30");
  });

  it("is a no-op when nothing is showing", async () => {
    const rec = recordingNative();
    const handle = createWorkoutNotificationHandle();
    await updateWorkoutNotification(handle, EXERCISE_PROPS, rec.native, 1_000_000);
    expect(rec.scheduled).toEqual([]);
  });
});

describe("endWorkoutNotification", () => {
  it("dismisses the row by its identifier", async () => {
    const rec = recordingNative();
    const handle = createWorkoutNotificationHandle();
    await startWorkoutNotification(handle, EXERCISE_PROPS, rec.native, 1_000_000);
    await endWorkoutNotification(handle, rec.native);
    expect(rec.dismissed).toEqual([WORKOUT_NOTIFICATION_ID]);
    expect(handle.showing).toBe(false);
  });

  it("is a no-op when nothing is showing", async () => {
    const rec = recordingNative();
    const handle = createWorkoutNotificationHandle();
    await endWorkoutNotification(handle, rec.native);
    expect(rec.dismissed).toEqual([]);
  });
});
