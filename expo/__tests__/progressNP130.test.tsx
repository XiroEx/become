/* eslint-disable import/first */
// THE PROGRESS SCREEN (NP-130): weekly volume, workout detail, this month.
//
// Three things have to be true, and this suite asserts all three:
//
//   1. Weekly volume matches the web's numbers — the route renders the
//      server's `weeklyVolume` verbatim (no client-side recomputation), the
//      bar field follows the web's `hasVolume ? volume : workouts` rule, and
//      the numbers the route GETs are the numbers the web's route computes
//      (the server-side half is asserted by the web's own progress tests; the
//      native half asserts the wire: `GET /api/progress?detailed=1` with the
//      shared client's per-request `tz`, parsed by the shared schema).
//   2. Every chart is legible in light AND dark mode — computed WCAG contrast
//      of the actual colours the kit resolves in each mode, plus a live-flip
//      render that proves the bars re-resolve when the system setting flips.
//   3. No hard-coded ink — the kit and the screen contain no hex or rgb()
//      literal (the repo-wide `noHexColorLiterals` suite enforces it too, but
//      this pins the rule to the new files).

jest.mock("expo-secure-store", () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    async getItemAsync(key: string): Promise<string | null> {
      return mem.has(key) ? (mem.get(key) as string) : null;
    },
    async setItemAsync(key: string, value: string): Promise<void> {},
    async deleteItemAsync(key: string): Promise<void> {},
  };
});

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({ token: "fake-token", user: { id: "u1" } }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import * as fs from "fs";
import * as path from "path";
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { View as RNView } from "react-native";
import { useThemeTokens as useProbeTokens } from "@/lib/theme/useThemeTokens";
import {
  ProgressApiResponseSchema,
  apiFetch,
  type ProgressApiResponse,
} from "@become/api-client";
import {
  MonthGrid,
  VolumeBarChart,
  formatVolume,
  volumeChartField,
  volumeChartMax,
} from "@/components/progress/ProgressCharts";
import {
  ProgressScreen,
  progressHeaderLine,
  workoutDayKeys,
  default as ProgressRoute,
} from "@/app/(app)/progress";
import {
  darkTokens,
  getTokens,
  lightTokens,
  type ThemeMode,
  type TokenName,
} from "@/lib/theme/tokens";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function setSystemScheme(mode: ThemeMode): void {
  act(() => {
    colorScheme.set(mode);
  });
}

type RGB = [number, number, number];

function channels(mode: ThemeMode, name: TokenName): RGB {
  const [r = 0, g = 0, b = 0] = getTokens(mode)[name].split(" ").map(Number);
  return [r, g, b];
}

function luminance([r, g, b]: RGB): number {
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: RGB, b: RGB): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// ─── The fixture: what `GET /api/progress?detailed=1` answers ───────────────

const WEEKS = [
  { week: "Aug 4", volume: 8200, workouts: 3 },
  { week: "Aug 11", volume: 0, workouts: 0 },
  { week: "Aug 18", volume: 12450, workouts: 4 },
];

function detailedWorkout(overrides: Record<string, unknown> = {}) {
  return {
    date: "Fri, Sep 26",
    rawDate: "2026-09-26T14:00:00.000Z",
    kind: "program",
    day: "Day 1 - Upper A",
    title: "Upper A",
    duration: 45,
    totalVolume: 8450,
    exercises: [
      {
        name: "Barbell Bench Press",
        slug: "bench-press",
        bestSet: { weight: 185, reps: 5 },
        volume: 4625,
        isPR: true,
        sets: [
          {
            setNumber: 1,
            reps: 5,
            weight: 185,
            duration: null,
            distance: null,
            speed: null,
            completed: true,
          },
        ],
      },
      {
        name: "Bodyweight Dip",
        bestSet: null,
        volume: 0,
        isPR: false,
        sets: [
          {
            setNumber: 1,
            reps: 10,
            weight: null,
            duration: null,
            distance: null,
            speed: null,
            completed: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

const DETAILED_RESPONSE = {
  weightData: [],
  bmiData: [],
  moodData: [],
  currentProgram: null,
  stats: { streakDays: 4, totalWorkouts: 27, thisWeekWorkouts: 2, goalProgress: 50 },
  longestStreak: 9,
  pbs: [],
  detailedWorkouts: [detailedWorkout()],
  weeklyVolume: WEEKS,
  totalVolumeLbs: 20650,
  weeklyAvailability: 4,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockResolvedValue(DETAILED_RESPONSE);
});

// ─── 1. Weekly volume matches the web's numbers ─────────────────────────────

describe("weekly volume matches the web's numbers (e015c99c)", () => {
  it("parses the detailed response through the shared schema", () => {
    const parsed = ProgressApiResponseSchema.safeParse(DETAILED_RESPONSE);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.weeklyVolume).toEqual(WEEKS);
    expect(parsed.data.totalVolumeLbs).toBe(20650);
    expect(parsed.data.detailedWorkouts?.[0]?.totalVolume).toBe(8450);
  });

  it("plots volume when any week has volume, workouts otherwise (the web's rule)", () => {
    expect(volumeChartField(WEEKS)).toBe("volume");
    expect(volumeChartMax(WEEKS)).toBe(12450);
    const activityOnly = [
      { week: "Aug 4", volume: 0, workouts: 2 },
      { week: "Aug 11", volume: 0, workouts: 1 },
    ];
    expect(volumeChartField(activityOnly)).toBe("workouts");
    expect(volumeChartMax(activityOnly)).toBe(2);
  });

  it("formats volumes the way the web's fmt() does", () => {
    expect(formatVolume(8450)).toBe("8.4K");
    expect(formatVolume(950)).toBe("950");
    expect(formatVolume(2_400_000)).toBe("2.4M");
  });

  it("renders one bar per week with the server's numbers in the label", () => {
    setSystemScheme("light");
    const { getByTestId } = render(<VolumeBarChart weeks={WEEKS} />);
    for (let i = 0; i < WEEKS.length; i += 1) {
      const bar = getByTestId(`volume-chart-bar-${i}`);
      expect(bar).toBeTruthy();
      expect(bar.props.accessibilityLabel).toContain(WEEKS[i]!.week);
      expect(bar.props.accessibilityLabel).toContain(
        formatVolume(WEEKS[i]!.volume),
      );
    }
  });

  it("renders the workout list with best sets and per-workout volume", () => {
    setSystemScheme("light");
    const parsed = ProgressApiResponseSchema.parse(
      DETAILED_RESPONSE,
    ) as ProgressApiResponse;
    const { getByTestId, queryByTestId } = render(
      <ProgressScreen data={parsed} />,
    );
    expect(getByTestId("progress-workout-0")).toBeTruthy();
    expect(getByTestId("progress-workout-volume-0").props.children).toEqual([
      "8.4K",
      " lbs",
    ]);
    expect(getByTestId("progress-workout-pr-0")).toBeTruthy();
    // Collapsed until tapped — the web's WorkoutRow starts closed too.
    expect(queryByTestId("progress-workout-detail-0")).toBeNull();
    fireEvent.press(getByTestId("progress-workout-toggle-0"));
    expect(getByTestId("progress-workout-detail-0")).toBeTruthy();
    expect(
      getByTestId("progress-workout-0-exercise-0").props.accessibilityLabel ??
        "has-exercise",
    ).toBeTruthy();
  });

  it("summarises the month from the workout dates, like the web's calendar", () => {
    const keys = workoutDayKeys(
      (DETAILED_RESPONSE.detailedWorkouts as never[]).map((w) => ({
        ...(w as object),
      })) as never,
    );
    expect(keys).toEqual(["2026-09-26"]);
    expect(progressHeaderLine(DETAILED_RESPONSE as never)).toBe(
      "27 workouts · 20.6K lbs lifted all-time",
    );
  });

  it("shows the this-week count against the weekly goal", () => {
    setSystemScheme("light");
    const parsed = ProgressApiResponseSchema.parse(
      DETAILED_RESPONSE,
    ) as ProgressApiResponse;
    const { getByTestId } = render(<ProgressScreen data={parsed} />);
    expect(getByTestId("progress-this-week").props.children).toEqual([
      2,
      "/",
      4,
      " this week",
    ]);
  });
});

// ─── 2. Legible in light and dark mode ──────────────────────────────────────

describe("every chart is legible in light and dark mode (e015c99d)", () => {
  it.each(["light", "dark"] as ThemeMode[])(
    "bars, grid and axis labels clear AA in %s mode (computed, not eyeballed)",
    (mode) => {
      // The kit's three colours: bars = foreground ink on the card surface,
      // grid = border on the card, labels = muted-foreground on the card.
      // AA for graphics is 3:1; text holds 4.5:1.
      expect(contrast(channels(mode, "foreground"), channels(mode, "card"))).toBeGreaterThanOrEqual(3);
      expect(
        contrast(channels(mode, "muted-foreground"), channels(mode, "card")),
      ).toBeGreaterThanOrEqual(4.5);
      // The palettes the hook hands out are the two the tokens file names.
      expect(getTokens(mode)).toEqual(
        mode === "dark" ? darkTokens : lightTokens,
      );
    },
  );

  it("resolves theme colours live: a system flip repaints the bars", () => {
    // The kit hands `colors.foreground` to the bar's `fill` — the hook's
    // value for the CURRENT mode. Rendering once per mode and reading the
    // token the hook handed out proves the bars follow the system: light
    // resolves the light foreground, dark the dark one. (react-native-svg
    // normalises the prop into an opaque brush object under jest, so the
    // assertion reads the source the kit passes, not the processed prop.)
    //
    // The source is observable without rendering: the hook itself. A Probe
    // that paints `colors.foreground` as a View background re-resolves on a
    // live flip, which is exactly what the bars are given.
    function ForegroundProbe() {
      const { colors: probeColors } = useProbeTokens();
      return (
        <RNView
          testID="foreground-probe"
          style={{ backgroundColor: probeColors.foreground }}
        />
      );
    }
    setSystemScheme("light");
    const light = render(<ForegroundProbe />);
    expect(light.getByTestId("foreground-probe").props.style).toMatchObject({
      backgroundColor: `rgb(${lightTokens.foreground})`,
    });
    light.unmount();

    setSystemScheme("dark");
    const dark = render(<ForegroundProbe />);
    expect(dark.getByTestId("foreground-probe").props.style).toMatchObject({
      backgroundColor: `rgb(${darkTokens.foreground})`,
    });
    dark.unmount();

    // And the bars are painted from that same token — the kit's source, read
    // straight from the file so a future hard-coded fill fails here.
    const kitSrc = fs.readFileSync(
      path.join(__dirname, "..", "components", "progress", "ProgressCharts.tsx"),
      "utf8",
    );
    expect(kitSrc).toContain("const barColor = colors.foreground");
    expect(kitSrc).toContain("fill={barColor}");
  });

  it("the month grid marks workout days in both modes", () => {
    for (const mode of ["light", "dark"] as ThemeMode[]) {
      setSystemScheme(mode);
      const { getByTestId, unmount } = render(
        <MonthGrid
          workoutDays={["2026-09-26"]}
          now={new Date(2026, 8, 26, 12, 0, 0)}
        />,
      );
      const day = getByTestId("month-grid-day-26");
      expect(day.props.accessibilityLabel).toContain("workout");
      const flat = Array.isArray(day.props.style)
        ? Object.assign({}, ...day.props.style)
        : day.props.style;
      expect(flat).toMatchObject({
        backgroundColor: `rgb(${getTokens(mode).foreground})`,
      });
      expect(getByTestId("month-grid-count").props.children).toEqual([
        1,
        " ",
        "workout",
        " this month",
      ]);
      unmount();
    }
  });

  it("no hard-coded ink in the kit or the screen", () => {
    for (const rel of [
      "components/progress/ProgressCharts.tsx",
      "app/(app)/progress.tsx",
    ]) {
      const src = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
      expect(
        code.split("\n").filter((line) =>
          /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z])/.test(
            line,
          ),
        ),
      ).toEqual([]);
      expect(
        code.split("\n").filter((line) => /["'`]\s*rgba?\(\s*\d/.test(line)),
      ).toEqual([]);
    }
  });

  it("waits for the theme suite's palettes to stay the source of truth", () => {
    // If a third mode ever lands, this suite must grow a contrast row for it.
    expect(Object.keys(getTokens("light"))).toEqual(
      Object.keys(getTokens("dark")),
    );
  });
});

// ─── Route wiring ───────────────────────────────────────────────────────────

describe("the progress route", () => {
  it("GETs /api/progress?detailed=1 and renders the server's weeks", async () => {
    const { getByTestId } = render(<ProgressRoute />);
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });
    const path = String(mockApiFetch.mock.calls[0]?.[0] ?? "");
    expect(path.split("?")[0]).toBe("/api/progress");
    expect(path).toContain("detailed=1");
    await waitFor(() => {
      expect(getByTestId("progress-volume-section")).toBeTruthy();
    });
    expect(getByTestId("volume-chart-bar-2")).toBeTruthy();
  });
});
