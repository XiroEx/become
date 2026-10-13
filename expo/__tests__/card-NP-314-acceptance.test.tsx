// ─── Android: Pressable style callbacks render unstyled (NP-314) ────────────
//
// Full visual pass (native vs web), Android S23 Ultra (One UI 7, font scale
// 0.9), build 24f4e34d: every `Pressable` whose `style` prop was a FUNCTION
// (`style={({ pressed }) => [...]}`) rendered with none of those styles on
// device — children render, the container style does not. That dropped the
// Mindset card's "Training Grounds ->" button to invisible, stacked Up Next's
// icon/title/subtitle/chevron into a column, drew the Becoming door with no
// card/border/padding, and stacked the Training Log and Personal Records
// rows (and lost the "Correct this workout" button's border/background).
//
// `__tests__/noStyleCallbacks.test.ts` is the blanket source-level ban (the
// mechanical fix: no component anywhere passes a function to `style`). This
// file pins the SPECIFIC layouts the card calls out, on the fixed
// components, so a future refactor that reintroduces a callback — or just
// drops a static style by accident — fails here even though RN's test
// renderer would have happily evaluated the broken callback version too.

import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { MindsetCard } from "@/components/dashboard/MindsetCard";
import { UpNextCard } from "@/components/dashboard/UpNextCard";
import { BecomingDoor } from "@/components/dashboard/BecomingDoor";
import type { MindSummaryResponse } from "@become/api-client";
import type { UpcomingWorkoutSummary } from "@/lib/dashboard/types";

function flat(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style as never) as Record<string, unknown>;
}

const MOCK_SUMMARY: MindSummaryResponse = {
  todayKey: "2026-10-06",
  level: 4,
  levelPct: 45,
  chapter: 2,
  chapterName: "The Foundation",
  sessionsIntoChapter: 3,
  sessionsPerChapter: 5,
  sessionDoneToday: false,
  mainSessionAvailable: true,
  sessionsLast7Days: 3,
  moodCheckinsLast7Days: 4,
  todayMood: null,
  lastState: null,
};

const WORKOUT: UpcomingWorkoutSummary = {
  dateLabel: "Tomorrow",
  dayLabel: "Day 1",
  workoutTitle: "Full Body",
  programName: "Starter",
  programId: "prog-1",
  workoutIndex: 0,
  phase: 1,
};

describe("NP-314: no style-callback Pressable renders unstyled", () => {
  it("MindsetCard's 'Training Grounds ->' CTA keeps its solid fill (not background-coloured text)", () => {
    const { getByTestId } = render(<MindsetCard summary={MOCK_SUMMARY} />);
    const cta = flat(getByTestId("mindset-cta").props.style);
    // The web's CTA is a solid button: background present, not transparent
    // or undefined (the exact regression — the callback's backgroundColor
    // never reached the Pressable, so Android drew it as plain text).
    expect(cta.backgroundColor).toBeTruthy();
    expect(cta.flexDirection).toBe("row");
    expect(cta.alignItems).toBe("center");
    expect(cta.justifyContent).toBe("center");
  });

  it("UpNextCard draws one row (icon, title/subtitle, chevron) — not a stacked column", () => {
    const { getByTestId } = render(<UpNextCard workout={WORKOUT} />);
    const row = flat(getByTestId("up-next-card").props.style);
    expect(row.flexDirection).toBe("row");
    expect(row.alignItems).toBe("center");
    // Web's tinted row: a visible fill and border, not drawn on bare page bg.
    expect(row.backgroundColor).toBeTruthy();
    expect(row.borderColor).toBeTruthy();
  });

  it("BecomingDoor keeps its card: background, border AND padding, not bare page content", () => {
    const { getByTestId } = render(<BecomingDoor goals={null} mind={null} />);
    const card = flat(getByTestId("becoming-door").props.style);
    expect(card.backgroundColor).toBeTruthy();
    expect(card.borderColor).toBeTruthy();
    expect(card.borderWidth).toBeGreaterThan(0);
    expect(card.padding).toBeGreaterThan(0);
  });
});
