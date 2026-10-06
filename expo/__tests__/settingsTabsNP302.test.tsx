/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
  }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual("react");
    React.useEffect(effect, [effect]);
  },
}));

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(async () => ({ type: "dismiss" })),
}));

function makeJwt(expiresAtMs: number): string {
  const payload = Buffer.from(
    JSON.stringify({ userId: "u1", exp: Math.floor(expiresAtMs / 1000) }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
}

let mockStoredJwt: string | null = makeJwt(Date.now() + 86400000);
jest.mock("@/lib/auth/secureStoreToken", () => {
  const actual = jest.requireActual("@/lib/auth/secureStoreToken");
  return {
    ...actual,
    sessionStore: {
      async get() {
        return mockStoredJwt;
      },
      async set(v: string) {
        mockStoredJwt = v;
      },
      async clear() {
        mockStoredJwt = null;
      },
    },
  };
});

import { AuthProvider } from "@/lib/auth/AuthProvider";
import SettingsScreen from "../app/(app)/settings";
/* eslint-enable import/first */

function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body ?? {},
    text: async () => JSON.stringify(body ?? {}),
  } as Response;
}

/**
 * NP-302: Settings gets the web's Profile / Training / Settings segmented
 * tabs. Profile = the content that used to be the unreachable
 * `(tabs)/profile/health.tsx` screen (embedded); Training =
 * `TrainingPreferencesScreen` (embedded, no Nutrition Planning control
 * there any more); Settings stays the default tab (so every existing deep
 * link / test keeps landing on exactly what it always has) and gained
 * Nutrition Planning, moved here from the Training tab to match the web.
 */
describe("Settings: Profile / Training / Settings tabs (NP-302)", () => {
  let fetchCalls: { url: string; init?: RequestInit }[];
  let mockProfile: Record<string, unknown>;

  beforeEach(() => {
    mockStoredJwt = makeJwt(Date.now() + 86400000);
    fetchCalls = [];
    mockReplace.mockClear();
    mockPush.mockClear();
    mockProfile = {
      name: "Alex Runner",
      email: "alex@example.com",
      onboardingCompleted: true,
      profile: {
        weightUnit: "lbs",
        fitnessGoal: "lose_weight",
        fitnessGoals: ["lose_weight"],
        planPromoteMode: "manual",
      },
    };

    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      fetchCalls.push({ url, init });

      if (url.includes("/api/auth/me")) {
        return jsonResponse(200, { user: { _id: "u1", name: "Alex Runner", email: "alex@example.com" } });
      }
      if (url.includes("/api/me/consent")) {
        return jsonResponse(200, { termsVersion: "v1", acceptedVersion: "v1", current: true, ai: { granted: false } });
      }
      if (url.includes("/api/notifications/preferences")) {
        return jsonResponse(200, { notificationsEnabled: true, emailEngagement: true, preferences: {} });
      }
      if (url.includes("/api/goals")) {
        return jsonResponse(200, { todayKey: "2026-10-06", nutrition: null });
      }
      if (url.includes("/api/profile") && init?.method === "PATCH") {
        const body = JSON.parse(init.body as string);
        if (body.profile) {
          mockProfile.profile = { ...(mockProfile.profile as object), ...body.profile };
        }
        return jsonResponse(200, mockProfile);
      }
      if (url.includes("/api/profile")) {
        return jsonResponse(200, mockProfile);
      }
      return jsonResponse(200, {});
    }) as typeof fetch;
  });

  function renderScreen() {
    return render(
      <AuthProvider fetchImpl={globalThis.fetch}>
        <SettingsScreen />
      </AuthProvider>,
    );
  }

  it("defaults to the Settings tab — every existing deep link and test still lands on the original content", async () => {
    const { getByTestId, queryByTestId } = renderScreen();

    await waitFor(() => {
      expect(getByTestId("account-user-name")).toBeTruthy();
    });
    expect(getByTestId("settings-tab-settings").props.accessibilityState.selected).toBe(true);
    expect(getByTestId("settings-tab-profile").props.accessibilityState.selected).toBe(false);
    expect(getByTestId("settings-tab-training").props.accessibilityState.selected).toBe(false);
    // The Profile tab's content (the editable name input) is not mounted
    // until that tab is selected.
    expect(queryByTestId("profile-name-input")).toBeNull();
    expect(queryByTestId("training-preferences-route")).toBeNull();
  });

  it("Profile tab shows the editable Account (name/email), Body Stats and Save Changes — the former unreachable profile/health.tsx content", async () => {
    const { getByTestId, queryByTestId } = renderScreen();
    await waitFor(() => {
      expect(getByTestId("settings-tab-profile")).toBeTruthy();
    });

    fireEvent.press(getByTestId("settings-tab-profile"));

    await waitFor(() => {
      expect(getByTestId("profile-name-input").props.value).toBe("Alex Runner");
    });
    expect(getByTestId("profile-email-input").props.value).toBe("alex@example.com");
    expect(getByTestId("settings-body-stats")).toBeTruthy();
    expect(getByTestId("profile-save")).toBeTruthy();
    // The Settings tab's own Account section (sign out / admin / plan) is
    // not shown while Profile is active.
    expect(queryByTestId("settings-account-section")).toBeNull();
    // DangerZone stays the Settings tab's one surface — not duplicated here.
    expect(queryByTestId("danger-zone")).toBeNull();
  });

  it("Training tab shows Fitness Goals / Experience & Schedule / Equipment & Injuries, with no Nutrition Planning control", async () => {
    const { getByTestId, queryByText, queryByTestId } = renderScreen();
    await waitFor(() => {
      expect(getByTestId("settings-tab-training")).toBeTruthy();
    });

    fireEvent.press(getByTestId("settings-tab-training"));

    await waitFor(() => {
      expect(getByTestId("training-preferences-goal-lose_weight")).toBeTruthy();
    });
    expect(getByTestId("training-preferences-experience-selector")).toBeTruthy();
    expect(getByTestId("training-preferences-equipment-selector")).toBeTruthy();
    expect(queryByText("Nutrition Planning")).toBeNull();
    expect(queryByTestId("training-preferences-promote-manual")).toBeNull();
    expect(queryByTestId("training-preferences-promote-auto")).toBeNull();
  });

  it("Nutrition Planning lives on the Settings tab now (moved from Training) and PATCHes /api/profile", async () => {
    const { getByTestId } = renderScreen();
    await waitFor(() => {
      expect(getByTestId("account-user-name")).toBeTruthy();
    });

    await waitFor(() => {
      expect(
        getByTestId("settings-nutrition-planning-manual").props.accessibilityState
          ?.selected,
      ).toBe(true);
    });

    await act(async () => {
      fireEvent.press(getByTestId("settings-nutrition-planning-auto"));
    });

    await waitFor(() => {
      const patchCall = fetchCalls.find(
        (c) => c.url.includes("/api/profile") && c.init?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse(patchCall!.init!.body as string)).toEqual({
        profile: { planPromoteMode: "auto" },
      });
    });

    await waitFor(() => {
      expect(
        getByTestId("settings-nutrition-planning-auto").props.accessibilityState
          ?.selected,
      ).toBe(true);
    });
  });

  it("switching tabs and back preserves the Settings tab's Nutrition Planning and Danger Zone", async () => {
    const { getByTestId } = renderScreen();
    await waitFor(() => {
      expect(getByTestId("settings-tab-profile")).toBeTruthy();
    });

    fireEvent.press(getByTestId("settings-tab-profile"));
    await waitFor(() => {
      expect(getByTestId("profile-name-input")).toBeTruthy();
    });

    fireEvent.press(getByTestId("settings-tab-settings"));
    await waitFor(() => {
      expect(getByTestId("settings-nutrition-planning-section")).toBeTruthy();
    });
    expect(getByTestId("delete-account")).toBeTruthy();
  });
});
