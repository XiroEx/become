import { fireEvent, render } from "@testing-library/react-native";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import { NativeShareButton } from "@/components/share/NativeShareButton";

describe("(NP-332) Track view header, sets defaulting, and compact superset parity", () => {
  describe("Header parity with web", () => {
    const WORKOUT: LiveWorkoutViewModel = {
      programId: "p1",
      workoutTitle: "Full Body A",
      exercises: [
        {
          slug: "pushups",
          name: "Push-ups",
          sets: 3,
        },
      ],
    };

    it("renders Back button, centered Track/Live toggle, round share button, centered title + day, progress bar with %, and View PRs link", () => {
      const onExit = jest.fn();
      const onViewPRs = jest.fn();

      const { getByTestId } = render(
        <LiveWorkoutClient
          workout={WORKOUT}
          day="Day 1"
          onExit={onExit}
          onViewPRs={onViewPRs}
          headerAction={
            <NativeShareButton
              body={{ kind: "workout", programId: "p1", day: "Day 1" }}
              testID="live-workout-share"
              iconOnly
            />
          }
        />,
      );

      // Back button
      const backBtn = getByTestId("live-workout-back");
      expect(backBtn).toBeTruthy();
      fireEvent.press(backBtn);
      expect(onExit).toHaveBeenCalledTimes(1);

      // Centered Title and Day
      expect(getByTestId("live-workout-title").props.children).toBe("Full Body A");
      expect(getByTestId("live-workout-day").props.children).toBe("Day 1");

      // Centered Track/Live toggle
      expect(getByTestId("live-workout-view")).toBeTruthy();

      // Circular round share button
      const shareBtn = getByTestId("live-workout-share");
      expect(shareBtn).toBeTruthy();
      expect(shareBtn.props.style).toEqual(
        expect.objectContaining({
          width: 36,
          height: 36,
          borderRadius: 18,
        }),
      );

      // Workout Progress bar & View PRs link
      expect(getByTestId("live-workout-overall-progress")).toBeTruthy();
      const viewPRsBtn = getByTestId("live-workout-view-prs");
      expect(viewPRsBtn).toBeTruthy();
      fireEvent.press(viewPRsBtn);
      expect(onViewPRs).toHaveBeenCalledTimes(1);

      // Hidden compatibility anchors are still present for backward compatibility
      expect(getByTestId("live-workout-progress")).toBeTruthy();
    });
  });

  describe("Set count defaulting and units", () => {
    it("defaults sets to 3 when absent in program data (e.g. Jumping Jacks shows 3 rows instead of 1)", () => {
      const WORKOUT_NO_SETS: LiveWorkoutViewModel = {
        programId: "p1",
        workoutTitle: "Cardio Warmup",
        exercises: [
          {
            slug: "jumping-jacks",
            name: "Jumping Jacks",
            // sets omitted
          },
        ],
      };

      const { getByTestId } = render(
        <LiveWorkoutClient workout={WORKOUT_NO_SETS} />,
      );

      // Defaults to 3 sets -> 3 rows rendered
      expect(getByTestId("live-workout-jumping-jacks-set-0")).toBeTruthy();
      expect(getByTestId("live-workout-jumping-jacks-set-1")).toBeTruthy();
      expect(getByTestId("live-workout-jumping-jacks-set-2")).toBeTruthy();
      expect(getByTestId("live-workout-exercise-jumping-jacks-meta").props.children).toBe(
        "3 sets",
      );
    });

    it("timed exercises show '3 rounds' via setUnitLabel instead of '1 sets'", () => {
      const WORKOUT_TIMED: LiveWorkoutViewModel = {
        programId: "p1",
        workoutTitle: "Mobility",
        exercises: [
          {
            slug: "arm-circles",
            name: "Arm Circles",
            durationLabel: "30s",
            trackingType: "duration",
            // sets omitted -> defaults to 3
          },
        ],
      };

      const { getByTestId } = render(
        <LiveWorkoutClient workout={WORKOUT_TIMED} />,
      );

      expect(getByTestId("live-workout-arm-circles-set-0")).toBeTruthy();
      expect(getByTestId("live-workout-arm-circles-set-1")).toBeTruthy();
      expect(getByTestId("live-workout-arm-circles-set-2")).toBeTruthy();
      expect(getByTestId("live-workout-exercise-arm-circles-meta").props.children).toBe(
        "3 rounds",
      );
    });

    it("retains '1 sets' when sets is explicitly 1 for backward compatibility", () => {
      const WORKOUT_EXPLICIT_ONE: LiveWorkoutViewModel = {
        programId: "p1",
        workoutTitle: "Single Set Workout",
        exercises: [
          {
            slug: "bench",
            name: "Bench Press",
            sets: 1,
            difficulty: "beginner",
          },
        ],
      };

      const { getByTestId } = render(
        <LiveWorkoutClient workout={WORKOUT_EXPLICIT_ONE} />,
      );

      expect(getByTestId("live-workout-exercise-bench-meta").props.children).toBe(
        "1 sets · Beginner",
      );
    });
  });

  describe("Target prefilling in placeholders", () => {
    it("prefills target reps and target duration in input placeholders instead of 0", () => {
      const WORKOUT_TARGETS: LiveWorkoutViewModel = {
        programId: "p1",
        workoutTitle: "Prescriptions",
        exercises: [
          {
            slug: "squat",
            name: "Squat",
            sets: 1,
            repsLabel: "10-12",
          },
          {
            slug: "plank",
            name: "Plank",
            sets: 1,
            durationLabel: "30s",
            trackingType: "duration",
          },
        ],
      };

      const { getByTestId } = render(
        <LiveWorkoutClient workout={WORKOUT_TARGETS} />,
      );

      // Reps input placeholder prefilled with target reps "10"
      expect(
        getByTestId("live-workout-squat-set-0-reps").props.placeholder,
      ).toBe("10");

      // Duration input placeholder prefilled with target duration "30"
      expect(
        getByTestId("live-workout-plank-set-0-duration").props.placeholder,
      ).toBe("30");
    });
  });

  describe("Compact superset rounds layout", () => {
    const SUPERSET_WORKOUT: LiveWorkoutViewModel = {
      programId: "p1",
      workoutTitle: "Upper Superset",
      exercises: [
        {
          slug: "db-bench",
          name: "Dumbbell Bench Press",
          sets: 2,
          equipment: "dumbbell",
          groupId: "ss1",
          groupLabel: "Superset A",
          groupType: "superset",
        },
        {
          slug: "bent-row",
          name: "Dumbbell Bent-Over Row",
          sets: 2,
          equipment: "dumbbell",
          groupId: "ss1",
          groupLabel: "Superset A",
          groupType: "superset",
        },
      ],
    };

    it("displays group header subtitle '— N exercises, minimal rest between exercises', compact 'lbs/DB' weight labels, skip button, and horizontal quick picks", () => {
      const { getByTestId, queryByTestId } = render(
        <LiveWorkoutClient workout={SUPERSET_WORKOUT} />,
      );

      // Group block exists
      expect(getByTestId("live-workout-group-ss1-block")).toBeTruthy();
      expect(getByTestId("live-workout-group-ss1-subtitle").props.children).toBe(
        "— 2 exercises, minimal rest between exercises",
      );

      // No FramedVideo media boxes inside group block
      expect(queryByTestId("live-workout-db-bench-video")).toBeNull();
      expect(queryByTestId("live-workout-bent-row-video")).toBeNull();

      // Compact weight label is "lbs/DB"
      expect(
        getByTestId("live-workout-db-bench-set-0-weight-label").props.children,
      ).toBe("lbs/DB");

      // Compact skip button » exists
      const skipBtn = getByTestId("live-workout-db-bench-set-0-skip");
      expect(skipBtn).toBeTruthy();

      // Horizontal quick picks container
      expect(getByTestId("live-workout-db-bench-set-0-quick-picks")).toBeTruthy();
      // Clicking a quick pick fills the weight
      fireEvent.press(getByTestId("live-workout-db-bench-set-0-quick-pick-20"));
      expect(getByTestId("live-workout-db-bench-set-0-weight").props.value).toBe("20");
    });
  });

  describe("Visual parity (notes, chevrons, number badge)", () => {
    const WORKOUT_VISUAL: LiveWorkoutViewModel = {
      programId: "p1",
      workoutTitle: "Visual Check",
      exercises: [
        {
          slug: "curls",
          name: "Bicep Curls",
          sets: 1,
          notes: "Keep elbows pinned to sides",
        },
      ],
    };

    it("renders notes in blue, dark mode badge in dark grey, and collapses with chevron", () => {
      const { getByTestId, queryByTestId } = render(
        <LiveWorkoutClient workout={WORKOUT_VISUAL} />,
      );

      // Notes styled with text-blue-600 dark:text-blue-400
      const notesEl = getByTestId("live-workout-curls-notes");
      expect(notesEl.props.className).toContain("text-blue-600");
      expect(notesEl.props.className).toContain("dark:text-blue-400");

      // Number badge when incomplete has bg-zinc-100 dark:bg-zinc-800
      const badge = getByTestId("live-workout-exercise-curls-badge");
      expect(badge.props.className).toContain("bg-zinc-100");
      expect(badge.props.className).toContain("dark:bg-zinc-800");

      // Collapse chevron toggles rows
      expect(getByTestId("live-workout-curls-set-0")).toBeTruthy();
      fireEvent.press(getByTestId("live-workout-exercise-curls-header"));
      expect(queryByTestId("live-workout-curls-set-0")).toBeNull();
    });
  });
});
