import { act, render, fireEvent, waitFor } from "@testing-library/react-native";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

const baseWorkout: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Push A",
  exercises: [
    {
      slug: "bench",
      name: "Barbell Bench Press",
      sets: 3,
      repsLabel: "5-8",
    },
    {
      slug: "db-row",
      name: "Dumbbell Row",
      sets: 3,
      repsLabel: "8-10",
      prefill: [
        { weight: 50, reps: 10, completed: true },
        { weight: 50, reps: 10, completed: true },
        null,
      ],
    },
  ],
};

describe("LiveWorkoutClient", () => {
  it("renders the workout title and a card per exercise", () => {
    const { getByTestId } = render(<LiveWorkoutClient workout={baseWorkout} />);
    expect(getByTestId("live-workout-title").props.children).toBe("Push A");
    expect(getByTestId("live-workout-exercise-bench")).toBeTruthy();
    expect(getByTestId("live-workout-exercise-db-row")).toBeTruthy();
  });

  it("renders 3 set rows per exercise", () => {
    const { getByTestId } = render(<LiveWorkoutClient workout={baseWorkout} />);
    for (let i = 0; i < 3; i++) {
      expect(getByTestId(`live-workout-bench-set-${i}`)).toBeTruthy();
      expect(getByTestId(`live-workout-db-row-set-${i}`)).toBeTruthy();
    }
  });

  it("renders last-performance prefill on db-row sets that have it", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={baseWorkout} />,
    );
    expect(
      getByTestId("live-workout-db-row-set-0-prefill"),
    ).toBeTruthy();
    expect(
      getByTestId("live-workout-db-row-set-1-prefill"),
    ).toBeTruthy();
    expect(
      queryByTestId("live-workout-db-row-set-2-prefill"),
    ).toBeNull();
    // bench has no prefill at all
    expect(queryByTestId("live-workout-bench-set-0-prefill")).toBeNull();
  });

  it("dumbbell label appears on db-row, barbell label on bench", () => {
    const { getByTestId } = render(<LiveWorkoutClient workout={baseWorkout} />);
    expect(
      getByTestId("live-workout-db-row-set-0-weight-label").props.children,
    ).toBe("Weight per DB (lbs)");
    expect(
      getByTestId("live-workout-bench-set-0-weight-label").props.children,
    ).toBe("Weight (lbs)");
  });

  it("marking a set complete fires onSetComplete", async () => {
    const onSetComplete = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={baseWorkout}
        onSetComplete={onSetComplete}
      />,
    );
    fireEvent.press(getByTestId("live-workout-bench-set-0-complete"));
    await waitFor(() => {
      expect(onSetComplete).toHaveBeenCalled();
    });
    const lastCall = onSetComplete.mock.calls[
      onSetComplete.mock.calls.length - 1
    ][0];
    expect(lastCall.exerciseSlug).toBe("bench");
    expect(lastCall.setIndex).toBe(0);
    expect(lastCall.state.completed).toBe(true);
  });

  it("group nav: superset round advances forward and back", () => {
    const supersetWorkout: LiveWorkoutViewModel = {
      ...baseWorkout,
      groupType: "superset",
      groupRounds: 3,
    };
    const { getByTestId } = render(
      <LiveWorkoutClient workout={supersetWorkout} />,
    );
    expect(getByTestId("live-workout-group-nav-round").props.children).toEqual([
      "Round ",
      1,
      " of ",
      3,
    ]);
    fireEvent.press(getByTestId("live-workout-group-nav-next"));
    expect(getByTestId("live-workout-group-nav-round").props.children).toEqual([
      "Round ",
      2,
      " of ",
      3,
    ]);
    fireEvent.press(getByTestId("live-workout-group-nav-next"));
    expect(getByTestId("live-workout-group-nav-round").props.children).toEqual([
      "Round ",
      3,
      " of ",
      3,
    ]);
    fireEvent.press(getByTestId("live-workout-group-nav-prev"));
    expect(getByTestId("live-workout-group-nav-round").props.children).toEqual([
      "Round ",
      2,
      " of ",
      3,
    ]);
  });

  it("group nav is hidden when workout has no groupType", () => {
    const { queryByTestId } = render(
      <LiveWorkoutClient workout={baseWorkout} />,
    );
    expect(queryByTestId("live-workout-group-nav")).toBeNull();
  });
});

function mockInterval() {
  let fn: (() => void) | null = null;
  const setI = ((f: () => void) => {
    fn = f;
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as unknown as typeof setInterval;
  const clearI = (() => {
    fn = null;
  }) as unknown as typeof clearInterval;
  return { setI, clearI, tick: (n: number) => { for (let i = 0; i < n; i++) fn?.(); } };
}

describe("LiveWorkoutClient — swap / notes / groups / rest", () => {
  const grouped: LiveWorkoutViewModel = {
    programId: "p",
    workoutTitle: "Circuit Day",
    exercises: [
      { slug: "a", name: "A", sets: 1, groupId: "g1", groupLabel: "Superset 1", notes: "go slow" },
      { slug: "b", name: "B", sets: 1, groupId: "g1", groupLabel: "Superset 1" },
      { slug: "c", name: "C", sets: 1 },
    ],
  };

  it("renders a group header once per group, in exercise order", () => {
    const { getByTestId, getAllByTestId } = render(
      <LiveWorkoutClient workout={grouped} />,
    );
    // Header appears for the first member of g1 only.
    expect(getByTestId("live-workout-group-g1")).toBeTruthy();
    expect(getAllByTestId("live-workout-group-g1")).toHaveLength(1);
    // Exercises render in order a, b, c.
    expect(getByTestId("live-workout-exercise-a")).toBeTruthy();
    expect(getByTestId("live-workout-exercise-b")).toBeTruthy();
    expect(getByTestId("live-workout-exercise-c")).toBeTruthy();
  });

  it("renders per-exercise notes", () => {
    const { getByTestId } = render(<LiveWorkoutClient workout={grouped} />);
    expect(getByTestId("live-workout-a-notes").props.children).toBe("go slow");
  });

  it("fires onRequestSwap with the slug when Swap is tapped", () => {
    const onRequestSwap = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient workout={grouped} onRequestSwap={onRequestSwap} />,
    );
    fireEvent.press(getByTestId("live-workout-a-swap"));
    expect(onRequestSwap).toHaveBeenCalledWith("a");
  });

  it("starts a rest timer that ticks down when a set is completed", () => {
    const { setI, clearI, tick } = mockInterval();
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={{
          programId: "p",
          workoutTitle: "W",
          exercises: [{ slug: "a", name: "A", sets: 1, restSec: 5 }],
        }}
        restTimerSetInterval={setI}
        restTimerClearInterval={clearI}
      />,
    );
    expect(queryByTestId("live-workout-rest")).toBeNull();
    // Complete set 0.
    fireEvent.press(getByTestId("live-workout-a-set-0-complete"));
    expect(getByTestId("live-workout-rest")).toBeTruthy();
    expect(getByTestId("live-workout-rest-time").props.children).toBe("0:05");
    act(() => tick(2));
    expect(getByTestId("live-workout-rest-time").props.children).toBe("0:03");
  });
});

describe("LiveWorkoutClient — trackingType-aware set logging + cache rehydrate", () => {
  const trackedWorkout: LiveWorkoutViewModel = {
    programId: "p",
    workoutTitle: "Conditioning",
    exercises: [
      { slug: "plank", name: "Plank", sets: 1, trackingType: "time" },
      { slug: "run", name: "Treadmill Run", sets: 1, trackingType: "time_distance" },
      { slug: "pushup", name: "Push-up", sets: 1, trackingType: "reps" },
    ],
  };

  it("renders only the inputs each trackingType needs", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={trackedWorkout} />,
    );
    // time → duration only (no weight, no reps, no distance)
    expect(getByTestId("live-workout-plank-set-0-duration")).toBeTruthy();
    expect(queryByTestId("live-workout-plank-set-0-weight")).toBeNull();
    expect(queryByTestId("live-workout-plank-set-0-reps")).toBeNull();
    expect(queryByTestId("live-workout-plank-set-0-distance")).toBeNull();
    // time_distance → duration + distance
    expect(getByTestId("live-workout-run-set-0-duration")).toBeTruthy();
    expect(getByTestId("live-workout-run-set-0-distance")).toBeTruthy();
    expect(queryByTestId("live-workout-run-set-0-weight")).toBeNull();
    // reps → reps only
    expect(getByTestId("live-workout-pushup-set-0-reps")).toBeTruthy();
    expect(queryByTestId("live-workout-pushup-set-0-weight")).toBeNull();
    expect(queryByTestId("live-workout-pushup-set-0-duration")).toBeNull();
  });

  it("logging a duration set persists durationSec to the grid (onGridChange)", () => {
    const onGridChange = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient workout={trackedWorkout} onGridChange={onGridChange} />,
    );
    fireEvent.changeText(getByTestId("live-workout-plank-set-0-duration"), "45");
    const lastGrid = onGridChange.mock.calls.at(-1)![0];
    expect(lastGrid.plank[0].durationSec).toBe(45);
  });

  it("logging a time_distance set captures both duration and distance", () => {
    const onGridChange = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient workout={trackedWorkout} onGridChange={onGridChange} />,
    );
    fireEvent.changeText(getByTestId("live-workout-run-set-0-duration"), "600");
    fireEvent.changeText(getByTestId("live-workout-run-set-0-distance"), "1500");
    const lastGrid = onGridChange.mock.calls.at(-1)![0];
    expect(lastGrid.run[0].durationSec).toBe(600);
    expect(lastGrid.run[0].distance).toBe(1500);
  });

  it("rehydrates logged duration/distance from a restored grid across remount", () => {
    // Simulate the SecureStore cache returning a prior snapshot on re-entry.
    const restoredGrid = {
      run: [{ reps: null, weight: null, durationSec: 600, distance: 1500, completed: true }],
    };
    const { getByTestId } = render(
      <LiveWorkoutClient workout={trackedWorkout} restoredGrid={restoredGrid} />,
    );
    expect(
      getByTestId("live-workout-run-set-0-duration").props.value,
    ).toBe("600");
    expect(
      getByTestId("live-workout-run-set-0-distance").props.value,
    ).toBe("1500");
  });
});
