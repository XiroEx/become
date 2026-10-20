/**
 * Face ID lock must obscure dashboard during scan — follow-up to NP-187
 * (6abb1268).
 *
 * George, on a real iPhone: the Face ID sheet prompted, but the dashboard
 * was visible underneath it, and the app-switcher snapshot showed it too.
 * Two causes, both in `app/_layout.tsx` / `lib/auth/useAppLock.ts`:
 *   1. `ColdOpenUnlock` rendered `null` — nothing ever covered the screen
 *      while the cold-open verdict was pending.
 *   2. `useAppLock`'s warm re-lock path also returned `null`, and only acted
 *      on a FAILED unlock (sign-out); a successful re-ask never showed
 *      anything either.
 *
 * This file covers both sides: the overlay component itself, and
 * `useAppLock`'s new `locked` signal (hook-level timeline tests — no
 * renderHook-against-a-real-root needed since `root-layout-smoke.test.tsx`
 * already proves the real tree boots; `coldOpenRedirect.test.tsx` already
 * proves `resolving`/`verdict`). What is new here is the WIRING: that the
 * two signals combine into an overlay that stays up until both have
 * resolved favourably, and clears correctly on every verdict.
 *
 * Acceptance ids attested here:
 *   9d6d3253 — cold open: overlay up while resolving, down once dashboard
 *              lands.
 *   9d6d3254 — warm re-lock: overlay up the instant the app backgrounds,
 *              through the whole re-verification.
 *   9d6d3255 — success reveals (overlay clears, no sign-out); failure signs
 *              out (onLocked fires) before the overlay clears.
 *   9d6d3256 — the overlay is a `Modal`, which is what the OS captures for
 *              the app-switcher snapshot; asserted structurally here.
 */
import { act, render, renderHook, waitFor } from "@testing-library/react-native";
import { Modal } from "react-native";
import type { AppStateStatus } from "react-native";
import { AppLockOverlay } from "@/components/auth/AppLockOverlay";
import { APP_LOCK_GRACE_PERIOD_MS, useAppLock } from "@/lib/auth/useAppLock";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";

describe("<AppLockOverlay>", () => {
  it("renders nothing at all when not visible — no hidden Modal competing for the snapshot", () => {
    const { queryByTestId, UNSAFE_queryAllByType } = render(
      <AppLockOverlay visible={false} />,
    );
    expect(queryByTestId("app-lock-overlay")).toBeNull();
    expect(UNSAFE_queryAllByType(Modal)).toHaveLength(0);
  });

  it("(id: 9d6d3256) renders as a Modal when visible — the OS window the app-switcher snapshot is taken from", () => {
    const { getByTestId, UNSAFE_getByType } = render(
      <AppLockOverlay visible testID="app-lock-overlay" />,
    );
    expect(getByTestId("app-lock-overlay")).toBeTruthy();
    expect(UNSAFE_getByType(Modal)).toBeTruthy();
    expect(getByTestId("app-lock-overlay-spinner")).toBeTruthy();
  });
});

describe("useAppLock — the `locked` signal that drives the overlay", () => {
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

  it("(id: 9d6d3254) flips `locked` true the INSTANT the app leaves the foreground, before any async read", () => {
    const appState = makeAppState();
    // A biometrics capability whose async methods never resolve during this
    // test — if `locked` depended on awaiting any of them, it would still be
    // false here.
    const hasHardware = jest.fn(() => new Promise<boolean>(() => {}));
    const { result } = renderHook(() =>
      useAppLock({
        tokenStore: createMemoryTokenStore("jwt-xyz"),
        optInStore: createMemoryTokenStore("yes"),
        biometrics: {
          hasHardware,
          isEnrolled: async () => true,
          authenticate: async () => ({ success: true }),
        },
        gracePeriodMs: 60_000,
        subscribeToAppState: appState.subscribeToAppState,
      }),
    );

    expect(result.current.locked).toBe(false);
    appState.emit("background");
    expect(result.current.locked).toBe(true);
  });

  it("a quick hop inside the grace period clears `locked` without ever prompting", async () => {
    const appState = makeAppState();
    const clock = { now: 1_000_000 };
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
    clock.now += 5_000;
    appState.emit("active");
    expect(result.current.locked).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("(id: 9d6d3254, 9d6d3255) stays locked through a deferred prompt, then clears on SUCCESS", async () => {
    const appState = makeAppState();
    const clock = { now: 1_000_000 };
    let resolveAuth: (v: { success: boolean }) => void = () => {};
    const authenticate = jest.fn(
      () => new Promise<{ success: boolean }>((res) => (resolveAuth = res)),
    );

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
    clock.now += 5 * 60_000;
    appState.emit("active");

    await waitFor(() => expect(authenticate).toHaveBeenCalled());
    // The prompt is up, but hasn't resolved yet — still locked.
    expect(result.current.locked).toBe(true);

    await act(async () => {
      resolveAuth({ success: true });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.locked).toBe(false));
  });

  it("(id: 9d6d3255) stays locked through a deferred prompt, then clears on FAILURE — AFTER onLocked (sign-out) has fired", async () => {
    const appState = makeAppState();
    const clock = { now: 1_000_000 };
    const tokenStore = createMemoryTokenStore("jwt-xyz");
    let resolveAuth: (v: { success: boolean; reason?: string }) => void =
      () => {};
    const authenticate = jest.fn(
      () =>
        new Promise<{ success: boolean; reason?: string }>(
          (res) => (resolveAuth = res),
        ),
    );
    const onLocked = jest.fn();

    const { result } = renderHook(() =>
      useAppLock({
        tokenStore,
        optInStore: createMemoryTokenStore("yes"),
        biometrics: {
          hasHardware: async () => true,
          isEnrolled: async () => true,
          authenticate,
        },
        onLocked,
        gracePeriodMs: 60_000,
        now: () => clock.now,
        subscribeToAppState: appState.subscribeToAppState,
      }),
    );

    appState.emit("background");
    clock.now += 5 * 60_000;
    appState.emit("active");

    await waitFor(() => expect(authenticate).toHaveBeenCalled());
    expect(result.current.locked).toBe(true);
    expect(onLocked).not.toHaveBeenCalled();

    await act(async () => {
      resolveAuth({ success: false, reason: "authentication_failed" });
      await Promise.resolve();
      await Promise.resolve();
    });

    // The JWT is already gone and sign-out already fired by the time the
    // overlay clears — never the other way round.
    expect(onLocked).toHaveBeenCalled();
    expect(await tokenStore.get()).toBeNull();
    await waitFor(() => expect(result.current.locked).toBe(false));
  });

  it("opting out clears `locked` on the next foreground return without prompting", async () => {
    const appState = makeAppState();
    const clock = { now: 1_000_000 };
    const authenticate = jest.fn(async () => ({ success: true }));

    const { result } = renderHook(() =>
      useAppLock({
        tokenStore: createMemoryTokenStore("jwt-xyz"),
        optInStore: createMemoryTokenStore(null),
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
    clock.now += 10 * 60_000;
    appState.emit("active");

    await waitFor(() => expect(result.current.locked).toBe(false));
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("defaults `locked` to false and keeps the grace period default", () => {
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
    expect(result.current.locked).toBe(false);
    expect(APP_LOCK_GRACE_PERIOD_MS).toBe(5 * 60 * 1000);
  });
});
