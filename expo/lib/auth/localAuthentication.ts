/**
 * The REAL biometrics capability, backed by `expo-local-authentication`.
 *
 * The cold-open flow (`lib/auth/biometrics.ts`) only knows the
 * `BiometricsCapability` interface — this file is the implementation it runs
 * against on a real phone. The OS native dialog falls back to the device
 * passcode automatically (`disableDeviceFallback` stays false), so a failed
 * biometric check falls back to the passcode and only a failure of BOTH
 * returns `success: false` — at which point the flow drops the JWT and the
 * member signs in again with a fresh magic link.
 *
 * Hardware / enrollment misses degrade to "no prompt": `hasHardware` and
 * `isEnrolled` answer false and the flow routes straight to the dashboard.
 * Expo Go has no native module, so every call is wrapped: anything the module
 * throws (including `UnavailabilityError`) becomes the no-hardware answer.
 *
 * Device verification is deferred to NP-008 (screens-first rule, 10/3): this
 * file is unit-tested against the module's own API, not against hardware.
 */
import type { BiometricsCapability } from "@/lib/auth/biometrics";

export const BIOMETRIC_UNLOCK_REASON = "Unlock Become";

/** The module, loaded lazily so Expo Go (no native side) never throws at import. */
export interface LocalAuthenticationModule {
  hasHardwareAsync: () => Promise<boolean>;
  isEnrolledAsync: () => Promise<boolean>;
  authenticateAsync: (options?: {
    promptMessage?: string;
    cancelLabel?: string;
    disableDeviceFallback?: boolean;
    fallbackLabel?: string;
  }) => Promise<
    | { success: true }
    | { success: false; error?: string; warning?: string }
  >;
}

export function loadLocalAuthenticationModule(): LocalAuthenticationModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-local-authentication") as Partial<LocalAuthenticationModule>;
    if (
      typeof mod.hasHardwareAsync !== "function" ||
      typeof mod.isEnrolledAsync !== "function" ||
      typeof mod.authenticateAsync !== "function"
    ) {
      return null;
    }
    return mod as LocalAuthenticationModule;
  } catch {
    return null;
  }
}

export interface RealBiometricsCapabilityOptions {
  /** Override the module loader (DI for tests). */
  loadModule?: () => LocalAuthenticationModule | null;
  /** The prompt the OS dialog shows. Defaults to "Unlock Become". */
  reason?: string;
}

export function createRealBiometricsCapability(
  options: RealBiometricsCapabilityOptions = {},
): BiometricsCapability {
  const loadModule = options.loadModule ?? loadLocalAuthenticationModule;
  const reason = options.reason ?? BIOMETRIC_UNLOCK_REASON;

  return {
    async hasHardware(): Promise<boolean> {
      try {
        const mod = loadModule();
        if (!mod) return false;
        return await mod.hasHardwareAsync();
      } catch {
        return false;
      }
    },
    async isEnrolled(): Promise<boolean> {
      try {
        const mod = loadModule();
        if (!mod) return false;
        return await mod.isEnrolledAsync();
      } catch {
        return false;
      }
    },
    async authenticate(): Promise<{ success: boolean; reason?: string }> {
      try {
        const mod = loadModule();
        if (!mod) return { success: false, reason: "no-hardware" };
        const result = await mod.authenticateAsync({
          promptMessage: reason,
          // Passcode fallback stays ON (disableDeviceFallback omitted/false):
          // the OS offers the device passcode after failed biometrics, and
          // only a failure of both reaches `success: false`.
          fallbackLabel: "Use Passcode",
        });
        if (result.success) return { success: true };
        const out: { success: boolean; reason?: string } = {
          success: false,
        };
        if (result.error !== undefined) out.reason = result.error;
        return out;
      } catch {
        return { success: false, reason: "unavailable" };
      }
    },
  };
}

/** The capability the app runs against. Null-module → no-hardware answers. */
export const realBiometricsCapability: BiometricsCapability =
  createRealBiometricsCapability();
