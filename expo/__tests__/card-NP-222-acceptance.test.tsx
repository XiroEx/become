// NP-222 (Live view 3/4) — Last, PR and the NEW PR flag on the current set.
//
// Port of the web block at
// `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`
// lines ~2404-2435 and ~2496: `Last:` keyed by exercise NAME, `PR: N lbs`
// when the stored PR weight is > 0, and `NEW PR!` beside the weight label
// when the typed weight is strictly greater than the PR (reps_weight only).
// Blank inputs stay blank: these lines are references, never prefill.
//
// The two acceptance ids, each asserted on its own below.

import { fireEvent, render } from "@testing-library/react-native";
import type { ReactTestInstance } from "react-test-renderer";
import {
  LiveSetReference,
  formatLastLine,
  formatPRLine,
  isNewPR,
} from "@/components/live/LiveSetReference";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

function textOf(instance: ReactTestInstance): string {
  const children = instance.props.children;
  return Array.isArray(children) ? children.join("") : String(children ?? "");
}

/** One loaded exercise, one set — the Live step under test. */
function loadedWorkout(): LiveWorkoutViewModel {
  return {
    programId: "prog-1",
    workoutTitle: "Push A",
    exercises: [
      {
        slug: "bench",
        name: "Bench Press",
        sets: 1,
        trackingType: "reps_weight",
      },
    ],
  };
}

describe("(id: e5cece57) typing a weight above the stored PR shows NEW PR; equal does not", () => {
  it("flags a strictly greater typed weight, not an equal one", () => {
    expect(
      isNewPR("reps_weight", 140, { weight: 135, reps: 5 }),
    ).toBe(true);
    expect(
      isNewPR("reps_weight", 135, { weight: 135, reps: 5 }),
    ).toBe(false);
    expect(isNewPR("reps_weight", 100, { weight: 135, reps: 5 })).toBe(
      false,
    );
  });

  it("needs a positive stored PR and a reps_weight exercise", () => {
    expect(isNewPR("reps_weight", 200, null)).toBe(false);
    expect(isNewPR("reps_weight", 200, { weight: 0, reps: 0 })).toBe(false);
    expect(isNewPR("reps_bodyweight", 200, { weight: 135, reps: 5 })).toBe(
      false,
    );
    expect(isNewPR("reps_weight", null, { weight: 135, reps: 5 })).toBe(
      false,
    );
  });

  it("renders NEW PR on the Live step only once the typed weight beats the PR", () => {
    const workout = loadedWorkout();
    const history = {
      "Bench Press": { weight: 135, reps: 5, date: "2026-09-01T00:00:00Z" },
    };
    const prs = { "Bench Press": { weight: 135, reps: 5 } };
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={workout}
        initialView="live"
        exerciseHistory={history}
        exercisePRs={prs}
      />,
    );
    expect(queryByTestId("live-workout-live-bench-reference-new-pr")).toBeNull();
    fireEvent.changeText(
      getByTestId("live-workout-live-bench-set-0-weight"),
      "140",
    );
    expect(
      getByTestId("live-workout-live-bench-reference-new-pr"),
    ).toBeTruthy();
  });

  it("an equal typed weight does not flag NEW PR on the Live step", () => {
    const workout = loadedWorkout();
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={workout}
        initialView="live"
        exerciseHistory={{
          "Bench Press": { weight: 135, reps: 5, date: "2026-09-01T00:00:00Z" },
        }}
        exercisePRs={{ "Bench Press": { weight: 135, reps: 5 } }}
      />,
    );
    fireEvent.changeText(
      getByTestId("live-workout-live-bench-set-0-weight"),
      "135",
    );
    expect(queryByTestId("live-workout-live-bench-reference-new-pr")).toBeNull();
  });
});

describe("(id: e5cece58) Last and PR lines match the web's formats per tracking type", () => {
  it("loaded sets read `X lbs × Y reps`, bodyweight `Y reps`, else `completed`", () => {
    expect(
      formatLastLine(
        "reps_weight",
        { weight: 135, reps: 5, date: "2026-09-01T00:00:00Z" },
        "sec",
      ),
    ).toBe("135 lbs × 5 reps");
    expect(
      formatLastLine(
        "reps_bodyweight",
        { weight: 0, reps: 12, date: "2026-09-01T00:00:00Z" },
        "sec",
      ),
    ).toBe("12 reps");
    expect(
      formatLastLine(
        "reps_only",
        { weight: 0, reps: 0, date: "2026-09-01T00:00:00Z" },
        "sec",
      ),
    ).toBe("completed");
  });

  it("timed work reads seconds, or minutes in min mode", () => {
    expect(
      formatLastLine(
        "time",
        { weight: 0, reps: 90, duration: 90, date: "2026-09-01T00:00:00Z" },
        "sec",
      ),
    ).toBe("90s");
    expect(
      formatLastLine(
        "time",
        { weight: 0, reps: 90, duration: 90, date: "2026-09-01T00:00:00Z" },
        "min",
      ),
    ).toBe("1.5m");
    expect(
      formatLastLine(
        "intervals",
        { weight: 0, reps: 0, date: "2026-09-01T00:00:00Z" },
        "sec",
      ),
    ).toBe("completed");
  });

  it("no PR record means no PR line; a zero PR weight means no PR line", () => {
    expect(formatPRLine(null)).toBeNull();
    expect(formatPRLine(undefined)).toBeNull();
    expect(formatPRLine({ weight: 0, reps: 0 })).toBeNull();
    expect(formatPRLine({ weight: 135, reps: 5 })).toBe("PR: 135 lbs");
  });

  it("a bodyweight history shows `Last: 12 reps` on the Live step", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={{
          programId: "prog-1",
          workoutTitle: "Pull-ups",
          exercises: [
            {
              slug: "pullup",
              name: "Pull-up",
              sets: 1,
              trackingType: "reps_bodyweight",
            },
          ],
        }}
        initialView="live"
        exerciseHistory={{
          "Pull-up": { weight: 0, reps: 12, date: "2026-09-01T00:00:00Z" },
        }}
      />,
    );
    expect(
      textOf(getByTestId("live-workout-live-pullup-reference-last")),
    ).toBe("Last: 12 reps");
  });

  it("a time exercise shows seconds on the Live step", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={{
          programId: "prog-1",
          workoutTitle: "Plank",
          exercises: [
            {
              slug: "plank",
              name: "Plank",
              sets: 1,
              trackingType: "time",
            },
          ],
        }}
        initialView="live"
        exerciseHistory={{
          Plank: {
            weight: 0,
            reps: 60,
            duration: 60,
            date: "2026-09-01T00:00:00Z",
          },
        }}
      />,
    );
    expect(textOf(getByTestId("live-workout-live-plank-reference-last"))).toBe(
      "Last: 60s",
    );
  });

  it("Track shows no reference lines — the mount point is Live only", () => {
    const { queryByTestId } = render(
      <LiveWorkoutClient
        workout={loadedWorkout()}
        initialView="track"
        exerciseHistory={{
          "Bench Press": {
            weight: 135,
            reps: 5,
            date: "2026-09-01T00:00:00Z",
          },
        }}
        exercisePRs={{ "Bench Press": { weight: 135, reps: 5 } }}
      />,
    );
    expect(
      queryByTestId("live-workout-live-bench-reference-last"),
    ).toBeNull();
    expect(queryByTestId("live-workout-live-bench-reference-pr")).toBeNull();
  });

  it("the reference renders nothing without history or PR", () => {
    const { toJSON } = render(
      <LiveSetReference exerciseName="Bench Press" trackingType="reps_weight" />,
    );
    expect(toJSON()).toBeNull();
  });
});
