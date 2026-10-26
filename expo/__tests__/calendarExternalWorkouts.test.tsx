/* eslint-disable import/first */
/**
 * ─── Workouts done outside Become, on the native calendar (card 6adf69c7) ────
 *
 * Jon, 2026-10-26: a walk Whoop tracked shows on the calendar as an EXTRA
 * activity, beside the day's program session — which it does NOT complete.
 * The web draws it in `CalendarClient.tsx`; this is the same on the phone:
 * a teal dot of its own (never the program's completed green), a legend row,
 * and a read-only day card naming the activity and the app that tracked it.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import * as fs from "fs";
import * as path from "path";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: "test-jwt",
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
import CalendarIndexRoute from "../app/(app)/(tabs)/calendar/index";
import {
  externalWorkoutDetail,
  externalWorkoutsForDate,
  toExternalCalItems,
} from "@/lib/schedule/slotStatus";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const today = new Date();
const y = today.getFullYear();
const monthStr = String(today.getMonth() + 1).padStart(2, "0");
const midMonth = `${y}-${monthStr}-15`;

const WALK = {
  source: "healthkit",
  externalId: "HK-WALK-1",
  date: midMonth,
  startedAt: `${midMonth}T11:00:00.000Z`,
  endedAt: `${midMonth}T11:45:00.000Z`,
  activityType: "walking",
  activityName: "Walking",
  durationMin: 45,
  distanceKm: 3.4,
  energyKcal: 180,
  originApp: "Whoop",
};

function byPath(p: string): unknown {
  const bare = p.split("?")[0];
  if (bare === "/api/workouts/external") {
    return { from: `${y}-${monthStr}-01`, to: `${y}-${monthStr}-28`, workouts: [WALK] };
  }
  if (bare === "/api/schedule") {
    return {
      schedules: [
        {
          programId: "prog-1",
          scheduledWorkouts: [
            {
              date: `${midMonth}T00:00:00.000Z`,
              dayLabel: "Day 1",
              status: "scheduled",
              phase: 1,
            },
          ],
        },
      ],
    };
  }
  return { logs: [] };
}

describe("the calendar route", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (p: string) => byPath(p));
  });

  it("GETs the external workouts for the visible span, by local day keys", async () => {
    render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(
        mockApiFetch.mock.calls.some((c) => String(c[0]).startsWith("/api/workouts/external?from=")),
      ).toBe(true);
    });
    const call = mockApiFetch.mock.calls.find((c) => String(c[0]).startsWith("/api/workouts/external"));
    expect(String(call![0])).toMatch(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
  });

  it("draws the walk as its own marker beside the program slot, which stays scheduled", async () => {
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId(`calendar-dot-${midMonth}-1`)).toBeTruthy();
    });
    expect(getByTestId(`calendar-dot-${midMonth}`).props.accessibilityLabel).toBe("status-scheduled");
    const extra = getByTestId(`calendar-dot-${midMonth}-1`);
    expect(extra.props.accessibilityLabel).toBe("status-external");
    expect(String(extra.props.className)).toMatch(/bg-teal-500/);
    expect(String(extra.props.className)).not.toMatch(/bg-green-700/);
    expect(getByTestId("legend-external")).toBeTruthy();
  });

  it("names the walk on the day panel, read-only, as an extra activity", async () => {
    const { getByTestId, queryByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId(`calendar-day-${midMonth}`)).toBeTruthy();
    });
    fireEvent.press(getByTestId(`calendar-day-${midMonth}`));
    await waitFor(() => {
      expect(getByTestId("day-detail-external-HK-WALK-1")).toBeTruthy();
    });
    const card = getByTestId("day-detail-external-HK-WALK-1");
    expect(card.props.accessibilityLabel).toBe(
      "Walking, extra activity, Tracked by Whoop · 45 min · 2.1 mi · 180 kcal",
    );
    // Nothing to start, skip or reschedule: Health owns the session.
    expect(queryByTestId("day-detail-external-start")).toBeNull();
  });
});

describe("the words, matched to the web's", () => {
  it("reads the same as webapp/lib/workout/externalWorkoutCopy.ts", () => {
    const w = toExternalCalItems({ workouts: [WALK] })[0]!;
    expect(externalWorkoutDetail(w, "lbs")).toBe("Tracked by Whoop · 45 min · 2.1 mi · 180 kcal");
    expect(externalWorkoutDetail(w, "kg")).toBe("Tracked by Whoop · 45 min · 3.4 km · 180 kcal");
    expect(externalWorkoutDetail({ durationMin: 30 }, "kg")).toBe("Tracked workout · 30 min");

    const web = fs.readFileSync(
      path.resolve(__dirname, "../../webapp/lib/workout/externalWorkoutCopy.ts"),
      "utf8",
    );
    expect(web).toMatch(/'Tracked workout'/);
    expect(web).toMatch(/`Tracked by \$\{w\.originApp\}`/);
    expect(web).toMatch(/EXTERNAL_WORKOUT_LABEL = 'Extra activity'/);
  });

  it("matches a day on the stored day key, never through a zone", () => {
    const items = toExternalCalItems({ workouts: [WALK] });
    expect(externalWorkoutsForDate(items, midMonth)).toHaveLength(1);
    expect(externalWorkoutsForDate(items, `${y}-${monthStr}-16`)).toHaveLength(0);
  });
});
