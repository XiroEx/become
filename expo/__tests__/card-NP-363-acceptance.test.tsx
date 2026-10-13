// NP-363 — PROGRAM JOURNEY RECAP: spacing/type diff pass (native vs web),
// Android S23 Ultra (One UI 7, font scale 0.9, logical 412x915, DPR 3.5),
// build 24f4e34d.
//
//   1. Header back button: the web's standalone card button is a square
//      36x36 with an 8px radius border; native used the same 36x36 card but
//      a 10px radius.
//   2. Key stats grid: the web lays the four stats out in ONE 2x2 grid with
//      a 12px gap in both directions; native split them into two separate
//      row blocks with an 8px gap.
//   3. Footer CTA: the web's "View Full Training Log" is explicitly bordered
//      (`border border-yellow-500/40 dark:border-zinc-800`); native's ghost
//      button carried no visible border styling.
import { render } from "@testing-library/react-native";
import {
  JOURNEY_TEST_ID,
  ProgramJourney,
} from "@/components/programs/ProgramJourney";
import type { ProgramJourneyResponse } from "@become/api-client";

const noop = () => {};

const BASE_JOURNEY: ProgramJourneyResponse = {
  programName: "Strength Foundation",
  durationWeeks: 8,
  goal: "Build strength",
  totalSessions: 9,
  totalVolumeLbs: 70000,
  weightChange: { startLbs: 180, endLbs: 181.5, change: 1.5 },
  topPRs: [{ name: "Barbell Back Squat", weight: 315, reps: 3, date: "Jul 2, 2026" }],
  startDate: null,
  endDate: null,
};

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean).map(flattenStyle));
  }
  return (style as Record<string, unknown>) ?? {};
}

describe("(id: np363-back) the header back button is a square card button with an 8px radius", () => {
  it("is 36x36 with borderRadius 8 and a 1px border, matching native's card-button dimensions", () => {
    const { getByTestId } = render(
      <ProgramJourney journey={BASE_JOURNEY} onBack={noop} onFindNext={noop} onViewLog={noop} />,
    );
    const back = getByTestId(`${JOURNEY_TEST_ID}-back`);
    const style = flattenStyle(back.props.style);
    expect(style.width).toBe(36);
    expect(style.height).toBe(36);
    expect(style.borderRadius).toBe(8);
    expect(style.borderWidth).toBe(1);
  });
});

describe("(id: np363-grid) the four stat cards sit in one unified 2x2 grid with a 12px gap", () => {
  it("wraps both stat rows in a single grid container with a 12px outer gap and 12px row gaps", () => {
    const { getByTestId } = render(
      <ProgramJourney journey={BASE_JOURNEY} onBack={noop} onFindNext={noop} onViewLog={noop} />,
    );
    const grid = getByTestId(`${JOURNEY_TEST_ID}-stats-grid`);
    const gridStyle = flattenStyle(grid.props.style);
    expect(gridStyle.gap).toBe(12);

    // Both internal rows (sessions/volume, length/weight) share the same
    // 12px gap — the web's `gap-3` column gap.
    const rows = grid.children as { props: { style?: unknown } }[];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(flattenStyle(row.props.style).gap).toBe(12);
    }

    // All four stat testIDs are still present and reachable.
    expect(getByTestId(`${JOURNEY_TEST_ID}-stat-sessions`)).toBeTruthy();
    expect(getByTestId(`${JOURNEY_TEST_ID}-stat-volume`)).toBeTruthy();
    expect(getByTestId(`${JOURNEY_TEST_ID}-stat-length`)).toBeTruthy();
    expect(getByTestId(`${JOURNEY_TEST_ID}-stat-weight`)).toBeTruthy();
  });

  it("drops the Program Length cell but keeps a 12px-gapped grid when durationWeeks is 0", () => {
    const { getByTestId, queryByTestId } = render(
      <ProgramJourney
        journey={{ ...BASE_JOURNEY, durationWeeks: 0 }}
        onBack={noop}
        onFindNext={noop}
        onViewLog={noop}
      />,
    );
    expect(queryByTestId(`${JOURNEY_TEST_ID}-stat-length`)).toBeNull();
    const grid = getByTestId(`${JOURNEY_TEST_ID}-stats-grid`);
    expect(flattenStyle(grid.props.style).gap).toBe(12);
  });
});

describe("(id: np363-log-border) 'View Full Training Log' carries a visible border, not a bare ghost button", () => {
  it("renders with a 1px border using the border token, matching the web's bordered secondary CTA", () => {
    const { getByTestId } = render(
      <ProgramJourney journey={BASE_JOURNEY} onBack={noop} onFindNext={noop} onViewLog={noop} />,
    );
    const log = getByTestId(`${JOURNEY_TEST_ID}-log`);
    expect(log.props.className).toContain("border");
    const style = flattenStyle(log.props.style);
    expect(style.borderWidth).toBe(1);
    expect(style.borderColor).toBeTruthy();
  });
});
