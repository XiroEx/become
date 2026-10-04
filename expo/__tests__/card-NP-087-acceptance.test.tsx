/* eslint-disable import/first */
// NP-087 — TRACK VIEW: EVERY SET ON ONE SCREEN, SHARING PROGRESS WITH LIVE.
//
// The native grid was Track in everything but name: it had every set of the
// workout on one page, and nothing in the app opened it. This card makes it the
// screen a workout OPENS on, puts the web's Track | Live toggle above it, gives
// both views one grid / one rest timer / one set of session notes / one
// remembered position / one save, and replaces the always-visible "Finish
// workout" with the web's rule — Complete Workout exists at 100% and nowhere
// else.
//
// The three acceptance ids, each asserted on its own below.

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactTestInstance } from "react-test-renderer";

let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import { createMemoryKeyValueStore } from "@/lib/live/liveWorkoutCache";
import {
  LiveWorkoutClient,
  type LiveGrid,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import {
  readWorkoutPosition,
  writeWorkoutPosition,
} from "@/lib/live/workoutPosition";
import { positionKey, programScope } from "@become/core";
import LiveWorkoutRoute from "../app/(app)/(tabs)/programming/[id]/workout/[idx]/live";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

/** One exercise, four sets — enough to have a "third set" to land on. */
const FOUR_SET_WORKOUT: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Push A",
  exercises: [
    {
      slug: "bench",
      name: "Bench Press",
      sets: 4,
      repsLabel: "5",
      trackingType: "reps_weight",
    },
  ],
};

/** The same two-set day, loaded by the route, for the finish-parity case. */
const PROGRAM = {
  program_id: "prog-1",
  name: "Strength",
  phases: [
    {
      phase: "Phase 1",
      weeks: "1-4",
      focus: "f",
      workouts: [
        {
          day: "Day 1",
          title: "Push A",
          exercises: [
            {
              exerciseSlug: "bench",
              name: "Bench",
              sets: 2,
              reps: "5",
              trackingType: "reps_weight",
            },
          ],
        },
      ],
    },
  ],
};

/** Log one `reps_weight` set the way a thumb does: two fields, two renders. */
function logRepsWeightSet(
  getByTestId: (id: string) => ReactTestInstance,
  prefix: string,
  weight: string,
  reps: string,
) {
  fireEvent.changeText(getByTestId(`${prefix}-weight`), weight);
  fireEvent.changeText(getByTestId(`${prefix}-reps`), reps);
}

describe("(id: e015c89a) Logging two sets in Track and switching to Live opens Live on the third set", () => {
  it("opens Live on the set after the ones already logged", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={FOUR_SET_WORKOUT} />,
    );

    // Track is what a workout opens on — the web lands on it too.
    expect(getByTestId("live-workout-track")).toBeTruthy();
    expect(getByTestId("live-workout-view-track").props.accessibilityState)
      .toEqual(expect.objectContaining({ selected: true }));
    expect(queryByTestId("live-workout-live")).toBeNull();

    // Two sets logged. Neither needed a tap on its checkbox: a `reps_weight`
    // set ticks itself once it holds reps and a weight.
    logRepsWeightSet(getByTestId, "live-workout-bench-set-0", "225", "5");
    logRepsWeightSet(getByTestId, "live-workout-bench-set-1", "225", "5");
    expect(getByTestId("live-workout-progress").props.children).toBe(
      "2 of 4 sets done",
    );

    // Flip to Live.
    fireEvent.press(getByTestId("live-workout-view-live"));

    expect(getByTestId("live-workout-live")).toBeTruthy();
    expect(queryByTestId("live-workout-track")).toBeNull();
    // THE THIRD SET — not back at set 1 (which is what rebuilding the flow from
    // scratch used to do) and not sitting on the set just finished.
    expect(getByTestId("live-workout-live-step").props.children).toBe(
      "Step 3 of 4",
    );
    expect(getByTestId("live-workout-live-set-label").props.children).toBe(
      "Set 3 of 4",
    );
    // And it is the SAME grid: the third set's inputs are empty, the finished
    // ones kept their numbers when we flip back.
    expect(getByTestId("live-workout-live-bench-set-2-weight").props.value).toBe(
      "",
    );
    fireEvent.press(getByTestId("live-workout-view-track"));
    expect(getByTestId("live-workout-bench-set-0-weight").props.value).toBe(
      "225",
    );
  });

  it("stands on the set you went back to redo, not the one after it", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={FOUR_SET_WORKOUT} />,
    );
    logRepsWeightSet(getByTestId, "live-workout-bench-set-0", "225", "5");
    logRepsWeightSet(getByTestId, "live-workout-bench-set-1", "225", "5");
    // Un-tick set 2 by hand — the member decided to redo it.
    fireEvent.press(getByTestId("live-workout-bench-set-1-complete"));

    fireEvent.press(getByTestId("live-workout-view-live"));
    expect(getByTestId("live-workout-live-set-label").props.children).toBe(
      "Set 2 of 4",
    );
  });

  it("writes the position under the key the web writes it under", async () => {
    const store = createMemoryKeyValueStore();
    const scope = programScope("prog-1", "Day 1");
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={FOUR_SET_WORKOUT}
        positionScope={scope}
        positionStore={store}
      />,
    );
    logRepsWeightSet(getByTestId, "live-workout-bench-set-0", "225", "5");

    await waitFor(async () => {
      expect(await store.get(positionKey(scope))).toBeTruthy();
    });
    // Set 0 ticked itself, so the position is step 1 — where the member is now.
    const saved = await readWorkoutPosition(scope, store);
    expect(saved).toEqual(
      expect.objectContaining({ exerciseIndex: 0, setIndex: 1 }),
    );
  });

  it("a position remembered on this phone is where Live opens, and a stale one is ignored", async () => {
    const store = createMemoryKeyValueStore();
    const scope = programScope("prog-1", "Day 1");
    await writeWorkoutPosition(scope, 0, 3, store);

    const fresh = render(
      <LiveWorkoutClient
        workout={FOUR_SET_WORKOUT}
        positionScope={scope}
        positionStore={store}
      />,
    );
    // Let the mount-time read of the stored position settle — it comes from
    // storage, which is outside React.
    await act(async () => {});
    fireEvent.press(fresh.getByTestId("live-workout-view-live"));
    expect(
      fresh.getByTestId("live-workout-live-set-label").props.children,
    ).toBe("Set 4 of 4");
    fresh.unmount();

    // Thirteen hours old: past POSITION_MAX_AGE_MS, so it is no opinion at all
    // and Live falls back to the first set that still needs doing.
    const stale = createMemoryKeyValueStore();
    await writeWorkoutPosition(
      scope,
      0,
      3,
      stale,
      Date.now() - 13 * 60 * 60 * 1000,
    );
    expect(await readWorkoutPosition(scope, stale)).toBeNull();
    const second = render(
      <LiveWorkoutClient
        workout={FOUR_SET_WORKOUT}
        positionScope={scope}
        positionStore={stale}
      />,
    );
    fireEvent.press(second.getByTestId("live-workout-view-live"));
    expect(
      second.getByTestId("live-workout-live-set-label").props.children,
    ).toBe("Set 1 of 4");
  });
});

describe("(id: e015c89b) Complete Workout appears only once every set is done, and finishing from Track matches finishing from Live", () => {
  it("is absent until the last set is done, and carries the web's label", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={FOUR_SET_WORKOUT} onFinish={jest.fn()} />,
    );
    // Nothing logged.
    expect(queryByTestId("live-workout-finish")).toBeNull();
    // Three of four.
    logRepsWeightSet(getByTestId, "live-workout-bench-set-0", "225", "5");
    logRepsWeightSet(getByTestId, "live-workout-bench-set-1", "225", "5");
    logRepsWeightSet(getByTestId, "live-workout-bench-set-2", "225", "5");
    expect(queryByTestId("live-workout-finish")).toBeNull();
    // The fourth, and there it is.
    logRepsWeightSet(getByTestId, "live-workout-bench-set-3", "225", "5");
    expect(getByTestId("live-workout-finish")).toBeTruthy();
    expect(
      getByTestId("live-workout-finish").props.accessibilityLabel,
    ).toBe("Complete Workout! 🎉");
    // Un-tick one and it goes away again — the button tracks the workout, it is
    // not a one-way door.
    fireEvent.press(getByTestId("live-workout-bench-set-3-complete"));
    expect(queryByTestId("live-workout-finish")).toBeNull();
  });

  it("the same button is there in Live, and both views hand over the same grid", () => {
    const onFinish = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={FOUR_SET_WORKOUT}
        onFinish={onFinish}
        initialView="live"
      />,
    );
    // Live opens on set 1 with nothing logged, and there is no separate
    // finish button — NP-220: completing the last step IS the finish.
    expect(getByTestId("live-workout-live")).toBeTruthy();

    for (let i = 0; i < 4; i++) {
      logRepsWeightSet(
        getByTestId,
        `live-workout-live-bench-set-${i}`,
        "225",
        "5",
      );
      // The last step's button reads Finish Workout and enters the finish
      // flow; every earlier step advances with Complete Set.
      if (i < 3) fireEvent.press(getByTestId("live-workout-live-complete"));
    }
    expect(
      getByTestId("live-workout-live-complete").props.accessibilityLabel,
    ).toBe("Finish Workout");
    fireEvent.press(getByTestId("live-workout-live-complete"));
    expect(onFinish).toHaveBeenCalledTimes(1);
    const fromLive = onFinish.mock.calls[0]![0] as LiveGrid;

    // The same workout logged in Track hands over an identical grid.
    const second = render(
      <LiveWorkoutClient workout={FOUR_SET_WORKOUT} onFinish={onFinish} />,
    );
    for (let i = 0; i < 4; i++) {
      logRepsWeightSet(
        second.getByTestId,
        `live-workout-bench-set-${i}`,
        "225",
        "5",
      );
    }
    fireEvent.press(second.getByTestId("live-workout-finish"));
    const fromTrack = onFinish.mock.calls[1]![0] as LiveGrid;

    expect(fromTrack).toEqual(fromLive);
    expect(fromTrack.bench).toHaveLength(4);
    expect(fromTrack.bench!.every((s) => s.completed)).toBe(true);
  });

  it("the server state and the summary are the same whichever view finished it", async () => {
    mockParams = { id: "prog-1", idx: "0", day: "Day 1" };

    const posts: Record<string, unknown>[] = [];
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
      if (
        path === "/api/workouts" &&
        (init as { method?: string } | undefined)?.method === "POST"
      ) {
        const body = (init as { body?: Record<string, unknown> }).body ?? {};
        if (body.completed) posts.push(body);
        return Promise.resolve({
          message: "Workout saved successfully",
          completed: true,
        });
      }
      return Promise.resolve({});
    });

    /**
     * Log both sets and finish, from whichever view. Returns the completing
     * POST body with the fields that are a FACT ABOUT THE TAP rather than about
     * the workout removed — the attempt id is minted per attempt and the clocks
     * move between the two runs.
     */
    const finishFrom = async (view: "track" | "live") => {
      const store = createMemoryKeyValueStore();
      const screen = render(
        <LiveWorkoutRoute cacheStore={store} positionStore={store} />,
      );
      await waitFor(() => {
        expect(
          screen.getByTestId("live-workout-bench-set-0-weight"),
        ).toBeTruthy();
      });
      for (let i = 0; i < 2; i++) {
        await act(async () => {
          fireEvent.changeText(
            screen.getByTestId(`live-workout-bench-set-${i}-weight`),
            "225",
          );
        });
        await act(async () => {
          fireEvent.changeText(
            screen.getByTestId(`live-workout-bench-set-${i}-reps`),
            "5",
          );
        });
      }
      if (view === "live") {
        await act(async () => {
          fireEvent.press(screen.getByTestId("live-workout-view-live"));
        });
        // NP-220: Live has no separate Finish button — the last step's
        // Complete IS the finish. The first press completes step 1 and
        // advances to step 2; the second press finishes the workout.
        // (The sets were already ticked in Track above, so each press
        // only advances — exactly what was typed is kept either way.)
        await act(async () => {
          fireEvent.press(screen.getByTestId("live-workout-live-complete"));
        });
        // After the first press the client may already show the summary
        // (both sets were ticked in Track, so the flow's last step is the
        // finish) — only press again if Live is still on screen.
        if (screen.queryByTestId("live-workout-live-complete")) {
          await act(async () => {
            fireEvent.press(screen.getByTestId("live-workout-live-complete"));
          });
        }
      } else {
        await act(async () => {
          fireEvent.press(screen.getByTestId("live-workout-finish"));
        });
      }
      // The same summary, from either view.
      await waitFor(() => {
        expect(screen.getByTestId("workout-summary-title")).toBeTruthy();
      });
      const sets = screen.getByTestId("workout-summary-sets").props
        .children as unknown;
      screen.unmount();
      const body = { ...posts[posts.length - 1]! };
      delete body.attemptId;
      delete body.activeSeconds;
      delete body.duration;
      return { body, sets };
    };

    const fromTrack = await finishFrom("track");
    const fromLive = await finishFrom("live");

    expect(posts).toHaveLength(2);
    expect(fromLive.body).toEqual(fromTrack.body);
    expect(fromLive.sets).toEqual(fromTrack.sets);
    // And it really is a completing save of both logged sets.
    expect(fromTrack.body).toEqual(
      expect.objectContaining({ programId: "prog-1", day: "Day 1", completed: true }),
    );
    const exercises = fromTrack.body.exercises as {
      sets: { completed: boolean }[];
    }[];
    expect(exercises[0]!.sets.map((s) => s.completed)).toEqual([true, true]);
  });

  it("session notes typed in Track ride along on the save", async () => {
    mockParams = { id: "prog-1", idx: "0", day: "Day 1" };
    const posts: Record<string, unknown>[] = [];
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
      if (
        path === "/api/workouts" &&
        (init as { method?: string } | undefined)?.method === "POST"
      ) {
        const body = (init as { body?: Record<string, unknown> }).body ?? {};
        if (body.completed) posts.push(body);
        return Promise.resolve({ message: "saved", completed: true });
      }
      return Promise.resolve({});
    });

    const store = createMemoryKeyValueStore();
    const screen = render(
      <LiveWorkoutRoute cacheStore={store} positionStore={store} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("live-workout-bench-set-0-weight")).toBeTruthy();
    });
    // The notes box is not there before anything is done — the web reveals it
    // with the first completed set.
    expect(screen.queryByTestId("live-workout-notes")).toBeNull();

    for (let i = 0; i < 2; i++) {
      await act(async () => {
        fireEvent.changeText(
          screen.getByTestId(`live-workout-bench-set-${i}-weight`),
          "225",
        );
      });
      await act(async () => {
        fireEvent.changeText(
          screen.getByTestId(`live-workout-bench-set-${i}-reps`),
          "5",
        );
      });
    }
    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId("live-workout-notes"),
        "Felt strong, bar speed good.",
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("live-workout-finish"));
    });

    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]!.notes).toBe("Felt strong, bar speed good.");
  });
});

describe("(id: e015c89c) Cardio exercises in Track use the duration and distance fields", () => {
  const CARDIO: LiveWorkoutViewModel = {
    programId: "prog-1",
    workoutTitle: "Conditioning",
    exercises: [
      {
        slug: "treadmill",
        name: "Treadmill Run",
        sets: 1,
        trackingType: "time_distance",
      },
      { slug: "plank", name: "Plank", sets: 1, trackingType: "time" },
      {
        slug: "squat",
        name: "Back Squat",
        sets: 1,
        trackingType: "reps_weight",
      },
    ],
  };

  it("asks a cardio row for duration and distance, and nothing it does not track", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={CARDIO} />,
    );
    expect(getByTestId("live-workout-treadmill-set-0-duration")).toBeTruthy();
    expect(getByTestId("live-workout-treadmill-set-0-distance")).toBeTruthy();
    expect(queryByTestId("live-workout-treadmill-set-0-weight")).toBeNull();
    expect(queryByTestId("live-workout-treadmill-set-0-reps")).toBeNull();
    // Timed-only work asks for a duration and no distance…
    expect(getByTestId("live-workout-plank-set-0-duration")).toBeTruthy();
    expect(queryByTestId("live-workout-plank-set-0-distance")).toBeNull();
    // …and loaded work is untouched.
    expect(getByTestId("live-workout-squat-set-0-weight")).toBeTruthy();
    expect(getByTestId("live-workout-squat-set-0-reps")).toBeTruthy();
  });

  it("logs both numbers into the grid and ticks the set on either of them", () => {
    const onGridChange = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient workout={CARDIO} onGridChange={onGridChange} />,
    );

    // Distance alone is a set that happened — `isSetFilled` accepts any of
    // duration, distance or speed for `time_distance`.
    fireEvent.changeText(
      getByTestId("live-workout-treadmill-set-0-distance"),
      "1500",
    );
    let grid = onGridChange.mock.calls.at(-1)![0] as LiveGrid;
    expect(grid.treadmill![0]!.distance).toBe(1500);
    expect(grid.treadmill![0]!.completed).toBe(true);

    fireEvent.changeText(
      getByTestId("live-workout-treadmill-set-0-duration"),
      "10",
    );
    grid = onGridChange.mock.calls.at(-1)![0] as LiveGrid;
    expect(grid.treadmill![0]!.durationSec).toBe(600);
    expect(grid.treadmill![0]!.completed).toBe(true);

    // Clearing both un-ticks it: the tick follows the numbers.
    fireEvent.changeText(
      getByTestId("live-workout-treadmill-set-0-distance"),
      "",
    );
    fireEvent.changeText(
      getByTestId("live-workout-treadmill-set-0-duration"),
      "",
    );
    grid = onGridChange.mock.calls.at(-1)![0] as LiveGrid;
    expect(grid.treadmill![0]!.completed).toBe(false);

    // A timed set needs its duration, and reps on a loaded set are not enough.
    fireEvent.changeText(getByTestId("live-workout-plank-set-0-duration"), "45");
    grid = onGridChange.mock.calls.at(-1)![0] as LiveGrid;
    expect(grid.plank![0]!.completed).toBe(true);
    fireEvent.changeText(getByTestId("live-workout-squat-set-0-reps"), "5");
    grid = onGridChange.mock.calls.at(-1)![0] as LiveGrid;
    expect(grid.squat![0]!.completed).toBe(false);
    fireEvent.changeText(getByTestId("live-workout-squat-set-0-weight"), "225");
    grid = onGridChange.mock.calls.at(-1)![0] as LiveGrid;
    expect(grid.squat![0]!.completed).toBe(true);
  });

  it("the cardio row in Live is the same row, with the same fields", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={CARDIO} initialView="live" />,
    );
    expect(
      getByTestId("live-workout-live-treadmill-set-0-duration"),
    ).toBeTruthy();
    expect(
      getByTestId("live-workout-live-treadmill-set-0-distance"),
    ).toBeTruthy();
    expect(
      queryByTestId("live-workout-live-treadmill-set-0-weight"),
    ).toBeNull();
  });
});
