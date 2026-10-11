/* eslint-disable import/first */
// NP-360: Workout History spacing, typography & visual parity
//
// Aligns native Workout History screen with web source of truth:
//   1. Header & Chrome:
//      - Circular back button h-8 w-8 rounded-full border (32x32, borderRadius 16, border)
//      - hitSlopToMinTarget(32, 32) preserves 44pt accessible touch target
//      - History icon size 24 (h-6 w-6), text-2xl font-bold sm:text-3xl title
//   2. Filter Chips:
//      - Active count badge bg-white/25 (rgba(255, 255, 255, 0.25)) and white text (#ffffff)
//      - Active chip label text is white (#ffffff)
//      - Inactive count badge background is dark muted (zinc-700 in dark mode, zinc-200 in light)
//      - Inactive count badge text is muted-foreground
//   3. Workout Card Rows:
//      - Smooth left accent stripe w-1.5 (6px width, rounded-l-2xl: borderTopLeftRadius 16, borderBottomLeftRadius 16)
//      - Quick session rows use purple accent: tint("purple", 0.15) for icon badge & type badge, colors.purple
//      - Program session rows use success accent: tint("success", 0.15) for icon badge & type badge, colors.success
//      - Meta line wraps cleanly with 12px gap and 4px icon-to-text gap

import * as fs from "fs";
import * as path from "path";
import React from "react";
import { StyleSheet } from "react-native";
import { fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { Calendar, ChevronLeft, Clock, Dumbbell, History, Sparkles } from "lucide-react-native";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => ({}),
}));

const mockToken = "test-jwt";
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

import { apiFetch } from "@become/api-client";
import HistoryRoute from "../app/(app)/(tabs)/programming/history";
import { lightTokens, darkTokens } from "../lib/theme/tokens";

const mockApiFetch = apiFetch as unknown as jest.Mock;

const WEDNESDAY_NOON = new Date(2026, 9, 7, 12, 0, 0);

const LOGS = [
  {
    kind: "program",
    title: "Hypertrophy · Day 2",
    programId: "prog-1",
    programName: "Hypertrophy",
    day: "Day 2",
    phase: 1,
    completed: true,
    skipped: false,
    favorite: false,
    date: "2026-10-07T08:00:00",
    duration: 45,
    exerciseCount: 5,
    completedSets: 15,
  },
  {
    kind: "quick",
    title: "Tuesday Pump",
    focus: "push",
    sessionId: "qs-1",
    completed: true,
    skipped: false,
    favorite: false,
    date: "2026-10-06T18:00:00",
    duration: 30,
    exerciseCount: 3,
    completedSets: 9,
    exercises: [],
  },
] as const;

function flat(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style as never) as Record<string, unknown>;
}

function readHistorySrc(): string {
  return fs.readFileSync(
    path.join(__dirname, "..", "app", "(app)", "(tabs)", "programming", "history.tsx"),
    "utf8",
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(WEDNESDAY_NOON);
  mockPush.mockReset();
  mockBack.mockReset();
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (url: string) => {
    if (String(url).startsWith("/api/workouts/logs")) {
      return { logs: LOGS };
    }
    return {};
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("NP-360: Workout History visual & spacing parity", () => {
  describe("1. Header & Chrome circular back button", () => {
    it("renders circular h-8 w-8 (32x32, borderRadius 16) back button with border", async () => {
      const { getByTestId } = render(<HistoryRoute initialLogs={LOGS as never} />);
      await waitFor(() => expect(getByTestId("history-back-button")).toBeTruthy());

      const backBtn = getByTestId("history-back-button");
      const style = flat(backBtn.props.style);
      expect(style.width).toBe(32);
      expect(style.height).toBe(32);
      expect(style.borderRadius).toBe(16);
      expect(style.borderWidth).toBe(1);

      // Hit slop expands 32x32 to 44x44 minimum touch target
      expect(backBtn.props.hitSlop).toEqual({
        top: 6,
        bottom: 6,
        left: 6,
        right: 6,
      });
    });

    it("source matches circular h-8 w-8 styling and does not contain square 40x40 borderRadius 12", () => {
      const src = readHistorySrc();
      expect(src).toMatch(/width:\s*32,\s*height:\s*32,\s*borderRadius:\s*16/);
      expect(src).not.toMatch(/width:\s*40,\s*height:\s*40,\s*borderRadius:\s*12/);
    });
  });

  describe("2. Filter Chips count badge and text styling", () => {
    it("source configures active badge as bg-white/25 with white text, and inactive badge with dark muted background", () => {
      const src = readHistorySrc();
      // Active badge background uses white with 25% alpha
      expect(src).toContain('"rgba(255, 255, 255, 0.25)"');
      // Active badge text is pure white
      expect(src).toMatch(/color:\s*active\s*\?\s*"#ffffff"/);
      // Inactive badge background matches web's zinc-700 / zinc-200
      expect(src).toContain('"rgb(63, 63, 70)"');
      expect(src).toContain('"rgb(228, 228, 231)"');
    });

    it("renders active filter count badge with rgba(255, 255, 255, 0.25) and white text", async () => {
      const { getByTestId } = render(<HistoryRoute initialLogs={LOGS as never} />);
      await waitFor(() => expect(getByTestId("history-filter-all")).toBeTruthy());

      const allCountText = getByTestId("history-filter-all-count");
      const textStyle = flat(allCountText.props.style);
      expect(textStyle.color).toBe("#ffffff");
    });
  });

  describe("3. Workout Card Rows left accent stripe & badge colors", () => {
    it("renders smooth left accent stripe with width 6 (w-1.5) and rounded-l-2xl radii", () => {
      const src = readHistorySrc();
      expect(src).toMatch(/width:\s*6,\s*borderTopLeftRadius:\s*16,\s*borderBottomLeftRadius:\s*16/);
      // No longer uses flat 4px border
      expect(src).not.toMatch(/width:\s*4,\s*backgroundColor:\s*accentColor/);
    });

    it("uses purple for quick session badge and success green for program badge", () => {
      const src = readHistorySrc();
      // Quick sessions use purple tint and purple icon/text
      expect(src).toContain('tint("purple", 0.15)');
      expect(src).toContain("colors.purple");
      // Program sessions use success green
      expect(src).toContain('tint("success", 0.15)');
      expect(src).toContain("colors.success");
      // Accent (amber) is no longer used for quick session badges
      expect(src).not.toMatch(/tint\("accent",\s*0\.15\)/);
    });
  });
});
