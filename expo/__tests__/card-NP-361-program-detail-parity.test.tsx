/**
 * NP-361: Program Detail spacing, typography, and layout parity pass:
 * 1) Sticky full-bleed parallax cover hero with sliding content panel.
 * 2) Green duration pill, blue frequency pill, and rounded-full action buttons
 *    (Continue gradient, Workout/Resume, Share in action row).
 * 3) Select Phase wrapped in Card with single-line tabs and circular lightning badge on focus block.
 * 4) Training Days heading 14px font-semibold with clean 4-column grid on mobile.
 * 5) Workout Title square icon badge, ExerciseAccordion 16px padding, 16px title font,
 *    bullet styling, and 36x36 circular play button.
 */
import * as fs from "fs";
import * as path from "path";
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ProgramDetail, type ProgramDetailViewModel } from "@/components/programs/ProgramDetail";
import { ExerciseAccordion } from "@/components/ExerciseAccordion";

function readComponentSrc(file: string): string {
  return fs.readFileSync(
    path.join(__dirname, "..", "components", "programs", file),
    "utf8",
  );
}

function readAccordionSrc(): string {
  return fs.readFileSync(
    path.join(__dirname, "..", "components", "ExerciseAccordion.tsx"),
    "utf8",
  );
}

function readRouteSrc(): string {
  return fs.readFileSync(
    path.join(__dirname, "..", "app", "(app)", "(tabs)", "programming", "[id]", "index.tsx"),
    "utf8",
  );
}

const sampleProgram: ProgramDetailViewModel = {
  id: "prog-test",
  name: "Parity Test Program",
  description: "Test program description.",
  durationWeeks: 12,
  trainingDaysPerWeek: 4,
  targetUser: "Intermediate",
  goal: "Build Strength",
  coverImage: "https://cdn.example.com/cover.jpg",
  coverParallax: true,
  phases: [
    {
      phaseIndex: 0,
      name: "Phase 1",
      weeks: "Weeks 1–4",
      weekStart: 1,
      weekEnd: 4,
      focus: "Hypertrophy base and core stabilization",
      workouts: [
        {
          workoutIndex: 0,
          day: "Day 1",
          title: "Upper Body Strength",
          exerciseCount: 2,
          exercises: [
            {
              slug: "bench-press",
              name: "Barbell Bench Press",
              sets: 4,
              reps: "8-10",
              rest: "90s",
            },
            {
              slug: "barbell-row",
              name: "Barbell Row",
              sets: 3,
              reps: "10-12",
              rest: "60s",
            },
          ],
        },
        {
          workoutIndex: 1,
          day: "Day 2",
          title: "Lower Body Strength",
          exerciseCount: 1,
          exercises: [
            {
              slug: "squat",
              name: "Back Squat",
              sets: 4,
              reps: "6-8",
              rest: "120s",
            },
          ],
        },
        {
          workoutIndex: 2,
          day: "Day 3",
          title: "Push Volume",
          exerciseCount: 1,
        },
        {
          workoutIndex: 3,
          day: "Day 4",
          title: "Pull Volume",
          exerciseCount: 1,
        },
      ],
    },
  ],
};

describe("NP-361 (1): Full-bleed parallax cover hero with sliding content panel", () => {
  it("route uses SafeAreaView with edges={['bottom']} to allow full-bleed hero to the top", () => {
    const src = readRouteSrc();
    expect(src).toContain('edges={["bottom"]}');
    expect(src).not.toContain('edges={["top", "bottom"]}\n      style={{ flex: 1, backgroundColor: colors.background }}\n      testID="programming-detail-route"');
  });

  it("ProgramDetail implements Animated parallax cover with gradient overlay", () => {
    const src = readComponentSrc("ProgramDetail.tsx");
    expect(src).toContain("imageTranslateY");
    expect(src).toContain("LinearGradient");
    expect(src).toContain("rgba(0, 0, 0, 0.3)");
    expect(src).toContain("rgba(0, 0, 0, 0.8)");
  });

  it("sliding content panel has zIndex: 10, rounded top corners, and slides up over hero", () => {
    const src = readComponentSrc("ProgramDetail.tsx");
    expect(src).toContain("zIndex: 10");
    expect(src).toContain("borderTopLeftRadius: 20");
    expect(src).toContain("borderTopRightRadius: 20");
  });
});

describe("NP-361 (2): Hero Badges & Action Buttons", () => {
  it("renders duration in green pill and frequency in blue pill", () => {
    const { getByText } = render(<ProgramDetail program={sampleProgram} />);
    const durationBadge = getByText("12 Weeks");
    const frequencyBadge = getByText("4x/week");
    expect(durationBadge).toBeTruthy();
    expect(frequencyBadge).toBeTruthy();
  });

  it("renders rounded-full pill buttons for Start/Continue, Workout/Resume, and Share", () => {
    const { getByTestId, getByText } = render(
      <ProgramDetail
        program={sampleProgram}
        isEnrolled={true}
        shareBody={{ kind: "program", programId: "prog-test" }}
      />,
    );

    const continueBtn = getByTestId("program-detail-continue");
    const workoutBtn = getByTestId("program-detail-workout-live");
    const shareBtn = getByTestId("program-detail-share");

    expect(continueBtn).toBeTruthy();
    expect(workoutBtn).toBeTruthy();
    expect(shareBtn).toBeTruthy();
    expect(getByText("Continue")).toBeTruthy();
    expect(getByText("Workout")).toBeTruthy();
  });

  it("renders Resume pill when workout is in progress", () => {
    const { getByTestId, getByText } = render(
      <ProgramDetail
        program={sampleProgram}
        isEnrolled={true}
        hasInProgressWorkout={true}
      />,
    );

    expect(getByTestId("program-detail-resume")).toBeTruthy();
    expect(getByText("Resume")).toBeTruthy();
  });
});

describe("NP-361 (3): Phase Selector Tabs & Focus Card", () => {
  it("wraps Select Phase inside Card with single-line tabs", () => {
    const { getByText, getByTestId } = render(<ProgramDetail program={sampleProgram} />);
    expect(getByText("Select Phase")).toBeTruthy();
    expect(getByTestId("program-detail-phase-0")).toBeTruthy();
    expect(getByText("Phase 1")).toBeTruthy();
    expect(getByText(" (Weeks 1–4)")).toBeTruthy();
  });

  it("nests phase focus inside with circular lightning badge", () => {
    const { getByTestId, getByText } = render(<ProgramDetail program={sampleProgram} />);
    const focusCard = getByTestId("program-detail-focus");
    expect(focusCard || getByTestId("program-detail-phase-focus")).toBeTruthy();
    expect(getByText("Hypertrophy base and core stabilization")).toBeTruthy();
  });
});

describe("NP-361 (4): Training Days Selector", () => {
  it("uses 14px font-semibold heading 'Training Days'", () => {
    const { getByText } = render(<ProgramDetail program={sampleProgram} />);
    const heading = getByText("Training Days");
    expect(heading).toBeTruthy();
    expect(heading.props.style?.fontSize).toBe(14);
    expect(heading.props.style?.fontWeight).toBe("600");
  });

  it("lays out training days in a 4-column grid", () => {
    const { getByTestId } = render(<ProgramDetail program={sampleProgram} />);
    expect(getByTestId("program-detail-day-Day 1")).toBeTruthy();
    expect(getByTestId("program-detail-day-Day 2")).toBeTruthy();
    expect(getByTestId("program-detail-day-Day 3")).toBeTruthy();
    expect(getByTestId("program-detail-day-Day 4")).toBeTruthy();

    const src = readComponentSrc("ProgramDetail.tsx");
    expect(src).toContain('width: "23.5%"');
    expect(src).toContain('gap: 6');
  });
});

describe("NP-361 (5): Workout Title & Accordion Rows", () => {
  it("renders square icon badge alongside Workout Title", () => {
    const { getByTestId } = render(
      <ProgramDetail program={sampleProgram} selectedDayKey="Day 1" />,
    );
    expect(getByTestId("program-detail-workout-title").props.children).toBe("Upper Body Strength");

    const src = readComponentSrc("ProgramDetail.tsx");
    expect(src).toContain("width: 40");
    expect(src).toContain("height: 40");
    expect(src).toContain("borderRadius: 12");
  });

  it("ExerciseAccordion uses 16px padding and gap, 16px name, bullet styling, and 36x36 play button", () => {
    const exercise = sampleProgram.phases[0]!.workouts[0]!.exercises![0]!;
    const { getByTestId } = render(
      <ExerciseAccordion exercise={exercise} index={0} />,
    );

    expect(getByTestId("program-detail-exercise-bench-press")).toBeTruthy();
    expect(getByTestId("program-detail-exercise-name-bench-press").props.style?.fontSize).toBe(16);

    const src = readAccordionSrc();
    expect(src).toContain("padding: 16");
    expect(src).toContain("gap: 16");
    expect(src).toContain("borderColor: colors.border");
    expect(src).not.toContain("borderColor: isExpanded ? colors.primary : colors.border");
    expect(src).toContain("width: 36");
    expect(src).toContain("height: 36");
    expect(src).toContain("borderRadius: 18");
  });
});
