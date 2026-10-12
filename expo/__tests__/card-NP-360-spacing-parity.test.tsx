/* eslint-disable import/first */
/**
 * NP-360: Workout History spacing, typography & layout parity pass.
 *
 * 1. Header & Chrome:
 *    - Circular back button: `h-8 w-8 rounded-full border border-border`
 *      (width 32, height 32, borderRadius 16, border).
 *    - History icon: size 24, colors.success.
 *    - Title: text-2xl font-extrabold sm:text-3xl.
 *
 * 2. Filter Chips ('All', 'Programs', 'Quick'):
 *    - Pills: `rounded-full px-3.5 py-1.5` (paddingHorizontal 14, paddingVertical 6).
 *    - Active chip: bg-success, text-white (colors["brand-foreground"]).
 *    - Inactive chip: bg-muted, text-muted-foreground.
 *    - Count badge in active chip: rounded-full px-1.5 text-xs bg-white/25 (tint brand-foreground 0.25), text-white.
 *    - Count badge in inactive chip: bg-zinc-200 dark:bg-zinc-700, text-muted-foreground.
 *
 * 3. Workout Card Rows:
 *    - Left accent stripe: `w-1.5 rounded-l-2xl` (width 6, borderTopLeftRadius 16, borderBottomLeftRadius 16).
 *      - Program: emerald-500 (colors["mind-emerald"]).
 *      - Quick: blue-500 (colors.info).
 *    - Icon badge: `h-10 w-10 shrink-0 items-center justify-center rounded-xl`.
 *      - Program: bg-green-100 dark:bg-green-900/30, Dumbbell icon.
 *      - Quick: bg-purple-100 dark:bg-purple-900/30, Sparkles icon.
 *    - Title: `truncate text-sm font-semibold`, numberOfLines={1}.
 *    - Type badge: `rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide`.
 *      - Program: green (colors.success).
 *      - Quick: purple (colors.purple).
 *
 * 4. NP-123 Token Rule:
 *    - Zero hex colours, zero hand-written rgb()/rgba() string literals.
 */

import * as fs from "fs";
import * as path from "path";
import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { WorkoutHistoryEntry } from "@become/api-client";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com" },
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

import HistoryRoute from "../app/(app)/(tabs)/programming/history";
/* eslint-enable import/first */

const HISTORY_PATH = path.join(
  __dirname,
  "..",
  "app",
  "(app)",
  "(tabs)",
  "programming",
  "history.tsx",
);

function readHistorySrc(): string {
  return fs.readFileSync(HISTORY_PATH, "utf8");
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const SAMPLE_LOGS: WorkoutHistoryEntry[] = [
  {
    kind: "program",
    title: "Hypertrophy Phase 1 — Upper Body Power",
    programId: "prog-hp1",
    programName: "Hypertrophy Foundations",
    day: "Day 1",
    phase: 1,
    completed: true,
    date: "2026-10-10T10:00:00.000Z",
    duration: 52,
    exerciseCount: 6,
    completedSets: 18,
  },
  {
    kind: "quick",
    title: "Quick Core & Arms",
    focus: "core",
    sessionId: "qs-core-1",
    completed: true,
    date: "2026-10-09T15:30:00.000Z",
    duration: 25,
    exerciseCount: 3,
    completedSets: 9,
  },
];

describe("NP-360 (1): Header & Chrome circular back button and typography", () => {
  it("uses a circular h-8 w-8 rounded-full border button for back navigation", () => {
    const src = readHistorySrc();
    expect(src).toContain('testID="history-back-button"');
    // Circular: width 32, height 32, borderRadius 16 (or rounded-full)
    expect(src).toMatch(/width:\s*32/);
    expect(src).toMatch(/height:\s*32/);
    expect(src).toMatch(/borderRadius:\s*16/);
    expect(src).toContain("rounded-full");
    expect(src).toContain("border");
  });

  it("header title is 2xl font-extrabold and History icon is size 24", () => {
    const src = readHistorySrc();
    expect(src).toContain("text-foreground text-2xl font-extrabold");
    expect(src).toMatch(/<History[^>]*size=\{24\}/);
  });

  it("renders back button and triggers handleBack on press", async () => {
    const { getByTestId } = render(<HistoryRoute initialLogs={SAMPLE_LOGS} />);
    await waitFor(() => expect(getByTestId("history-back-button")).toBeTruthy());

    fireEvent.press(getByTestId("history-back-button"));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe("NP-360 (2): Filter chips badges & styling", () => {
  it("chips use rounded-full px-3.5 py-1.5 pill styling", () => {
    const src = readHistorySrc();
    expect(src).toContain("rounded-full px-3.5 py-1.5");
    expect(src).toMatch(/paddingHorizontal:\s*14/);
    expect(src).toMatch(/paddingVertical:\s*6/);
  });

  it("active chip uses bg-success and text-white, inactive uses bg-muted and text-muted-foreground", () => {
    const src = readHistorySrc();
    expect(src).toMatch(/active\s*\?\s*"bg-success"\s*:\s*"bg-muted"/);
    expect(src).toMatch(/active\s*\?\s*"text-white"\s*:\s*"text-muted-foreground"/);
  });

  it("count badge uses bg-white/25 when active and zinc dark muted when inactive", () => {
    const src = readHistorySrc();
    expect(src).toMatch(/active\s*\?\s*"bg-white\/25"\s*:\s*"bg-zinc-200 dark:bg-zinc-700"/);
  });

  it("renders all 3 filter chips with correct session counts", async () => {
    const { getByTestId } = render(<HistoryRoute initialLogs={SAMPLE_LOGS} />);
    await waitFor(() => expect(getByTestId("history-filters")).toBeTruthy());

    expect(getByTestId("history-filter-all-count").props.children).toBe(2);
    expect(getByTestId("history-filter-program-count").props.children).toBe(1);
    expect(getByTestId("history-filter-quick-count").props.children).toBe(1);
  });

  it("filters the workout list when clicking filter chips", async () => {
    const { getByTestId, queryByText } = render(
      <HistoryRoute initialLogs={SAMPLE_LOGS} />,
    );
    await waitFor(() => expect(getByTestId("history-list")).toBeTruthy());

    // Switch to quick filter
    fireEvent.press(getByTestId("history-filter-quick"));
    expect(queryByText("Quick Core & Arms")).toBeTruthy();
    expect(queryByText("Hypertrophy Phase 1 — Upper Body Power")).toBeNull();

    // Switch to program filter
    fireEvent.press(getByTestId("history-filter-program"));
    expect(queryByText("Hypertrophy Phase 1 — Upper Body Power")).toBeTruthy();
    expect(queryByText("Quick Core & Arms")).toBeNull();
  });
});

describe("NP-360 (3): Workout Card Rows accent stripe, icon badge and type badge", () => {
  it("uses smooth left accent stripe w-1.5 (width 6) rounded-l-2xl", () => {
    const src = readHistorySrc();
    expect(src).toContain("w-1.5 rounded-l-2xl");
    expect(src).toMatch(/width:\s*6/);
    expect(src).toMatch(/borderTopLeftRadius:\s*16/);
    expect(src).toMatch(/borderBottomLeftRadius:\s*16/);
  });

  it("program accent stripe is emerald-500 (mind-emerald token) and quick is blue-500 (info token)", () => {
    const src = readHistorySrc();
    expect(src).toContain('colors["mind-emerald"]');
    expect(src).toMatch(/isQuick\s*\?\s*"bg-blue-500"\s*:\s*"bg-emerald-500"/);
  });

  it("icon badge is h-10 w-10 rounded-xl with green-100/purple-100 backgrounds", () => {
    const src = readHistorySrc();
    expect(src).toContain("h-10 w-10 shrink-0 items-center justify-center rounded-xl");
    expect(src).toMatch(/bg-purple-100 dark:bg-purple-900\/30/);
    expect(src).toMatch(/bg-green-100 dark:bg-green-900\/30/);
  });

  it("type badge has rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide", () => {
    const src = readHistorySrc();
    expect(src).toContain("rounded-full px-1.5 py-0.5 shrink-0");
    expect(src).toContain("text-[10px] font-medium uppercase tracking-wide");
  });

  it("title is truncated with numberOfLines={1}", () => {
    const src = readHistorySrc();
    expect(src).toContain('className="text-foreground text-sm font-semibold truncate"');
    expect(src).toContain("numberOfLines={1}");
  });

  it("renders program and quick workout cards with correct type badges", async () => {
    const { getByText } = render(<HistoryRoute initialLogs={SAMPLE_LOGS} />);
    await waitFor(() => {
      expect(getByText("Hypertrophy Phase 1 — Upper Body Power")).toBeTruthy();
    });

    expect(getByText("Program")).toBeTruthy();
    expect(getByText("Quick")).toBeTruthy();
  });
});

describe("NP-360 (4): NP-123 Token Rule Compliance (no hex or rgb literals in history.tsx)", () => {
  const HEX_COLOUR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z])/;
  const LITERAL_RGB = /["'`]\s*rgba?\(\s*\d/;

  it("contains no hex colours in code", () => {
    const code = stripComments(readHistorySrc());
    const offenders: string[] = [];
    code.split("\n").forEach((line, i) => {
      if (HEX_COLOUR.test(line)) {
        offenders.push(`Line ${i + 1}: ${line.trim()}`);
      }
    });
    expect(offenders).toEqual([]);
  });

  it("contains no hand-written rgb()/rgba() strings in code", () => {
    const code = stripComments(readHistorySrc());
    const offenders: string[] = [];
    code.split("\n").forEach((line, i) => {
      if (LITERAL_RGB.test(line)) {
        offenders.push(`Line ${i + 1}: ${line.trim()}`);
      }
    });
    expect(offenders).toEqual([]);
  });
});
