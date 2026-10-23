import { fireEvent, render, within } from "@testing-library/react-native";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

// The Track table for multi-metric (timed/cardio) tracking types: the header
// row carries that exercise's own column names from its tracking type, the
// rows show only the inputs, and the sec/min toggle lives in the header
// without overlapping anything. Stored durations are always seconds.
const TREADMILL: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Cardio",
  exercises: [
    {
      slug: "treadmill",
      name: "Incline Treadmill Walk",
      sets: 1,
      trackingType: "time_distance",
      durationLabel: "20min",
    },
  ],
};

describe("Track table for time_distance work", () => {
  it("header names the exercise's own columns — Round / Min / Dist (m) / mph / Done, never Reps", () => {
    const { getByTestId, queryByText } = render(
      <LiveWorkoutClient workout={TREADMILL} />,
    );
    const header = getByTestId("live-workout-treadmill-set-table-header");
    for (const label of ["Round", "Min", "Dist (m)", "mph", "Done"]) {
      expect(within(header).getByText(label)).toBeTruthy();
    }
    expect(queryByText("Reps")).toBeNull();
  });

  it("rows show only the inputs — no stacked Time/Dist/Speed labels, no weight or reps boxes", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={TREADMILL} />,
    );
    expect(getByTestId("live-workout-treadmill-set-0-duration")).toBeTruthy();
    expect(getByTestId("live-workout-treadmill-set-0-distance")).toBeTruthy();
    expect(getByTestId("live-workout-treadmill-set-0-speed")).toBeTruthy();
    expect(
      queryByTestId("live-workout-treadmill-set-0-weight"),
    ).toBeNull();
    expect(queryByTestId("live-workout-treadmill-set-0-reps")).toBeNull();
    // No per-input labels anywhere in the row (the header owns them).
    expect(
      queryByTestId("live-workout-treadmill-set-0-duration-label"),
    ).toBeNull();
    expect(
      queryByTestId("live-workout-treadmill-set-0-distance-label"),
    ).toBeNull();
  });

  it("900 stored seconds read as 15 under the Min header, and the header toggle flips to Sec", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={TREADMILL}
        restoredGrid={{
          treadmill: [
            {
              reps: null,
              weight: null,
              durationSec: 900,
              distance: 1500,
              speed: null,
              completed: false,
            },
          ],
        }}
      />,
    );
    // 900 s is fifteen minutes, labelled as minutes.
    expect(getByTestId("live-workout-treadmill-set-0-duration").props.value).toBe(
      "15",
    );
    const header = getByTestId("live-workout-treadmill-set-table-header");
    expect(within(header).getByText("Min")).toBeTruthy();

    fireEvent.press(getByTestId("live-workout-treadmill-duration-toggle"));
    expect(within(header).getByText("Sec")).toBeTruthy();
    expect(getByTestId("live-workout-treadmill-set-0-duration").props.value).toBe(
      "900",
    );
  });

  it("the done control is the same empty square that greens with a check", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={TREADMILL} />,
    );
    const box = getByTestId("live-workout-treadmill-set-0-complete");
    expect(box.props.className).toContain("rounded-lg");
    expect(box.props.className).not.toContain("rounded-full");
    fireEvent.press(box);
    expect(
      getByTestId("live-workout-treadmill-set-0").props.className,
    ).toContain("bg-green-100");
  });
});
