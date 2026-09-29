/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

// The weigh-in goes through the offline queue (NP-190), which reads the JWT
// from the session store rather than from the screen: a replay fires on
// reconnect, potentially long after this screen was unmounted.
jest.mock("@/lib/auth/secureStoreToken", () => {
  const actual = jest.requireActual("@/lib/auth/secureStoreToken");
  return {
    ...actual,
    sessionStore: {
      async get() {
        return "test-jwt";
      },
      async set() {},
      async clear() {},
    },
  };
});

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

import NetInfo from "@react-native-community/netinfo";
import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { getOfflineWrites } from "@/lib/offline/writes";
import { localDateKey } from "@/lib/nutrition/localDay";
import HealthSettingsRoute from "../app/(app)/(tabs)/profile/health";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;
const mockNetInfoFetch = NetInfo.fetch as unknown as jest.Mock;
const ONLINE = { isConnected: true, isInternetReachable: true };
const AIRPLANE_MODE = { isConnected: false, isInternetReachable: false };

function callsByMethod(path: string, method: string): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]) === path &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === method,
  );
}

describe("HealthSettingsRoute (profile + weight)", () => {
  afterEach(async () => {
    await getOfflineWrites().clear();
    mockNetInfoFetch.mockResolvedValue(ONLINE);
  });

  beforeEach(() => {
    mockNetInfoFetch.mockResolvedValue(ONLINE);
    mockApiFetch.mockReset();
    let currentName = "Jon";
    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (path === "/api/profile" && (!method || method === "GET")) {
        return Promise.resolve({
          profile: {},
          name: currentName,
          onboardingCompleted: true,
        });
      }
      if (path === "/api/profile" && method === "PATCH") {
        const body = (init as { body?: { name?: string } }).body;
        if (body?.name) currentName = body.name;
        return Promise.resolve({ profile: {}, name: currentName });
      }
      if (path === "/api/weight" && (!method || method === "GET")) {
        return Promise.resolve({
          needsWeightCheck: true,
          lastWeight: 182,
          daysSinceLastEntry: 3,
          consecutiveSkips: 0,
        });
      }
      if (path === "/api/weight" && method === "POST") {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({});
    });
  });

  it("GETs /api/profile with baseUrl + token and seeds the name", async () => {
    const { getByTestId } = render(<HealthSettingsRoute />);
    await waitFor(() => {
      expect(callsByMethod("/api/profile", "GET").length).toBeGreaterThan(0);
    });
    const opts = callsByMethod("/api/profile", "GET")[0]![2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);
    await waitFor(() => {
      expect(getByTestId("profile-name-input").props.value).toBe("Jon");
    });
  });

  it("PATCHes /api/profile on save and refetches (roundtrip persists)", async () => {
    const { getByTestId } = render(<HealthSettingsRoute />);
    await waitFor(() => {
      expect(getByTestId("profile-name-input").props.value).toBe("Jon");
    });
    const getsBefore = callsByMethod("/api/profile", "GET").length;

    fireEvent.changeText(getByTestId("profile-name-input"), "Jon Updated");
    await act(async () => {
      fireEvent.press(getByTestId("profile-save"));
    });

    await waitFor(() => {
      expect(callsByMethod("/api/profile", "PATCH").length).toBeGreaterThan(0);
    });
    const patch = callsByMethod("/api/profile", "PATCH")[0]!;
    expect(patch[2]).toEqual(
      expect.objectContaining({
        method: "PATCH",
        body: { name: "Jon Updated" },
        baseUrl: WEBAPP_BASE_URL,
      }),
    );
    // onSuccess refetched the profile (reflecting the persisted name).
    await waitFor(() => {
      expect(callsByMethod("/api/profile", "GET").length).toBeGreaterThan(
        getsBefore,
      );
    });
  });

  it("GETs /api/weight skip-tracking state and shows the last logged weight", async () => {
    const { getByTestId } = render(<HealthSettingsRoute />);
    await waitFor(() => {
      expect(callsByMethod("/api/weight", "GET").length).toBeGreaterThan(0);
    });
    const opts = callsByMethod("/api/weight", "GET")[0]![2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);
    await waitFor(() => {
      const txt = getByTestId("weight-last").props.children;
      expect((Array.isArray(txt) ? txt.join("") : String(txt))).toContain("182");
    });
  });

  it("POSTs /api/weight for a logged weight and for a skip, then refetches the state", async () => {
    const { getByTestId } = render(<HealthSettingsRoute />);
    await waitFor(() => {
      expect(getByTestId("weight-input")).toBeTruthy();
    });
    const weightGetsBefore = callsByMethod("/api/weight", "GET").length;

    fireEvent.changeText(getByTestId("weight-input"), "183");
    await act(async () => {
      fireEvent.press(getByTestId("weight-log"));
    });
    await waitFor(() => {
      expect(callsByMethod("/api/weight", "POST").length).toBeGreaterThan(0);
    });
    expect(callsByMethod("/api/weight", "POST")[0]![2]).toEqual(
      expect.objectContaining({
        method: "POST",
        baseUrl: WEBAPP_BASE_URL,
      }),
    );
    // The weigh-in carries the local day it was made on, so it is the same
    // body whether it goes now or is replayed after midnight (NP-189/NP-190).
    const loggedBody = (
      callsByMethod("/api/weight", "POST")[0]![2] as {
        body: Record<string, unknown>;
      }
    ).body;
    expect(loggedBody.weight).toBe(183);
    expect(loggedBody.date).toBe(localDateKey(new Date()));

    await act(async () => {
      fireEvent.press(getByTestId("weight-skip"));
    });
    await waitFor(() => {
      expect(callsByMethod("/api/weight", "POST").length).toBeGreaterThan(1);
    });
    const skipCall = callsByMethod("/api/weight", "POST")[1]!;
    expect(skipCall[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: { weight: null, skip: true },
      }),
    );

    // Each successful POST re-pulls the skip-tracking state.
    await waitFor(() => {
      expect(callsByMethod("/api/weight", "GET").length).toBeGreaterThan(
        weightGetsBefore,
      );
    });
  });

  it("a weigh-in typed offline is kept, and replayed on its own day", async () => {
    mockNetInfoFetch.mockResolvedValue(AIRPLANE_MODE);
    const { getByTestId } = render(<HealthSettingsRoute />);
    await waitFor(() => {
      expect(getByTestId("weight-input")).toBeTruthy();
    });

    fireEvent.changeText(getByTestId("weight-input"), "179.5");
    await act(async () => {
      fireEvent.press(getByTestId("weight-log"));
    });

    expect(callsByMethod("/api/weight", "POST")).toHaveLength(0);
    await waitFor(() => {
      expect(getByTestId("weight-queued-note")).toBeTruthy();
    });

    mockNetInfoFetch.mockResolvedValue(ONLINE);
    await act(async () => {
      await getOfflineWrites().flush();
    });

    const posts = callsByMethod("/api/weight", "POST");
    expect(posts).toHaveLength(1);
    const body = (posts[0]![2] as { body: Record<string, unknown> }).body;
    expect(body.weight).toBe(179.5);
    expect(body.date).toBe(localDateKey(new Date()));
  });

  // A SKIP IS A TODAY EVENT, so it is deliberately NOT queued: it answers
  // today's prompt and moves the skip counter, and a skip replayed onto
  // yesterday would answer a prompt that is long gone.
  it("a skip is sent directly, never queued", async () => {
    mockNetInfoFetch.mockResolvedValue(AIRPLANE_MODE);
    const { getByTestId } = render(<HealthSettingsRoute />);
    await waitFor(() => {
      expect(getByTestId("weight-skip")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("weight-skip"));
    });

    await waitFor(() => {
      expect(callsByMethod("/api/weight", "POST").length).toBeGreaterThan(0);
    });
    expect(getOfflineWrites().pending()).toBe(0);
  });
});
