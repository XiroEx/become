/* eslint-disable import/first */
// NP-300: a failed/slow GET /api/mind/vision used to be indistinguishable
// from "never set one up" — the empty "Paint your vision" card. This pins:
//   1. A loading state while the request is in flight.
//   2. An error-with-retry state on failure (never the empty CTA).
//   3. Retry re-fetches and recovers to the real vision.
//   4. The hero icon is the web's Telescope, not Eye.
//   5. The editor's domain labels carry the web's per-domain icons.
import React from "react";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { Brain, Dumbbell, Home, Repeat, Telescope, Users } from "lucide-react-native";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
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

jest.mock("expo-secure-store", () => ({
  __esModule: true,
  async getItemAsync(): Promise<string | null> {
    return "test-jwt";
  },
  async setItemAsync(): Promise<void> {},
  async deleteItemAsync(): Promise<void> {},
}));

jest.mock("@/lib/feedback/haptics", () => ({
  lightHaptic: jest.fn(),
  celebrationHaptic: jest.fn(),
}));

jest.mock("@/lib/ai/runClient", () => ({
  runAiTask: jest.fn(),
}));

import { ApiError, apiFetch } from "@become/api-client";
import VisionDashboard from "@/components/mind/VisionDashboard";
/* eslint-enable import/first */

const mockedApiFetch = apiFetch as unknown as jest.Mock;

const VISION_WITH_DATA = {
  vision: {
    identityStatement: "A disciplined, present leader",
    body: "Lean and energized",
    mind: "Calm and focused",
    habits: "Train on schedule",
    relationships: "Present and dependable",
    environment: "Ordered space",
  },
  alignment: { avg7: 4, entries7: 3, todayScore: null, checkedToday: false },
};

const EMPTY_JOURNAL = { entries: [], counts: {} };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("NP-300: Vision load/error/retry and icon parity", () => {
  it("shows a loading state and never the empty 'Paint your vision' card while GET /api/mind/vision is in flight", async () => {
    const visionGate = deferred<typeof VISION_WITH_DATA>();
    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/mind/vision") return visionGate.promise;
      if (path.startsWith("/api/mind/journal")) return EMPTY_JOURNAL;
      return {};
    });

    const { getByTestId, queryByTestId } = render(<VisionDashboard />);

    await waitFor(() => {
      expect(getByTestId("vision-loading")).toBeTruthy();
    });
    expect(queryByTestId("vision-paint-button")).toBeNull();
    expect(queryByTestId("vision-error")).toBeNull();

    await act(async () => {
      visionGate.resolve(VISION_WITH_DATA);
      await visionGate.promise;
    });

    await waitFor(() => {
      expect(getByTestId("vision-profile")).toBeTruthy();
    });
    expect(queryByTestId("vision-loading")).toBeNull();
  });

  it("shows an error with retry on a failed vision fetch — never the empty 'Paint your vision' card", async () => {
    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/mind/vision") throw new ApiError(500, { error: "boom" });
      if (path.startsWith("/api/mind/journal")) return EMPTY_JOURNAL;
      return {};
    });

    const { getByTestId, queryByTestId } = render(<VisionDashboard />);

    await waitFor(() => {
      expect(getByTestId("vision-error")).toBeTruthy();
    });
    expect(queryByTestId("vision-paint-button")).toBeNull();
    expect(getByTestId("vision-error-retry")).toBeTruthy();
  });

  it("retrying after a failure re-fetches and recovers the real vision", async () => {
    let shouldFail = true;
    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/mind/vision") {
        if (shouldFail) throw new ApiError(500, { error: "boom" });
        return VISION_WITH_DATA;
      }
      if (path.startsWith("/api/mind/journal")) return EMPTY_JOURNAL;
      return {};
    });

    const { getByTestId, queryByTestId } = render(<VisionDashboard />);

    await waitFor(() => {
      expect(getByTestId("vision-error")).toBeTruthy();
    });

    shouldFail = false;
    await act(async () => {
      fireEvent.press(getByTestId("vision-error-retry"));
    });

    await waitFor(() => {
      expect(getByTestId("vision-profile")).toBeTruthy();
    });
    expect(queryByTestId("vision-error")).toBeNull();
    expect(getByTestId("vision-identity")).toHaveTextContent(
      "A disciplined, present leader",
    );
  });

  it("genuinely never set up: a successful empty response still shows 'Paint your vision'", async () => {
    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/mind/vision") {
        return { vision: null, alignment: { avg7: 0, entries7: 0, todayScore: null, checkedToday: false } };
      }
      if (path.startsWith("/api/mind/journal")) return EMPTY_JOURNAL;
      return {};
    });

    const { getByTestId } = render(<VisionDashboard />);

    await waitFor(() => {
      expect(getByTestId("vision-paint-button")).toBeTruthy();
    });
  });

  it("hero icon is the web's Telescope, not Eye", async () => {
    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/mind/vision") {
        return { vision: null, alignment: { avg7: 0, entries7: 0, todayScore: null, checkedToday: false } };
      }
      if (path.startsWith("/api/mind/journal")) return EMPTY_JOURNAL;
      return {};
    });

    const { getByTestId } = render(<VisionDashboard />);

    await waitFor(() => {
      expect(getByTestId("vision-paint-button")).toBeTruthy();
    });

    const hero = getByTestId("mind-system-hero");
    expect(within(hero).UNSAFE_getByType(Telescope)).toBeTruthy();
    // The empty-state CTA also carries the telescope, matching the web.
    expect(
      within(getByTestId("vision-paint-button")).UNSAFE_getByType(Telescope),
    ).toBeTruthy();
  });

  it("the editor carries the domain icons from the web (body/mind/habits/relationships/environment)", async () => {
    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/mind/vision") {
        return { vision: null, alignment: { avg7: 0, entries7: 0, todayScore: null, checkedToday: false } };
      }
      if (path.startsWith("/api/mind/journal")) return EMPTY_JOURNAL;
      return {};
    });

    const { getByTestId } = render(<VisionDashboard />);

    await waitFor(() => {
      expect(getByTestId("vision-paint-button")).toBeTruthy();
    });

    fireEvent.press(getByTestId("vision-paint-button"));

    await waitFor(() => {
      expect(getByTestId("vision-edit-form")).toBeTruthy();
    });

    const form = getByTestId("vision-edit-form");
    expect(within(form).UNSAFE_getByType(Dumbbell)).toBeTruthy();
    expect(within(form).UNSAFE_getByType(Brain)).toBeTruthy();
    expect(within(form).UNSAFE_getByType(Repeat)).toBeTruthy();
    expect(within(form).UNSAFE_getByType(Users)).toBeTruthy();
    expect(within(form).UNSAFE_getByType(Home)).toBeTruthy();
  });
});
