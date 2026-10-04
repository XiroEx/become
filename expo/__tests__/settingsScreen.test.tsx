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
    // Run the focus effect on mount, like the tab coming into view.
    const React = jest.requireActual("react");
    React.useEffect(effect, [effect]);
  },
}));

const mockOpenBrowserAsync = jest.fn(async (_url?: string, _options?: unknown) => ({ type: "dismiss" }));
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: (url: string, options?: unknown) =>
    options !== undefined
      ? mockOpenBrowserAsync(url, options)
      : mockOpenBrowserAsync(url),
}));

function makeJwt(expiresAtMs: number, marker = "a"): string {
  const payload = Buffer.from(
    JSON.stringify({ userId: "u1", marker, exp: Math.floor(expiresAtMs / 1000) }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.signature-${marker}`;
}

// In-memory token store for SecureStore
let mockStoredJwt: string | null = makeJwt(Date.now() + 86400000, "init");
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
import { setStoredPushToken, getStoredPushToken } from "@/lib/push/pushTokenStore";
import { createLiveWorkoutCache, liveCacheKey } from "@/lib/live/liveWorkoutCache";
import { getOfflineWrites } from "@/lib/offline/writes";
import { HEALTH_DISCLAIMER_SHORT } from "@become/core";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

describe("SettingsScreen", () => {
  let fetchCalls: { url: string; init?: RequestInit }[] = [];
  let mockCurrentUser: { _id: string; name: string; email: string; role?: string } = {
    _id: "user-1",
    name: "Alex Runner",
    email: "alex@example.com",
  };

  beforeEach(async () => {
    mockStoredJwt = makeJwt(Date.now() + 30 * 24 * 60 * 60 * 1000, "fresh");
    mockCurrentUser = {
      _id: "user-1",
      name: "Alex Runner",
      email: "alex@example.com",
    };
    fetchCalls = [];
    mockReplace.mockClear();
    mockPush.mockClear();
    mockOpenBrowserAsync.mockClear();
    jest.clearAllMocks();
    // Fresh denial-reminder storage per test.
    await AsyncStorage.clear();

    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      fetchCalls.push({ url, init });

      if (url.includes("/api/auth/me")) {
        return jsonResponse(200, {
          user: mockCurrentUser,
        });
      }

      if (url.includes("/api/auth/handoff")) {
        return jsonResponse(200, {
          code: "admin-handoff-code",
        });
      }

      if (url.includes("/api/me/consent")) {
        return jsonResponse(200, {
          termsVersion: "v1.2.0",
          acceptedVersion: "v1.2.0",
          acceptedAt: "2026-09-24T12:00:00.000Z",
          current: true,
          ai: {
            granted: true,
            decided: true,
            decidedAt: "2026-09-24T12:00:00.000Z",
          },
        });
      }

      if (url.includes("/api/notifications/preferences")) {
        return jsonResponse(200, {
          notificationsEnabled: true,
          emailEngagement: true,
          preferences: {
            workoutReminder: true,
            streakAtRisk: true,
          },
        });
      }

      if (url.includes("/api/notifications/unsubscribe")) {
        return jsonResponse(200, { success: true });
      }

      if (url.includes("/api/auth/logout")) {
        return jsonResponse(200, { success: true });
      }

      if (url.includes("/api/me/ai-consent")) {
        return jsonResponse(200, { granted: false, decided: true });
      }

      if (url.includes("/api/me/account")) {
        return jsonResponse(200, { ok: true, restorableUntil: "2026-10-07" });
      }

      return jsonResponse(200, {});
    }) as typeof fetch;
  });

  function renderScreen(notifDeps?: {
    getPermission?: () => Promise<"granted" | "denied" | "undetermined">;
    enablePush?: (jwt: string) => Promise<{ kind: string }>;
    repairPush?: (jwt: string) => Promise<{ kind: string }>;
    openSettings?: () => Promise<void>;
  }) {
    return render(
      <AuthProvider fetchImpl={globalThis.fetch}>
        <SettingsScreen notifDeps={notifDeps} />
      </AuthProvider>,
    );
  }

  it("(e015c7a5) Sign out returns to sign-in, and relaunching does not restore the session", async () => {
    // 1. Setup a registered push token and live workout drafts
    await setStoredPushToken("ExponentPushToken[device-test-123]");
    const cache = createLiveWorkoutCache();
    await cache.save(liveCacheKey("prog-1", 0), { bench: [{ reps: 5, weight: 135, completed: true }] });

    const { getByTestId } = renderScreen();

    // Wait for user to load in Account section
    await waitFor(() => {
      expect(getByTestId("account-user-name")).toBeTruthy();
    });
    expect(getByTestId("account-user-name").props.children).toBe("Alex Runner");
    expect(getByTestId("account-user-email").props.children).toBe("alex@example.com");

    const signOutBtn = getByTestId("sign-out-button");
    await act(async () => {
      fireEvent.press(signOutBtn);
    });

    // Verify sign-out navigated to /login
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });

    // (e015c7a6) Verify unsubscribe was called with this device's push token endpoint
    const unsubCall = fetchCalls.find((c) => c.url.includes("/api/notifications/unsubscribe"));
    expect(unsubCall).toBeDefined();
    expect(unsubCall?.init?.method).toBe("POST");
    expect(JSON.parse(unsubCall?.init?.body as string)).toEqual({
      endpoint: "ExponentPushToken[device-test-123]",
    });

    // Verify stored push token was dropped
    expect(await getStoredPushToken()).toBeNull();

    // Verify POST /api/auth/logout was called
    const logoutCall = fetchCalls.find((c) => c.url.includes("/api/auth/logout"));
    expect(logoutCall).toBeDefined();
    expect(logoutCall?.init?.method).toBe("POST");

    // Verify session was cleared from storage
    expect(mockStoredJwt).toBeNull();

    // Verify offline queue and live workout drafts were cleared
    expect(getOfflineWrites().pending()).toBe(0);
    expect(await cache.load(liveCacheKey("prog-1", 0))).toBeNull();

    // Verify relaunching does not restore the session
    const freshRender = renderScreen();
    await waitFor(() => {
      expect(mockStoredJwt).toBeNull();
    });
    expect(freshRender.queryByTestId("account-user-name")).toBeNull();
  });

  it("(e015c7a7) Terms, Privacy, Health data and Support open from Settings without leaving the app", async () => {
    const { getByTestId } = renderScreen();

    await waitFor(() => {
      expect(getByTestId("settings-legal-section")).toBeTruthy();
    });

    const links = [
      { id: "legal-link-terms", expectedUrl: "https://becomeurbest.com/terms" },
      { id: "legal-link-privacy", expectedUrl: "https://becomeurbest.com/privacy" },
      { id: "legal-link-health-data", expectedUrl: "https://becomeurbest.com/health-data" },
      { id: "legal-link-support", expectedUrl: "https://becomeurbest.com/support" },
      { id: "legal-link-delete-account", expectedUrl: "https://becomeurbest.com/delete-account" },
    ];

    for (const link of links) {
      const el = getByTestId(link.id);
      expect(el).toBeTruthy();
      fireEvent.press(el);
      expect(mockOpenBrowserAsync).toHaveBeenCalledWith(link.expectedUrl);
    }
  });

  it("(e015c7a8) The agreement record and the health disclaimer are shown", async () => {
    const { getByTestId } = renderScreen();

    // Wait for consent record to render
    await waitFor(() => {
      expect(getByTestId("consent-record")).toBeTruthy();
    });

    const consentText = getByTestId("consent-record");
    expect(consentText.props.children).toContain("You agreed to the Terms and Privacy Policy (v1.2.0)");
    expect(consentText.props.children).toContain("September 24, 2026");

    // Health disclaimer
    const disclaimer = getByTestId("health-disclaimer");
    expect(disclaimer).toBeTruthy();
    expect(disclaimer.props.children).toBe(HEALTH_DISCLAIMER_SHORT);

    // App version and build
    const appVersion = getByTestId("app-version");
    expect(appVersion).toBeTruthy();
    expect(appVersion.props.children).toContain("Version");
  });

  it("toggles notifications and email engagement", async () => {
    const { getByTestId } = renderScreen();

    await waitFor(() => {
      expect(getByTestId("account-user-name")).toBeTruthy();
    });

    const emailToggle = getByTestId("email-engagement-toggle");
    await act(async () => {
      fireEvent.press(emailToggle);
    });

    await waitFor(() => {
      const patchCall = fetchCalls.find(
        (c) => c.url.includes("/api/notifications/preferences") && c.init?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse(patchCall?.init?.body as string)).toEqual({ emailEngagement: false });
    });
  });

  it("(e015c821) a per-type switch PATCHes its own key flat, like the web", async () => {
    const { getByTestId } = renderScreen();

    await waitFor(() => {
      expect(getByTestId("notification-toggle-workoutReminder")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("notification-toggle-workoutReminder"));
    });

    await waitFor(() => {
      const patchCall = fetchCalls.find(
        (c) =>
          c.url.includes("/api/notifications/preferences") &&
          c.init?.method === "PATCH" &&
          String(c.init?.body).includes("workoutReminder"),
      );
      expect(patchCall).toBeDefined();
      // Flat body — the shape the server reads per key, so the web reads it back.
      expect(JSON.parse(patchCall?.init?.body as string)).toEqual({
        workoutReminder: false,
      });
    });
  });

  it("(e015c821) chatMessage stays hidden while NP-032 keeps chat out", async () => {
    const { getByTestId, queryByTestId } = renderScreen();

    await waitFor(() => {
      expect(getByTestId("notification-toggle-workoutReminder")).toBeTruthy();
    });

    expect(queryByTestId("notification-toggle-chatMessage")).toBeNull();
    // The other nine per-type switches are visible.
    for (const key of [
      "dailyGlance",
      "checkInReminder",
      "mindReminder",
      "goalNudge",
      "superStreakAtRisk",
      "streakAtRisk",
      "mealReminder",
      "reEngagement",
    ]) {
      expect(getByTestId(`notification-toggle-${key}`)).toBeTruthy();
    }
  });

  it("(e015c823) turning notifications off posts unsubscribe with no endpoint (account-wide)", async () => {
    const { getByTestId } = renderScreen();

    await waitFor(() => {
      expect(getByTestId("notifications-toggle")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("notifications-toggle"));
    });

    await waitFor(() => {
      const unsubCall = fetchCalls.find((c) =>
        c.url.includes("/api/notifications/unsubscribe"),
      );
      expect(unsubCall).toBeDefined();
      expect(unsubCall?.init?.method).toBe("POST");
      // No endpoint = the server drops EVERY device and latches the master
      // switch off — notifications stop on all of the member's devices.
      expect(JSON.parse(unsubCall?.init?.body as string)).toEqual({});
    });
  });

  it("(e015c822) a denied member is shown the way to iOS Settings", async () => {
    // Past the 7-day silence so the reminder shows.
    const storage = AsyncStorage;
    const { PUSH_CARD_DENIED_AT_KEY } = jest.requireActual(
      "../components/push/PushOptInCard",
    );
    await storage.setItem(
      PUSH_CARD_DENIED_AT_KEY,
      String(Date.now() - 8 * 24 * 60 * 60 * 1000),
    );

    const openSettings = jest.fn(async () => {});
    const { getByTestId } = renderScreen({
      getPermission: async () => "denied",
      openSettings,
    });

    await waitFor(() => {
      expect(getByTestId("notifications-status").props.children).toBe("Blocked");
    });
    await waitFor(() => {
      expect(getByTestId("notifications-denied-reminder")).toBeTruthy();
    });
    expect(getByTestId("notifications-open-settings")).toBeTruthy();
    // The button opens the OS Settings app at Become's permissions.
    await act(async () => {
      fireEvent.press(getByTestId("notifications-open-settings"));
    });
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it("toggles AI consent with DELETE /api/me/ai-consent", async () => {
    const { getByTestId } = renderScreen();

    await waitFor(() => {
      expect(getByTestId("account-user-name")).toBeTruthy();
      expect(getByTestId("consent-record")).toBeTruthy();
    });

    const aiToggle = getByTestId("ai-consent-toggle");
    await act(async () => {
      fireEvent.press(aiToggle);
    });

    await waitFor(() => {
      const deleteAiCall = fetchCalls.find(
        (c) => c.url.includes("/api/me/ai-consent") && c.init?.method === "DELETE",
      );
      expect(deleteAiCall).toBeDefined();
    });
  });

  it("Delete account is 2 taps away and kept at the bottom of Settings", async () => {
    const { getByTestId } = renderScreen();

    await waitFor(() => {
      expect(getByTestId("delete-account")).toBeTruthy();
    });

    // Tap 1: raises confirmation modal
    fireEvent.press(getByTestId("delete-account"));
    expect(getByTestId("delete-account-confirm")).toBeTruthy();

    // Tap 2: confirms deletion
    await act(async () => {
      fireEvent.press(getByTestId("delete-account-confirm"));
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("(e015c971) An admin sees Admin tools in native Settings and it opens the web admin overview", async () => {
    mockCurrentUser = {
      _id: "admin-1",
      name: "Jon Coach",
      email: "jon@example.com",
      role: "admin",
    };

    const { getByTestId, getByText } = renderScreen();

    await waitFor(() => {
      expect(getByText("Admin tools")).toBeTruthy();
    });

    const adminRow = getByTestId("admin-tools-row");
    expect(adminRow).toBeTruthy();

    await act(async () => {
      fireEvent.press(adminRow);
    });

    await waitFor(() => {
      const handoffCall = fetchCalls.find((c) => c.url.includes("/api/auth/handoff"));
      expect(handoffCall).toBeDefined();
      expect(JSON.parse(handoffCall?.init?.body as string)).toEqual({
        path: "/dashboard/admin",
      });
      expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
        expect.stringContaining("/auth/handoff?code=admin-handoff-code"),
      );
    });
  });

  it("(e015c972) A member never sees the Admin tools row", async () => {
    mockCurrentUser = {
      _id: "member-1",
      name: "Alex Member",
      email: "alex@example.com",
      role: "member",
    };

    const { queryByText, queryByTestId } = renderScreen();

    await waitFor(() => {
      expect(queryByTestId("account-user-name")).toBeTruthy();
    });

    expect(queryByText("Admin tools")).toBeNull();
    expect(queryByTestId("admin-tools-row")).toBeNull();
  });
});
