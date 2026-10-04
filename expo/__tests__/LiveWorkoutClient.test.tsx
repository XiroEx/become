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
    const dbWorkout: LiveWorkoutViewModel = {
      ...baseWorkout,
      exercises: [
        { ...baseWorkout.exercises[0]!, equipment: ["barbell", "bench"] },
        {
          ...baseWorkout.exercises[1]!,
          equipment: ["dumbbell", "bench"],
        },
      ],
    };
    const { getByTestId } = render(<LiveWorkoutClient workout={dbWorkout} />);
    expect(
      getByTestId("live-workout-db-row-set-0-weight-label").props.children,
    ).toBe("Weight per DB (lbs)");
    expect(
      getByTestId("live-workout-bench-set-0-weight-label").props.children,
    ).toBe("Weight (lbs)");
  });

  it("equipment-aware weight logging: per-DB labels, totals, quick picks, assumption chip", () => {
    const workout: LiveWorkoutViewModel = {
      programId: "prog-1",
      workoutTitle: "Arms",
      exercises: [
        {
          slug: "single-arm-row",
          name: "Single-Arm Dumbbell Row",
          sets: 1,
          equipment: ["dumbbell", "bench"],
          laterality: "unilateral",
        },
        {
          slug: "db-bench",
          name: "Dumbbell Bench Press",
          sets: 1,
          equipment: ["dumbbell", "bench"],
        },
        {
          slug: "bb-bench",
          name: "Barbell Bench Press",
          sets: 1,
          equipment: ["barbell", "bench"],
        },
        {
          slug: "rear-delt-fly",
          name: "Rear Delt Fly",
          sets: 1,
          equipment: ["dumbbell"],
        },
      ],
    };
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={workout} />,
    );
    // Single-Arm Dumbbell Row: per-DB label, no doubled total.
    expect(
      getByTestId("live-workout-single-arm-row-set-0-weight-label").props
        .children,
    ).toBe("Weight per DB (lbs)");
    expect(queryByTestId("live-workout-single-arm-row-set-0-helper")).toBeNull();
    // Dumbbell Bench Press: per-DB label with the doubled total once a
    // weight is typed (the total is a hint; the saved number stays per-DB).
    expect(
      getByTestId("live-workout-db-bench-set-0-weight-label").props.children,
    ).toBe("Weight per DB (lbs)");
    expect(
      getByTestId("live-workout-db-bench-set-0-quick-picks"),
    ).toBeTruthy();
    expect(
      getByTestId("live-workout-db-bench-set-0-quick-pick-30"),
    ).toBeTruthy();
    // Barbell Bench Press: plain label and the barbell quick picks.
    expect(
      getByTestId("live-workout-bb-bench-set-0-weight-label").props.children,
    ).toBe("Weight (lbs)");
    expect(
      getByTestId("live-workout-bb-bench-set-0-quick-pick-135"),
    ).toBeTruthy();
    // Rear Delt Fly: the name never says dumbbell, so the assumption chip shows.
    expect(
      getByTestId("live-workout-rear-delt-fly-set-0-assumption").props.children,
    ).toBe("Logging as Dumbbell");
    // …while the self-disclosing names get no chip.
    expect(
      queryByTestId("live-workout-db-bench-set-0-assumption"),
    ).toBeNull();
    expect(
      queryByTestId("live-workout-bb-bench-set-0-assumption"),
    ).toBeNull();
  });

  it("quick picks fill the per-implement weight without changing the convention", () => {
    const onGridChange = jest.fn();
    const workout: LiveWorkoutViewModel = {
      programId: "prog-1",
      workoutTitle: "Press",
      exercises: [
        {
          slug: "db-bench",
          name: "Dumbbell Bench Press",
          sets: 1,
          equipment: ["dumbbell", "bench"],
        },
      ],
    };
    const { getByTestId } = render(
      <LiveWorkoutClient workout={workout} onGridChange={onGridChange} />,
    );
    fireEvent.press(getByTestId("live-workout-db-bench-set-0-quick-pick-30"));
    expect(onGridChange).toHaveBeenCalled();
    const lastGrid =
      onGridChange.mock.calls[onGridChange.mock.calls.length - 1]![0];
    // The saved number is the per-DB pick itself — never the doubled total.
    expect(lastGrid["db-bench"]![0]!.weight).toBe(30);
    expect(
      getByTestId("live-workout-db-bench-set-0-helper").props.children,
    ).toBe("= 60 lbs total");
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

  it("with activeSeconds the header shows elapsed time and 0% overall progress", () => {
    const { getByTestId, getByText } = render(
      <LiveWorkoutClient workout={baseWorkout} activeSeconds={125} />,
    );
    expect(getByTestId("live-workout-elapsed").props.children).toBe("2:05");
    expect(getByTestId("live-workout-overall-progress")).toBeTruthy();
    expect(getByText("0%")).toBeTruthy();
  });

  it("without activeSeconds no elapsed text renders", () => {
    const { queryByTestId } = render(
      <LiveWorkoutClient workout={baseWorkout} />,
    );
    expect(queryByTestId("live-workout-elapsed")).toBeNull();
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
    // The timer derives what is left from the clock (NP-082): drive the
    // clock forward so the display ticks read the new time.
    let nowMs = 1_000_000;
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
        restTimerNow={() => nowMs}
      />,
    );
    expect(queryByTestId("live-workout-rest")).toBeNull();
    // Complete set 0.
    fireEvent.press(getByTestId("live-workout-a-set-0-complete"));
    expect(getByTestId("live-workout-rest")).toBeTruthy();
    expect(getByTestId("live-workout-rest-time").props.children).toBe("0:05");
    act(() => {
      nowMs += 2_000;
      tick(2);
    });
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
      {
        slug: "pushup",
        name: "Push-up",
        sets: 1,
        // The canonical type for a bodyweight movement. It used to read
        // "reps", which is one of the aliases the web's rebuild paths emit —
        // and the web resolves that to `reps_weight` on purpose, because a
        // set that cannot be logged is worse than a spare weight box. See the
        // "a resumed session" case below.
        trackingType: "reps_bodyweight",
      },
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

  it("a resumed session typed 'reps' still offers a weight (web parity)", () => {
    // NP-058: the inputs come from the web's `normalizeTracking`, and the
    // vocabulary the rebuild paths invented ('reps', 'weight', 'duration') maps
    // into it rather than falling through every branch. The old native rule
    // read "reps" as reps-only and a resumed loaded set became unloggable.
    const resumed: LiveWorkoutViewModel = {
      programId: "p",
      workoutTitle: "Resumed",
      exercises: [
        { slug: "calf", name: "Calf Raise", sets: 1, trackingType: "reps" },
      ],
    };
    const { getByTestId } = render(<LiveWorkoutClient workout={resumed} />);
    expect(getByTestId("live-workout-calf-set-0-weight")).toBeTruthy();
    expect(getByTestId("live-workout-calf-set-0-reps")).toBeTruthy();
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
    // A `time_distance` row opens in minutes (the web's `defaultDurationUnit`
    // rule), so typing 10 stores 600 s — the stored value is always seconds.
    fireEvent.changeText(getByTestId("live-workout-run-set-0-duration"), "10");
    fireEvent.changeText(getByTestId("live-workout-run-set-0-distance"), "1500");
    const lastGrid = onGridChange.mock.calls.at(-1)![0];
    expect(lastGrid.run[0].durationSec).toBe(600);
    expect(lastGrid.run[0].distance).toBe(1500);
  });

  // The component keeps a ref mirror of the grid so that two edits landing in
  // one render cycle compose instead of clobbering each other. The mirror is
  // written by the edit handler and re-synced in an effect — never during
  // render, which is what react-hooks/refs reports. These two are the
  // behaviour that would break if the mirror ever went stale.
  it("composes consecutive edits across exercises instead of clobbering them", () => {
    const onGridChange = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient workout={trackedWorkout} onGridChange={onGridChange} />,
    );
    fireEvent.changeText(getByTestId("live-workout-plank-set-0-duration"), "45");
    fireEvent.changeText(getByTestId("live-workout-run-set-0-duration"), "10");
    fireEvent.changeText(getByTestId("live-workout-pushup-set-0-reps"), "12");
    const lastGrid = onGridChange.mock.calls.at(-1)![0];
    expect(lastGrid.plank[0].durationSec).toBe(45);
    expect(lastGrid.run[0].durationSec).toBe(600);
    expect(lastGrid.pushup[0].reps).toBe(12);
  });

  it("finishes with the latest grid, including the edit just made", () => {
    const onFinish = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient workout={trackedWorkout} onFinish={onFinish} />,
    );
    fireEvent.changeText(getByTestId("live-workout-plank-set-0-duration"), "30");
    fireEvent.changeText(getByTestId("live-workout-pushup-set-0-reps"), "8");
    // Complete Workout only exists once every set is done (NP-087) — each of
    // these three sets ticks itself the moment its tracking type is satisfied,
    // so the cardio row has to be logged too before the button is there.
    // The run row opens in minutes, so 10 min stores 600 s.
    fireEvent.changeText(getByTestId("live-workout-run-set-0-duration"), "10");
    fireEvent.press(getByTestId("live-workout-finish"));
    expect(onFinish).toHaveBeenCalledTimes(1);
    const finished = onFinish.mock.calls[0]![0];
    expect(finished.plank[0].durationSec).toBe(30);
    expect(finished.pushup[0].reps).toBe(8);
  });

  it("rehydrates logged duration/distance from a restored grid across remount", () => {
    // Simulate the SecureStore cache returning a prior snapshot on re-entry.
    // The run row opens in minutes, so 600 s reads back as "10".
    const restoredGrid = {
      run: [{ reps: null, weight: null, durationSec: 600, distance: 1500, completed: true }],
    };
    const { getByTestId } = render(
      <LiveWorkoutClient workout={trackedWorkout} restoredGrid={restoredGrid} />,
    );
    expect(
      getByTestId("live-workout-run-set-0-duration").props.value,
    ).toBe("10");
    expect(
      getByTestId("live-workout-run-set-0-distance").props.value,
    ).toBe("1500");
  });
});
