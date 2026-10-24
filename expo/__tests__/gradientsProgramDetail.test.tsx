// Program Detail's web gradients (`ProgramDetailClient.tsx`): the hero's base
// `bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-900` behind the photo,
// the Start / Continue pill's `from-green-500 to-emerald-600` and the progress
// bar's `from-green-400 to-emerald-400`. The pills keep their solid fill under
// the gradient (NP-361's contract), so this only asserts the added layer.

import { render } from "@testing-library/react-native";
import { ProgramDetail } from "@/components/programs/ProgramDetail";
import type { ProgramDetailViewModel } from "@/components/programs/ProgramDetail";
import { darkTokens, lightTokens, webGradientTokens } from "@/lib/theme/tokens";

const rgb = (triplet: string) => `rgb(${triplet})`;

const sample: ProgramDetailViewModel = {
  id: "prog-grad",
  name: "Strength Foundation",
  description: "Build a base.",
  durationWeeks: 12,
  trainingDaysPerWeek: 4,
  targetUser: "Beginner",
  coverImage: null,
  phases: [
    {
      phaseIndex: 0,
      name: "Phase 1",
      weekStart: 1,
      weekEnd: 4,
      focus: "Base",
      workouts: [{ workoutIndex: 0, day: "Day 1", title: "Push A", exerciseCount: 1 }],
    },
  ],
};

describe("Program Detail web gradients", () => {
  it("hero: a zinc-900 → zinc-800 → zinc-900 ground behind the photo (light scheme)", () => {
    const { getByTestId } = render(<ProgramDetail program={sample} />);
    const base = getByTestId("program-detail-hero-base-gradient");
    expect(base.props.colors).toEqual([
      rgb(darkTokens.card),
      rgb(darkTokens.muted),
      rgb(darkTokens.card),
    ]);
    expect(base.props.start).toEqual({ x: 0, y: 0 });
    expect(base.props.end).toEqual({ x: 1, y: 1 });
  });

  it("Start program: green-500 → emerald-600, left to right", () => {
    const { getByTestId } = render(<ProgramDetail program={sample} />);
    const g = getByTestId("program-detail-start-gradient");
    expect(g.props.colors).toEqual([
      rgb(lightTokens["mind-green"]),
      rgb(webGradientTokens.emerald600),
    ]);
    expect(g.props.start).toEqual({ x: 0, y: 0 });
    expect(g.props.end).toEqual({ x: 1, y: 0 });
  });

  it("Continue: the same pill gradient", () => {
    const { getByTestId } = render(
      <ProgramDetail program={sample} isEnrolled onContinue={() => {}} />,
    );
    expect(getByTestId("program-detail-continue-gradient").props.colors).toEqual([
      rgb(lightTokens["mind-green"]),
      rgb(webGradientTokens.emerald600),
    ]);
  });

  it("progress bar: green-400 → emerald-400", () => {
    const { getByTestId } = render(
      <ProgramDetail
        program={sample}
        isEnrolled
        activeProgram={{
          programId: "prog-grad",
          programName: "Strength Foundation",
          status: "active",
          currentPhase: 1,
          completedWorkouts: 2,
          totalWorkouts: 8,
        }}
      />,
    );
    expect(getByTestId("program-detail-progress-gradient").props.colors).toEqual([
      rgb(webGradientTokens.green400),
      rgb(webGradientTokens.emerald400),
    ]);
  });
});
