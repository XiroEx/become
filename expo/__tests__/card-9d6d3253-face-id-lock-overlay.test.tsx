/* eslint-disable import/first */
/**
 * Face ID lock must obscure dashboard during scan (native-parity, follow-up
 * to NP-187 / 6abb1268).
 *
 * George, on a real iPhone: Face ID prompts, but the dashboard is visible
 * during the scan AND in the app-switcher snapshot. The cause was
 * architectural — `ColdOpenUnlock` fired the biometric prompt in the
 * background and rendered `null`, `app/index.tsx` redirected to the
 * dashboard the moment the member was signed in (without waiting on the
 * verdict), and the warm re-lock (`useAppLock`) never signalled "hide me"
 * to anything at all.
 *
 * The fix is `AppLockOverlay` (`components/auth/AppLockOverlay.tsx`): a
 * `Modal` — not an absolutely positioned `View` — driven by
 * `resolving` (cold open, `useColdOpenRedirect`) OR'd with `locked` (warm
 * re-lock, `useAppLock`'s own new return value). A `Modal` is its own native
 * presentation above everything already on screen, which is also why it is
 * what the OS captures for the app-switcher snapshot.
 *
 * Device verification is out of reach here (no hardware in a unit test, same
 * caveat `__tests__/biometricUnlock.test.tsx` already states for NP-187): the
 * acceptance ids below are attested through the hook-level signal
 * (`useAppLock().locked`, `useColdOpenRedirect().resolving`) that
 * `AppLockOverlay`'s `visible` prop is wired to, and through the component
 * itself rendering/not-rendering for that prop — not a literal device pass.
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

import {
  act,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react-native";
import type { AppStateStatus } from "react-native";
import { Text } from "react-native";
import { Slot } from "expo-router";
import { renderRouter, screen as routerScreen } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { AppLockOverlay } from "@/components/auth/AppLockOverlay";
import { useAppLock } from "@/lib/auth/useAppLock";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";
import type { BiometricsCapability } from "@/lib/auth/biometrics";
import RootLayout from "../app/_layout";
import LaunchRoute from "../app/index";
/* eslint-enable import/first */

const fakeSecureStore = SecureStore as unknown as { __reset: () => void };

/** Unexpired, so the local `exp` check trusts it without the network. */
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

function makeAppState() {
  const listeners: ((status: AppStateStatus) => void)[] = [];
  const subscribeToAppState = jest.fn(
    (l: (status: AppStateStatus) => void) => {
      listeners.push(l);
      return jest.fn();
    },
  );
  return {
    subscribeToAppState,
    emit: (status: AppStateStatus) => {
      act(() => {
        for (const l of [...listeners]) l(status);
      });
    },
  };
}

/** A capability whose `authenticate` only settles when the test says so. */
function deferredCapability(): {
  biometrics: BiometricsCapability;
  resolve: (success: boolean) => void;
} {
  let resolveFn!: (v: { success: boolean }) => void;
  const pending = new Promise<{ success: boolean }>((res) => {
    resolveFn = res;
  });
  return {
    biometrics: {
      hasHardware: async () => true,
      isEnrolled: async () => true,
      authenticate: async () => pending,
    },
    resolve: (success: boolean) => resolveFn({ success }),
  };
}

beforeEach(() => {
  fakeSecureStore.__reset();
});

describe("(9d6d3253) AppLockOverlay — renders only while visible", () => {
  it("mounts the opaque cover when visible", () => {
    const { getByTestId } = render(<AppLockOverlay visible />);
    expect(getByTestId("app-lock-overlay")).toBeTruthy();
    expect(getByTestId("app-lock-overlay-surface")).toBeTruthy();
  });

  it("renders nothing at all when not visible — no hidden dashboard node left behind", () => {
    const { queryByTestId } = render(<AppLockOverlay visible={false} />);
    expect(queryByTestId("app-lock-overlay")).toBeNull();
    expect(queryByTestId("app-lock-overlay-surface")).toBeNull();
  });

  it("blocks Android's hardware back button instead of dismissing (onRequestClose is a no-op)", () => {
    const { getByTestId } = render(<AppLockOverlay visible />);
    const modal = getByTestId("app-lock-overlay");
    expect(() => modal.props.onRequestClose()).not.toThrow();
    expect(getByTestId("app-lock-overlay")).toBeTruthy();
  });
});

describe("(9d6d3254, 9d6d3256) useAppLock — the overlay signal for warm re-lock", () => {
  it("locks THE INSTANT the app leaves the foreground — before any store read can resolve (app-switcher snapshot)", () => {
    const appState = makeAppState();
    const { result } = renderHook(() =>
      useAppLock({
        tokenStore: createMemoryTokenStore("jwt-xyz"),
        optInStore: createMemoryTokenStore("yes"),
        biometrics: {
          hasHardware: async () => true,
          isEnrolled: async () => true,
          authenticate: async () => ({ success: true }),
        },
        gracePeriodMs: 60_000,
        subscribeToAppState: appState.subscribeToAppState,
      }),
    );

    expect(result.current.locked).toBe(false);
    appState.emit("background");
    // No `await`, no `waitFor` — this is the state in the SAME synchronous
    // tick as the AppState event, which is what the switcher snapshot sees.
    expect(result.current.locked).toBe(true);
  });

  it("inactive (the state iOS reports mid-transition, e.g. Control Center) locks too", () => {
    const appState = makeAppState();
    const { result } = renderHook(() =>
      useAppLock({
        tokenStore: createMemoryTokenStore("jwt-xyz"),
        optInStore: createMemoryTokenStore("yes"),
        biometrics: {
          hasHardware: async () => true,
          isEnrolled: async () => true,
          authenticate: async () => ({ success: true }),
        },
        subscribeToAppState: appState.subscribeToAppState,
      }),
    );
    appState.emit("inactive");
    expect(result.current.locked).toBe(true);
  });

  it("a quick hop inside the grace period unlocks again on return without a prompt", async () => {
    const clock = { now: 1_000_000 };
    const appState = makeAppState();
    const authenticate = jest.fn(async () => ({ success: true }));
    const { result } = renderHook(() =>
      useAppLock({
        tokenStore: createMemoryTokenStore("jwt-xyz"),
        optInStore: createMemoryTokenStore("yes"),
        biometrics: {
          hasHardware: async () => true,
          isEnrolled: async () => true,
          authenticate,
        },
        gracePeriodMs: 60_000,
        now: () => clock.now,
        subscribeToAppState: appState.subscribeToAppState,
      }),
    );

    appState.emit("background");
    expect(result.current.locked).toBe(true);
    clock.now += 5_000; // well inside the 60s grace period
    appState.emit("active");
    expect(result.current.locked).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("opted out: locks on background, unlocks on return without a prompt", async () => {
    const clock = { now: 1_000_000 };
    const appState = makeAppState();
    const authenticate = jest.fn(async () => ({ success: true }));
    const { result } = renderHook(() =>
      useAppLock({
        tokenStore: createMemoryTokenStore("jwt-xyz"),
        optInStore: createMemoryTokenStore(null), // opted OUT
        biometrics: {
          hasHardware: async () => true,
          isEnrolled: async () => true,
          authenticate,
        },
        gracePeriodMs: 1_000,
        now: () => clock.now,
        subscribeToAppState: appState.subscribeToAppState,
      }),
    );

    appState.emit("background");
    expect(result.current.locked).toBe(true);
    clock.now += 10 * 60_000; // long past any grace period
    appState.emit("active");
    await waitFor(() => {
      expect(result.current.locked).toBe(false);
    });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("(9d6d3255 success) stays locked through the prompt, then unlocks when it succeeds", async () => {
    const clock = { now: 1_000_000 };
    const appState = makeAppState();
    const deferred = deferredCapability();
    const onLocked = jest.fn();
    const { result } = renderHook(() =>
      useAppLock({
        tokenStore: createMemoryTokenStore("jwt-xyz"),
        optInStore: createMemoryTokenStore("yes"),
        biometrics: deferred.biometrics,
        onLocked,
        gracePeriodMs: 1_000,
        now: () => clock.now,
        subscribeToAppState: appState.subscribeToAppState,
      }),
    );

    appState.emit("background");
    clock.now += 10 * 60_000;
    appState.emit("active");

    // The prompt is in flight — still locked, nothing revealed yet.
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.locked).toBe(true);
    expect(onLocked).not.toHaveBeenCalled();

    act(() => {
      deferred.resolve(true);
    });
    await waitFor(() => {
      expect(result.current.locked).toBe(false);
    });
    expect(onLocked).not.toHaveBeenCalled();
  });

  it("(9d6d3255 failure) stays locked through the prompt, then unlocks and signs out when it fails", async () => {
    const clock = { now: 1_000_000 };
    const appState = makeAppState();
    const deferred = deferredCapability();
    const onLocked = jest.fn();
    const tokenStore = createMemoryTokenStore("jwt-xyz");
    const { result } = renderHook(() =>
      useAppLock({
        tokenStore,
        optInStore: createMemoryTokenStore("yes"),
        biometrics: deferred.biometrics,
        onLocked,
        gracePeriodMs: 1_000,
        now: () => clock.now,
        subscribeToAppState: appState.subscribeToAppState,
      }),
    );

    appState.emit("background");
    clock.now += 10 * 60_000;
    appState.emit("active");

    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.locked).toBe(true);

    act(() => {
      deferred.resolve(false);
    });
    await waitFor(() => {
      expect(onLocked).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(result.current.locked).toBe(false);
    });
    expect(await tokenStore.get()).toBeNull();
  });
});

describe("(9d6d3253) the real root layout — cold open covers the dashboard until the verdict is known", () => {
  it("a cold open with a saved session shows the lock overlay before the dashboard, and reveals the dashboard once the verdict lands", async () => {
    // What a force-quit and relaunch looks like: the JWT is already in the
    // Keychain before the tree even mounts.
    await SecureStore.setItemAsync("become.session", SAVED_JWT);

    renderRouter(ROUTES, { initialUrl: "/" });

    // Still inside the SAME synchronous render pass that mounted the tree —
    // `useColdOpenRedirect`'s cold-open flow is an async effect that has not
    // had a chance to settle yet, so this is exactly the window NP-187's
    // follow-up was about: the launch redirect already sent `/` to the
    // dashboard, and the lock overlay is what stands between that and a
    // member actually seeing it.
    expect(routerScreen.queryByTestId("app-lock-overlay")).toBeTruthy();

    await waitFor(() => {
      expect(routerScreen.getByTestId("stub-dashboard")).toBeTruthy();
    });
    // The verdict landed (no biometrics opt-in stored → straight to
    // dashboard) and the overlay came down with it.
    expect(routerScreen.queryByTestId("app-lock-overlay")).toBeNull();
  });

  it("a launch with no stored session settles on sign-in with the overlay down (a `login` verdict never leaves it stuck up)", async () => {
    renderRouter(ROUTES, { initialUrl: "/" });

    await waitFor(() => {
      expect(routerScreen.getByTestId("stub-login")).toBeTruthy();
    });
    expect(routerScreen.queryByTestId("app-lock-overlay")).toBeNull();
  });
});
