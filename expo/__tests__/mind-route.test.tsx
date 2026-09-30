/* eslint-disable import/first */
import { render, waitFor } from "@testing-library/react-native";

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
import MindRoute from "../app/(app)/(tabs)/mind/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function getsTo(path: string): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]) === path &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === "GET",
  );
}

describe("MindRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (path === "/api/progress" && (!method || method === "GET")) {
        return Promise.resolve({
          moodData: [
            { date: "Jun 1", value: 3 },
            { date: "Jun 2", value: 5 },
          ],
        });
      }
      return Promise.resolve({});
    });
  });

  it("GETs /api/progress with baseUrl + token and renders the history strip", async () => {
    const { getByTestId } = render(<MindRoute />);
    await waitFor(() => {
      expect(getsTo("/api/progress").length).toBeGreaterThan(0);
    });
    const opts = getsTo("/api/progress")[0]![2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);
    await waitFor(() => {
      expect(getByTestId("mood-history-point-0")).toBeTruthy();
      expect(getByTestId("mood-history-point-1")).toBeTruthy();
    });
  });

  it("does not render the mood picker on the Mind tab (mood logging belongs to check-in)", async () => {
    const { queryByTestId } = render(<MindRoute />);
    await waitFor(() => {
      expect(getsTo("/api/progress").length).toBeGreaterThan(0);
    });
    expect(queryByTestId("mood-picker-1")).toBeNull();
    expect(queryByTestId("mood-picker-5")).toBeNull();
  });
});
