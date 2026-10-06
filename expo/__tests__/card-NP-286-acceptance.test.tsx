// NP-286 — PROGRAM JOURNEY: HEADER MISSING AND THE WEB'S GOLD HERO, COLOURED
// STATS AND AMBER PRs RENDERED NEUTRAL.
//
// Full visual pass (native vs web), build d68b84e3:
//   1. The web has a header (back arrow, "Your Journey", program name);
//      native had none (the name sat in the hero only).
//   2. The web hero is amber-tinted with a gold trophy ring and gold
//      "PROGRAM COMPLETE"; stats are coloured (green sessions, blue volume,
//      violet length, amber/success weight change); PR weights amber;
//      "Find My Next Challenge" has a Dumbbell icon and "View Full Training
//      Log" a Calendar icon. Native rendered all of it neutral with no
//      icons.
import { fireEvent, render, within } from "@testing-library/react-native";
import { Calendar, Dumbbell } from "lucide-react-native";
import {
  JOURNEY_TEST_ID,
  ProgramJourney,
  journeyWeightToneClass,
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

describe("(id: np286-header) the recap has a header the web has — back arrow, title, program name", () => {
  it("renders a back button, 'Your Journey' and the program name above the hero", () => {
    const onBack = jest.fn();
    const { getByTestId } = render(
      <ProgramJourney journey={BASE_JOURNEY} onBack={onBack} onFindNext={noop} onViewLog={noop} />,
    );
    expect(getByTestId(`${JOURNEY_TEST_ID}-header-title`)).toHaveTextContent("Your Journey");
    expect(getByTestId(`${JOURNEY_TEST_ID}-header-program`)).toHaveTextContent(
      "Strength Foundation",
    );
    fireEvent.press(getByTestId(`${JOURNEY_TEST_ID}-back`));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("(id: np286-hero) the hero carries the web's gold treatment, not neutral", () => {
  it("'PROGRAM COMPLETE' is the amber accent colour", () => {
    const { getByTestId } = render(
      <ProgramJourney journey={BASE_JOURNEY} onBack={noop} onFindNext={noop} onViewLog={noop} />,
    );
    expect(getByTestId(`${JOURNEY_TEST_ID}-title`).props.className).toContain("text-accent");
  });
});

describe("(id: np286-stats) stat values are coloured like the web's, not neutral", () => {
  it("sessions is green (success), volume is blue (info), length is violet (mind-violet)", () => {
    const { getByTestId } = render(
      <ProgramJourney journey={BASE_JOURNEY} onBack={noop} onFindNext={noop} onViewLog={noop} />,
    );
    expect(getByTestId(`${JOURNEY_TEST_ID}-sessions`).props.className).toContain("text-success");
    expect(getByTestId(`${JOURNEY_TEST_ID}-volume`).props.className).toContain("text-info");
    expect(getByTestId(`${JOURNEY_TEST_ID}-length`).props.className).toContain(
      "text-mind-violet",
    );
  });

  it("a weight INCREASE is amber (accent), a DECREASE is success, and no change is muted", () => {
    expect(
      journeyWeightToneClass({ startLbs: 180, endLbs: 181.5, change: 1.5 }),
    ).toBe("text-accent");
    expect(
      journeyWeightToneClass({ startLbs: 181.5, endLbs: 180, change: -1.5 }),
    ).toBe("text-success");
    expect(journeyWeightToneClass({ startLbs: 180, endLbs: 180, change: 0 })).toBe(
      "text-muted-foreground",
    );
    expect(journeyWeightToneClass(null)).toBe("text-muted-foreground");

    const { getByTestId } = render(
      <ProgramJourney journey={BASE_JOURNEY} onBack={noop} onFindNext={noop} onViewLog={noop} />,
    );
    expect(getByTestId(`${JOURNEY_TEST_ID}-weight-change`).props.className).toContain(
      "text-accent",
    );
  });
});

describe("(id: np286-prs) PR weights are amber, not neutral", () => {
  it("the first PR's weight carries the accent colour", () => {
    const { getByTestId } = render(
      <ProgramJourney journey={BASE_JOURNEY} onBack={noop} onFindNext={noop} onViewLog={noop} />,
    );
    expect(getByTestId(`${JOURNEY_TEST_ID}-pr-0-weight`).props.className).toContain(
      "text-accent",
    );
  });
});

describe("(id: np286-icons) the footer CTAs carry icons like the web's, not bare labels", () => {
  it("'Find My Next Challenge' carries a Dumbbell and 'View Full Training Log' a Calendar", () => {
    const { getByTestId } = render(
      <ProgramJourney journey={BASE_JOURNEY} onBack={noop} onFindNext={noop} onViewLog={noop} />,
    );
    expect(
      within(getByTestId(`${JOURNEY_TEST_ID}-next`)).UNSAFE_getByType(Dumbbell),
    ).toBeTruthy();
    expect(
      within(getByTestId(`${JOURNEY_TEST_ID}-log`)).UNSAFE_getByType(Calendar),
    ).toBeTruthy();
  });
});
