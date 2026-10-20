/* eslint-disable import/first */
/**
 * Face ID lock must obscure dashboard during scan — the COLD-OPEN side,
 * through the REAL root layout (same harness as `root-layout-smoke.test.tsx`
 * and `coldOpenRedirect.test.tsx`'s stores, but driving `expo-local-
 * authentication` directly rather than a DI'd `BiometricsCapability`, since
 * that is what `app/_layout.tsx` actually wires to `ColdOpenUnlock`).
 *
 * Acceptance ids attested here:
 *   9d6d3253 — a saved session with biometrics opted in renders the overlay
 *              immediately, before the Face ID prompt resolves — the opaque
 *              Modal that covers whatever `app/index.tsx` has already
 *              decided to mount underneath it (by design: `index.tsx` owns
 *              navigation regardless of the biometric verdict — see the
 *              "WHAT IT NO LONGER DOES IS NAVIGATE" note in
 *              `app/_layout.tsx` — the overlay's job is purely to make sure
 *              nothing under it is ever VISIBLE, not to block the mount).
 *   9d6d3255 — a successful scan clears the overlay and leaves the dashboard
 *              as the only thing on screen; a failed scan still drops the
 *              JWT and signs out (same `signOut("biometric-fail")` as
 *              before this card), and the overlay does not stay stuck up
 *              once that has happened — the ensuing navigation to `/login`
 *              is the existing AuthGuard's job (`(app)/_layout.tsx`, not
 *              re-tested here) and out of this card's scope.
 */
jest.mock("expo-secure-store", () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    async getItemAsync(key: string): Promise<string | null> {
      return mem.has(key) ? (mem.get(key) as string) : null;
    },
    async setItemAsync(key: string, value: string): Promise<void> {
      mem.set(key, value);
    },
    async deleteItemAsync(key: string): Promise<void> {
      mem.delete(key);
    },
    __reset(): void {
      mem.clear();
    },
  };
});

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    __esModule: true,
    ...actual,
    apiFetch: jest.fn(async () => ({
      user: { _id: "u1", email: "jon@example.com" },
    })),
  };
});

let resolveAuthenticate: (v: {
  success: boolean;
  error?: string;
}) => void = () => {};

jest.mock("expo-local-authentication", () => ({
  __esModule: true,
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(
    () =>
      new Promise((res) => {
        resolveAuthenticate = res;
      }),
  ),
}));

import { Text } from "react-native";
import { Slot } from "expo-router";
import { act, waitFor } from "@testing-library/react-native";
import { renderRouter, screen } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import RootLayout from "../app/_layout";
import LaunchRoute from "../app/index";
/* eslint-enable import/first */

const fake = SecureStore as unknown as { __reset: () => void };

const SAVED_JWT = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(
  JSON.stringify({ userId: "u1", exp: Math.floor(Date.now() / 1000) + 3600 }),
  "utf8",
).toString("base64url")}.signature`;

function StubScreen({ label }: { label: string }) {
  return <Text testID={`stub-${label}`}>{label}</Text>;
}

const ROUTES = {
  _layout: RootLayout,
  index: LaunchRoute,
  "(auth)/_layout": () => <Slot />,
  "(auth)/login": () => <StubScreen label="login" />,
  "(app)/_layout": () => <Slot />,
  "(app)/(tabs)/dashboard/index": () => <StubScreen label="dashboard" />,
  onboarding: () => <StubScreen label="onboarding" />,
};

beforeEach(() => {
  fake.__reset();
  resolveAuthenticate = () => {};
});

describe("app/_layout.tsx — the cold-open Face ID overlay", () => {
  it("(id: 9d6d3253) a saved session with biometrics opted in shows the opaque overlay immediately, before the scan resolves", async () => {
    await SecureStore.setItemAsync("become.session", SAVED_JWT);
    await SecureStore.setItemAsync("become.optin.biometrics", "yes");

    renderRouter(ROUTES, { initialUrl: "/" });

    // Up right away — before the (never-yet-resolved) authenticateAsync call
    // settles, i.e. exactly the window the Face ID sheet occupies. It is a
    // Modal (asserted in `appLockOverlay.test.tsx`), so whatever `index.tsx`
    // has already mounted behind it is covered, not visible.
    await waitFor(() => {
      expect(screen.getByTestId("app-lock-overlay")).toBeTruthy();
    });
  });

  it("(id: 9d6d3255) a successful scan reveals the dashboard and clears the overlay", async () => {
    await SecureStore.setItemAsync("become.session", SAVED_JWT);
    await SecureStore.setItemAsync("become.optin.biometrics", "yes");

    renderRouter(ROUTES, { initialUrl: "/" });

    await waitFor(() => {
      expect(screen.getByTestId("app-lock-overlay")).toBeTruthy();
    });

    await act(async () => {
      resolveAuthenticate({ success: true });
      await Promise.resolve();
    });

    expect(await screen.findByTestId("stub-dashboard")).toBeTruthy();
    expect(screen.queryByTestId("app-lock-overlay")).toBeNull();
  });

  it("(id: 9d6d3255) a failed scan drops the JWT and signs out, and the overlay does not stay stuck up", async () => {
    await SecureStore.setItemAsync("become.session", SAVED_JWT);
    await SecureStore.setItemAsync("become.optin.biometrics", "yes");

    renderRouter(ROUTES, { initialUrl: "/" });

    await waitFor(() => {
      expect(screen.getByTestId("app-lock-overlay")).toBeTruthy();
    });

    await act(async () => {
      resolveAuthenticate({ success: false, error: "authentication_failed" });
      // coldOpenFlow's own cleanup (clearing the JWT) is one more async
      // hop past `authenticateAsync` resolving; give it room before the
      // assertions below poll for the settled state.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Same consequence as before this card: the JWT is dropped, same key,
    // same "biometric-fail" path.
    await waitFor(async () => {
      expect(await SecureStore.getItemAsync("become.session")).toBeNull();
    });
    // And the overlay is not left up forever once the verdict settled —
    // whether the next screen is `/login` (the existing AuthGuard's job,
    // not re-tested here) or still mid-transition, the lock state itself
    // has cleared.
    await waitFor(() => {
      expect(screen.queryByTestId("app-lock-overlay")).toBeNull();
    });
  });
});
