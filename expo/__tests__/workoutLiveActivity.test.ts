/**
 * ─── The Lock Screen Live Activity control module (NP-188) ─────────────────
 *
 * `expo-widgets` is not driven for real here (its native module does not
 * exist under Jest — `__mocks__/expo-widgets.ts` stands in, same arrangement
 * as the widgets draw tests) — these tests drive `startWorkoutLiveActivity`
 * / `updateWorkoutLiveActivity` / `endWorkoutLiveActivity` with a recording
 * fake factory, exactly like `iosWidgetDraw.test.ts` does for the Home
 * Screen widgets.
 */
import {
  createWorkoutLiveActivityHandle,
  endWorkoutLiveActivity,
  loadWorkoutLiveActivityFactory,
  startWorkoutLiveActivity,
  updateWorkoutLiveActivity,
  WORKOUT_LIVE_ACTIVITY_NAME,
  type WorkoutLiveActivityFactory,
  type WorkoutLiveActivityInstance,
  type WorkoutLiveActivityProps,
} from "@/lib/live/liveActivity/workoutLiveActivity";

const EXERCISE_PROPS: WorkoutLiveActivityProps = {
  workoutTitle: "Upper Body",
  exerciseName: "Bench Press",
  setLabel: "Set 1 of 4",
  phase: "exercise",
  restEndsAtMs: null,
  restTotalSec: null,
};

function restProps(endsAtMs: number): WorkoutLiveActivityProps {
  return {
    ...EXERCISE_PROPS,
    phase: "rest",
    restEndsAtMs: endsAtMs,
    restTotalSec: 90,
  };
}

interface Recording {
  factory: WorkoutLiveActivityFactory;
  started: WorkoutLiveActivityProps[];
  updated: WorkoutLiveActivityProps[];
  ended: (WorkoutLiveActivityProps | undefined)[];
  instance: WorkoutLiveActivityInstance;
}

function recordingFactory(startsNull = false): Recording {
  const rec: Partial<Recording> = {
    started: [],
    updated: [],
    ended: [],
  };
  const instance: WorkoutLiveActivityInstance = {
    update: async (props) => {
      rec.updated!.push(props);
    },
    end: async (props) => {
      rec.ended!.push(props);
    },
  };
  rec.instance = instance;
  rec.factory = {
    start: (props) => {
      rec.started!.push(props);
      return startsNull ? null : instance;
    },
  };
  return rec as Recording;
}

describe("startWorkoutLiveActivity", () => {
  it("starts exactly once per handle, with the exact props handed in", () => {
    const rec = recordingFactory();
    const handle = createWorkoutLiveActivityHandle();
    startWorkoutLiveActivity(handle, EXERCISE_PROPS, rec.factory);
    expect(rec.started).toEqual([EXERCISE_PROPS]);
    expect(handle.instance).toBe(rec.instance);

    // A second start on the SAME handle is a no-op — one live workout owns
    // one activity.
    startWorkoutLiveActivity(handle, restProps(Date.now() + 90_000), rec.factory);
    expect(rec.started).toEqual([EXERCISE_PROPS]);
  });

  it("does nothing when there is no factory (Android, Expo Go, iOS < 16.2)", () => {
    const handle = createWorkoutLiveActivityHandle();
    startWorkoutLiveActivity(handle, EXERCISE_PROPS, null);
    expect(handle.instance).toBeNull();
  });

  it("never throws when the factory itself throws", () => {
    const handle = createWorkoutLiveActivityHandle();
    const throwing: WorkoutLiveActivityFactory = {
      start: () => {
        throw new Error("ActivityKit disabled");
      },
    };
    expect(() =>
      startWorkoutLiveActivity(handle, EXERCISE_PROPS, throwing),
    ).not.toThrow();
    expect(handle.instance).toBeNull();
  });

  it("leaves the handle empty when the factory itself answers null", () => {
    const rec = recordingFactory(true);
    const handle = createWorkoutLiveActivityHandle();
    startWorkoutLiveActivity(handle, EXERCISE_PROPS, rec.factory);
    expect(handle.instance).toBeNull();
  });
});

describe("updateWorkoutLiveActivity", () => {
  it("pushes the update to the running instance", async () => {
    const rec = recordingFactory();
    const handle = createWorkoutLiveActivityHandle();
    startWorkoutLiveActivity(handle, EXERCISE_PROPS, rec.factory);

    // The rule that travels: whatever `restEndsAtMs` the caller hands in is
    // what reaches the activity, unchanged.
    const endsAt = Date.now() + 90_000;
    await updateWorkoutLiveActivity(handle, restProps(endsAt));
    expect(rec.updated).toEqual([restProps(endsAt)]);
    expect(rec.updated[0]?.restEndsAtMs).toBe(endsAt);
  });

  it("does nothing when nothing is running", async () => {
    const handle = createWorkoutLiveActivityHandle();
    await expect(
      updateWorkoutLiveActivity(handle, EXERCISE_PROPS),
    ).resolves.toBeUndefined();
  });

  it("never throws when the update itself rejects", async () => {
    const handle = createWorkoutLiveActivityHandle();
    handle.instance = {
      update: async () => {
        throw new Error("activity gone");
      },
      end: async () => undefined,
    };
    await expect(
      updateWorkoutLiveActivity(handle, EXERCISE_PROPS),
    ).resolves.toBeUndefined();
  });
});

describe("endWorkoutLiveActivity", () => {
  it("ends the running instance and clears the handle", async () => {
    const rec = recordingFactory();
    const handle = createWorkoutLiveActivityHandle();
    startWorkoutLiveActivity(handle, EXERCISE_PROPS, rec.factory);
    await endWorkoutLiveActivity(handle);
    expect(rec.ended).toEqual([undefined]);
    expect(handle.instance).toBeNull();
  });

  it("is idempotent — a second end is a no-op", async () => {
    const rec = recordingFactory();
    const handle = createWorkoutLiveActivityHandle();
    startWorkoutLiveActivity(handle, EXERCISE_PROPS, rec.factory);
    await endWorkoutLiveActivity(handle);
    await endWorkoutLiveActivity(handle);
    expect(rec.ended).toEqual([undefined]);
  });

  it("does nothing when nothing is running", async () => {
    const handle = createWorkoutLiveActivityHandle();
    await expect(endWorkoutLiveActivity(handle)).resolves.toBeUndefined();
  });

  it("never throws when the end itself rejects", async () => {
    const handle = createWorkoutLiveActivityHandle();
    handle.instance = {
      update: async () => undefined,
      end: async () => {
        throw new Error("already ended");
      },
    };
    await expect(endWorkoutLiveActivity(handle)).resolves.toBeUndefined();
  });
});

describe("loadWorkoutLiveActivityFactory", () => {
  it("registers under WORKOUT_LIVE_ACTIVITY_NAME and wraps the native factory's end() argument order", () => {
    const calls: { name: string; layout: unknown }[] = [];
    const nativeEnded: unknown[] = [];
    const native = {
      start: () => ({
        update: async () => undefined,
        end: async (dismissalPolicy: unknown, props: unknown) => {
          nativeEnded.push([dismissalPolicy, props]);
        },
      }),
    };
    const factory = loadWorkoutLiveActivityFactory(
      (name, layout) => {
        calls.push({ name, layout });
        return native;
      },
      { fakeLayout: true },
    );
    expect(calls).toEqual([
      { name: WORKOUT_LIVE_ACTIVITY_NAME, layout: { fakeLayout: true } },
    ]);
    expect(factory).not.toBeNull();

    const handle = createWorkoutLiveActivityHandle();
    startWorkoutLiveActivity(handle, EXERCISE_PROPS, factory);
    expect(handle.instance).not.toBeNull();
    void handle.instance?.end(EXERCISE_PROPS);
    expect(nativeEnded).toEqual([["default", EXERCISE_PROPS]]);
  });

  it("never throws when the native side is unavailable", () => {
    expect(() =>
      loadWorkoutLiveActivityFactory(() => {
        throw new Error("no ActivityKit module");
      }),
    ).not.toThrow();
    expect(
      loadWorkoutLiveActivityFactory(() => {
        throw new Error("no ActivityKit module");
      }),
    ).toBeNull();
  });
});
