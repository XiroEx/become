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
  // Settings reads deep-link params (`?tab=training&highlight=weekly`); no
  // params here, so the default tab/highlight behaviour is what is tested.
  useLocalSearchParams: () => ({}),
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

const mockPasskeyCreate = jest.fn(async () => ({
  id: "cred-1",
  rawId: "cred-1",
  response: { clientDataJSON: "c", attestationObject: "a" },
}));
jest.mock("react-native-passkey", () => ({
  Passkey: {
    isSupported: () => true,
    create: (...args: unknown[]) => mockPasskeyCreate(...(args as [])),
    get: jest.fn(),
  },
}));

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
 * Regression (S23, build ffb81140): native "Add a passkey" did nothing on
 * Android or iOS because Settings rendered `<PasskeySection />` with no
 * token, so the button was disabled. The control now sits where the web has
 * it, Profile > Account under Email, and gets the token from `useAuth()`.
 * This renders the REAL Settings screen under the REAL AuthProvider with a
 * stored session and a device that supports passkeys, and asserts the button
 * is enabled and runs the ceremony with the member's token.
 */
describe("Profile > Account: Add a passkey (card 6acdcae0433f8772a69adf8c, NP-161)", () => {
  let fetchCalls: { url: string; init?: RequestInit }[];

  beforeEach(() => {
    mockStoredJwt = makeJwt(Date.now() + 86400000);
    fetchCalls = [];
    mockPasskeyCreate.mockClear();
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      fetchCalls.push({ url, init });
      if (url.includes("/api/auth/me")) {
        return jsonResponse(200, { user: { _id: "u1", name: "Alex Runner", email: "alex@example.com" } });
      }
      if (url.includes("/api/me/consent")) {
        return jsonResponse(200, { termsVersion: "v1", acceptedVersion: "v1", current: true, ai: { granted: false } });
      }
      if (url.includes("/api/auth/passkey/register/options")) {
        return jsonResponse(200, { challengeId: "chal-1", options: { challenge: "x" } });
      }
      if (url.includes("/api/auth/passkey/register/verify")) {
        return jsonResponse(200, { ok: true });
      }
      if (url.includes("/api/goals")) {
        return jsonResponse(200, { todayKey: "2026-10-13", nutrition: null });
      }
      if (url.includes("/api/profile")) {
        return jsonResponse(200, {
          name: "Alex Runner",
          email: "alex@example.com",
          onboardingCompleted: true,
          profile: { weightUnit: "lbs" },
        });
      }
      return jsonResponse(200, {});
    }) as typeof fetch;
  });

  it("is in the Profile tab's Account section, under Email, ENABLED, and runs the ceremony with the session token", async () => {
    const utils = render(
      <AuthProvider fetchImpl={globalThis.fetch}>
        <SettingsScreen />
      </AuthProvider>,
    );

    // Profile is the default tab (NP-337); wait for the profile to load.
    await waitFor(() => {
      expect(utils.getByTestId("profile-email-input").props.value).toBe("alex@example.com");
    });
    const button = utils.getByTestId("passkey-add-button");
    expect(button.props.accessibilityRole).toBe("button");
    expect(button.props.accessibilityState?.disabled).toBe(false);

    // Under Email: the passkey control comes after the email field in the tree.
    const ids: string[] = [];
    (function walk(node: { props?: { testID?: string }; children?: unknown[] } | string) {
      if (typeof node === "string" || !node) return;
      if (node.props?.testID) ids.push(node.props.testID);
      for (const c of node.children ?? []) walk(c as never);
    })(utils.toJSON() as never);
    expect(ids.indexOf("profile-email-input")).toBeGreaterThan(-1);
    expect(ids.indexOf("passkey-add-button")).toBeGreaterThan(ids.indexOf("profile-email-input"));
    expect(ids.indexOf("passkey-add-button")).toBeLessThan(ids.indexOf("settings-body-stats"));

    await act(async () => {
      fireEvent.press(button);
    });

    expect(
      await utils.findByText("Passkey added. You can use it to sign in next time."),
    ).toBeTruthy();
    expect(mockPasskeyCreate).toHaveBeenCalledTimes(1);
    const options = fetchCalls.find((c) => c.url.includes("/api/auth/passkey/register/options"));
    expect(options).toBeDefined();
    const headers = options!.init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${mockStoredJwt}`);
    expect(fetchCalls.some((c) => c.url.includes("/api/auth/passkey/register/verify"))).toBe(true);
  });
});
