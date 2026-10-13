import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ExerciseAccordion, type ProgramExerciseDetail } from "@/components/ExerciseAccordion";

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    token: "mock-jwt",
    user: { id: "user-123" },
    isAuthed: true,
  }),
}));

describe("ExerciseAccordion", () => {
  const sampleExercise: ProgramExerciseDetail = {
    slug: "barbell-squat",
    name: "Barbell Back Squat",
    type: "strength",
    sets: 3,
    reps: "8-10",
    repsUnit: "reps",
    rest: "120s",
    details: "Keep your chest up and drive through your heels.",
    tip: "Brace your core before descending.",
    thumbnailUrl: "https://cdn.example.com/squat-thumb.jpg",
    videoUrl: "https://cdn.example.com/squat-demo.mp4",
  };

  it("renders collapsed row with a green number circle, name, prescription (rest in green), and play button — even with a thumbnail", () => {
    const { getByTestId, getByText } = render(
      <ExerciseAccordion exercise={sampleExercise} index={0} testID="test-acc" />,
    );

    expect(getByTestId("test-acc-exercise-barbell-squat")).toBeTruthy();
    // Web numbers every row the same way regardless of thumbnailUrl — no
    // thumbnail square on the collapsed row, only the number circle.
    expect(getByTestId("test-acc-exercise-number-barbell-squat")).toBeTruthy();
    expect(getByText("1")).toBeTruthy();
    expect(getByTestId("test-acc-exercise-name-barbell-squat").props.children).toBe("Barbell Back Squat");
    expect(getByText("3 sets · 8-10 reps · 120s rest")).toBeTruthy();
    expect(getByTestId("test-acc-exercise-demo-barbell-squat")).toBeTruthy();
  });

  it("renders the number circle for every row regardless of thumbnailUrl", () => {
    const withoutThumb: ProgramExerciseDetail = {
      ...sampleExercise,
      thumbnailUrl: null,
    };
    const { getByText, getByTestId } = render(
      <ExerciseAccordion exercise={withoutThumb} index={2} testID="test-acc" />,
    );

    expect(getByText("3")).toBeTruthy();
    expect(getByTestId("test-acc-exercise-number-barbell-squat")).toBeTruthy();
  });

  it("renders the play button even when there is no video yet", () => {
    const noVideo: ProgramExerciseDetail = {
      ...sampleExercise,
      videoUrl: null,
      thumbnailUrl: null,
    };
    const { getByTestId } = render(
      <ExerciseAccordion exercise={noVideo} index={0} testID="test-acc" />,
    );

    expect(getByTestId("test-acc-exercise-demo-barbell-squat")).toBeTruthy();
  });

  it("does not render expanded content when collapsed", () => {
    const { queryByTestId } = render(
      <ExerciseAccordion exercise={sampleExercise} index={0} isExpanded={false} testID="test-acc" />,
    );

    expect(queryByTestId("test-acc-exercise-expanded-barbell-squat")).toBeNull();
  });

  it("renders video demo when expanded and isPlaying is true", () => {
    const { getByTestId } = render(
      <ExerciseAccordion
        exercise={sampleExercise}
        index={0}
        isExpanded={true}
        isPlaying={true}
        testID="test-acc"
      />,
    );

    expect(getByTestId("test-acc-exercise-expanded-barbell-squat")).toBeTruthy();
    expect(getByTestId("test-acc-exercise-video-barbell-squat-player")).toBeTruthy();
  });

  it("renders thumbnail preview without player when expanded and isPlaying is false", () => {
    const { getByTestId, queryByTestId } = render(
      <ExerciseAccordion
        exercise={sampleExercise}
        index={0}
        isExpanded={true}
        isPlaying={false}
        testID="test-acc"
      />,
    );

    expect(getByTestId("test-acc-exercise-expanded-barbell-squat")).toBeTruthy();
    expect(queryByTestId("test-acc-exercise-video-barbell-squat-player")).toBeNull();
    expect(getByTestId("test-acc-exercise-video-barbell-squat-thumbnail")).toBeTruthy();
  });

  it("toggles instructions and tips tabs when expanded", () => {
    const { getByTestId, getByText } = render(
      <ExerciseAccordion
        exercise={sampleExercise}
        index={0}
        isExpanded={true}
        testID="test-acc"
      />,
    );

    // Switch to Instructions
    fireEvent.press(getByTestId("test-acc-exercise-tab-instructions"));
    expect(getByText("Keep your chest up and drive through your heels.")).toBeTruthy();

    // Switch to Tips
    fireEvent.press(getByTestId("test-acc-exercise-tab-tips"));
    expect(getByText("Brace your core before descending.")).toBeTruthy();
  });

  it("fires onToggleExpand when the header is pressed", () => {
    const onToggleExpand = jest.fn();
    const { getByTestId } = render(
      <ExerciseAccordion
        exercise={sampleExercise}
        index={0}
        onToggleExpand={onToggleExpand}
        testID="test-acc"
      />,
    );

    fireEvent.press(getByTestId("test-acc-exercise-name-barbell-squat"));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it("fires onPlayPress when demo button is pressed", () => {
    const onPlayPress = jest.fn();
    const { getByTestId } = render(
      <ExerciseAccordion
        exercise={sampleExercise}
        index={0}
        onPlayPress={onPlayPress}
        testID="test-acc"
      />,
    );

    fireEvent.press(getByTestId("test-acc-exercise-demo-barbell-squat"));
    expect(onPlayPress).toHaveBeenCalledTimes(1);
  });
});
