/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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
import { WEBAPP_BASE_URL } from "@/lib/config";
import CalendarIndexRoute from "../app/(tabs)/calendar/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

// A completed slot mid-month (rendered in the calendar grid) and a future
// scheduled slot (actionable from the upcoming list).
const today = new Date();
const y = today.getFullYear();
const monthStr = String(today.getMonth() + 1).padStart(2, "0");
const midMonth = `${y}-${monthStr}-15`;
const futureDate = new Date(today.getTime() + 2 * 86400000)
  .toISOString()
  .slice(0, 10);

function schedulesTo(path: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => String(c[0]) === path);
}

describe("CalendarIndexRoute", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({
      schedules: [
        {
          programId: "prog-1",
          scheduledWorkouts: [
            {
              date: `${midMonth}T00:00:00.000Z`,
              dayLabel: "Day 1",
              status: "completed",
              phase: 1,
            },
            {
              date: `${futureDate}T00:00:00.000Z`,
              dayLabel: "Day 2",
              status: "scheduled",
              phase: 1,
            },
          ],
        },
      ],
    });
  });

  it("GETs /api/schedule with baseUrl + token", async () => {
    render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(schedulesTo("/api/schedule").length).toBeGreaterThan(0);
    });
    const opts = schedulesTo("/api/schedule")[0]![2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);
  });

  it("renders calendar slots colored by status", async () => {
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId(`calendar-dot-${midMonth}`)).toBeTruthy();
    });
    expect(
      getByTestId(`calendar-dot-${midMonth}`).props.accessibilityLabel,
    ).toBe("status-completed");
  });

  it("navigates to the workout when a future scheduled slot is tapped", async () => {
    const { getByTestId } = render(<CalendarIndexRoute />);
    // workoutIndex from "Day 2" → 1; phaseIndex from phase 1 → 0.
    const itemId = `scheduled-list-item-${futureDate}-1`;
    await waitFor(() => {
      expect(getByTestId(itemId)).toBeTruthy();
    });
    fireEvent.press(getByTestId(itemId));
    expect(mockPush).toHaveBeenCalledWith(
      `/(tabs)/programming/prog-1/workout/1?phase=0`,
    );
  });

  it("does not navigate when a completed slot is tapped", async () => {
    const { getByTestId } = render(<CalendarIndexRoute />);
    const itemId = `scheduled-list-item-${midMonth}-0`;
    await waitFor(() => {
      expect(getByTestId(itemId)).toBeTruthy();
    });
    fireEvent.press(getByTestId(itemId));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
