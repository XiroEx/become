/* eslint-disable import/first */
// THE PROGRAM JOURNEY RECAP (NP-167) — the native end-of-program recap.
//
// Completing a program natively offers the recap with the same numbers as the
// web (the screen reads `GET /api/programs/[programId]/journey`, parsed by
// the shared schema, so sessions, volume, weight change and top PRs match by
// construction), and the recap shows those four sections and reads in light
// and dark mode (every colour from `useThemeTokens()` or a Tailwind class).

jest.mock("expo-secure-store", () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    async getItemAsync(key: string): Promise<string | null> {
      return mem.has(key) ? (mem.get(key) as string) : null;
    },
    async setItemAsync(): Promise<void> {},
    async deleteItemAsync(): Promise<void> {},
  };
});

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({ id: "p1" }),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({ token: "fake-token", user: { _id: "u1" } }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { apiFetch, ProgramJourneyResponseSchema } from "@become/api-client";
import {
  formatJourneyVolume,
  formatJourneyWeightChange,
  ProgramJourneyLoaded,
  ProgramJourneyScreen,
} from "@/components/programs/ProgramJourney";
import ProgramJourneyRoute from "@/app/(app)/(tabs)/programming/[id]/journey";
import { resolveWebPath } from "@/lib/navigation/webPathToRoute";
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

// ─── The fixture: what the web's journey route answers ─────────────────────
// Mirrors `webapp/app/api/programs/[programId]/journey/route.ts`: the
// pre-formatted dates, the lbs weight change, the heaviest-first PRs.

const JOURNEY_FIXTURE = {
  programName: "Strength Foundation",
  durationWeeks: 8,
  goal: "Build strength",
  totalSessions: 14,
  totalVolumeLbs: 84250,
  weightChange: { startLbs: 180.4, endLbs: 185.2, change: 4.8 },
  topPRs: [
    { name: "Barbell Back Squat", weight: 315, reps: 3, date: "Jul 2, 2026" },
    { name: "Barbell Bench Press", weight: 225, reps: 5, date: "Jul 20, 2026" },
  ],
  startDate: "June 1, 2026",
  endDate: "July 26, 2026",
};

const noop = () => {};

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockResolvedValue(JOURNEY_FIXTURE);
});

// ─── 1. The recap carries the web's numbers (id: e015ca67) ─────────────────

describe("the recap carries the web's numbers (id: e015ca67)", () => {
  it("parses the web's journey answer through the shared schema", () => {
    const parsed = ProgramJourneyResponseSchema.safeParse(JOURNEY_FIXTURE);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.totalSessions).toBe(14);
    expect(parsed.data.totalVolumeLbs).toBe(84250);
    expect(parsed.data.weightChange).toEqual({
      startLbs: 180.4,
      endLbs: 185.2,
      change: 4.8,
    });
    expect(parsed.data.topPRs).toHaveLength(2);
  });

  it("formats volume and weight exactly like the web's journey page", () => {
    // Web: `${(totalVolumeLbs / 1000).toFixed(1)}k` + `lbs lifted`, `—` empty.
    expect(formatJourneyVolume(84250)).toEqual({
      value: "84.3k",
      sub: "lbs lifted",
    });
    expect(formatJourneyVolume(0)).toEqual({ value: "—", sub: null });
    // Web: `{change > 0 ? '+' : ''}{change} lbs` over `{start} → {end} lbs`.
    expect(formatJourneyWeightChange(4.8)).toBe("+4.8 lbs");
    expect(formatJourneyWeightChange(-2.5)).toBe("-2.5 lbs");
    expect(formatJourneyWeightChange(0)).toBe("0 lbs");
  });

  it("renders the server's sessions, volume, weight change and top PRs", () => {
    const parsed = ProgramJourneyResponseSchema.safeParse(JOURNEY_FIXTURE);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const { getByTestId } = render(
      <ProgramJourneyLoaded
        journey={parsed.data}
        onFindNext={noop}
        onViewLog={noop}
      />,
    );
    expect(getByTestId("program-journey-title").props.children).toBe(
      "PROGRAM COMPLETE",
    );
    expect(getByTestId("program-journey-program-name").props.children).toBe(
      "Strength Foundation",
    );
    expect(getByTestId("program-journey-sessions").props.children).toBe("14");
    expect(getByTestId("program-journey-volume").props.children).toBe("84.3k");
    expect(getByTestId("program-journey-weight").props.children).toBe(
      "+4.8 lbs",
    );
    // PR rows render name + date on the left, weight + reps on the right.
    expect(getByTestId("program-journey-pr-0").props.children).toBeTruthy();
    expect(getByTestId("program-journey-pr-1").props.children).toBeTruthy();
  });

  it("the route fetches the journey endpoint and offers both CTAs", async () => {
    const { getByTestId } = render(<ProgramJourneyRoute />);
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/programs/p1/journey"),
        expect.anything(),
      );
    });
    await waitFor(() => {
      expect(getByTestId("program-journey-next")).toBeTruthy();
    });
    // Buttons carry their accessible names (the label is a Text child, read
    // the way React Native reads it).
    expect(getByTestId("program-journey-next").props.accessibilityLabel).toBe(
      "Find My Next Challenge",
    );
    expect(getByTestId("program-journey-log").props.accessibilityLabel).toBe(
      "View Full Training Log",
    );
    fireEvent.press(getByTestId("program-journey-next"));
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/programming");
    fireEvent.press(getByTestId("program-journey-log"));
    expect(mockReplace).toHaveBeenCalledWith("/progress");
  });

  it("the web's journey url resolves to the native recap, exactly", () => {
    const target = resolveWebPath("/dashboard/workout/p1/journey");
    expect(target).toMatchObject({
      kind: "native",
      href: "/(tabs)/programming/p1/journey",
      fallback: "exact",
    });
  });
});

// ─── 2. Sessions, volume, weight and PRs in light and dark (id: e015ca68) ──

describe("sessions, volume, weight and PRs in light and dark (id: e015ca68)", () => {
  it("shows all four sections, with the web's empty states", () => {
    const parsed = ProgramJourneyResponseSchema.safeParse(JOURNEY_FIXTURE);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const { getByTestId, getByText, queryByTestId, rerender } = render(
      <ProgramJourneyLoaded
        journey={parsed.data}
        onFindNext={noop}
        onViewLog={noop}
      />,
    );
    expect(getByTestId("program-journey-stats")).toBeTruthy();
    expect(getByTestId("program-journey-prs")).toBeTruthy();
    expect(getByTestId("program-journey-length").props.children).toBe("8w");

    // No weight entries on the server → the web's `—` / `no data` cell.
    rerender(
      <ProgramJourneyLoaded
        journey={{ ...parsed.data, weightChange: null }}
        onFindNext={noop}
        onViewLog={noop}
      />,
    );
    expect(getByTestId("program-journey-weight").props.children).toBe("—");
    // The `no data` sub-line sits beside the value inside the weight cell.
    expect(getByText("no data")).toBeTruthy();

    // No PRs → the section is absent, exactly like the web.
    rerender(
      <ProgramJourneyLoaded
        journey={{ ...parsed.data, topPRs: [] }}
        onFindNext={noop}
        onViewLog={noop}
      />,
    );
    expect(queryByTestId("program-journey-prs")).toBeNull();
  });

  it("every section is legible in light AND dark mode", () => {
    for (const mode of ["light", "dark"] as ThemeMode[]) {
      setSystemScheme(mode);
      const parsed = ProgramJourneyResponseSchema.safeParse(JOURNEY_FIXTURE);
      expect(parsed.success).toBe(true);
      if (!parsed.success) continue;
      const { getByTestId, unmount } = render(
        <ProgramJourneyLoaded
          journey={parsed.data}
          onFindNext={noop}
          onViewLog={noop}
        />,
      );
      expect(getByTestId("program-journey-title")).toBeTruthy();
      expect(getByTestId("program-journey-prs")).toBeTruthy();
      // Body copy against the card surface, and the accent title against it:
      // the same 4.5:1 bar the theme suite holds every screen to.
      expect(
        contrast(channels(mode, "foreground"), channels(mode, "card")),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(channels(mode, "accent"), channels(mode, "card")),
      ).toBeGreaterThanOrEqual(3);
      unmount();
    }
    setSystemScheme("light");
  });

  it("a live flip of the system setting re-renders the recap", () => {
    setSystemScheme("light");
    expect(lightTokens.accent).not.toBe(darkTokens.accent);
    const parsed = ProgramJourneyResponseSchema.safeParse(JOURNEY_FIXTURE);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const { getByTestId } = render(
      <ProgramJourneyLoaded
        journey={parsed.data}
        onFindNext={noop}
        onViewLog={noop}
      />,
    );
    expect(getByTestId("program-journey-title")).toBeTruthy();
    setSystemScheme("dark");
    expect(getByTestId("program-journey-title")).toBeTruthy();
    setSystemScheme("light");
  });

  it("no hard-coded ink in the new files", () => {
    const fs = jest.requireActual("fs") as typeof import("fs");
    const path = jest.requireActual("path") as typeof import("path");
    const HEX_COLOUR =
      /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z])/;
    const LITERAL_RGB = /["'`]\s*rgba?\(\s*\d/;
    for (const rel of [
      "components/programs/ProgramJourney.tsx",
      "app/(app)/(tabs)/programming/[id]/journey.tsx",
    ]) {
      const src = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
      expect(`${rel}: ${code.match(HEX_COLOUR)?.[0] ?? ""}`).not.toMatch(
        HEX_COLOUR,
      );
      expect(code).not.toMatch(LITERAL_RGB);
    }
  });

  it("loading and error states keep their names for a screen reader", () => {
    const loading = render(
      <ProgramJourneyScreen
        journey={null}
        loading
        error={null}
        onRetry={noop}
        onFindNext={noop}
        onViewLog={noop}
      />,
    );
    // ScreenState renders `${testID}-loading` inside `${testID}` while
    // loading, and `${testID}-error` + `${testID}-retry` on failure.
    expect(
      loading.getByTestId("program-journey-state-loading"),
    ).toBeTruthy();
    loading.unmount();
    const failed = render(
      <ProgramJourneyScreen
        journey={null}
        loading={false}
        error={new Error("boom")}
        onRetry={noop}
        onFindNext={noop}
        onViewLog={noop}
      />,
    );
    // A plain Error classifies as offline, so the offline state (with its
    // retry button) is what the member gets — never a blank screen.
    expect(failed.getByTestId("program-journey-state-offline")).toBeTruthy();
    expect(failed.getByTestId("program-journey-state-retry")).toBeTruthy();
    failed.unmount();
  });
});
