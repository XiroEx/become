/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

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

// Mock apiFetch; useFetch validates against the (real) schema only inside the
// real apiFetch — with apiFetch mocked, the resolved value flows straight to
// the hook, so we return schema-shaped fixtures.
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import DashboardRoute from "../app/(tabs)/dashboard/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function wireApiFetch() {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/api/auth/me") {
      return Promise.resolve({
        user: { _id: "u1", email: "jon@example.com", name: "Jon" },
      });
    }
    if (path === "/api/streak") {
      return Promise.resolve({
        streakDays: 5,
        longestStreak: 9,
        streakFreezes: 1,
      });
    }
    if (path === "/api/programs/active") {
      return Promise.resolve({
        activePrograms: [{ programId: "p1", programName: "Hypertrophy" }],
      });
    }
    if (path.startsWith("/api/programs/current-workout")) {
      return Promise.resolve({
        workout: { title: "Upper A", exercises: [{}, {}, {}] },
        phase: 1,
        phaseInfo: { name: "Phase 1" },
      });
    }
    if (path === "/api/mood" || path === "/api/weight") {
      return Promise.resolve({ success: true });
    }
    return Promise.resolve({});
  });
}

function callsTo(path: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) =>
    String(c[0]).startsWith(path),
  );
}

describe("DashboardRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    wireApiFetch();
  });

  it("fires the user/streak/active GETs with baseUrl + token, then current-workout", async () => {
    render(<DashboardRoute />);

    await waitFor(() => {
      expect(callsTo("/api/auth/me").length).toBeGreaterThan(0);
      expect(callsTo("/api/streak").length).toBeGreaterThan(0);
      expect(callsTo("/api/programs/active").length).toBeGreaterThan(0);
    });

    for (const path of ["/api/auth/me", "/api/streak", "/api/programs/active"]) {
      const call = callsTo(path)[0]!;
      const opts = call[2] as {
        baseUrl?: string;
        getToken?: () => string | undefined;
      };
      expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
      expect(opts.getToken?.()).toBe(mockToken);
    }

    // Dependent fetch: active program id drives the current-workout call.
    await waitFor(() => {
      expect(callsTo("/api/programs/current-workout").length).toBeGreaterThan(0);
    });
    expect(String(callsTo("/api/programs/current-workout")[0]![0])).toContain(
      "programId=p1",
    );
  });

  it("passes real props through to the presentational screen", async () => {
    const { getByTestId } = render(<DashboardRoute />);

    await waitFor(() => {
      expect(getByTestId("dashboard-greeting").props.children).toBe("Hey, Jon");
    });
    expect(getByTestId("dashboard-streak")).toBeTruthy();
    await waitFor(() => {
      expect(getByTestId("dashboard-today-workout").props.children).toBe(
        "Upper A",
      );
    });
    // exerciseCount 3 → "3 exercise" + "s"
    const exText = getByTestId("dashboard-today-exercises").props.children;
    expect(Array.isArray(exText) ? exText.join("") : exText).toContain("3");
  });

  it("pull-to-refresh re-fires the fetches", async () => {
    const { getByTestId } = render(<DashboardRoute />);

    await waitFor(() => {
      expect(getByTestId("dashboard-greeting")).toBeTruthy();
    });
    const before = callsTo("/api/auth/me").length;

    await act(async () => {
      getByTestId("dashboard-scroll").props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(callsTo("/api/auth/me").length).toBeGreaterThan(before);
    });
  });

  it("surfaces an inline error when a fetch fails", async () => {
    mockApiFetch.mockReset();
    mockApiFetch.mockRejectedValue(new Error("boom"));
    const { getByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-error")).toBeTruthy();
    });
  });

  it("check-in fires POST /api/mood + /api/weight with bodies+baseUrl and refreshes the streak", async () => {
    const { getByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-greeting")).toBeTruthy();
    });
    const streakCallsBefore = callsTo("/api/streak").length;

    // Open the check-in modal, pick a mood, enter a weight, submit.
    fireEvent.press(getByTestId("dashboard-open-checkin"));
    fireEvent.press(getByTestId("dashboard-checkin-modal-mood-4"));
    fireEvent.changeText(getByTestId("dashboard-checkin-modal-weight"), "183");
    await act(async () => {
      fireEvent.press(getByTestId("dashboard-checkin-modal-submit"));
    });

    await waitFor(() => {
      expect(callsTo("/api/mood").length).toBeGreaterThan(0);
      expect(callsTo("/api/weight").length).toBeGreaterThan(0);
    });

    const moodCall = callsTo("/api/mood")[0]!;
    expect(moodCall[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: { mood: 4 },
        baseUrl: WEBAPP_BASE_URL,
      }),
    );
    expect(
      (moodCall[2] as { getToken?: () => string | undefined }).getToken?.(),
    ).toBe(mockToken);

    const weightCall = callsTo("/api/weight")[0]!;
    expect(weightCall[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: { weight: 183 },
        baseUrl: WEBAPP_BASE_URL,
      }),
    );

    // Streak re-pulled after the check-in.
    await waitFor(() => {
      expect(callsTo("/api/streak").length).toBeGreaterThan(streakCallsBefore);
    });
  });

  it("surfaces an error in the check-in modal when a mutation fails", async () => {
    const { getByTestId, queryByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-greeting")).toBeTruthy();
    });

    // Make the mood POST fail; keep the GETs succeeding.
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/mood") return Promise.reject(new Error("save failed"));
      if (path === "/api/auth/me") {
        return Promise.resolve({
          user: { _id: "u1", email: "jon@example.com", name: "Jon" },
        });
      }
      if (path === "/api/streak") {
        return Promise.resolve({
          streakDays: 5,
          longestStreak: 9,
          streakFreezes: 1,
        });
      }
      return Promise.resolve({});
    });

    fireEvent.press(getByTestId("dashboard-open-checkin"));
    fireEvent.press(getByTestId("dashboard-checkin-modal-mood-4"));
    await act(async () => {
      fireEvent.press(getByTestId("dashboard-checkin-modal-submit"));
    });

    // The inline modal error appears and the modal stays open (not dismissed).
    await waitFor(() => {
      expect(getByTestId("dashboard-checkin-modal-error")).toBeTruthy();
    });
    expect(queryByTestId("dashboard-checkin-modal-mood-row")).toBeTruthy();
  });

  it("check-in logs mood only when weight is left blank", async () => {
    const { getByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-greeting")).toBeTruthy();
    });

    fireEvent.press(getByTestId("dashboard-open-checkin"));
    fireEvent.press(getByTestId("dashboard-checkin-modal-mood-3"));
    await act(async () => {
      fireEvent.press(getByTestId("dashboard-checkin-modal-submit"));
    });

    await waitFor(() => {
      expect(callsTo("/api/mood").length).toBeGreaterThan(0);
    });
    expect(callsTo("/api/weight").length).toBe(0);
  });
});
