// ─── Track Workout View Spacing / Typography Parity (NP-364) ──────────────
//
// Aligns native Track Workout View with web source of truth:
//   1. Sticky Top Header Bar: the header (Back, Track|Live toggle, Share,
//      title/day, Workout Progress bar) lives OUTSIDE the ScrollView — a
//      fixed sibling with a bottom border — so it stays on screen while
//      scrolling through the workout instead of scrolling away with it.
//   2. Progress Bar & PRs Link: `View PRs →` reads in the web's blue-500
//      accent, not a muted grey.
//   3. Exercise Cards & Set Table: the exercise card keeps 16px (`p-4`)
//      padding and a `SET · REPS · DONE` 11px uppercase table header row
//      above the set grid.
//   4. Superset / Group Blocks: the group container is 16px (`p-4`)
//      padded, and the group label renders as a solid-colour pill badge
//      (white text on the group's accent colour) rather than plain text.

import { render, within } from "@testing-library/react-native";
import { ScrollView } from "react-native";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

const baseWorkout: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Push A",
  exercises: [
    { slug: "bench", name: "Barbell Bench Press", sets: 3, repsLabel: "5-8" },
  ],
};

const groupedWorkout: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Push A",
  exercises: [
    {
      slug: "db-bench",
      name: "Dumbbell Bench Press",
      sets: 2,
      groupId: "g1",
      groupLabel: "Superset A",
      groupType: "superset",
    },
    {
      slug: "db-row",
      name: "Dumbbell Bent-Over Row",
      sets: 2,
      groupId: "g1",
      groupLabel: "Superset A",
      groupType: "superset",
    },
  ],
};

describe("NP-364 Track Workout View Spacing & Typography Parity", () => {
  describe("1. Sticky Top Header Bar", () => {
    it("renders the header as a sibling OUTSIDE the ScrollView, with a border-b style", () => {
      const onExit = jest.fn();
      const { getByTestId, UNSAFE_getByType } = render(
        <LiveWorkoutClient workout={baseWorkout} onExit={onExit} />,
      );

      const header = getByTestId("live-workout-header");
      expect(header).toBeTruthy();
      expect(header.props.className).toContain("border-b");

      const scrollView = UNSAFE_getByType(ScrollView);
      // The header is NOT inside the ScrollView...
      expect(within(scrollView).queryByTestId("live-workout-header")).toBeNull();
      // ...while the grid it scrolls to IS.
      expect(within(scrollView).getByTestId("live-workout-track")).toBeTruthy();

      // The pieces that used to scroll away stay reachable without scrolling.
      expect(within(header).getByTestId("live-workout-back")).toBeTruthy();
      expect(within(header).getByTestId("live-workout-view")).toBeTruthy();
      expect(within(header).getByTestId("live-workout-overall-progress")).toBeTruthy();
    });
  });

  describe("2. Progress Bar & PRs Link", () => {
    it("styles `View PRs →` in the web's blue-500 accent, not a muted grey", () => {
      const onViewPRs = jest.fn();
      const { getByTestId } = render(
        <LiveWorkoutClient workout={baseWorkout} onViewPRs={onViewPRs} />,
      );
      const link = getByTestId("live-workout-view-prs");
      const text = within(link).getByText("View PRs →");
      expect(text.props.className).toContain("text-blue-500");
      expect(text.props.className).not.toContain("text-muted-foreground");
    });
  });

  describe("3. Exercise Cards & Set Table", () => {
    it("keeps 16px (p-4) card padding and renders the SET · REPS · DONE table header", () => {
      const { getByTestId } = render(<LiveWorkoutClient workout={baseWorkout} />);
      const card = getByTestId("live-workout-exercise-bench");
      expect(card.props.className).toContain("p-4");

      const header = getByTestId("live-workout-bench-set-table-header");
      expect(header.props.children).toBe("SET · REPS · DONE");
      expect(header.props.className).toContain("text-[11px]");
      expect(header.props.className).toContain("uppercase");
      expect(header.props.className).toContain("tracking-wider");
    });
  });

  describe("4. Superset / Group Blocks", () => {
    it("pads the group container 16px (p-4) and renders the group label as a solid pill badge", () => {
      const { getByTestId } = render(<LiveWorkoutClient workout={groupedWorkout} />);
      const block = getByTestId("live-workout-group-g1-block");
      expect(block.props.className).toContain("p-4");

      const badge = getByTestId("live-workout-group-g1-badge");
      expect(badge.props.className).toContain("rounded-full");
      expect(badge.props.className).toContain("bg-purple-500");

      // The label itself keeps its pre-existing testID/children contract
      // (NP-287 coverage reads it as a plain string) — just moved inside
      // the pill, white text on the fill.
      const label = within(badge).getByTestId("live-workout-group-g1");
      expect(label.props.children).toBe("Superset A");
      expect(label.props.className).toContain("text-white");
    });
  });
});
