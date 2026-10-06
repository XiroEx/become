/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (effect: () => void | (() => void)) => {
    // Run the focus effect on mount, like the tab coming into view.
    const React = jest.requireActual("react");
    React.useEffect(effect, [effect]);
  },
}));

let mockCurrentUser: { _id: string; email: string; name?: string; onboardingCompleted?: boolean } | null = {
  _id: "user-1",
  email: "alex@example.com",
  name: "Alex Runner",
};
let mockCurrentToken: string | null = "jwt-user-1";
const mockRefresh = jest.fn(async () => {});
const mockLogout = jest.fn(async () => {});

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: mockCurrentUser,
    token: mockCurrentToken,
    loading: false,
    isAuthed: !!mockCurrentToken,
    setToken: jest.fn(),
    refresh: mockRefresh,
    logout: mockLogout,
    signOut: mockLogout,
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

jest.mock("expo-secure-store", () => ({
  __esModule: true,
  async getItemAsync(): Promise<string | null> {
    return mockCurrentToken;
  },
  async setItemAsync(): Promise<void> {},
  async deleteItemAsync(): Promise<void> {},
}));

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(async () => ({ type: "dismiss" })),
}));

import NetInfo from "@react-native-community/netinfo";
import { ApiError, apiFetch } from "@become/api-client";
import {
  writeCache,
  readCache,
  clearAll,
  setCacheMemberId,
} from "@/lib/cache/lastKnown";
import DashboardRoute from "../app/(app)/(tabs)/dashboard/index";
import SettingsScreen from "../app/(app)/settings";
import HealthSettingsRoute from "../app/(app)/(tabs)/profile/health";
import OnboardingRoute from "../app/onboarding";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;
const mockNetInfoFetch = NetInfo.fetch as unknown as jest.Mock;

describe("Card NP-036 Acceptance Criteria", () => {
  beforeEach(async () => {
    await clearAll();
    mockApiFetch.mockReset();
    mockReplace.mockReset();
    mockPush.mockReset();
    mockRefresh.mockReset();
    mockLogout.mockReset();
    setCacheMemberId("user-1");
    mockCurrentUser = {
      _id: "user-1",
      email: "alex@example.com",
      name: "Alex Runner",
    };
    mockCurrentToken = "jwt-user-1";
  });

  afterEach(async () => {
    await clearAll();
    setCacheMemberId(null);
  });

  // ─── Acceptance Criterion 1 (id: e015c762) ───────────────────────────────
  describe("e015c762: Relaunching in airplane mode shows last-seen Home and Settings data with an offline note", () => {
    it("Home screen: shows last-seen tiles, streak, greeting, and offline note in airplane mode", async () => {
      // 1. Seed last-known cache as if previous session loaded it
      await writeCache(
        "/api/auth/me",
        { user: { _id: "user-1", email: "alex@example.com", name: "Alex Runner" } },
        "user-1",
      );
      await writeCache(
        "/api/streak",
        { streakDays: 14, longestStreak: 21, streakFreezes: 2 },
        "user-1",
      );
      await writeCache(
        "/api/programs/active",
        { activePrograms: [{ programId: "p1", programName: "Hypertrophy Wave" }] },
        "user-1",
      );
      await writeCache(
        "/api/programs/current-workout?programId=p1",
        {
          workout: { title: "Push Power A", day: "Day 1", exercises: [{}, {}, {}, {}] },
          phase: 1,
          day: "Day 1",
          phaseInfo: { name: "Phase 1" },
        },
        "user-1",
      );

      // 2. Simulate airplane mode: NetInfo offline, all fetches throw network failure
      mockNetInfoFetch.mockResolvedValue({ isConnected: false, isInternetReachable: false });
      mockApiFetch.mockRejectedValue(new Error("Network request failed (airplane mode)"));

      // 3. Render Home in airplane mode
      const { getByTestId, getByText, queryByTestId } = render(<DashboardRoute />);

      // Verify cached data is rendered. The header is the web's static copy
      // (NP-255), not a personalized greeting, so the cached member name
      // shows up through Up Next — the one next-workout card — instead of a
      // dropped "Today's workout" card.
      await waitFor(() => {
        expect(getByTestId("up-next-card")).toBeTruthy();
      });
      expect(getByText("Push Power A · Hypertrophy Wave")).toBeTruthy();

      // Verify offline note is displayed on the screen
      expect(getByTestId("dashboard-error")).toBeTruthy();
      expect(getByText("You're offline — showing last-known data.")).toBeTruthy();

      // Ensure no blocking loading skeleton
      expect(queryByTestId("dashboard-skeleton")).toBeNull();
    });

    it("Settings screen: shows last-seen consent and notification preferences with offline note in airplane mode", async () => {
      // 1. Seed last-known cache for settings
      await writeCache(
        "/api/me/consent",
        {
          termsVersion: "v1.2.0",
          acceptedVersion: "v1.2.0",
          acceptedAt: "2026-09-24T12:00:00.000Z",
          current: true,
          ai: {
            granted: true,
            decided: true,
            decidedAt: "2026-09-24T12:00:00.000Z",
          },
        },
        "user-1",
      );
      await writeCache(
        "/api/notifications/preferences",
        {
          notificationsEnabled: true,
          emailEngagement: true,
        },
        "user-1",
      );

      // 2. Simulate airplane mode
      mockNetInfoFetch.mockResolvedValue({ isConnected: false, isInternetReachable: false });
      mockApiFetch.mockRejectedValue(new Error("Network request failed"));

      // 3. Render Settings
      const { getByTestId, getByText, queryByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByText("Alex Runner")).toBeTruthy();
        expect(getByText("alex@example.com")).toBeTruthy();
      });

      // Verify offline note banner is visible
      expect(getByTestId("settings-screen-state-offline-note")).toBeTruthy();
      expect(getByText("You're offline. Showing last-saved settings.")).toBeTruthy();

      // Ensure no server error or blank screen
      expect(queryByTestId("settings-screen-state-server")).toBeNull();
    });

    it("Health Settings screen: shows last-seen profile name and weight check with offline note in airplane mode", async () => {
      // 1. Seed last-known cache for health settings
      await writeCache(
        "/api/profile",
        {
          name: "Alex Runner",
          onboardingCompleted: true,
          profile: {},
        },
        "user-1",
      );
      await writeCache(
        "/api/weight",
        {
          needsWeightCheck: false,
          lastWeight: 175,
          daysSinceLastEntry: 1,
          consecutiveSkips: 0,
        },
        "user-1",
      );

      // 2. Simulate airplane mode
      mockNetInfoFetch.mockResolvedValue({ isConnected: false, isInternetReachable: false });
      mockApiFetch.mockRejectedValue(new Error("Network unreachable"));

      // 3. Render HealthSettingsRoute
      const { getByTestId, getByText, queryByTestId } = render(<HealthSettingsRoute />);

      await waitFor(() => {
        expect(getByTestId("profile-name-input").props.value).toBe("Alex Runner");
      });

      // Verify offline note banner is visible
      expect(getByTestId("health-settings-screen-state-offline-note")).toBeTruthy();
      expect(getByText("You're offline. Showing last-saved profile.")).toBeTruthy();
      expect(queryByTestId("health-settings-screen-state-server")).toBeNull();
    });
  });

  // ─── Acceptance Criterion 2 (id: e015c763) ───────────────────────────────
  describe("e015c763: A 500 from any v1 screen's request shows the error state with a working Retry, never a blank screen", () => {
    it("Settings screen: 500 error shows ScreenState server error with working Retry", async () => {
      mockCurrentUser = null; // No user in auth, no cache
      mockApiFetch.mockRejectedValue(new ApiError(500, { error: "Database crashed" }, "Database crashed"));

      const { getByTestId, getByText, queryByTestId } = render(<SettingsScreen />);

      // Verify server error state is displayed, NOT blank
      await waitFor(() => {
        expect(getByTestId("settings-screen-state-server")).toBeTruthy();
        expect(getByText("Server error")).toBeTruthy();
        expect(getByText("Database crashed")).toBeTruthy();
      });

      // Verify Retry button works
      const retryBtn = getByTestId("settings-screen-state-retry");
      expect(retryBtn).toBeTruthy();

      // Setup recovery on retry
      mockApiFetch.mockResolvedValueOnce({
        termsVersion: "v1.2.0",
        acceptedVersion: "v1.2.0",
        ai: { granted: true },
      });
      mockApiFetch.mockResolvedValueOnce({
        notificationsEnabled: true,
      });

      await act(async () => {
        fireEvent.press(retryBtn);
      });

      // Error clears and screen renders content
      await waitFor(() => {
        expect(queryByTestId("settings-screen-state-server")).toBeNull();
      });
    });

    it("Health Settings screen: 500 error shows ScreenState server error with working Retry", async () => {
      mockApiFetch.mockRejectedValue(new ApiError(500, { error: "Profile service down" }, "Profile service down"));

      const { getByTestId, getByText, queryByTestId } = render(<HealthSettingsRoute />);

      await waitFor(() => {
        expect(getByTestId("health-settings-screen-state-server")).toBeTruthy();
        expect(getByText("Server error")).toBeTruthy();
        expect(getByText("Profile service down")).toBeTruthy();
      });

      const retryBtn = getByTestId("health-settings-screen-state-retry");
      expect(retryBtn).toBeTruthy();

      mockApiFetch.mockResolvedValueOnce({ name: "Recovered User", profile: {} });
      mockApiFetch.mockResolvedValueOnce({ lastWeight: 180 });

      await act(async () => {
        fireEvent.press(retryBtn);
      });

      await waitFor(() => {
        expect(queryByTestId("health-settings-screen-state-server")).toBeNull();
      });
    });

    it("Onboarding screen: 500 on submit shows ScreenState server error with working Retry", async () => {
      mockApiFetch.mockRejectedValue(new ApiError(500, { error: "Cannot save onboarding" }, "Cannot save onboarding"));

      const { getByTestId, getByText, queryByTestId } = render(<OnboardingRoute />);

      // Advance through steps
      fireEvent.press(getByTestId("onboarding-goal-gain_muscle"));
      fireEvent.press(getByTestId("onboarding-next"));
      fireEvent.changeText(getByTestId("onboarding-name"), "Sam");
      fireEvent.changeText(getByTestId("onboarding-age"), "25");
      fireEvent.press(getByTestId("onboarding-sex-female"));
      fireEvent.press(getByTestId("onboarding-next"));
      fireEvent.changeText(getByTestId("stat-height-ft"), "5");
      fireEvent.changeText(getByTestId("stat-height-in"), "6");
      fireEvent.changeText(getByTestId("stat-current-weight"), "140");
      fireEvent.press(getByTestId("onboarding-next"));
      fireEvent.press(getByTestId("onboarding-equipment-dumbbells"));
      fireEvent.press(getByTestId("onboarding-next"));

      // Complete -> triggers PATCH -> returns 500
      await act(async () => {
        fireEvent.press(getByTestId("onboarding-next"));
      });

      // Verify server error state with Retry is displayed, never blank
      await waitFor(() => {
        expect(getByTestId("onboarding-screen-state-server")).toBeTruthy();
        expect(getByText("Server error")).toBeTruthy();
        expect(getByText("Cannot save onboarding")).toBeTruthy();
      });

      const retryBtn = getByTestId("onboarding-screen-state-retry");
      expect(retryBtn).toBeTruthy();

      // Now mock successful response on retry
      mockApiFetch.mockResolvedValueOnce({ profile: {}, onboardingCompleted: true });

      await act(async () => {
        fireEvent.press(retryBtn);
      });

      await waitFor(() => {
        expect(queryByTestId("onboarding-screen-state-server")).toBeNull();
        expect(mockReplace).toHaveBeenCalledWith("/(tabs)/dashboard");
      });
    });

    it("Home screen: 500 error shows error state with working Retry button, never blank", async () => {
      mockApiFetch.mockRejectedValue(new ApiError(500, { error: "Gateway Timeout" }));

      const { getByTestId, getByText } = render(<DashboardRoute />);

      await waitFor(() => {
        expect(getByTestId("dashboard-error")).toBeTruthy();
        expect(getByText("Couldn't load your dashboard. Pull to refresh.")).toBeTruthy();
      });

      const retryBtn = getByTestId("dashboard-retry-button");
      expect(retryBtn).toBeTruthy();

      // Press retry
      await act(async () => {
        fireEvent.press(retryBtn);
      });

      expect(mockApiFetch.mock.calls.length).toBeGreaterThan(3);
    });
  });

  // ─── Acceptance Criterion 3 (id: e015c764) ───────────────────────────────
  describe("e015c764: Signing out and in as another member never shows the first member's cached data", () => {
    it("clears cache on sign-out and isolates member scopes", async () => {
      // 1. User 1 writes data to cache
      await writeCache("/api/profile", { name: "Alice", email: "alice@example.com" }, "user-1");
      await writeCache("/api/streak", { streakDays: 30 }, "user-1");

      expect(await readCache("/api/profile", "user-1")).toEqual({
        name: "Alice",
        email: "alice@example.com",
      });

      // 2. User 1 signs out: clearAll is called and active member cleared
      await clearAll();
      setCacheMemberId(null);

      // Verify User 1's cache is wiped
      expect(await readCache("/api/profile", "user-1")).toBeNull();
      expect(await readCache("/api/streak", "user-1")).toBeNull();

      // 3. User 2 signs in
      setCacheMemberId("user-2");

      // Verify User 2 cannot read any data from User 1
      const user2Profile = await readCache("/api/profile", "user-2");
      const user2Streak = await readCache("/api/streak", "user-2");

      expect(user2Profile).toBeNull();
      expect(user2Streak).toBeNull();

      // 4. Even if User 1's data somehow lingered, member scoping blocks it
      await writeCache("/api/streak", { streakDays: 99 }, "user-1");
      expect(await readCache("/api/streak", "user-2")).toBeNull();
    });
  });
});
