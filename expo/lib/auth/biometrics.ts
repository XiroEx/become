/**
 * Biometrics cold-open flow.
 *
 * On cold app open, when a JWT is present AND the user has opted in to
 * biometrics, prompt expo-local-authentication. The OS native dialog falls
 * back to device passcode automatically; if BOTH fail we drop the JWT and
 * route to /login for a fresh magic-link.
 *
 * Hardware / enrollment misses route straight to dashboard — opting in
 * gracefully degrades when the device can't honour it.
 */
import {
  createMemoryTokenStore,
  type TokenStore,
} from "@/lib/auth/secureStoreToken";

export type ColdOpenResult =
  | { kind: "dashboard" }
  | { kind: "login"; reason?: string };

export interface BiometricsCapability {
  hasHardware: () => Promise<boolean>;
  isEnrolled: () => Promise<boolean>;
  /** Returns success=true on biometric OR passcode success. */
  authenticate: (opts?: { reason?: string }) => Promise<{
    success: boolean;
    reason?: string;
  }>;
}

export interface ColdOpenInput {
  tokenStore: TokenStore;
  /** SecureStore-backed boolean opt-in for biometrics — same shape as health. */
  optInStore: TokenStore;
  biometrics: BiometricsCapability;
}

const OPT_IN_VALUE = "yes";

export async function coldOpenFlow(
  input: ColdOpenInput,
): Promise<ColdOpenResult> {
  const jwt = await input.tokenStore.get();
  if (!jwt) return { kind: "login", reason: "no-jwt" };

  const optedIn = (await input.optInStore.get()) === OPT_IN_VALUE;
  if (!optedIn) return { kind: "dashboard" };

  // Opted in — gracefully degrade on hardware/enrollment misses.
  if (!(await input.biometrics.hasHardware())) {
    return { kind: "dashboard" };
  }
  if (!(await input.biometrics.isEnrolled())) {
    return { kind: "dashboard" };
  }

  const result = await input.biometrics.authenticate({
    reason: "Unlock Become",
  });
  if (result.success) return { kind: "dashboard" };

  // Biometric + passcode both failed → drop the JWT, send to login.
  await input.tokenStore.clear();
  const out: ColdOpenResult = { kind: "login", reason: "biometric-fail" };
  if (result.reason !== undefined) out.reason = result.reason;
  return out;
}

/** Persistence helper for the opt-in boolean. Mirrors createHealthOptInStore. */
export interface BiometricsOptInStore {
  isOptedIn: () => Promise<boolean>;
  setOptedIn: (value: boolean) => Promise<void>;
}

export function createBiometricsOptInStore(
  inner: TokenStore,
): BiometricsOptInStore {
  return {
    async isOptedIn(): Promise<boolean> {
      return (await inner.get()) === OPT_IN_VALUE;
    },
    async setOptedIn(value: boolean): Promise<void> {
      if (value) await inner.set(OPT_IN_VALUE);
      else await inner.clear();
    },
  };
}

export function createMemoryBiometricsOptInStore(
  initial = false,
): BiometricsOptInStore {
  return createBiometricsOptInStore(
    createMemoryTokenStore(initial ? OPT_IN_VALUE : null),
  );
}
