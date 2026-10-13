/**
 * NP-257: the dashboard's Up Next card drew its icon tile, "Calendar" link and
 * chevrons in the brand red (`colors.primary`) — the web's `NextWorkoutCard`
 * uses blue throughout (`text-blue-500`/`text-blue-600`, `bg-blue-50/100`).
 * Pins the native port to the same `info` (blue) token.
 */
import React from "react";
import { act, render } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { Dumbbell } from "lucide-react-native";
import { UpNextCard } from "@/components/dashboard/UpNextCard";
import { darkTokens } from "@/lib/theme/tokens";
import type { UpcomingWorkoutSummary } from "@/lib/dashboard/types";

function setSystemScheme(mode: "light" | "dark"): void {
  act(() => {
    colorScheme.set(mode);
  });
}

const WORKOUT: UpcomingWorkoutSummary = {
  dateLabel: "Wed, Oct 7",
  dayLabel: "Day 1",
  workoutTitle: "Upper Body",
  programName: "Strength Block",
  programId: "prog-1",
  workoutIndex: 0,
  phase: 1,
};

describe("NP-257: Up Next card is blue, like the web's NextWorkoutCard", () => {
  it("colours the Calendar link with the info (blue) token, not the brand red", () => {
    setSystemScheme("dark");
    const { getByText } = render(<UpNextCard workout={WORKOUT} />);
    const calendarText = getByText("Calendar");
    const color = [calendarText.props.style]
      .flat(Infinity)
      .find((s) => s?.color)?.color;
    expect(color).toBe(`rgb(${darkTokens.info})`);
  });

  it("colours the workout icon with the info (blue) token", () => {
    setSystemScheme("dark");
    const { UNSAFE_getByType } = render(<UpNextCard workout={WORKOUT} />);
    const icon = UNSAFE_getByType(Dumbbell);
    expect(icon.props.color).toBe(`rgb(${darkTokens.info})`);
  });
});
