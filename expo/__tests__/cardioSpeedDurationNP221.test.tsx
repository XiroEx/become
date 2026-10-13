import { render, fireEvent, renderHook, waitFor } from "@testing-library/react-native";
import { apiFetch } from "@become/api-client";
import { LiveSetRow, setInputsFor } from "@/components/live/LiveSetRow";
import {
  buildWorkoutSaveRequest,
  newWorkoutAttemptId,
} from "@/lib/live/workoutSave";
import { useLiveWorkout } from "@/lib/live/useLiveWorkout";
import { createMemoryKeyValueStore } from "@/lib/live/liveWorkoutCache";
import type {
  LiveGrid,
  LiveWorkoutExercise,
} from "@/components/live/LiveWorkoutClient";

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
const mockApiFetch = apiFetch as unknown as jest.Mock;

beforeEach(() => {
  mockApiFetch.mockReset();
});

// NP-221 (Live view 2/4): cardio inputs — speed and the sec/min duration
// toggle — saved and resumed like the web. The web source of truth is
// webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx
// (`showSpeedInput`, the `durationUnit` toggle, `speed` in the save body and
// in the resume restore).

describe("cardio inputs: which rows ask for what (id: e5cece51)", () => {
  it("reps_bodyweight shows reps only", () => {
    expect(setInputsFor("reps_bodyweight")).toEqual({
      weight: false,
      reps: true,
      duration: false,
      distance: false,
      speed: false,
    });
    const { queryByTestId } = render(
      <LiveSetRow
        setIndex={0}
        state={{ reps: null, weight: null, completed: false }}
        trackingType="reps_bodyweight"
        onChange={() => {}}
      />,
    );
    expect(queryByTestId("live-set-0-reps")).toBeTruthy();
    expect(queryByTestId("live-set-0-weight")).toBeNull();
    expect(queryByTestId("live-set-0-duration")).toBeNull();
    expect(queryByTestId("live-set-0-distance")).toBeNull();
    expect(queryByTestId("live-set-0-speed")).toBeNull();
  });

  it("time_distance shows duration, distance and speed", () => {
    expect(setInputsFor("time_distance")).toEqual({
      weight: false,
      reps: false,
      duration: true,
      distance: true,
      speed: true,
    });
    const { getByTestId, queryByTestId } = render(
      <LiveSetRow
        setIndex={0}
        exerciseName="Treadmill Run"
        state={{ reps: null, weight: null, completed: false }}
        trackingType="time_distance"
        onChange={() => {}}
      />,
    );
    expect(getByTestId("live-set-0-duration")).toBeTruthy();
    expect(getByTestId("live-set-0-distance")).toBeTruthy();
    expect(getByTestId("live-set-0-speed")).toBeTruthy();
    expect(queryByTestId("live-set-0-weight")).toBeNull();
    expect(queryByTestId("live-set-0-reps")).toBeNull();
  });

  it("intervals shows duration and speed (no distance)", () => {
    expect(setInputsFor("intervals")).toEqual({
      weight: false,
      reps: false,
      duration: true,
      distance: false,
      speed: true,
    });
    const { getByTestId, queryByTestId } = render(
      <LiveSetRow
        setIndex={0}
        state={{ reps: null, weight: null, completed: false }}
        trackingType="intervals"
        onChange={() => {}}
      />,
    );
    expect(getByTestId("live-set-0-duration")).toBeTruthy();
    expect(getByTestId("live-set-0-speed")).toBeTruthy();
    expect(queryByTestId("live-set-0-distance")).toBeNull();
    expect(queryByTestId("live-set-0-weight")).toBeNull();
    expect(queryByTestId("live-set-0-reps")).toBeNull();
  });

  it("none shows no inputs", () => {
    expect(setInputsFor("none")).toEqual({
      weight: false,
      reps: false,
      duration: false,
      distance: false,
      speed: false,
    });
    const { queryByTestId } = render(
      <LiveSetRow
        setIndex={0}
        state={{ reps: null, weight: null, completed: false }}
        trackingType="none"
        onChange={() => {}}
      />,
    );
    expect(queryByTestId("live-set-0-weight")).toBeNull();
    expect(queryByTestId("live-set-0-reps")).toBeNull();
    expect(queryByTestId("live-set-0-duration")).toBeNull();
    expect(queryByTestId("live-set-0-distance")).toBeNull();
    expect(queryByTestId("live-set-0-speed")).toBeNull();
  });

  it("reps (the legacy alias) shows weight and reps", () => {
    expect(setInputsFor("reps")).toEqual(setInputsFor("reps_weight"));
    const { getByTestId } = render(
      <LiveSetRow
        setIndex={0}
        state={{ reps: null, weight: null, completed: false }}
        trackingType="reps"
        onChange={() => {}}
      />,
    );
    expect(getByTestId("live-set-0-weight")).toBeTruthy();
    expect(getByTestId("live-set-0-reps")).toBeTruthy();
  });

  it("labels distance Floors for stair machines", () => {
    const { getByTestId } = render(
      <LiveSetRow
        setIndex={0}
        exerciseName="Stairmaster Intervals"
        state={{ reps: null, weight: null, completed: false }}
        trackingType="time_distance"
        onChange={() => {}}
      />,
    );
    expect(getByTestId("live-set-0-distance-label").props.children).toBe(
      "Floors",
    );
  });

  it("typing a speed lands it on the set", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <LiveSetRow
        setIndex={0}
        state={{ reps: null, weight: null, completed: false }}
        trackingType="time_distance"
        onChange={onChange}
      />,
    );
    fireEvent.changeText(getByTestId("live-set-0-speed"), "6.5");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ speed: 6.5 }),
    );
  });
});

describe("the sec/min toggle stores seconds (id: e5cece52)", () => {
  it("time_distance opens in minutes; typing 2 saves 120 s", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <LiveSetRow
        setIndex={0}
        state={{ reps: null, weight: null, completed: false }}
        trackingType="time_distance"
        onChange={onChange}
      />,
    );
    // Cardio machines are prescribed in minutes, so the row opens there.
    expect(getByTestId("live-set-0-duration-label").props.children).toBe(
      "Time (min)",
    );
    fireEvent.changeText(getByTestId("live-set-0-duration"), "2");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ durationSec: 120 }),
    );
  });

  it("time opens in seconds; the toggle flips the display, not the store", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <LiveSetRow
        setIndex={0}
        state={{
          reps: null,
          weight: null,
          durationSec: 120,
          completed: false,
        }}
        trackingType="time"
        onChange={onChange}
      />,
    );
    expect(getByTestId("live-set-0-duration-label").props.children).toBe(
      "Time (sec)",
    );
    expect(getByTestId("live-set-0-duration").props.value).toBe("120");
    fireEvent.press(getByTestId("live-set-0-duration-toggle"));
    expect(getByTestId("live-set-0-duration-label").props.children).toBe(
      "Time (min)",
    );
    // 120 s reads as 2 min; typing 3 min stores 180 s.
    expect(getByTestId("live-set-0-duration").props.value).toBe("2");
    fireEvent.changeText(getByTestId("live-set-0-duration"), "3");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ durationSec: 180 }),
    );
  });
});

describe("speed is in the save body and survives resume (id: e5cece53)", () => {
  const exercises: LiveWorkoutExercise[] = [
    { slug: "run", name: "Treadmill Run", sets: 1, trackingType: "time_distance" },
  ];

  it("a speed of 6.5 appears on that set in the save body", () => {
    const grid: LiveGrid = {
      run: [
        {
          reps: null,
          weight: null,
          durationSec: 600,
          distance: 1500,
          speed: 6.5,
          completed: true,
        },
      ],
    };
    const req = buildWorkoutSaveRequest({
      programId: "p",
      phase: 1,
      day: "Day 1",
      exercises,
      grid,
      completed: true,
      activeSeconds: 700,
      attemptId: newWorkoutAttemptId(),
    });
    expect(req.exercises[0]!.sets[0]).toEqual({
      setNumber: 1,
      reps: 0,
      weight: 0,
      completed: true,
      duration: 600,
      distance: 1500,
      speed: 6.5,
    });
  });

  it("a zero speed is omitted, like a zero duration or distance", () => {
    const grid: LiveGrid = {
      run: [
        {
          reps: null,
          weight: null,
          durationSec: 600,
          distance: 1500,
          speed: 0,
          completed: true,
        },
      ],
    };
    const req = buildWorkoutSaveRequest({
      programId: "p",
      phase: 1,
      day: "Day 1",
      exercises,
      grid,
      completed: false,
    });
    expect(req.exercises[0]!.sets[0]).not.toHaveProperty("speed");
  });

  it("a resumed workout with a saved speed shows it again", async () => {
    const store = createMemoryKeyValueStore();
    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      const url = String(path);
      if (url.startsWith("/api/programs/current-workout")) {
        return Promise.resolve({
          workout: {
            title: "Cardio Day",
            day: "Day 1",
            exercises: [
              {
                exerciseSlug: "run",
                name: "Treadmill Run",
                sets: 1,
                trackingType: "time_distance",
              },
            ],
          },
          phase: 1,
          day: "Day 1",
        });
      }
      if (url.startsWith("/api/workouts/last-performance")) {
        return Promise.resolve({ performances: {}, prs: {} });
      }
      if (url.startsWith("/api/workouts?")) {
        return Promise.resolve({
          isResume: true,
          workout: {
            programId: "prog-1",
            day: "Day 1",
            phase: 1,
            activeSeconds: 600,
            exercises: [
              {
                name: "Treadmill Run",
                exerciseSlug: "run",
                sets: [
                  {
                    setNumber: 1,
                    reps: 0,
                    weight: 0,
                    duration: 600,
                    distance: 1500,
                    speed: 6.5,
                    completed: true,
                  },
                ],
              },
            ],
          },
          exerciseHistory: {},
          exercisePRs: {},
        });
      }
      if (url === "/api/workouts" && (init as { method?: string })?.method === "POST") {
        return Promise.resolve({ message: "ok", completed: false });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(() =>
      useLiveWorkout("prog-1", "Day 1", "2026-10-01", { cacheStore: store }),
    );
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.isResuming).toBe(true);
    const sets = result.current.restoredGrid?.["run"];
    expect(sets?.[0]).toEqual(
      expect.objectContaining({
        durationSec: 600,
        distance: 1500,
        speed: 6.5,
        completed: true,
      }),
    );
  });
});
