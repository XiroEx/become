/* eslint-disable import/first */
// PROGRAM JOURNEY RECAP (NP-167): the end-of-program recap after the last
// workout of a program.
//
// The web links its program-complete summary to
// `/dashboard/workout/[programId]/journey`, which reads
// `GET /api/programs/[programId]/journey` (sessions, total volume, weight
// change, top PRs). This suite pins the native port:
//
//   • (e015ca67) completing a program natively offers the recap with the same
//     numbers as the web — the route fetches the same endpoint through the
//     shared schema (no client recomputation), the formatters mirror the web
//     page's expressions exactly, and the summary CTA pushes the journey
//     route;
//   • (e015ca68) the recap shows sessions, total volume, weight change and
//     the top PRs, and reads in light and dark mode — every colour comes from
//     a Tailwind class or `useThemeTokens()` (no literals), and the screen
//     renders under both system schemes.

jest.mock("expo-secure-store", () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    async getItemAsync(key: string): Promise<string | null> {
      return mem.has(key) ? (mem.get(key) as string) : null;
    },
    async setItemAsync(_key: string, _value: string): Promise<void> {},
    async deleteItemAsync(_key: string): Promise<void> {},
  };
});

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));

const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: mockToken,
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import * as fs from "fs";
import * as path from "path";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { apiFetch, ProgramJourneyResponseSchema } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { resolveWebPath } from "@/lib/navigation/webPathToRoute";
import {
  formatJourneyVolume,
  journeyWeightSub,
  formatJourneyWeightChange,
  ProgramJourney,
  JOURNEY_TEST_ID,
} from "@/components/programs/ProgramJourney";
import ProgramJourneyRoute from "../app/(app)/(tabs)/programming/[id]/journey";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const JOURNEY = {
  programName: "Strength Foundation",
  durationWeeks: 8,
  goal: "Build strength",
  totalSessions: 14,
  totalVolumeLbs: 84250,
  weightChange: { startLbs: 180.4, endLbs: 185.2, change: 4.8 },
  topPRs: [
    { name: "Barbell Back Squat", weight: 315, reps: 3, date: "Jul 2, 2026" },
    { name: "Bench Press", weight: 225, reps: 5, date: "Jul 10, 2026" },
  ],
  startDate: "June 1, 2026",
  endDate: "July 26, 2026",
};

const noop = () => {};

function setSystemScheme(mode: "light" | "dark"): void {
  act(() => {
    colorScheme.set(mode);
  });
}

describe("the recap carries the web's numbers", () => {
  it("the shared schema parses the web's journey payload", () => {
    const parsed = ProgramJourneyResponseSchema.safeParse(JOURNEY);
    expect(parsed.success).toBe(true);
    // The empty recap (no completed sessions) parses too.
    expect(
      ProgramJourneyResponseSchema.safeParse({
        programName: "Strength Foundation",
        durationWeeks: 8,
        totalSessions: 0,
        totalVolumeLbs: 0,
        weightChange: null,
        topPRs: [],
        startDate: null,
        endDate: null,
      }).success,
    ).toBe(true);
  });

  it("the formatters mirror the web page's expressions exactly", () => {
    // Web: `totalVolumeLbs > 0 ? `${(v/1000).toFixed(1)}k` : "—"`.
    expect(formatJourneyVolume(84250)).toBe("84.3k");
    expect(formatJourneyVolume(0)).toBe("—");
    // Web: `{change > 0 ? "+" : ""}{change} lbs`, `{start} → {end} lbs`.
    expect(formatJourneyWeightChange(JOURNEY.weightChange)).toBe("+4.8 lbs");
    expect(formatJourneyWeightChange({ startLbs: 185.2, endLbs: 180.4, change: -4.8 })).toBe(
      "-4.8 lbs",
    );
    expect(journeyWeightSub(JOURNEY.weightChange)).toBe("180.4 → 185.2 lbs");
  });

  it("(id: e015ca67) the route fetches the journey endpoint and offers both CTAs", async () => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockBack.mockReset();
    mockApiFetch.mockResolvedValue(JOURNEY);
    mockParams = { id: "p1" };

    const { getByTestId } = render(<ProgramJourneyRoute />);
    await waitFor(() => {
      expect(getByTestId(`${JOURNEY_TEST_ID}-sessions`)).toBeTruthy();
    });

    // The route reads the same endpoint the web page reads, through the
    // shared schema — `useFetch` calls `apiFetch(path, schema, opts)`, so the
    // path is the first arg and the token rides in the options.
    const journeyCalls = mockApiFetch.mock.calls.filter(
      (c) => String(c[0]) === "/api/programs/p1/journey",
    );
    expect(journeyCalls.length).toBeGreaterThan(0);
    const opts = journeyCalls[0]![2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);

    // The numbers on screen are the server's numbers, formatted the web's way.
    expect(getByTestId(`${JOURNEY_TEST_ID}-sessions`).props.children).toBe("14");
    expect(getByTestId(`${JOURNEY_TEST_ID}-volume`).props.children).toBe("84.3k");
    expect(getByTestId(`${JOURNEY_TEST_ID}-weight-change`).props.children).toBe(
      "+4.8 lbs",
    );
    expect(getByTestId(`${JOURNEY_TEST_ID}-pr-0-weight`).props.children).toBe(
      "315 lbs",
    );

    // Both CTAs are wired: next challenge → Workout tab, log → Training Log.
    fireEvent.press(getByTestId(`${JOURNEY_TEST_ID}-next`));
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/programming");
    fireEvent.press(getByTestId(`${JOURNEY_TEST_ID}-log`));
    expect(mockReplace).toHaveBeenCalledWith("/progress");
    // The header's back arrow (NP-286) is wired to `router.back()`.
    fireEvent.press(getByTestId(`${JOURNEY_TEST_ID}-back`));
    expect(mockBack).toHaveBeenCalled();
  });

  it("the web journey path resolves to the native journey screen", () => {
    const target = resolveWebPath("/dashboard/workout/p1/journey");
    expect(target.kind).toBe("native");
    if (target.kind !== "native") return;
    expect(target.href).toBe("/(tabs)/programming/p1/journey");
    expect(target.fallback).toBe("exact");
  });
});

describe("the recap reads in both modes", () => {
  beforeEach(() => {
    setSystemScheme("dark");
  });

  afterEach(() => {
    setSystemScheme("dark");
  });

  it("(id: e015ca68) renders sessions, volume, weight change and the top PRs", () => {
    const { getByTestId, queryByTestId } = render(
      <ProgramJourney journey={JOURNEY} onBack={noop} onFindNext={noop} onViewLog={noop} />,
    );
    expect(getByTestId(`${JOURNEY_TEST_ID}-title`)).toHaveTextContent(
      "PROGRAM COMPLETE",
    );
    expect(getByTestId(`${JOURNEY_TEST_ID}-sessions`).props.children).toBe("14");
    expect(getByTestId(`${JOURNEY_TEST_ID}-volume`).props.children).toBe("84.3k");
    expect(getByTestId(`${JOURNEY_TEST_ID}-weight-change`).props.children).toBe(
      "+4.8 lbs",
    );
    expect(getByTestId(`${JOURNEY_TEST_ID}-weight-range`)).toHaveTextContent(
      "180.4 → 185.2 lbs",
    );
    expect(getByTestId(`${JOURNEY_TEST_ID}-pr-0-name`)).toHaveTextContent(
      "Barbell Back Squat",
    );
    expect(getByTestId(`${JOURNEY_TEST_ID}-pr-0-weight`).props.children).toBe(
      "315 lbs",
    );
    expect(getByTestId(`${JOURNEY_TEST_ID}-pr-0-reps`)).toHaveTextContent(
      "× 3 reps",
    );
    expect(getByTestId(`${JOURNEY_TEST_ID}-next`)).toHaveTextContent(
      "Find My Next Challenge",
    );
    expect(getByTestId(`${JOURNEY_TEST_ID}-log`)).toHaveTextContent(
      "View Full Training Log",
    );
    // The PR section is absent — not empty — when there are no PRs, as on web.
    const empty = render(
      <ProgramJourney
        journey={{ ...JOURNEY, topPRs: [], totalVolumeLbs: 0, weightChange: null }}
        onBack={noop}
        onFindNext={noop}
        onViewLog={noop}
      />,
    );
    expect(empty.queryByTestId(`${JOURNEY_TEST_ID}-prs`)).toBeNull();
    expect(
      empty.getByTestId(`${JOURNEY_TEST_ID}-volume`).props.children,
    ).toBe("—");
    expect(
      empty.getByTestId(`${JOURNEY_TEST_ID}-weight-change`).props.children,
    ).toBe("—");
  });

  it.each(["light", "dark"] as const)("renders under the %s system scheme", (mode) => {
    setSystemScheme(mode);
    const { getByTestId } = render(
      <ProgramJourney journey={JOURNEY} onBack={noop} onFindNext={noop} onViewLog={noop} />,
    );
    expect(getByTestId(`${JOURNEY_TEST_ID}-sessions`).props.children).toBe("14");
    expect(getByTestId(`${JOURNEY_TEST_ID}-pr-0-weight`).props.children).toBe(
      "315 lbs",
    );
  });

  it("no colour literal survives in the recap — every colour follows the system", () => {
    const files = [
      path.join(__dirname, "..", "components", "programs", "ProgramJourney.tsx"),
      path.join(
        __dirname,
        "..",
        "app",
        "(app)",
        "(tabs)",
        "programming",
        "[id]",
        "journey.tsx",
      ),
    ];
    const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z])/;
    const RGB_LITERAL = /["'`]\s*rgba?\(\s*\d/;
    for (const file of files) {
      const src = fs
        .readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
      expect(src.split("\n").filter((l) => HEX.test(l))).toEqual([]);
      expect(src.split("\n").filter((l) => RGB_LITERAL.test(l))).toEqual([]);
    }
    const component = fs.readFileSync(files[0]!, "utf8");
    expect(component).toContain("useThemeTokens");
  });
});
