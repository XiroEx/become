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

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import MindRoute from "../app/(tabs)/mind/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function callsByMethod(path: string, method?: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => {
    if (String(c[0]) !== path) return false;
    const m = (c[2] as { method?: string } | undefined)?.method;
    return method ? m === method : true;
  });
}
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
    let progressGets = 0;
    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (path === "/api/progress" && (!method || method === "GET")) {
        progressGets += 1;
        // First load: 1 point. After logging, the refetch returns 2 points.
        return Promise.resolve({
          moodData:
            progressGets === 1
              ? [{ date: "Jun 1", value: 3 }]
              : [
                  { date: "Jun 1", value: 3 },
                  { date: "Jun 2", value: 5 },
                ],
        });
      }
      if (path === "/api/mood" && method === "POST") {
        return Promise.resolve({ success: true, mood: 5 });
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
    });
  });

  it("POSTs /api/mood {mood} and rerenders the strip from the refetch", async () => {
    const { getByTestId, queryByTestId } = render(<MindRoute />);
    await waitFor(() => {
      expect(getByTestId("mood-picker-5")).toBeTruthy();
    });
    // Initially one history point.
    await waitFor(() => {
      expect(getByTestId("mood-history-point-0")).toBeTruthy();
    });
    expect(queryByTestId("mood-history-point-1")).toBeNull();

    await act(async () => {
      fireEvent.press(getByTestId("mood-picker-5"));
    });

    await waitFor(() => {
      expect(callsByMethod("/api/mood", "POST").length).toBeGreaterThan(0);
    });
    const post = callsByMethod("/api/mood", "POST")[0]!;
    expect(post[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: { mood: 5 },
        baseUrl: WEBAPP_BASE_URL,
      }),
    );

    // onSuccess refetched progress; the strip now shows the second point.
    await waitFor(() => {
      expect(getsTo("/api/progress").length).toBeGreaterThan(1);
    });
    await waitFor(() => {
      expect(getByTestId("mood-history-point-1")).toBeTruthy();
    });
  });
});
