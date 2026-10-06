import { render, fireEvent } from "@testing-library/react-native";
import { ProgramDetail } from "@/components/programs/ProgramDetail";
import type { ProgramDetailViewModel } from "@/components/programs/ProgramDetail";

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
        {
          workoutIndex: 0,
          day: "Day 1",
          title: "Push A",
          exerciseCount: 2,
          exercises: [
            {
              slug: "bench-press",
              name: "Barbell Bench Press",
              sets: 4,
              reps: "8-10",
              rest: "90s",
              thumbnailUrl: "https://cdn.example.com/bench.jpg",
              videoUrl: "https://cdn.example.com/bench.mp4",
            },
            {
              slug: "overhead-press",
              name: "Overhead Press",
              sets: 3,
              reps: "10-12",
              groupId: "superset-1",
              groupType: "superset",
              groupLabel: "Superset A",
              groupRest: "60s",
            },
          ],
        },
        {
          workoutIndex: 1,
          day: "Day 2",
          title: "Pull A",
          exerciseCount: 1,
          exercises: [
            {
              slug: "pull-up",
              name: "Pull-Up",
              sets: 3,
              reps: "max",
            },
          ],
        },
        {
          workoutIndex: 2,
          day: "Day 3",
          title: "Legs A",
          exerciseCount: 1,
        },
      ],
    },
    {
      phaseIndex: 1,
      name: "Phase 2 — Hypertrophy",
      weekStart: 5,
      weekEnd: 8,
      workouts: [
        {
          workoutIndex: 0,
          day: "Day 1",
          title: "Push B",
          exerciseCount: 1,
        },
      ],
    },
  ],
};

describe("ProgramDetail", () => {
  // NP-284: the web hero never shows the long description paragraph — only
  // the name, the duration/frequency badges and the target user/goal lines.
  it("renders program name and hero badges, and does not render the description paragraph", () => {
    const { getByTestId, getByText, queryByText } = render(
      <ProgramDetail program={sample} />,
    );
    expect(getByTestId("program-detail-name").props.children).toBe(
      "Strength Foundation",
    );
    expect(getByText("12 Weeks")).toBeTruthy();
    expect(getByText("4x/week")).toBeTruthy();
    expect(getByText("Beginner")).toBeTruthy();
    expect(queryByText("Build a base of strength and movement quality.")).toBeNull();
  });

  it("renders a card/tab per phase + workout titles", () => {
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

  // e015c841: No native screen links to /dashboard/programming/*
  it("does not render 'Edit in browser' button (no links to /dashboard/programming/*)", () => {
    const { queryByTestId, queryByText } = render(
      <ProgramDetail program={sample} />,
    );
    expect(queryByTestId("program-detail-edit-in-browser")).toBeNull();
    expect(queryByText("Edit in browser")).toBeNull();
  });

  // e015c83f: Enrolled member sees Continue, completed days checked, and first incomplete day selected
  it("renders Continue button when enrolled and calls onContinue", () => {
    const onContinue = jest.fn();
    const { getByTestId, queryByTestId, getByText } = render(
      <ProgramDetail
        program={sample}
        isEnrolled={true}
        activeProgram={{
          programId: "prog-123",
          programName: "Strength Foundation",
          currentPhase: 1,
          currentDay: "Day 1",
          completedWorkouts: 2,
          totalWorkouts: 12,
        }}
        onContinue={onContinue}
      />,
    );

    expect(getByTestId("program-detail-continue")).toBeTruthy();
    expect(getByText("Continue")).toBeTruthy();
    expect(queryByTestId("program-detail-start")).toBeNull();

    fireEvent.press(getByTestId("program-detail-continue"));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("displays checkmark for completed days", () => {
    const completedDays = new Set<string>(["Day 1"]);
    const { getByTestId, queryByTestId } = render(
      <ProgramDetail
        program={sample}
        isEnrolled={true}
        completedDays={completedDays}
      />,
    );

    expect(getByTestId("program-detail-day-check-Day 1")).toBeTruthy();
    expect(queryByTestId("program-detail-day-check-Day 2")).toBeNull();
  });

  it("defaults to the first incomplete day when enrolled", () => {
    // Day 1 is complete; Day 2 is incomplete
    const completedDays = new Set<string>(["Day 1"]);
    const { getByTestId } = render(
      <ProgramDetail
        program={sample}
        isEnrolled={true}
        activeProgram={{
          programId: "prog-123",
          programName: "Strength Foundation",
          currentPhase: 1,
          currentDay: "Day 1",
        }}
        completedDays={completedDays}
      />,
    );

    // Workout title reflects Day 2 workout ("Pull A")
    expect(getByTestId("program-detail-workout-title").props.children).toBe("Pull A");
  });

  // e015c840: Workout in-progress state and resume
  it("renders Resume button with in-progress state and calls onResumeLive", () => {
    const onResumeLive = jest.fn();
    const { getByTestId, getByText, queryByTestId } = render(
      <ProgramDetail
        program={sample}
        isEnrolled={true}
        hasInProgressWorkout={true}
        onResumeLive={onResumeLive}
      />,
    );

    const resumeBtn = getByTestId("program-detail-resume");
    expect(resumeBtn).toBeTruthy();
    expect(getByText("Resume")).toBeTruthy();
    expect(queryByTestId("program-detail-workout-live")).toBeNull();

    fireEvent.press(resumeBtn);
    expect(onResumeLive).toHaveBeenCalledTimes(1);
  });

  it("renders Workout button when not in progress and calls onStartLive", () => {
    const onStartLive = jest.fn();
    const { getByTestId, getByText, queryByTestId } = render(
      <ProgramDetail
        program={sample}
        isEnrolled={true}
        hasInProgressWorkout={false}
        onStartLive={onStartLive}
      />,
    );

    const workoutBtn = getByTestId("program-detail-workout-live");
    expect(workoutBtn).toBeTruthy();
    expect(getByText("Workout")).toBeTruthy();
    expect(queryByTestId("program-detail-resume")).toBeNull();

    fireEvent.press(workoutBtn);
    expect(onStartLive).toHaveBeenCalledTimes(1);
  });

  it("renders exercise list with thumbnail, video demo, and group badges", () => {
    const { getByTestId, getByText } = render(
      <ProgramDetail program={sample} selectedDayKey="Day 1" />,
    );

    expect(getByTestId("program-detail-workout-title").props.children).toBe("Push A");
    expect(getByTestId("program-detail-exercise-bench-press")).toBeTruthy();
    expect(getByTestId("program-detail-exercise-number-bench-press")).toBeTruthy();
    expect(getByTestId("program-detail-exercise-demo-bench-press")).toBeTruthy();

    expect(getByTestId("program-detail-exercise-group-superset-1")).toBeTruthy();
    expect(getByText("Superset A")).toBeTruthy();
    // NP-284: full wording, matching the web exactly — not the shortened
    // native "minimal rest" / "60s rest".
    expect(getByText("1 exercises · 60s rest between rounds")).toBeTruthy();
    expect(getByTestId("program-detail-exercise-overhead-press")).toBeTruthy();
  });

  // NP-284: web colours group blocks by type (purple Superset, orange Circuit,
  // …) instead of one red badge for every type, and says "minimal rest
  // between exercises" when the group carries no groupRest.
  it("colours group badges by groupType and uses the web's subtitle wording", () => {
    const withCircuit: ProgramDetailViewModel = {
      ...sample,
      phases: [
        {
          ...sample.phases[0]!,
          workouts: [
            {
              workoutIndex: 0,
              day: "Day 1",
              title: "Circuit Day",
              exerciseCount: 2,
              exercises: [
                {
                  slug: "burpees",
                  name: "Burpees",
                  sets: 3,
                  groupId: "circuit-1",
                  groupType: "circuit",
                },
                {
                  slug: "mountain-climbers",
                  name: "Mountain Climbers",
                  sets: 3,
                  groupId: "circuit-1",
                  groupType: "circuit",
                },
              ],
            },
          ],
        },
      ],
    };
    const { getByText } = render(
      <ProgramDetail program={withCircuit} selectedDayKey="Day 1" />,
    );
    expect(getByText("Circuit")).toBeTruthy();
    expect(getByText("2 exercises · minimal rest between exercises")).toBeTruthy();
  });

  it("renders Save/Unsave toggle button and calls onToggleSave", () => {
    const onToggleSave = jest.fn();
    const { getByTestId, rerender } = render(
      <ProgramDetail
        program={sample}
        isSaved={false}
        onToggleSave={onToggleSave}
      />,
    );

    const toggleBtn = getByTestId("program-detail-toggle-save");
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn.props.accessibilityLabel).toBe(
      "Save program Strength Foundation",
    );

    fireEvent.press(toggleBtn);
    expect(onToggleSave).toHaveBeenCalledTimes(1);

    // When saved, label updates to Unsave
    rerender(
      <ProgramDetail
        program={sample}
        isSaved={true}
        onToggleSave={onToggleSave}
      />,
    );
    expect(getByTestId("program-detail-toggle-save").props.accessibilityLabel).toBe(
      "Unsave program Strength Foundation",
    );
  });

  it("renders Pause/Resume button, toggles label based on status, and calls onPauseResume", () => {
    const onPauseResume = jest.fn();
    const activeProg = {
      programId: "prog-1",
      programName: "Strength Foundation",
      currentPhase: 1,
      currentDay: "Day 1",
      completedWorkouts: 0,
      totalWorkouts: 4,
      status: "in-progress" as const,
    };

    const { getByTestId, getByText, rerender, queryByTestId } = render(
      <ProgramDetail
        program={sample}
        isEnrolled={true}
        activeProgram={activeProg}
        onPauseResume={onPauseResume}
      />,
    );

    const btn = getByTestId("program-detail-pause-resume");
    expect(btn).toBeTruthy();
    expect(getByText("Pause Program")).toBeTruthy();
    expect(queryByTestId("program-detail-paused-banner")).toBeNull();

    fireEvent.press(btn);
    expect(onPauseResume).toHaveBeenCalledTimes(1);

    // When paused: button says Resume Program and banner is visible
    rerender(
      <ProgramDetail
        program={sample}
        isEnrolled={true}
        activeProgram={{ ...activeProg, status: "paused" }}
        onPauseResume={onPauseResume}
      />,
    );
    expect(getByText("Resume Program")).toBeTruthy();
    expect(getByTestId("program-detail-paused-banner")).toBeTruthy();
  });

  it("renders Delay Schedule button and calls onShift", () => {
    const onShift = jest.fn();
    const activeProg = {
      programId: "prog-1",
      programName: "Strength Foundation",
      currentPhase: 1,
      currentDay: "Day 1",
      completedWorkouts: 0,
      totalWorkouts: 4,
      status: "in-progress" as const,
    };

    const { getByTestId, getByText } = render(
      <ProgramDetail
        program={sample}
        isEnrolled={true}
        activeProgram={activeProg}
        onShift={onShift}
      />,
    );

    const shiftBtn = getByTestId("program-detail-shift");
    expect(shiftBtn).toBeTruthy();
    expect(getByText("Delay Schedule")).toBeTruthy();

    fireEvent.press(shiftBtn);
    expect(onShift).toHaveBeenCalledWith(3);
  });

  it("renders Change start date and Abandon program buttons and calls handlers", () => {
    const onSetStartDate = jest.fn();
    const onAbandon = jest.fn();
    const activeProg = {
      programId: "prog-1",
      programName: "Strength Foundation",
      currentPhase: 1,
      currentDay: "Day 1",
      completedWorkouts: 0,
      totalWorkouts: 4,
      status: "in-progress" as const,
    };

    const { getByTestId } = render(
      <ProgramDetail
        program={sample}
        isEnrolled={true}
        activeProgram={activeProg}
        onSetStartDate={onSetStartDate}
        onAbandon={onAbandon}
      />,
    );

    const dateBtn = getByTestId("program-detail-set-start-date");
    expect(dateBtn).toBeTruthy();
    fireEvent.press(dateBtn);
    expect(onSetStartDate).toHaveBeenCalledTimes(1);

    const abandonBtn = getByTestId("program-detail-abandon");
    expect(abandonBtn).toBeTruthy();
    fireEvent.press(abandonBtn);
    expect(onAbandon).toHaveBeenCalledTimes(1);
  });

  // NP-284: "Started Sep 15, 2026" — the blue start-date link in the hero.
  it("renders the formatted start date as the start-date link label", () => {
    const { getByText } = render(
      <ProgramDetail
        program={sample}
        isEnrolled={true}
        activeProgram={{
          programId: "prog-1",
          programName: "Strength Foundation",
          currentPhase: 1,
          currentDay: "Day 1",
          completedWorkouts: 9,
          totalWorkouts: 13,
          startDate: "2026-09-15",
        }}
        onSetStartDate={() => {}}
      />,
    );
    expect(getByText("Started Sep 15, 2026")).toBeTruthy();
  });

  // NP-284: Schedule + Training Log links — unreachable from native once
  // enrolled before this card.
  it("renders Schedule and Training Log links and calls their handlers", () => {
    const onOpenSchedule = jest.fn();
    const onOpenTrainingLog = jest.fn();
    const { getByTestId, getByText } = render(
      <ProgramDetail
        program={sample}
        isEnrolled={true}
        activeProgram={{
          programId: "prog-1",
          programName: "Strength Foundation",
          currentPhase: 1,
          currentDay: "Day 1",
          completedWorkouts: 9,
          totalWorkouts: 13,
        }}
        onOpenSchedule={onOpenSchedule}
        onOpenTrainingLog={onOpenTrainingLog}
      />,
    );

    expect(getByText("Schedule")).toBeTruthy();
    expect(getByText("Training Log")).toBeTruthy();

    fireEvent.press(getByTestId("program-detail-schedule-link"));
    expect(onOpenSchedule).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId("program-detail-training-log-link"));
    expect(onOpenTrainingLog).toHaveBeenCalledTimes(1);
  });

  // NP-284 point 3: hold the enroll/continue area until the active-program
  // read resolves — never flash "Enroll in program" at an enrolled member.
  it("shows a neutral loading state instead of Enroll in program while activeProgramLoading", () => {
    const { getByTestId, queryByTestId, queryByText } = render(
      <ProgramDetail program={sample} activeProgramLoading={true} />,
    );

    expect(getByTestId("program-detail-start-loading")).toBeTruthy();
    expect(queryByTestId("program-detail-start")).toBeNull();
    expect(queryByText("Enroll in program")).toBeNull();
  });

  // NP-284: "All Programs" and "Calendar" nav pills on the hero.
  it("renders All Programs and Calendar pills and calls their handlers", () => {
    const onBack = jest.fn();
    const onOpenCalendar = jest.fn();
    const { getByTestId, getByText } = render(
      <ProgramDetail program={sample} onBack={onBack} onOpenCalendar={onOpenCalendar} />,
    );

    expect(getByText("All Programs")).toBeTruthy();
    expect(getByText("Calendar")).toBeTruthy();

    fireEvent.press(getByTestId("program-detail-back"));
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId("program-detail-open-calendar"));
    expect(onOpenCalendar).toHaveBeenCalledTimes(1);
  });
});
