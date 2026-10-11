import { render } from "@testing-library/react-native";
import { ProgramDetail, type ProgramDetailViewModel } from "@/components/programs/ProgramDetail";
import { ExerciseAccordion, type ProgramExerciseDetail } from "@/components/ExerciseAccordion";
import { tintToken } from "@/lib/theme/tokens";

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    token: "mock-jwt",
    user: { id: "user-123" },
    isAuthed: true,
  }),
}));

const sampleProgram: ProgramDetailViewModel = {
  id: "prog-test",
  name: "Hypertrophy Program",
  description: "Build muscle",
  durationWeeks: 12,
  trainingDaysPerWeek: 4,
  goal: "Muscle growth",
  targetUser: "Intermediate",
  coverImage: "https://example.com/cover.jpg",
  coverParallax: true,
  phases: [
    {
      phaseIndex: 0,
      name: "Phase 1",
      weeks: "Weeks 1–4",
      weekStart: 1,
      weekEnd: 4,
      focus: "Build foundational hypertrophy and work capacity",
      workouts: [
        {
          workoutIndex: 0,
          day: "Day 1",
          title: "Upper Body Strength",
          exerciseCount: 1,
          exercises: [
            {
              slug: "bench-press",
              name: "Barbell Bench Press",
              type: "strength",
              sets: 4,
              reps: "8-10",
              repsUnit: "reps",
              rest: "90s",
              thumbnailUrl: "https://example.com/thumb.jpg",
            },
          ],
        },
        {
          workoutIndex: 1,
          day: "Day 2",
          title: "Lower Body",
          exerciseCount: 1,
        },
        {
          workoutIndex: 2,
          day: "Day 3",
          title: "Push",
          exerciseCount: 1,
        },
        {
          workoutIndex: 3,
          day: "Day 4",
          title: "Pull",
          exerciseCount: 1,
        },
      ],
    },
  ],
};

describe("(NP-361) Program Detail native vs web parity", () => {
  it("renders full-bleed cover image hero with sliding content panel", () => {
    const { getByTestId } = render(
      <ProgramDetail
        program={sampleProgram}
        testID="np361-test"
      />,
    );

    // ScrollView container exists
    const scrollContainer = getByTestId("np361-test");
    expect(scrollContainer).toBeTruthy();
    // Program name is rendered in hero
    expect(getByTestId("np361-test-name").props.children).toBe("Hypertrophy Program");
  });

  it("renders duration in green pill and frequency in blue pill", () => {
    const { getByText, getByTestId } = render(
      <ProgramDetail
        program={sampleProgram}
        testID="np361-test"
      />,
    );

    expect(getByText("12 Weeks")).toBeTruthy();
    const durationPill = getByTestId("np361-test-duration-pill");
    expect(durationPill.props.style).toEqual(
      expect.objectContaining({
        backgroundColor: tintToken("success", "dark", 0.2),
        borderRadius: 9999,
      }),
    );

    expect(getByText("4x/week")).toBeTruthy();
    const freqPill = getByTestId("np361-test-frequency-pill");
    expect(freqPill.props.style).toEqual(
      expect.objectContaining({
        backgroundColor: tintToken("info", "dark", 0.2),
        borderRadius: 9999,
      }),
    );
  });

  it("renders rounded-full pill buttons for Continue, Workout, and Share", () => {
    const { getByTestId } = render(
      <ProgramDetail
        program={sampleProgram}
        isEnrolled={true}
        shareBody={{ kind: "program", programId: "prog-test" }}
        testID="np361-test"
      />,
    );

    const continueBtn = getByTestId("np361-test-continue");
    expect(continueBtn.props.style).toEqual(
      expect.objectContaining({
        borderRadius: 9999,
      }),
    );

    const workoutBtn = getByTestId("np361-test-workout-live");
    expect(workoutBtn.props.style).toEqual(
      expect.objectContaining({
        borderRadius: 9999,
      }),
    );

    const shareBtn = getByTestId("np361-test-share");
    expect(shareBtn.props.style).toEqual(
      expect.objectContaining({
        borderRadius: 9999,
      }),
    );
  });

  it("wraps Select Phase inside Card with single-line tabs and nests lightning focus badge", () => {
    const { getByTestId, getByText } = render(
      <ProgramDetail
        program={sampleProgram}
        testID="np361-test"
      />,
    );

    // Select Phase tab
    const phaseTab = getByTestId("np361-test-phase-0");
    expect(phaseTab).toBeTruthy();
    expect(getByText("Phase 1")).toBeTruthy();
    expect(getByText(" (Weeks 1–4)")).toBeTruthy();

    // Nested focus with lightning badge
    const focusBlock = getByTestId("np361-test-phase-focus");
    expect(focusBlock).toBeTruthy();
    expect(getByText("Build foundational hypertrophy and work capacity")).toBeTruthy();
  });

  it("renders Training Days in a 4-column grid layout", () => {
    const { getByText, getByTestId } = render(
      <ProgramDetail
        program={sampleProgram}
        testID="np361-test"
      />,
    );

    expect(getByText("Training Days")).toBeTruthy();
    const day1 = getByTestId("np361-test-day-Day 1");
    const day2 = getByTestId("np361-test-day-Day 2");
    const day3 = getByTestId("np361-test-day-Day 3");
    const day4 = getByTestId("np361-test-day-Day 4");

    expect(day1).toBeTruthy();
    expect(day2).toBeTruthy();
    expect(day3).toBeTruthy();
    expect(day4).toBeTruthy();

    // Day buttons have flexBasis 23% and rounded corners
    expect(day1.props.style).toEqual(
      expect.objectContaining({
        flexBasis: "23%",
        borderRadius: 8,
      }),
    );
  });

  it("renders workout title with icon badge and ExerciseAccordion with 16px padding & gap", () => {
    const sampleExercise: ProgramExerciseDetail = {
      slug: "bench-press",
      name: "Barbell Bench Press",
      type: "strength",
      sets: 3,
      reps: "8-10",
      repsUnit: "reps",
      rest: "120s",
    };

    const { getByTestId } = render(
      <ExerciseAccordion
        exercise={sampleExercise}
        index={0}
        testID="test-acc"
      />,
    );

    const accordion = getByTestId("test-acc-exercise-bench-press");
    expect(accordion).toBeTruthy();
    // Border matches border color (no stark primary recoloring on expanded)
    expect(accordion.props.style).toEqual(
      expect.objectContaining({
        borderRadius: 12,
      }),
    );

    // Number badge is 36x36
    const numBadge = getByTestId("test-acc-exercise-number-bench-press");
    expect(numBadge.props.style).toEqual(
      expect.objectContaining({
        width: 36,
        height: 36,
        borderRadius: 18,
      }),
    );

    // Play button is 36x36
    const playBtn = getByTestId("test-acc-exercise-demo-bench-press");
    expect(playBtn.props.style).toEqual(
      expect.objectContaining({
        width: 36,
        height: 36,
        borderRadius: 18,
      }),
    );
  });
});
