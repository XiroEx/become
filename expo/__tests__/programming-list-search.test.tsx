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
import { toProgramSummary } from "@/lib/programs/programSummary";
import ProgrammingIndexRoute from "../app/(tabs)/programming/index";
import ProgramsSearchRoute from "../app/(tabs)/programming/search";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function callsTo(path: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => String(c[0]).startsWith(path));
}

describe("toProgramSummary", () => {
  it("maps raw webapp fields and prefers program_id as id", () => {
    expect(
      toProgramSummary({
        _id: "mongo1",
        program_id: "strength-5x5",
        name: "Strength 5x5",
        description: "Barbell strength",
        duration_weeks: 12,
        training_days_per_week: 5,
        goal: "strength",
        target_user: "Beginner",
      }),
    ).toEqual({
      id: "strength-5x5",
      name: "Strength 5x5",
      description: "Barbell strength",
      durationWeeks: 12,
      trainingDaysPerWeek: 5,
      goal: "strength",
      targetUser: "Beginner",
    });
  });

  it("falls back to _id and drops an unknown target_user", () => {
    const s = toProgramSummary({ _id: "m2", name: "X", target_user: "Pro" });
    expect(s.id).toBe("m2");
    expect(s.targetUser).toBeUndefined();
    expect(s.description).toBe("");
  });
});

describe("ProgrammingIndexRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
  });

  it("GETs /api/programs with baseUrl + token and renders the mapped list", async () => {
    mockApiFetch.mockResolvedValue([
      {
        program_id: "p1",
        name: "Strength 5x5",
        description: "d",
        duration_weeks: 12,
      },
      { program_id: "p2", name: "Hypertrophy", description: "d2" },
    ]);

    const { getByTestId } = render(<ProgrammingIndexRoute />);

    await waitFor(() => {
      expect(callsTo("/api/programs").length).toBeGreaterThan(0);
    });
    const call = callsTo("/api/programs")[0]!;
    expect(call[0]).toBe("/api/programs");
    const opts = call[2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);

    await waitFor(() => {
      expect(getByTestId("programs-list-item-p1")).toBeTruthy();
    });
    fireEvent.press(getByTestId("programs-list-item-p1"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/p1");
  });

  it("shows the loading skeleton while the fetch is in flight (not the empty state)", async () => {
    // Never-resolving fetch keeps the route in its initial-loading state.
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { getByTestId, queryByTestId } = render(<ProgrammingIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("programming-index-loading")).toBeTruthy();
    });
    // The "No programs yet" empty message must NOT show during loading.
    expect(queryByTestId("programs-list-empty")).toBeNull();
  });

  it("renders the empty state when the catalog is empty", async () => {
    mockApiFetch.mockResolvedValue([]);
    const { getByTestId, queryByTestId } = render(<ProgrammingIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("programs-list-empty")).toBeTruthy();
    });
    expect(queryByTestId("programming-index-loading")).toBeNull();
  });

  it("surfaces an error when the fetch fails", async () => {
    mockApiFetch.mockRejectedValue(new Error("boom"));
    const { getByTestId } = render(<ProgrammingIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("programming-index-error")).toBeTruthy();
    });
  });
});

describe("ProgramsSearchRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockApiFetch.mockResolvedValue({
      programs: [{ program_id: "p9", name: "Push Pull Legs", description: "d" }],
    });
  });

  it("debounces input, then GETs /api/programs/search?q=… with baseUrl", async () => {
    const { getByTestId } = render(<ProgramsSearchRoute />);

    fireEvent.changeText(getByTestId("programs-search-input"), "push");
    // Debounce not yet elapsed → no request fired synchronously.
    expect(callsTo("/api/programs/search").length).toBe(0);

    await waitFor(() => {
      expect(callsTo("/api/programs/search").length).toBeGreaterThan(0);
    });
    const call = callsTo("/api/programs/search")[0]!;
    expect(String(call[0])).toBe("/api/programs/search?q=push");
    const opts = call[2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);

    await waitFor(() => {
      expect(getByTestId("programs-search-results-item-p9")).toBeTruthy();
    });
  });

  it("does not search while the query is empty", async () => {
    render(<ProgramsSearchRoute />);
    // Give any debounce timer a chance to fire.
    await new Promise((r) => setTimeout(r, 300));
    expect(callsTo("/api/programs/search").length).toBe(0);
  });
});
