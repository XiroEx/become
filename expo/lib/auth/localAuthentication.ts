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
  /**
   * Optional: older module shapes (and any DI fake that only implements the
   * three methods above) omit it. `getSupportedAuthenticationTypes` below
   * treats a missing function the same as a missing module — an empty list,
   * which is the generic-wording answer.
   */
  supportedAuthenticationTypesAsync?: () => Promise<number[]>;
}

/**
 * The hardware's enum values from `expo-local-authentication`'s
 * `AuthenticationType`, inlined so this file never has to import the module
 * at the type level (it is loaded lazily, by design, above).
 */
export const AUTHENTICATION_TYPE = {
  FINGERPRINT: 1,
  FACIAL_RECOGNITION: 2,
  IRIS: 3,
} as const;

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

/**
 * The hardware's supported authentication kinds (Face ID / Touch ID /
 * fingerprint / iris), queried directly from the module rather than through
 * `BiometricsCapability` — picking platform wording is a UI concern, not
 * part of the cold-open contract. A missing module, a missing method
 * (`supportedAuthenticationTypesAsync` is optional on the interface above)
 * or a throw all degrade to an empty list, same as the capability's own
 * no-hardware answers (George's 2026-10-06 QA note on Android wording).
 */
export async function getSupportedAuthenticationTypes(
  loadModule: () => LocalAuthenticationModule | null = loadLocalAuthenticationModule,
): Promise<number[]> {
  try {
    const mod = loadModule();
    if (!mod || typeof mod.supportedAuthenticationTypesAsync !== "function") {
      return [];
    }
    return await mod.supportedAuthenticationTypesAsync();
  } catch {
    return [];
  }
}

/** The label the Settings row and its accessibility strings use. */
export interface BiometricWording {
  /** Title-cased for the row label, e.g. "Face ID", "Touch ID", "fingerprint". */
  label: string;
  /** Same word, used mid-sentence ("Ask for {noun} or your passcode…"). */
  noun: string;
}

/**
 * Platform-appropriate wording for the Security row (George, 2026-10-06 QA):
 * Android showed "Face ID" copy even when the device only has a fingerprint
 * sensor. iOS keeps Apple's own vocabulary — Face ID when the hardware
 * reports facial recognition, Touch ID for fingerprint-only iPhones, and
 * "Face ID" as the steady-state default before the probe resolves (matches
 * the overwhelming majority of current iPhones and this file's prior
 * behaviour). Android prefers "fingerprint" (the common case), falls back to
 * "face unlock" when that is the only kind reported, and "biometrics" when
 * neither is known yet (e.g. the probe hasn't resolved, or the module is
 * absent).
 */
export function describeBiometricWording(
  supportedTypes: number[],
  platformOS: string,
): BiometricWording {
  const hasFingerprint = supportedTypes.includes(
    AUTHENTICATION_TYPE.FINGERPRINT,
  );
  const hasFacial = supportedTypes.includes(
    AUTHENTICATION_TYPE.FACIAL_RECOGNITION,
  );

  if (platformOS === "android") {
    if (hasFingerprint) return { label: "fingerprint", noun: "fingerprint" };
    if (hasFacial) return { label: "face unlock", noun: "face unlock" };
    return { label: "biometrics", noun: "biometrics" };
  }

  // iOS (and any other platform): Apple's own vocabulary.
  if (hasFingerprint && !hasFacial) {
    return { label: "Touch ID", noun: "Touch ID" };
  }
  return { label: "Face ID", noun: "Face ID" };
}
