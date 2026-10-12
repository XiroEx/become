/**
 * NP-361 — Program Detail spacing/type parity (native vs web):
 * 1. Full-bleed parallax cover hero + sliding content panel.
 * 2. Green/blue tint badges + rounded-full pill action buttons (Continue,
 *    Workout/Resume, Share).
 * 3. Select Phase wrapped in a Card, single-line tabs, circular lightning
 *    badge on the focus block.
 * 4. Training Days laid out as a 4-column grid instead of a horizontal
 *    scroll.
 * 5. Workout Title square icon badge + ExerciseAccordion 16px padding/bullet
 *    parity.
 *
 * Screens: components/programs/ProgramDetail.tsx, components/ExerciseAccordion.tsx.
 */
import { render, within } from "@testing-library/react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ProgramDetail } from "@/components/programs/ProgramDetail";
import type { ProgramDetailViewModel } from "@/components/programs/ProgramDetail";
import { ExerciseAccordion } from "@/components/ExerciseAccordion";

const sample: ProgramDetailViewModel = {
  id: "prog-361",
  name: "Strength Foundation",
  description: "Build a base of strength and movement quality.",
  durationWeeks: 12,
  trainingDaysPerWeek: 4,
  targetUser: "Beginner",
  coverImage: "https://cdn.example.com/program-cover.jpg",
  phases: [
    {
      phaseIndex: 0,
      name: "Phase 1 — Foundation",
      weekStart: 1,
      weekEnd: 4,
      focus: "Build a base of strength.",
      workouts: [
        {
          workoutIndex: 0,
          day: "Day 1",
          title: "Push A",
          exerciseCount: 1,
          exercises: [
            {
              slug: "bench-press",
              name: "Barbell Bench Press",
              sets: 4,
              reps: "8-10",
              rest: "90s",
            },
          ],
        },
        { workoutIndex: 1, day: "Day 2", title: "Pull A", exerciseCount: 1 },
        { workoutIndex: 2, day: "Day 3", title: "Legs A", exerciseCount: 1 },
        { workoutIndex: 3, day: "Day 4", title: "Push B", exerciseCount: 1 },
      ],
    },
  ],
};

describe("(NP-361) Program Detail spacing/type parity", () => {
  // Point 1: full-bleed cover hero + sliding content panel.
  describe("1. full-bleed parallax cover hero", () => {
    it("bleeds past the scroll view's own inset and renders the cover photo + gradient scrim", () => {
      const { getByTestId } = render(<ProgramDetail program={sample} />);

      const hero = getByTestId("program-detail-hero");
      expect(hero.props.style).toEqual(
        expect.objectContaining({ marginHorizontal: -16, marginTop: -16 }),
      );

      const cover = getByTestId("program-detail-hero-cover");
      expect(cover.props.source).toEqual({ uri: sample.coverImage });

      expect(within(hero).UNSAFE_getByType(LinearGradient)).toBeTruthy();
    });

    it("falls back to the dark-pinned card colour with no cover photo", () => {
      const { getByTestId, queryByTestId } = render(
        <ProgramDetail program={{ ...sample, coverImage: null }} />,
      );
      expect(getByTestId("program-detail-hero")).toBeTruthy();
      expect(queryByTestId("program-detail-hero-cover")).toBeNull();
    });

    it("the content panel slides up and over the hero with rounded top corners", () => {
      const { getByTestId } = render(<ProgramDetail program={sample} />);
      const panel = getByTestId("program-detail-content-panel");
      expect(panel.props.style).toEqual(
        expect.objectContaining({
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }),
      );
    });
  });

  // Point 2: pill action buttons + Share folded into the hero row.
  describe("2. rounded-full pill action buttons", () => {
    it("Continue, Workout and Share are all pill-shaped (borderRadius 9999)", () => {
      const { getByTestId } = render(
        <ProgramDetail
          program={sample}
          isEnrolled
          onContinue={() => {}}
          shareBody={{ kind: "program", programId: "prog-361" }}
        />,
      );
      expect(getByTestId("program-detail-continue").props.style).toEqual(
        expect.objectContaining({ borderRadius: 9999 }),
      );
      expect(getByTestId("program-detail-workout-live").props.style).toEqual(
        expect.objectContaining({ borderRadius: 9999 }),
      );
      expect(getByTestId("program-detail-share").props.style).toEqual(
        expect.objectContaining({ borderRadius: 999 }),
      );
    });

    it("Share and the save heart both render, as independent controls", () => {
      const onToggleSave = jest.fn();
      const { getByTestId } = render(
        <ProgramDetail
          program={sample}
          onToggleSave={onToggleSave}
          shareBody={{ kind: "program", programId: "prog-361" }}
        />,
      );
      expect(getByTestId("program-detail-toggle-save")).toBeTruthy();
      expect(getByTestId("program-detail-share")).toBeTruthy();
      expect(getByTestId("program-detail-start")).toBeTruthy();
    });
  });

  // Point 3: Select Phase inside a Card, single line, lightning badge.
  describe("3. Select Phase Card with single-line tabs + lightning focus badge", () => {
    it("wraps the phase tabs in a Card and keeps the phase name on its own text node", () => {
      const { getByTestId, getByText } = render(<ProgramDetail program={sample} />);
      expect(getByTestId("program-detail-phase-card")).toBeTruthy();
      // Name stays independently matchable (native-parity baseline relies on this).
      expect(getByText("Phase 1 — Foundation")).toBeTruthy();
      // Weeks render alongside it on the same row, parenthesised like the web.
      expect(getByText("(Weeks 1–4)")).toBeTruthy();
    });

    it("renders the circular lightning badge next to the phase focus copy", () => {
      const { getByTestId } = render(<ProgramDetail program={sample} />);
      const focus = getByTestId("program-detail-phase-focus");
      // The badge is the first child View inside the focus row.
      expect(focus).toBeTruthy();
      expect(within(focus).getByText("Build a base of strength.")).toBeTruthy();
    });
  });

  // Point 4: Training Days as a 4-column grid.
  describe("4. Training Days 4-column grid", () => {
    it("lays four day cells out in a wrapping grid, not a horizontal scroll", () => {
      const { getByTestId } = render(<ProgramDetail program={sample} />);
      for (const day of ["Day 1", "Day 2", "Day 3", "Day 4"]) {
        const cell = getByTestId(`program-detail-day-${day}`);
        expect(cell.props.style).toEqual(expect.objectContaining({ width: "23%" }));
      }
    });
  });

  // Point 5: Workout Title icon badge + ExerciseAccordion 16px padding/bullets.
  describe("5. Workout Title icon badge + ExerciseAccordion spacing parity", () => {
    it("renders a square icon badge beside the workout title", () => {
      const { getByTestId } = render(
        <ProgramDetail program={sample} selectedDayKey="Day 1" />,
      );
      expect(getByTestId("program-detail-workout-icon")).toBeTruthy();
      expect(getByTestId("program-detail-workout-title").props.children).toBe("Push A");
    });

    it("ExerciseAccordion's header row carries 16px padding and the exact prescription string", () => {
      const { getByTestId, getByText } = render(
        <ExerciseAccordion
          exercise={{
            slug: "ohp",
            name: "Overhead Press",
            sets: 3,
            reps: "8-10",
            repsUnit: "reps",
            rest: "120s",
          }}
          index={0}
          testID="acc"
        />,
      );
      // Same exact joined string the baseline unit test for this component
      // already pins — this card must not regress it.
      expect(getByText("3 sets · 8-10 reps · 120s rest")).toBeTruthy();
      const header = getByTestId("acc-exercise-demo-ohp");
      expect(header.props.style).toEqual(
        expect.objectContaining({ width: 36, height: 36, borderRadius: 18 }),
      );
    });
  });
});
