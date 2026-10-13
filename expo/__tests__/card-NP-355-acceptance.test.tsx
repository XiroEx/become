/* eslint-disable import/first */
// Card NP-355: Spacing/type: Workout tab - header chrome, History pill position
// & chip row, week strip day tile, Continue Training play button & text sizing
//
// Full visual parity pass (native vs web), Android S23 Ultra (One UI 7, font scale
// 0.9, logical 412x915, DPR 3.5), build 24f4e34d.
//
// 1. Header Chrome & History Pill:
//    - Web has History pill on the right of the Workout title row.
//    - Native previously placed History in the quick links chip row as a 4th chip,
//      forcing Generate to wrap to a second line.
//    - Fixed: History pill is moved to the right of the Workout title row, leaving
//      exactly 3 chips (Workouts, Programs, Generate) in the quick links row so
//      they fit on a single horizontal line.
// 2. Upcoming Week Strip - Day Tile:
//    - Day tiles and skeleton day placeholders use `rounded-lg` corners (matching web)
//      rather than `rounded-xl`.
// 3. Continue Training Card:
//    - Typography matches web: text-sm (14px) for phase/day subline, text-xs (12px)
//      for sessions count, text-sm font-semibold for progress percentage.
//    - Circular play button expanded to 40x40 (h-10 w-10) with emerald fill.

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockToken = "test-jwt-token";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com" },
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
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { apiFetch } from "@become/api-client";
import ProgrammingIndexRoute from "@/app/(app)/(tabs)/programming/index";
import { ContinueTrainingSection } from "@/components/workout/ContinueTrainingSection";
import type { ActiveProgramSummary } from "@become/api-client";

const mockApiFetch = apiFetch as unknown as jest.Mock;

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

describe("NP-355: Workout tab spacing, typography & layout parity", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockApiFetch.mockReset();
  });

  describe("(id: np355-01) Header Chrome & History pill in title row, 3-chip quick links row", () => {
    it("source places History pill in the top header row, leaving exactly 3 chips in quick links", () => {
      const src = readExpo("app/(app)/(tabs)/programming/index.tsx");

      // Verify Top Header contains History pill
      const headerSection = src.slice(
        src.indexOf("{/* Top Header */}"),
        src.indexOf("{/* Quick Links Hub"),
      );
      expect(headerSection).toContain('testID="workout-open-history"');
      expect(headerSection).toContain('testID="programming-open-search"');
      expect(headerSection).toContain('testID="programming-open-saved"');
      expect(headerSection).toContain('testID="programming-open-calendar"');

      // Verify Quick Links section has Workouts, Programs, Generate and NOT History
      const quickLinksSection = src.slice(
        src.indexOf("{/* Quick Links Hub"),
        src.indexOf("{/* 1. Resume Workout Pill"),
      );
      expect(quickLinksSection).not.toContain('testID="workout-open-history"');
      expect(quickLinksSection).toContain('testID="workout-open-exercises"');
      expect(quickLinksSection).toContain('testID="workout-open-mine"');
      expect(quickLinksSection).toContain('testID="workout-open-generate"');
    });

    it("renders History pill and 3 quick links chips with functional navigation", () => {
      mockApiFetch.mockImplementation(async (fetchPath: string) => {
        if (fetchPath.startsWith("/api/workouts/in-progress")) {
          return { workout: null, planned: null };
        }
        if (fetchPath.startsWith("/api/programs/active")) {
          return { programs: [] };
        }
        if (fetchPath.startsWith("/api/programs/saved")) {
          return { savedPrograms: [] };
        }
        if (fetchPath.startsWith("/api/programs")) {
          return { programs: [], pagination: { hasMore: false, total: 0 }, availableTags: [] };
        }
        return {};
      });

      const { getByTestId, getByText } = render(<ProgrammingIndexRoute />);

      expect(getByText("Workout")).toBeTruthy();

      // Pressing History pill opens history
      fireEvent.press(getByTestId("workout-open-history"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/history");

      // Quick links chips work
      fireEvent.press(getByTestId("workout-open-exercises"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/exercises");

      fireEvent.press(getByTestId("workout-open-mine"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/mine");

      expect(getByTestId("workout-open-generate")).toBeTruthy();
    });
  });

  describe("(id: np355-02) Upcoming Week Strip day tile rounded-lg corners", () => {
    it("UpcomingWeekStrip uses rounded-lg for day tiles and loading skeleton", () => {
      const src = readExpo("components/workout/UpcomingWeekStrip.tsx");

      // Skeleton tiles use rounded-lg
      expect(src).toContain('className="flex-1 h-16 rounded-lg bg-muted animate-pulse"');

      // Day tiles use rounded-lg
      expect(src).toContain("rounded-lg");
      expect(src).not.toContain("flex-1 items-center py-2 px-1 rounded-xl");
    });
  });

  describe("(id: np355-03) ContinueTrainingSection typography & 40x40 circular play button", () => {
    const mockPrograms: ActiveProgramSummary[] = [
      {
        programId: "prog-1",
        programName: "Circuit & Superset Shred",
        status: "active",
        progress: 69,
        completedWorkouts: 9,
        totalWorkouts: 13,
        currentPhase: 1,
        currentDay: "Day 1",
      },
      {
        programId: "prog-2",
        programName: "Strength Hypertrophy",
        status: "paused",
        progress: 45,
        completedWorkouts: 5,
        totalWorkouts: 12,
        currentPhase: 2,
        currentDay: "Day 3",
      },
    ];

    it("source enforces text-sm for subline, text-xs for session count, text-sm font-semibold for progress, and h-10 w-10 for play button", () => {
      const src = readExpo("components/workout/ContinueTrainingSection.tsx");

      // Phase/day subline has text-sm
      expect(src).toContain('className="text-muted-foreground text-sm mt-1"');
      // Paused subline has text-sm
      expect(src).toContain('className="text-amber-600 dark:text-amber-400 text-sm font-semibold"');
      // Session count has text-xs
      expect(src).toContain('className="text-muted-foreground text-xs"');
      // Progress percentage has text-sm font-semibold
      expect(src).toContain("text-sm font-semibold");
      // Play button has h-10 w-10 with emerald fill
      expect(src).toContain("h-10 w-10 rounded-full items-center justify-center");
      expect(src).toContain('isPaused ? "bg-amber-500" : "bg-emerald-600"');
    });

    it("renders active and paused cards with correct labels and testIDs", () => {
      const { getByTestId, getByText } = render(
        <ContinueTrainingSection initialPrograms={mockPrograms} />,
      );

      // Active program
      expect(getByText("Circuit & Superset Shred")).toBeTruthy();
      expect(getByText("Phase 1 • Day 1")).toBeTruthy();
      expect(getByText("69%")).toBeTruthy();
      expect(getByText("9/13 sessions")).toBeTruthy();
      expect(getByTestId("continue-program-progress-prog-1")).toBeTruthy();

      // Paused program
      expect(getByText("Strength Hypertrophy")).toBeTruthy();
      expect(getByText("Paused")).toBeTruthy();
      expect(getByText("45%")).toBeTruthy();
      expect(getByText("5/12 sessions")).toBeTruthy();
      expect(getByTestId("continue-program-paused-prog-2")).toBeTruthy();
    });
  });
});
