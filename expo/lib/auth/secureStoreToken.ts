import * as SecureStore from "expo-secure-store";

/**
 * EVERY SecureStore key this app owns, one per purpose, declared here and
 * nowhere else.
 *
 * WHY THIS EXISTS. There used to be exactly one key — `become.auth_token` —
 * behind a single exported `secureTokenStore`, and anything that needed to
 * persist a string reached for it. The Health opt-in did: turning "Sync from
 * Health" on wrote `"yes"` over the session JWT and turning it off deleted the
 * JWT, signing the member out. The biometrics opt-in had the same shape and
 * would have done the same the moment it was wired to real storage.
 *
 * So: a store is built from a NAMED key with `createSecureStore(key)`, there is
 * no default, and a value for one purpose can no longer land on another
 * purpose's key. Adding a purpose means adding a key here.
 *
 * No build has ever shipped with `become.auth_token`, so nothing needs
 * migrating off it.
 */
export const SECURE_STORE_KEYS = {
  /** The session JWT. Written by useAuth, cleared by logout and delete-account. */
  session: "become.session",
  /** "Sync from Health" opt-in — `"yes"` when on, absent when off. */
  healthOptIn: "become.optin.health",
  /**
   * "Read from Health" — the Health → Become direction. Its own key, not a
   * field inside the opt-in, because each DIRECTION is its own answer: a member
   * may want their scale's weigh-ins imported and nothing written back.
   */
  healthSyncRead: "become.sync.health.read",
  /** "Write to Health" — the Become → Health direction. */
  healthSyncWrite: "become.sync.health.write",
  /** Biometric-unlock opt-in — `"yes"` when on, absent when off. */
  biometricsOptIn: "become.optin.biometrics",
} as const;

export type SecureStoreKey =
  (typeof SECURE_STORE_KEYS)[keyof typeof SECURE_STORE_KEYS];

/**
 * Minimal storage contract over ONE key — DI-friendly so unit tests can pass an
 * in-memory store and avoid the native expo-secure-store module.
 */
export interface TokenStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * A SecureStore-backed store (Keychain on iOS, Keystore on Android) over one
 * named key.
 *
 * `key` is required and must be one of `SECURE_STORE_KEYS` — there is
 * deliberately no default, because a default key is what let one feature
 * overwrite another's value.
 */
export function createSecureStore(key: SecureStoreKey): TokenStore {
  return {
    async get(): Promise<string | null> {
      const v = await SecureStore.getItemAsync(key);
      return v ?? null;
    },
    async set(value: string): Promise<void> {
      await SecureStore.setItemAsync(key, value);
    },
    async clear(): Promise<void> {
      await SecureStore.deleteItemAsync(key);
    },
  };
}

/** The session JWT, on `become.session`. Nothing but the session uses it. */
export const sessionStore: TokenStore = createSecureStore(
  SECURE_STORE_KEYS.session,
);

/** The Health opt-in flag, on `become.optin.health`. */
export const healthOptInSecureStore: TokenStore = createSecureStore(
  SECURE_STORE_KEYS.healthOptIn,
);

/** The Health → Become direction switch, on `become.sync.health.read`. */
export const healthSyncReadSecureStore: TokenStore = createSecureStore(
  SECURE_STORE_KEYS.healthSyncRead,
);

/** The Become → Health direction switch, on `become.sync.health.write`. */
export const healthSyncWriteSecureStore: TokenStore = createSecureStore(
  SECURE_STORE_KEYS.healthSyncWrite,
);

/** The biometrics opt-in flag, on `become.optin.biometrics`. */
export const biometricsOptInSecureStore: TokenStore = createSecureStore(
  SECURE_STORE_KEYS.biometricsOptIn,
);

/** In-memory store for tests / SSR / browser-mode fallback. */
export function createMemoryTokenStore(initial?: string | null): TokenStore {
  let value: string | null = initial ?? null;
  return {
    async get(): Promise<string | null> {
      return value;
    },
    async set(v: string): Promise<void> {
      value = v;
    },
    async clear(): Promise<void> {
      value = null;
    },
  };
}
