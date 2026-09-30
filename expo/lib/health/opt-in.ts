import {
  createMemoryTokenStore,
  type TokenStore,
} from "@/lib/auth/secureStoreToken";

const OPT_IN_KEY_VALUE_TRUE = "yes";

/**
 * Persists the boolean `health.optedIn` flag. The store contract is
 * string-only so we serialise the boolean to "yes" / null.
 */
export interface HealthOptInStore {
  isOptedIn: () => Promise<boolean>;
  setOptedIn: (value: boolean) => Promise<void>;
}

/**
 * `inner` is REQUIRED and must be the store for the health opt-in key —
 * `healthOptInSecureStore` (`become.optin.health`) in the app, an in-memory
 * store in tests.
 *
 * It used to default to the single-key `secureTokenStore`, which is the
 * session JWT: opting in wrote "yes" over the member's token and opting out
 * deleted it. Naming the store at every call site is what stops that.
 */
export function createHealthOptInStore(inner: TokenStore): HealthOptInStore {
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
