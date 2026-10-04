/**
 * Face ID / fingerprint unlock (NP-187).
 *
 * The cold-open flow (`lib/auth/biometrics.ts`) is written and tested against
 * the `BiometricsCapability` interface; these tests drive the REAL capability
 * (`lib/auth/localAuthentication.ts`, backed by `expo-local-authentication`),
 * the background re-lock (`lib/auth/useAppLock.ts`) and the Settings switch
 * (`components/settings/BiometricUnlockSection.tsx`).
 *
 * Device verification is deferred to NP-008 (screens-first rule, 10/3): no
 * test here touches hardware. The module is injected per case, and the
 * acceptance ids below are attested through these unit tests — a real iPhone
 * pass waits on NP-008.
 */
import { fireEvent, render, waitFor, renderHook } from "@testing-library/react-native";
import type { AppStateStatus } from "react-native";
import {
  createRealBiometricsCapability,
  BIOMETRIC_UNLOCK_REASON,
  type LocalAuthenticationModule,
} from "@/lib/auth/localAuthentication";
import {
  APP_LOCK_GRACE_PERIOD_MS,
  useAppLock,
} from "@/lib/auth/useAppLock";
import { BiometricUnlockSection } from "@/components/settings/BiometricUnlockSection";
import {
  createBiometricsOptInStore,
  createMemoryBiometricsOptInStore,
} from "@/lib/auth/biometrics";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";

function fakeModule(
  overrides: Partial<LocalAuthenticationModule> = {},
): LocalAuthenticationModule & {
  authenticateAsync: jest.Mock;
  hasHardwareAsync: jest.Mock;
  isEnrolledAsync: jest.Mock;
} {
  return {
    hasHardwareAsync: jest.fn(async () => true),
    isEnrolledAsync: jest.fn(async () => true),
    authenticateAsync: jest.fn(async () => ({ success: true as const })),
    ...overrides,
  } as LocalAuthenticationModule & {
    authenticateAsync: jest.Mock;
    hasHardwareAsync: jest.Mock;
    isEnrolledAsync: jest.Mock;
  };
}

describe("createRealBiometricsCapability", () => {
  it("(e015cacf) asks for Face ID on unlock and signs out only when both checks fail", async () => {
    const mod = fakeModule({
      authenticateAsync: jest.fn(async () => ({
        success: false as const,
        error: "authentication_failed",
      })),
    });
    const capability = createRealBiometricsCapability({
      loadModule: () => mod,
    });

    expect(await capability.hasHardware()).toBe(true);
    expect(await capability.isEnrolled()).toBe(true);
    const result = await capability.authenticate();
    expect(mod.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: BIOMETRIC_UNLOCK_REASON }),
    );
    // The OS dialog falls back to the device passcode automatically; only a
    // failure of BOTH reaches success: false — and that is what signs out.
    expect(result.success).toBe(false);
  });

  it("biometric success → success (no sign-out)", async () => {
    const mod = fakeModule();
    const capability = createRealBiometricsCapability({
      loadModule: () => mod,
    });
    expect(await capability.authenticate()).toEqual({ success: true });
  });

  it("(e015cad0) no hardware or nothing enrolled → no prompt, app opens", async () => {
    const noHardware = createRealBiometricsCapability({
      loadModule: () =>
        fakeModule({ hasHardwareAsync: jest.fn(async () => false) }),
    });
    expect(await noHardware.hasHardware()).toBe(false);

    const notEnrolled = createRealBiometricsCapability({
      loadModule: () =>
        fakeModule({ isEnrolledAsync: jest.fn(async () => false) }),
    });
    expect(await notEnrolled.isEnrolled()).toBe(false);
  });

  it("keeps the device-passcode fallback on (never disables it)", async () => {
    const mod = fakeModule();
    const capability = createRealBiometricsCapability({
      loadModule: () => mod,
    });
    await capability.authenticate();
    const opts = (mod.authenticateAsync as jest.Mock).mock.calls[0]?.[0] ?? {};
    expect(opts.disableDeviceFallback).not.toBe(true);
  });

  it("a missing module (Expo Go) degrades to no-hardware answers", async () => {
    const capability = createRealBiometricsCapability({
      loadModule: () => null,
    });
    expect(await capability.hasHardware()).toBe(false);
    expect(await capability.isEnrolled()).toBe(false);
    expect(await capability.authenticate()).toEqual(
      expect.objectContaining({ success: false }),
    );
  });

  it("a throwing module degrades instead of crashing the launch", async () => {
    const capability = createRealBiometricsCapability({
      loadModule: () => {
        throw new Error("UnavailabilityError");
      },
    });
    expect(await capability.hasHardware()).toBe(false);
    expect(await capability.isEnrolled()).toBe(false);
    expect(await capability.authenticate()).toEqual(
      expect.objectContaining({ success: false }),
    );
  });
});

describe("useAppLock — re-ask after a set time in the background", () => {
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
        for (const l of [...listeners]) l(status);
      },
    };
  }

  /** Emit outside `act` and flush: the prompt is async, so assertions wait. */
  async function backgroundAndForeground(
    appState: ReturnType<typeof makeAppState>,
    advanceMs: number,
    clock: { now: number },
  ): Promise<void> {
    appState.emit("background");
    clock.now += advanceMs;
    appState.emit("active");
  }

  it("foreground after the grace period re-prompts; success keeps the session", async () => {
    const appState = makeAppState();
    const clock = { now: 1_000_000 };
    const tokenStore = createMemoryTokenStore("jwt-xyz");
    const optInStore = createMemoryTokenStore("yes");
    const authenticate = jest.fn(async () => ({ success: true }));
    const onLocked = jest.fn();

    renderHook(() =>
      useAppLock({
        tokenStore,
        optInStore,
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

    await backgroundAndForeground(appState, 5 * 60_000, clock);
    await waitFor(() => {
      expect(authenticate).toHaveBeenCalled();
    });
    expect(await tokenStore.get()).toBe("jwt-xyz");
    expect(onLocked).not.toHaveBeenCalled();
  });
  it("a quick hop to the switcher (inside the grace period) does not prompt", async () => {
    const appState = makeAppState();
    const clock = { now: 1_000_000 };
    const authenticate = jest.fn(async () => ({ success: true }));

    renderHook(() =>
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

    await backgroundAndForeground(appState, 5_000, clock);
    await new Promise((r) => setTimeout(r, 20));
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("failing both checks on return drops the JWT and calls onLocked (sign-out)", async () => {
    const appState = makeAppState();
    const clock = { now: 1_000_000 };
    const tokenStore = createMemoryTokenStore("jwt-xyz");
    const onLocked = jest.fn();

    renderHook(() =>
      useAppLock({
        tokenStore,
        optInStore: createMemoryTokenStore("yes"),
        biometrics: {
          hasHardware: async () => true,
          isEnrolled: async () => true,
          authenticate: async () => ({
            success: false,
            reason: "authentication_failed",
          }),
        },
        onLocked,
        gracePeriodMs: 60_000,
        now: () => clock.now,
        subscribeToAppState: appState.subscribeToAppState,
      }),
    );

    await backgroundAndForeground(appState, 5 * 60_000, clock);
    await waitFor(() => {
      expect(onLocked).toHaveBeenCalled();
    });
    expect(await tokenStore.get()).toBeNull();
  });

  it("(e015cad0) switch off → foreground return never prompts", async () => {
    const appState = makeAppState();
    const clock = { now: 1_000_000 };
    const authenticate = jest.fn(async () => ({ success: true }));

    renderHook(() =>
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

    await backgroundAndForeground(appState, 10 * 60_000, clock);
    await new Promise((r) => setTimeout(r, 20));
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("defaults to a five-minute grace period", () => {
    expect(APP_LOCK_GRACE_PERIOD_MS).toBe(5 * 60 * 1000);
  });
});

describe("BiometricUnlockSection — the Settings switch", () => {
  it("hydrates from the opt-in store and writes through on toggle", async () => {
    const store = createMemoryBiometricsOptInStore(false);
    const { getByTestId } = render(<BiometricUnlockSection store={store} />);

    await waitFor(() => {
      expect(getByTestId("biometric-unlock-toggle")).toBeTruthy();
    });
    expect(
      getByTestId("biometric-unlock-toggle").props.accessibilityState?.checked,
    ).toBe(false);

    fireEvent.press(getByTestId("biometric-unlock-toggle"));
    await waitFor(async () => {
      expect(await store.isOptedIn()).toBe(true);
    });
  });

  it("toggling the switch never touches the session JWT (own key NP-001)", async () => {
    const inner = createMemoryTokenStore(null);
    const session = createMemoryTokenStore("jwt-xyz");
    const store = createBiometricsOptInStore(inner);

    const { getByTestId } = render(<BiometricUnlockSection store={store} />);
    await waitFor(() => {
      expect(getByTestId("biometric-unlock-toggle")).toBeTruthy();
    });

    fireEvent.press(getByTestId("biometric-unlock-toggle"));
    await waitFor(async () => {
      expect(await store.isOptedIn()).toBe(true);
    });
    fireEvent.press(getByTestId("biometric-unlock-toggle"));
    await waitFor(async () => {
      expect(await store.isOptedIn()).toBe(false);
    });
    expect(await session.get()).toBe("jwt-xyz");
    expect(await inner.get()).toBeNull();
  });

  it("renders in the Security section with an accessible name", async () => {
    const { getByTestId } = render(
      <BiometricUnlockSection store={createMemoryBiometricsOptInStore(true)} />,
    );
    await waitFor(() => {
      expect(getByTestId("settings-security-section")).toBeTruthy();
    });
    const toggle = getByTestId("biometric-unlock-toggle");
    expect(toggle.props.accessibilityRole).toBe("switch");
    expect(toggle.props.accessibilityLabel).toBe("Unlock with Face ID");
  });
});
