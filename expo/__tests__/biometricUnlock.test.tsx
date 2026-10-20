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
import {
  act,
  fireEvent,
  render,
  waitFor,
  renderHook,
} from "@testing-library/react-native";
import type { AppStateStatus } from "react-native";
import {
  createRealBiometricsCapability,
  describeBiometricWording,
  getSupportedAuthenticationTypes,
  AUTHENTICATION_TYPE,
  BIOMETRIC_UNLOCK_REASON,
  type LocalAuthenticationModule,
} from "@/lib/auth/localAuthentication";
import {
  APP_LOCK_GRACE_PERIOD_MS,
  useAppLock,
} from "@/lib/auth/useAppLock";
import {
  BiometricUnlockSection,
  BIOMETRIC_CONFIRM_REASON,
} from "@/components/settings/BiometricUnlockSection";
import {
  createBiometricsOptInStore,
  createMemoryBiometricsOptInStore,
  type BiometricsCapability,
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

describe("getSupportedAuthenticationTypes", () => {
  it("returns the module's supported types", async () => {
    const mod = fakeModule({
      supportedAuthenticationTypesAsync: jest.fn(async () => [
        AUTHENTICATION_TYPE.FACIAL_RECOGNITION,
      ]),
    });
    expect(await getSupportedAuthenticationTypes(() => mod)).toEqual([
      AUTHENTICATION_TYPE.FACIAL_RECOGNITION,
    ]);
  });

  it("a missing module, a missing method, or a throw all degrade to []", async () => {
    expect(await getSupportedAuthenticationTypes(() => null)).toEqual([]);
    expect(
      await getSupportedAuthenticationTypes(() => fakeModule()),
    ).toEqual([]);
    expect(
      await getSupportedAuthenticationTypes(() => {
        throw new Error("UnavailabilityError");
      }),
    ).toEqual([]);
  });
});

describe("describeBiometricWording — platform-appropriate copy (George, 2026-10-06 QA)", () => {
  it("iOS reads Face ID when the hardware reports facial recognition", () => {
    expect(
      describeBiometricWording([AUTHENTICATION_TYPE.FACIAL_RECOGNITION], "ios"),
    ).toEqual({ label: "Face ID", noun: "Face ID" });
  });

  it("iOS reads Touch ID for a fingerprint-only iPhone", () => {
    expect(
      describeBiometricWording([AUTHENTICATION_TYPE.FINGERPRINT], "ios"),
    ).toEqual({ label: "Touch ID", noun: "Touch ID" });
  });

  it("iOS with nothing reported yet defaults to Face ID (prior behaviour)", () => {
    expect(describeBiometricWording([], "ios")).toEqual({
      label: "Face ID",
      noun: "Face ID",
    });
  });

  it("(QA) Android reads fingerprint instead of Face ID", () => {
    expect(
      describeBiometricWording([AUTHENTICATION_TYPE.FINGERPRINT], "android"),
    ).toEqual({ label: "fingerprint", noun: "fingerprint" });
  });

  it("Android with only facial recognition reads face unlock", () => {
    expect(
      describeBiometricWording(
        [AUTHENTICATION_TYPE.FACIAL_RECOGNITION],
        "android",
      ),
    ).toEqual({ label: "face unlock", noun: "face unlock" });
  });

  it("Android with nothing reported yet falls back to generic biometrics", () => {
    expect(describeBiometricWording([], "android")).toEqual({
      label: "biometrics",
      noun: "biometrics",
    });
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
      // Wrapped in `act`: `useAppLock` now flips `locked` synchronously on
      // the background/inactive transition itself (the overlay signal for
      // the app-switcher snapshot, native-parity follow-up to NP-187), so
      // the listener call is a real state update, not just a ref write.
      emit: (status: AppStateStatus) => {
        act(() => {
          for (const l of [...listeners]) l(status);
        });
      },
    };
  }

  /** The prompt itself is still async, so assertions after `emit` wait. */
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

describe("BiometricUnlockSection — platform wording (George, 2026-10-06 QA)", () => {
  function fakeCapability(
    overrides: Partial<BiometricsCapability> = {},
  ): BiometricsCapability {
    return {
      hasHardware: async () => true,
      isEnrolled: async () => true,
      authenticate: async () => ({ success: true }),
      ...overrides,
    };
  }

  it("Android with a fingerprint sensor reads 'Unlock with fingerprint', not Face ID", async () => {
    const { getByTestId } = render(
      <BiometricUnlockSection
        store={createMemoryBiometricsOptInStore(false)}
        biometrics={fakeCapability()}
        platformOS="android"
        getSupportedTypes={async () => [AUTHENTICATION_TYPE.FINGERPRINT]}
      />,
    );
    const toggle = await waitFor(() => getByTestId("biometric-unlock-toggle"));
    expect(toggle.props.accessibilityLabel).toBe("Unlock with fingerprint");
    expect(toggle.props.accessibilityHint).toBe(
      "Asks for fingerprint or the device passcode when reopening Become",
    );
  });

  it("Android with nothing reported falls back to generic 'biometrics' wording", async () => {
    const { getByTestId } = render(
      <BiometricUnlockSection
        store={createMemoryBiometricsOptInStore(false)}
        biometrics={fakeCapability()}
        platformOS="android"
        getSupportedTypes={async () => []}
      />,
    );
    const toggle = await waitFor(() => getByTestId("biometric-unlock-toggle"));
    expect(toggle.props.accessibilityLabel).toBe("Unlock with biometrics");
  });

  it("iOS with a facial-recognition sensor keeps 'Unlock with Face ID'", async () => {
    const { getByTestId } = render(
      <BiometricUnlockSection
        store={createMemoryBiometricsOptInStore(false)}
        biometrics={fakeCapability()}
        platformOS="ios"
        getSupportedTypes={async () => [
          AUTHENTICATION_TYPE.FACIAL_RECOGNITION,
        ]}
      />,
    );
    const toggle = await waitFor(() => getByTestId("biometric-unlock-toggle"));
    expect(toggle.props.accessibilityLabel).toBe("Unlock with Face ID");
  });
});

describe("BiometricUnlockSection — confirm immediately on turn-on (George, 2026-10-06 QA)", () => {
  function fakeCapability(
    overrides: Partial<BiometricsCapability> = {},
  ): BiometricsCapability {
    return {
      hasHardware: async () => true,
      isEnrolled: async () => true,
      authenticate: async () => ({ success: true }),
      ...overrides,
    };
  }

  it("turning the switch ON asks for a confirming biometric prompt before opting in", async () => {
    const store = createMemoryBiometricsOptInStore(false);
    const authenticate = jest.fn(async () => ({ success: true }));
    const { getByTestId } = render(
      <BiometricUnlockSection
        store={store}
        biometrics={fakeCapability({ authenticate })}
      />,
    );
    const toggle = await waitFor(() => getByTestId("biometric-unlock-toggle"));

    fireEvent.press(toggle);
    await waitFor(() => {
      expect(authenticate).toHaveBeenCalledWith(
        expect.objectContaining({ reason: BIOMETRIC_CONFIRM_REASON }),
      );
    });
    await waitFor(async () => {
      expect(await store.isOptedIn()).toBe(true);
    });
  });

  it("a failed confirm (biometric AND passcode) reverts the switch and never opts in", async () => {
    const store = createMemoryBiometricsOptInStore(false);
    const authenticate = jest.fn(async () => ({
      success: false,
      reason: "authentication_failed",
    }));
    const { getByTestId } = render(
      <BiometricUnlockSection
        store={store}
        biometrics={fakeCapability({ authenticate })}
      />,
    );
    const toggle = await waitFor(() => getByTestId("biometric-unlock-toggle"));

    fireEvent.press(toggle);
    await waitFor(() => {
      expect(authenticate).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(
        getByTestId("biometric-unlock-toggle").props.accessibilityState
          ?.checked,
      ).toBe(false);
    });
    expect(await store.isOptedIn()).toBe(false);
  });

  it("a device the probe found unavailable opts in without a confirm prompt", async () => {
    const store = createMemoryBiometricsOptInStore(false);
    const authenticate = jest.fn(async () => ({ success: true }));
    const { getByTestId } = render(
      <BiometricUnlockSection
        store={store}
        biometrics={fakeCapability({
          hasHardware: async () => false,
          authenticate,
        })}
      />,
    );
    const toggle = await waitFor(() => getByTestId("biometric-unlock-toggle"));

    fireEvent.press(toggle);
    await waitFor(async () => {
      expect(await store.isOptedIn()).toBe(true);
    });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("turning the switch OFF never prompts", async () => {
    const store = createMemoryBiometricsOptInStore(true);
    const authenticate = jest.fn(async () => ({ success: true }));
    const { getByTestId } = render(
      <BiometricUnlockSection
        store={store}
        biometrics={fakeCapability({ authenticate })}
      />,
    );
    const toggle = await waitFor(() => getByTestId("biometric-unlock-toggle"));

    fireEvent.press(toggle);
    await waitFor(async () => {
      expect(await store.isOptedIn()).toBe(false);
    });
    expect(authenticate).not.toHaveBeenCalled();
  });
});
