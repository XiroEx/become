/**
 * NP-188 acceptance: the Lock Screen Live Activity for the live workout —
 * started when the workout opens, updated with the exercise and the rest
 * countdown on every set, and ended when the member leaves (finish or
 * discard, which both unmount this component in the real app — see
 * `useWorkoutLiveActivity.ts`).
 *
 * `expo-widgets`'s native module does not exist under Jest, so these tests
 * inject a recording `workoutLiveActivityFactory` instead of the real
 * `createLiveActivity` (same arrangement `card-NP-082-acceptance.test.tsx`
 * uses for the rest-alert deps).
 */
import { act, fireEvent, render } from "@testing-library/react-native";
import { addUserInteractionListener } from "expo-widgets";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import {
  createWorkoutLiveActivityHandle,
  WORKOUT_LIVE_ACTIVITY_NAME,
  type WorkoutLiveActivityFactory,
  type WorkoutLiveActivityInstance,
  type WorkoutLiveActivityProps,
} from "@/lib/live/liveActivity/workoutLiveActivity";

interface Recording {
  factory: WorkoutLiveActivityFactory;
  started: WorkoutLiveActivityProps[];
  updated: WorkoutLiveActivityProps[];
  ended: (WorkoutLiveActivityProps | undefined)[];
}

function recordingFactory(): Recording {
  const rec: Partial<Recording> = { started: [], updated: [], ended: [] };
  const instance: WorkoutLiveActivityInstance = {
    update: async (props) => {
      rec.updated!.push(props);
    },
    end: async (props) => {
      rec.ended!.push(props);
    },
  };
  rec.factory = {
    start: (props) => {
      rec.started!.push(props);
      return instance;
    },
  };
  return rec as Recording;
}

function mockInterval(): {
  setI: typeof setInterval;
  clearI: typeof clearInterval;
} {
  const setI = (() => 1 as unknown as ReturnType<typeof setInterval>) as unknown as typeof setInterval;
  const clearI = (() => undefined) as unknown as typeof clearInterval;
  return { setI, clearI };
}

const WORKOUT: LiveWorkoutViewModel = {
  programId: "p",
  workoutTitle: "Upper Body",
  exercises: [{ slug: "bench", name: "Bench Press", sets: 2, restSec: 90 }],
};

describe("NP-188 acceptance", () => {
  it("e015cad4: shows the exercise, then the rest countdown at the exact instant the in-app timer uses", () => {
    const rec = recordingFactory();
    const handle = createWorkoutLiveActivityHandle();
    let nowMs = 1_000_000;
    const { setI, clearI } = mockInterval();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={WORKOUT}
        restTimerSetInterval={setI}
        restTimerClearInterval={clearI}
        restTimerNow={() => nowMs}
        workoutLiveActivityHandle={handle}
        workoutLiveActivityFactory={rec.factory}
      />,
    );

    // The activity starts as soon as the workout is on screen, showing the
    // exercise — lifting, not resting.
    expect(rec.started).toHaveLength(1);
    expect(rec.started[0]?.exerciseName).toBe("Bench Press");
    expect(rec.started[0]?.phase).toBe("exercise");
    expect(rec.started[0]?.restEndsAtMs).toBeNull();

    // Completing the first set starts a 90s rest.
    act(() => {
      fireEvent.press(getByTestId("live-workout-bench-set-0-complete"));
    });
    const restDisplay = getByTestId("live-workout-rest-time").props.children;
    expect(restDisplay).toBe("1:30");

    const lastUpdate = rec.updated[rec.updated.length - 1];
    expect(lastUpdate?.phase).toBe("rest");
    // THE RULE THAT TRAVELS: the Lock Screen's rest end instant is the same
    // one the in-app countdown is built from — `nowMs + 90_000` here.
    expect(lastUpdate?.restEndsAtMs).toBe(nowMs + 90_000);
    expect(lastUpdate?.restTotalSec).toBe(90);
    expect(lastUpdate?.exerciseName).toBe("Bench Press");
    expect(lastUpdate?.setLabel).toBe("Set 2 of 2");
  });

  it("e015cad5: finishing or discarding — unmounting the live screen — ends the activity", () => {
    const rec = recordingFactory();
    const handle = createWorkoutLiveActivityHandle();
    const { setI, clearI } = mockInterval();
    const { unmount } = render(
      <LiveWorkoutClient
        workout={WORKOUT}
        restTimerSetInterval={setI}
        restTimerClearInterval={clearI}
        workoutLiveActivityHandle={handle}
        workoutLiveActivityFactory={rec.factory}
      />,
    );
    expect(rec.started).toHaveLength(1);
    expect(rec.ended).toEqual([]);

    // The route renders either `LiveWorkoutClient` or the finish summary,
    // never both — and discarding navigates away — so in the app this
    // unmount IS "finished or discarded".
    act(() => unmount());
    expect(rec.ended).toEqual([undefined]);
  });

  it("never starts when there is nothing to show yet (the route's loading placeholder)", () => {
    const rec = recordingFactory();
    const handle = createWorkoutLiveActivityHandle();
    render(
      <LiveWorkoutClient
        workout={{ programId: "p", workoutTitle: "Loading…", exercises: [] }}
        workoutLiveActivityHandle={handle}
        workoutLiveActivityFactory={rec.factory}
      />,
    );
    expect(rec.started).toEqual([]);
  });
});

describe("NP-188 interactive controls", () => {
  const WEIGHTED_WORKOUT: LiveWorkoutViewModel = {
    programId: "p",
    workoutTitle: "Upper Body",
    exercises: [
      {
        slug: "bench",
        name: "Bench Press",
        sets: 2,
        restSec: 90,
        trackingType: "reps_weight",
        prefill: [
          { reps: 5, weight: 135, completed: false },
          { reps: 5, weight: 135, completed: false },
        ],
      },
    ],
  };

  /** The listener the client subscribed with `addUserInteractionListener`. */
  function lockScreenListener() {
    const calls = jest.mocked(addUserInteractionListener).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const listener = calls[calls.length - 1]?.[0] as unknown as (event: {
      source?: string;
      target?: string;
    }) => void;
    expect(typeof listener).toBe("function");
    return listener;
  }

  it("weight-up steps the current set from its prefill and the activity redraws the number, then log-set runs the on-screen Complete path", () => {
    const rec = recordingFactory();
    const handle = createWorkoutLiveActivityHandle();
    let nowMs = 1_000_000;
    const { setI, clearI } = mockInterval();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={WEIGHTED_WORKOUT}
        restTimerSetInterval={setI}
        restTimerClearInterval={clearI}
        restTimerNow={() => nowMs}
        workoutLiveActivityHandle={handle}
        workoutLiveActivityFactory={rec.factory}
      />,
    );
    const press = lockScreenListener();

    // The activity starts on the last-done load — the set's prefill.
    expect(rec.started).toHaveLength(1);
    expect(rec.started[0]?.weightLabel).toBe("135 lbs");

    // − / + type into the same input the on-screen steppers would: empty
    // starts from the prefill, then steps by 5 (lb).
    act(() => {
      press({ source: WORKOUT_LIVE_ACTIVITY_NAME, target: "weight-up" });
    });
    const stepped = rec.updated[rec.updated.length - 1];
    expect(stepped?.weightLabel).toBe("140 lbs");

    // Log set IS the on-screen Complete button: the same 90 s rest starts and
    // the activity moves to the rest phase at the in-app instant.
    act(() => {
      press({ source: WORKOUT_LIVE_ACTIVITY_NAME, target: "log-set" });
    });
    const restDisplay = getByTestId("live-workout-rest-time").props.children;
    expect(restDisplay).toBe("1:30");
    const restUpdate = rec.updated[rec.updated.length - 1];
    expect(restUpdate?.phase).toBe("rest");
    expect(restUpdate?.restEndsAtMs).toBe(nowMs + 90_000);
    expect(restUpdate?.exerciseName).toBe("Bench Press");
  });

  it("a timed set starts the activity with no weightLabel and no controls to press", () => {
    const rec = recordingFactory();
    const handle = createWorkoutLiveActivityHandle();
    const { setI, clearI } = mockInterval();
    render(
      <LiveWorkoutClient
        workout={{
          programId: "p",
          workoutTitle: "Cardio",
          exercises: [{ slug: "run", name: "Run", sets: 1, trackingType: "time" }],
        }}
        restTimerSetInterval={setI}
        restTimerClearInterval={clearI}
        workoutLiveActivityHandle={handle}
        workoutLiveActivityFactory={rec.factory}
      />,
    );
    expect(rec.started).toHaveLength(1);
    expect(rec.started[0]).not.toHaveProperty("weightLabel");
  });
});
