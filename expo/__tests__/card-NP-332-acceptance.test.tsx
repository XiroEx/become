import { fireEvent, render } from "@testing-library/react-native";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

describe("(NP-332) Track view visual parity with webapp", () => {
  describe("1. Header parity", () => {
    const WORKOUT: LiveWorkoutViewModel = {
      programId: "prog-1",
      workoutTitle: "Full Body Blast",
      exercises: [
        {
          slug: "squat",
          name: "Bodyweight Squat",
          sets: 3,
        },
      ],
    };

    it("renders back button on left, centered toggle pill, centered title with day line, workout progress bar, and View PRs link", () => {
      const onExit = jest.fn();
      const onViewPRs = jest.fn();

      const { getByTestId } = render(
        <LiveWorkoutClient
          workout={WORKOUT}
          day="Day 1"
          onExit={onExit}
          onViewPRs={onViewPRs}
        />,
      );

      // Back button
      const backBtn = getByTestId("live-workout-back");
      expect(backBtn).toBeTruthy();
      fireEvent.press(backBtn);
      expect(onExit).toHaveBeenCalledTimes(1);

      // Centered view toggle
      expect(getByTestId("live-workout-view")).toBeTruthy();

      // Centered title and Day line
      expect(getByTestId("live-workout-title").props.children).toBe("Full Body Blast");
      expect(getByTestId("live-workout-day").props.children).toBe("Day 1");

      // Overall Progress bar
      expect(getByTestId("live-workout-overall-progress")).toBeTruthy();

      // View PRs button
      const viewPRsBtn = getByTestId("live-workout-view-prs");
      expect(viewPRsBtn).toBeTruthy();
      fireEvent.press(viewPRsBtn);
      expect(onViewPRs).toHaveBeenCalledTimes(1);
    });
  });

  describe("2. Set count defaulting & timed exercise units", () => {
    it("defaults sets to 3 when absent in program data, and timed exercises display rounds", () => {
      const WORKOUT_NO_SETS: LiveWorkoutViewModel = {
        programId: "prog-2",
        workoutTitle: "Cardio & Warmup",
        exercises: [
          {
            slug: "jumping-jacks",
            name: "Jumping Jacks",
            // sets omitted — should default to 3
          },
          {
            slug: "arm-circles",
            name: "Arm Circles",
            // sets omitted — should default to 3
            trackingType: "time",
            durationLabel: "30s",
          },
        ],
      };

      const { getByTestId } = render(
        <LiveWorkoutClient workout={WORKOUT_NO_SETS} day="Day 2" />,
      );

      // Jumping jacks should have 3 sets
      expect(getByTestId("live-workout-jumping-jacks-set-0")).toBeTruthy();
      expect(getByTestId("live-workout-jumping-jacks-set-1")).toBeTruthy();
      expect(getByTestId("live-workout-jumping-jacks-set-2")).toBeTruthy();
      expect(getByTestId("live-workout-exercise-jumping-jacks-meta").props.children).toBe(
        "3 sets",
      );

      // Arm circles is timed work — meta should display "3 rounds" via setUnitLabel
      expect(getByTestId("live-workout-arm-circles-set-0")).toBeTruthy();
      expect(getByTestId("live-workout-arm-circles-set-1")).toBeTruthy();
      expect(getByTestId("live-workout-arm-circles-set-2")).toBeTruthy();
      expect(getByTestId("live-workout-exercise-arm-circles-meta").props.children).toBe(
        "3 rounds",
      );
    });
  });

  describe("3. Target reps and duration prefilling in placeholders", () => {
    it("pre-fills target reps (10) and target duration (30s) in input placeholders instead of 0", () => {
      const WORKOUT_TARGETS: LiveWorkoutViewModel = {
        programId: "prog-3",
        workoutTitle: "Target Reps Day",
        exercises: [
          {
            slug: "pushup",
            name: "Push-Up",
            sets: 1,
            repsLabel: "10 reps",
            trackingType: "reps_only",
          },
          {
            slug: "plank",
            name: "Plank",
            sets: 1,
            durationLabel: "45s",
            trackingType: "time",
          },
        ],
      };

      const { getByTestId } = render(
        <LiveWorkoutClient workout={WORKOUT_TARGETS} day="Day 3" />,
      );

      // Pushup reps input placeholder should be "10"
      const repsInput = getByTestId("live-workout-pushup-set-0-reps");
      expect(repsInput.props.placeholder).toBe("10");

      // Plank duration input placeholder should be "45"
      const durInput = getByTestId("live-workout-plank-set-0-duration");
      expect(durInput.props.placeholder).toBe("45");
    });
  });

  describe("4. Superset rounds compact parity", () => {
    const SUPERSET_WORKOUT: LiveWorkoutViewModel = {
      programId: "prog-4",
      workoutTitle: "Upper Superset Day",
      exercises: [
        {
          slug: "db-bench",
          name: "Dumbbell Bench Press",
          sets: 2,
          groupId: "ss-1",
          groupLabel: "Superset A",
          groupType: "superset",
          repsLabel: "10",
          equipment: ["dumbbells"],
          notes: "Slow eccentric",
        },
        {
          slug: "bent-row",
          name: "Dumbbell Bent-Over Row",
          sets: 2,
          groupId: "ss-1",
          groupLabel: "Superset A",
          groupType: "superset",
          repsLabel: "12",
          equipment: ["dumbbells"],
        },
      ],
    };

    it("renders group subtitle with exercise count & minimal rest, ungroup button, and compact rows with no per-exercise media boxes", () => {
      const onExerciseChange = jest.fn();
      const { getByTestId, queryByTestId, getByText } = render(
        <LiveWorkoutClient
          workout={SUPERSET_WORKOUT}
          day="Day 4"
          onExerciseChange={onExerciseChange}
        />,
      );

      // Group header block
      expect(getByTestId("live-workout-group-ss-1-block")).toBeTruthy();
      expect(getByTestId("live-workout-group-ss-1").props.children).toBe("Superset A");

      // Subtitle
      expect(
        getByText("— 2 exercises, minimal rest between exercises"),
      ).toBeTruthy();

      // Ungroup action
      const ungroupBtn = getByTestId("live-workout-group-ss-1-ungroup");
      expect(ungroupBtn).toBeTruthy();
      fireEvent.press(ungroupBtn);
      expect(onExerciseChange).toHaveBeenCalledTimes(1);

      // Dropped per-exercise media boxes (FramedVideo) inside group
      expect(queryByTestId("live-workout-db-bench-video")).toBeNull();
      expect(queryByTestId("live-workout-bent-row-video")).toBeNull();

      // Compact set rows with inputs, skip button, and complete checkbox
      expect(getByTestId("live-workout-db-bench-set-0")).toBeTruthy();
      expect(getByTestId("live-workout-db-bench-set-0-weight")).toBeTruthy();
      expect(getByTestId("live-workout-db-bench-set-0-reps")).toBeTruthy();
      expect(getByTestId("live-workout-db-bench-set-0-skip")).toBeTruthy();
      expect(getByTestId("live-workout-db-bench-set-0-complete")).toBeTruthy();

      // Compact labels underneath inputs
      expect(getByTestId("live-workout-db-bench-set-0-weight-label").props.children).toBe("lbs/DB");
      expect(getByTestId("live-workout-db-bench-set-0-reps-label").props.children).toBe("reps");

      // Target reps prefilled in placeholder
      expect(getByTestId("live-workout-db-bench-set-0-reps").props.placeholder).toBe("10");

      // Quick picks horizontal chips are present
      expect(getByTestId("live-workout-db-bench-set-0-quick-picks")).toBeTruthy();
    });
  });

  describe("5. Visual styling parity", () => {
    it("renders hint/notes in blue and badge in dark grey container style", () => {
      const WORKOUT_HINTS: LiveWorkoutViewModel = {
        programId: "prog-5",
        workoutTitle: "Styling Test",
        exercises: [
          {
            slug: "overhead-press",
            name: "Overhead Press",
            sets: 1,
            notes: "Keep core tight",
          },
        ],
      };

      const { getByTestId } = render(
        <LiveWorkoutClient workout={WORKOUT_HINTS} day="Day 5" />,
      );

      // Notes text has blue class
      const notesEl = getByTestId("live-workout-overhead-press-notes");
      expect(notesEl.props.className).toContain("text-blue-600");
      expect(notesEl.props.className).toContain("dark:text-blue-400");

      // Badge has dark:bg-zinc-800
      const badgeEl = getByTestId("live-workout-exercise-overhead-press-badge");
      expect(badgeEl.props.className).toContain("dark:bg-zinc-800");
    });
  });
});
