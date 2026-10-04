/* eslint-disable import/first */
// THE PROGRAM JOURNEY RECAP (NP-167).
//
// The web finishes a program with a recap — `webapp/app/dashboard/workout/
// [programId]/journey/page.tsx` over `GET /api/programs/[programId]/journey`:
// sessions, total volume, weight change and the top PRs. Native had nothing;
// the program-complete summary's "See Your Full Journey" secondary (NP-086)
// went back to the program screen. This suite pins the port:
//
//   • (e015ca67) the recap carries the web's numbers — the route fetches the
//     same endpoint and parses it with the shared schema (no client
//     recomputation), and the volume / weight-change formatters mirror the
//     web page's expressions exactly;
//   • (e015ca68) the recap shows all four sections with the web's empty
//     states, and every colour comes from a Tailwind class or
//     `useThemeTokens()` — no hex, no rgb() — so it reads in light and dark
//     mode.

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string | undefined> = { id: "p1" };
let mockCanGoBack = true;

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "member-1", email: "member@example.com" },
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@/lib/hooks/useFetch", () => ({
  useFetch: jest.fn(),
}));

import * as fs from "fs";
import * as path from "path";
import { fireEvent, render } from "@testing-library/react-native";
import { useFetch } from "@/lib/hooks/useFetch";
import {
  ProgramJourneyResponseSchema,
  type ProgramJourneyResponse,
} from "@become/api-client";
import {
  JOURNEY_ENDPOINT,
  ProgramJourney,
  formatJourneyVolume,
  formatJourneyWeightChange,
} from "@/components/programs/ProgramJourney";
import JourneyRoute from "@/app/(app)/(tabs)/programming/[id]/journey";
/* eslint-enable import/first */

const mockUseFetch = useFetch as unknown as jest.Mock;

const EXPO_DIR = path.resolve(__dirname, "..");

const FULL_JOURNEY: ProgramJourneyResponse = {
  programName: "Strength Foundation",
  durationWeeks: 8,
  goal: "gain_muscle",
  totalSessions: 24,
  totalVolumeLbs: 84300,
  weightChange: { startLbs: 180.2, endLbs: 185, change: 4.8 },
  topPRs: [
    { name: "Barbell Bench Press", weight: 225, reps: 5, date: "Jun 3, 2026" },
    { name: "Back Squat", weight: 315, reps: 3, date: "Jun 1, 2026" },
  ],
  startDate: "April 6, 2026",
  endDate: "May 31, 2026",
};

const noop = () => {};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: "p1" };
  mockCanGoBack = true;
  mockUseFetch.mockReturnValue({
    data: FULL_JOURNEY,
    error: null,
    loading: false,
    refetch: jest.fn(),
    isCached: false,
  });
});

describe("the recap carries the web's numbers (id: e015ca67)", () => {
  it("the endpoint is the web's journey endpoint", () => {
    expect(JOURNEY_ENDPOINT("p1")).toBe("/api/programs/p1/journey");
    expect(JOURNEY_ENDPOINT("a b")).toBe("/api/programs/a%20b/journey");
  });

  it("the shared schema parses the server's answer", () => {
    const parsed = ProgramJourneyResponseSchema.safeParse(FULL_JOURNEY);
    expect(parsed.success).toBe(true);
  });

  it("volume and weight-change formatters mirror the web page's expressions", () => {
    // Web: `${(totalVolumeLbs / 1000).toFixed(1)}k`, "—" when empty.
    expect(formatJourneyVolume(84300)).toBe("84.3k");
    expect(formatJourneyVolume(0)).toBe("—");
    // Web: `{change > 0 ? "+" : ""}{change} lbs`.
    expect(formatJourneyWeightChange(4.8)).toBe("+4.8 lbs");
    expect(formatJourneyWeightChange(-2)).toBe("-2 lbs");
    expect(formatJourneyWeightChange(0)).toBe("0 lbs");
  });

  it("the route fetches the journey endpoint and offers both CTAs", () => {
    const { getByTestId } = render(<JourneyRoute />);
    expect(mockUseFetch).toHaveBeenCalled();
    const firstCall = mockUseFetch.mock.calls[0] as unknown[];
    const calledPath = firstCall[0] as string | null;
    const calledSchema = firstCall[1] as unknown;
    expect(calledPath).toBe("/api/programs/p1/journey");
    expect(calledSchema).toBe(ProgramJourneyResponseSchema);
    // The server's numbers reach the screen unmodified.
    expect(getByTestId("program-journey-sessions").props.children).toBe("24");
    expect(getByTestId("program-journey-volume").props.children).toBe("84.3k");
    expect(getByTestId("program-journey-weight-change").props.children).toBe(
      "+4.8 lbs",
    );
    expect(getByTestId("program-journey-pr-0-name").props.children).toBe(
      "Barbell Bench Press",
    );
    // Both CTAs are wired.
    fireEvent.press(getByTestId("program-journey-next"));
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/programming");
    fireEvent.press(getByTestId("program-journey-log"));
    expect(mockReplace).toHaveBeenCalledWith("/progress");
  });

  it("the summary's journey secondary opens the recap route", () => {
    const live = fs.readFileSync(
      path.join(
        EXPO_DIR,
        "app",
        "(app)",
        "(tabs)",
        "programming",
        "[id]",
        "workout",
        "[idx]",
        "live.tsx",
      ),
      "utf8",
    );
    expect(live).toContain("/journey");
  });
});

describe("the recap shows every section and reads in both modes (id: e015ca68)", () => {
  it("renders sessions, volume, weight change and the top PRs", () => {
    const { getByTestId } = render(
      <ProgramJourney journey={FULL_JOURNEY} onFindNext={noop} onViewLog={noop} />,
    );
    expect(getByTestId("program-journey-title")).toBeTruthy();
    expect(getByTestId("program-journey-program-name").props.children).toBe(
      "Strength Foundation",
    );
    expect(getByTestId("program-journey-hero-title")).toBeTruthy();
    expect(getByTestId("program-journey-stats")).toBeTruthy();
    expect(getByTestId("program-journey-sessions").props.children).toBe("24");
    expect(getByTestId("program-journey-volume").props.children).toBe("84.3k");
    expect(getByTestId("program-journey-weight-change").props.children).toBe(
      "+4.8 lbs",
    );
    expect(getByTestId("program-journey-prs")).toBeTruthy();
    expect(getByTestId("program-journey-pr-0-weight").props.children).toBe(
      "225 lbs",
    );
    expect(getByTestId("program-journey-ctas")).toBeTruthy();
  });

  it("keeps the web's empty states: — volume, no-data weight, no PR section", () => {
    const empty: ProgramJourneyResponse = {
      programName: "Program",
      durationWeeks: 4,
      totalSessions: 0,
      totalVolumeLbs: 0,
      weightChange: null,
      topPRs: [],
      startDate: null,
      endDate: null,
    };
    const { getByTestId, queryByTestId } = render(
      <ProgramJourney journey={empty} onFindNext={noop} onViewLog={noop} />,
    );
    expect(getByTestId("program-journey-volume").props.children).toBe("—");
    expect(getByTestId("program-journey-weight-change").props.children).toBe(
      "—",
    );
    expect(queryByTestId("program-journey-prs")).toBeNull();
  });

  it("shows the error copy when the journey will not load", () => {
    mockUseFetch.mockReturnValue({
      data: null,
      error: new Error("nope"),
      loading: false,
      refetch: jest.fn(),
      isCached: false,
    });
    const { getByTestId } = render(<JourneyRoute />);
    expect(getByTestId("program-journey-error")).toBeTruthy();
  });

  it("paints no colour literal: every colour is a class or a theme token", () => {
    for (const rel of [
      "components/programs/ProgramJourney.tsx",
      "app/(app)/(tabs)/programming/[id]/journey.tsx",
    ]) {
      const src = fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
      expect(code).not.toMatch(
        /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z])/,
      );
      expect(code).not.toMatch(/["'`]\s*rgba?\(\s*\d/);
    }
  });
});
