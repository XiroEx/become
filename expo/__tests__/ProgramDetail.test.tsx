import { render, fireEvent } from "@testing-library/react-native";
import { ProgramDetail } from "@/components/programs/ProgramDetail";
import type { ProgramDetailViewModel } from "@/components/programs/ProgramDetail";
import { programEditUrl } from "@/lib/programs/browserLauncher";

const sample: ProgramDetailViewModel = {
  id: "prog-123",
  name: "Strength Foundation",
  description: "Build a base of strength and movement quality.",
  durationWeeks: 12,
  trainingDaysPerWeek: 4,
  targetUser: "Beginner",
  phases: [
    {
      phaseIndex: 0,
      name: "Phase 1 — Foundation",
      weekStart: 1,
      weekEnd: 4,
      workouts: [
        { workoutIndex: 0, title: "Push A", exerciseCount: 6 },
        { workoutIndex: 1, title: "Pull A", exerciseCount: 6 },
        { workoutIndex: 2, title: "Legs A", exerciseCount: 5 },
      ],
    },
    {
      phaseIndex: 1,
      name: "Phase 2 — Hypertrophy",
      weekStart: 5,
      weekEnd: 8,
      workouts: [
        { workoutIndex: 0, title: "Push B", exerciseCount: 6 },
      ],
    },
  ],
};

describe("ProgramDetail", () => {
  it("renders program name, description, and metadata", () => {
    const { getByTestId } = render(<ProgramDetail program={sample} />);
    expect(getByTestId("program-detail-name").props.children).toBe(
      "Strength Foundation",
    );
    expect(getByTestId("program-detail-description").props.children).toBe(
      "Build a base of strength and movement quality.",
    );
  });

  it("renders a card per phase + workout titles", () => {
    const { getByTestId, getByText } = render(
      <ProgramDetail program={sample} />,
    );
    expect(getByTestId("program-detail-phase-0")).toBeTruthy();
    expect(getByTestId("program-detail-phase-1")).toBeTruthy();
    expect(getByText("Phase 1 — Foundation")).toBeTruthy();
    expect(getByText("Phase 2 — Hypertrophy")).toBeTruthy();
  });

  it("fires onPhasePress with the phase index", () => {
    const onPhasePress = jest.fn();
    const { getByTestId } = render(
      <ProgramDetail program={sample} onPhasePress={onPhasePress} />,
    );
    fireEvent.press(getByTestId("program-detail-phase-1"));
    expect(onPhasePress).toHaveBeenCalledWith(1);
  });

  it("'Edit in browser' button calls the injected launcher with the correct URL", () => {
    const launcher = jest.fn(async () => undefined);
    const { getByTestId } = render(
      <ProgramDetail program={sample} browserLauncher={launcher} />,
    );
    fireEvent.press(getByTestId("program-detail-edit-in-browser"));
    expect(launcher).toHaveBeenCalledWith(programEditUrl("prog-123"));
    expect(programEditUrl("prog-123")).toBe(
      "https://become.redbtn.io/dashboard/programming/prog-123/edit",
    );
  });

  it("URL-encodes the program id in the edit URL", () => {
    expect(programEditUrl("a b/c")).toBe(
      "https://become.redbtn.io/dashboard/programming/a%20b%2Fc/edit",
    );
  });
});
