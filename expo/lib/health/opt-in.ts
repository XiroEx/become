import {
  createMemoryTokenStore,
  secureTokenStore,
  type TokenStore,
} from "@/lib/auth/secureStoreToken";

const OPT_IN_KEY_VALUE_TRUE = "yes";

/**
 * Reuses the SecureStore-backed TokenStore from P6 to persist the boolean
 * `health.optedIn` flag. The store contract is string-only so we serialise
 * the boolean to "yes" / null.
 */
export interface HealthOptInStore {
  isOptedIn: () => Promise<boolean>;
  setOptedIn: (value: boolean) => Promise<void>;
}

export function createHealthOptInStore(
  inner: TokenStore = secureTokenStore,
): HealthOptInStore {
  return {
    async isOptedIn(): Promise<boolean> {
      const v = await inner.get();
      return v === OPT_IN_KEY_VALUE_TRUE;
    },
    async setOptedIn(value: boolean): Promise<void> {
      if (value) await inner.set(OPT_IN_KEY_VALUE_TRUE);
      else await inner.clear();
    },
  };
}

/** Convenience for tests: in-memory opt-in store, no SecureStore required. */
export function createMemoryHealthOptInStore(initial = false): HealthOptInStore {
  return createHealthOptInStore(
    createMemoryTokenStore(initial ? OPT_IN_KEY_VALUE_TRUE : null),
  );
}
