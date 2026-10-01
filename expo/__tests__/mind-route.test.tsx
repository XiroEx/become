/* eslint-disable import/first */
import { act, render, waitFor } from "@testing-library/react-native";

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

// The mood write goes through the offline queue (NP-190), which reads the JWT
// from the secure store rather than from a screen — a replay fires on
// reconnect, long after the screen that queued it was unmounted.
jest.mock("expo-secure-store", () => ({
  __esModule: true,
  async getItemAsync(): Promise<string | null> {
    return "test-jwt";
  },
  async setItemAsync(): Promise<void> {},
  async deleteItemAsync(): Promise<void> {},
}));

import NetInfo from "@react-native-community/netinfo";
import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { getOfflineWrites } from "@/lib/offline/writes";
import { localDateKey } from "@/lib/nutrition/localDay";
import MindRoute from "../app/(app)/(tabs)/mind/index";
/* eslint-enable import/first */

const ONLINE = { isConnected: true, isInternetReachable: true };
const AIRPLANE_MODE = { isConnected: false, isInternetReachable: false };
const mockNetInfoFetch = NetInfo.fetch as unknown as jest.Mock;

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

describe("MindRoute (NP-105: mood picker removed)", () => {
  afterEach(async () => {
    await getOfflineWrites().clear();
    mockNetInfoFetch.mockResolvedValue(ONLINE);
  });

  beforeEach(() => {
    mockNetInfoFetch.mockResolvedValue(ONLINE);
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
      expect(getByTestId("mood-history-point-1")).toBeTruthy();
    });
  });

  it("does not render the mood picker on the Mind tab (moved to check-in)", async () => {
    const { queryByTestId } = render(<MindRoute />);
    await waitFor(() => {
      expect(getsTo("/api/progress").length).toBeGreaterThan(0);
    });
    expect(queryByTestId("mood-picker")).toBeNull();
    expect(queryByTestId("mood-picker-1")).toBeNull();
    expect(queryByTestId("mood-picker-5")).toBeNull();
  });

  // Offline mood write test verifies the queue functionality independently of Mind tab
  it("offline mood write is KEPT, and sent — on its own day — on reconnect", async () => {
    mockNetInfoFetch.mockResolvedValue(AIRPLANE_MODE);
    const writes = getOfflineWrites();
    const status = await writes.logMood(4);
    expect(status).toBe("queued");
    expect(callsByMethod("/api/mood", "POST")).toHaveLength(0);

    // Reconnect and flush
    mockNetInfoFetch.mockResolvedValue(ONLINE);
    await act(async () => {
      await writes.flush();
    });

    const posts = callsByMethod("/api/mood", "POST");
    expect(posts).toHaveLength(1);
    const body = (posts[0]![2] as { body: Record<string, unknown> }).body;
    expect(body.mood).toBe(4);
    expect(body.date).toBe(localDateKey(new Date()));
  });
});
