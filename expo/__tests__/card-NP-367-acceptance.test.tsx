// Card NP-367: Spacing/type: Training Calendar - Month grid cell height & day
// chips, selected day panel padding & action buttons
//
// Spacing / typography / layout diff pass (native vs web), Android S23 Ultra
// (One UI 7, font scale 0.9, logical 412x915, DPR 3.5), build 24f4e34d.
//
// 1. Month Grid Cell Sizing: web's month cell is `min-h-[52px] sm:min-h-16`
//    with `p-1 sm:p-2` (CalendarClient.tsx). Native used a 44px cell with
//    only 3px of vertical padding — shorter and tighter than the web grid.
//    Fixed to a 52px cell with 4px padding.
// 2. Week-view workout chip: web's chip is `rounded px-1 py-0.5 text-[8px]
//    font-medium leading-tight sm:text-[10px]`. Native used a tighter
//    `px-0.5` and a fixed 9px label. Fixed to track the web's padding and
//    responsive text size.
// 3. Selected Day Panel padding: web's panel padding scales `p-4 sm:p-6`.
//    Native stayed at a flat `p-4` regardless of width. Fixed to
//    `p-4 sm:p-6`.
// 4. Quick-session "View Summary" button: the web renders the SAME outlined
//    green treatment (`border-green-200 text-green-600`) for a completed
//    quick session's View Summary as it does for a completed program
//    workout's. Native rendered the quick-session one neutral grey
//    (`variant="secondary"`) while the program-workout one right below it
//    was already green (`success-outline`) — fixed to match.

/* eslint-disable import/first */
import { render, waitFor } from "@testing-library/react-native";
import * as fs from "fs";
import * as path from "path";

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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

import { apiFetch } from "@become/api-client";
import { Calendar } from "@/components/schedule/Calendar";
import type { ScheduledSlot } from "@/lib/schedule/slotStatus";
import CalendarIndexRoute from "../app/(app)/(tabs)/calendar/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

describe("NP-367: Training Calendar native parity pass", () => {
  describe("(id: np367-01) Month grid cell height and padding match the web (52px / 4px)", () => {
    it("sizes a month cell to 52px minHeight with 4px vertical padding", () => {
      const { getByTestId } = render(<Calendar month="2026-05" />);
      const cell = getByTestId("calendar-day-2026-05-15");
      const style = cell.props.style as Record<string, unknown>;
      expect(style.minHeight).toBe(52);
      expect(style.paddingVertical).toBe(4);
    });

    it("leaves the week-view cell height at the web's 80px", () => {
      const { getByTestId } = render(
        <Calendar viewMode="week" currentDate={new Date(2026, 4, 18, 12, 0, 0)} />,
      );
      const cell = getByTestId("calendar-day-2026-05-18");
      const style = cell.props.style as Record<string, unknown>;
      expect(style.minHeight).toBe(80);
    });
  });

  describe("(id: np367-02) Week-view workout chip padding and responsive text size", () => {
    it("renders the chip with px-1 py-0.5 and a responsive 8px/10px label", () => {
      const slots: ScheduledSlot[] = [
        {
          date: "2026-05-18",
          programId: "p1",
          phaseIndex: 0,
          workoutIndex: 0,
          dayLabel: "Day 1",
          status: "scheduled",
        },
      ];
      const { getByTestId, getByText } = render(
        <Calendar
          viewMode="week"
          currentDate={new Date(2026, 4, 18, 12, 0, 0)}
          slots={slots}
        />,
      );
      const chip = getByTestId("calendar-pill-2026-05-18-0");
      expect(chip.props.className).toContain("px-1");
      expect(chip.props.className).toContain("py-0.5");
      expect(chip.props.className).not.toContain("px-0.5 py-0.5");

      const label = getByText("Day 1");
      expect(label.props.className).toContain("text-[8px]");
      expect(label.props.className).toContain("sm:text-[10px]");
    });
  });

  describe("(id: np367-03) Selected day panel padding scales p-4 sm:p-6", () => {
    it("source renders the day-detail panel with p-4 sm:p-6", () => {
      const src = readExpo("app/(app)/(tabs)/calendar/index.tsx");
      const panelBlock = src.slice(
        src.indexOf('testID="calendar-day-detail"'),
        src.indexOf('testID="calendar-day-detail"') + 800,
      );
      expect(panelBlock).toContain("p-4 sm:p-6");
    });

    it("renders calendar-day-detail with the p-4 sm:p-6 className", async () => {
      mockParams = { date: "2026-05-18" };
      mockApiFetch.mockReset();
      mockApiFetch.mockResolvedValue({ schedules: [] });

      const { getByTestId } = render(<CalendarIndexRoute />);
      await waitFor(() => {
        expect(getByTestId("calendar-day-detail")).toBeTruthy();
      });
      expect(getByTestId("calendar-day-detail").props.className).toContain(
        "p-4 sm:p-6",
      );
    });
  });

  describe("(id: np367-04) Completed quick-session 'View Summary' matches the green program-workout one", () => {
    beforeEach(() => {
      mockPush.mockReset();
      mockApiFetch.mockReset();
      mockParams = { date: "2026-05-18" };
    });

    it("renders success-outline (green), not secondary (grey)", async () => {
      mockApiFetch.mockImplementation((p: string) => {
        const url = String(p);
        if (url.startsWith("/api/schedule")) {
          return Promise.resolve({ schedules: [] });
        }
        if (url.startsWith("/api/workouts/logs")) {
          return Promise.resolve({
            logs: [
              {
                kind: "quick",
                sessionId: "q-done",
                title: "Morning Run",
                date: "2026-05-18T08:00:00.000Z",
                completed: true,
                exerciseCount: 1,
                duration: 30,
              },
            ],
            favoriteSessionOrder: [],
          });
        }
        return Promise.resolve({});
      });

      const { getByTestId } = render(<CalendarIndexRoute />);
      await waitFor(() => {
        expect(getByTestId("day-detail-quick-summary-q-done")).toBeTruthy();
      });

      const btn = getByTestId("day-detail-quick-summary-q-done");
      expect(btn.props.className).toContain("border-success");
      expect(btn.props.className).not.toContain("bg-muted");
    });

    it("source wires the quick-session View Summary button to success-outline", () => {
      const src = readExpo("app/(app)/(tabs)/calendar/index.tsx");
      const block = src.slice(
        src.indexOf("day-detail-quick-summary-"),
        src.indexOf("day-detail-quick-summary-") + 900,
      );
      expect(block).toContain('variant="success-outline"');
      expect(block).toContain("colors.success");
    });
  });
});
