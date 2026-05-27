import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "become.auth_token";

/**
 * Minimal storage contract — DI-friendly so unit tests can pass an in-memory
 * store and avoid the native expo-secure-store module.
 */
export interface TokenStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  clear(): Promise<void>;
}

/** Default store backed by expo-secure-store (Keychain on iOS, Keystore on Android). */
export const secureTokenStore: TokenStore = {
  async get(): Promise<string | null> {
    const v = await SecureStore.getItemAsync(TOKEN_KEY);
    return v ?? null;
  },
  async set(value: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, value);
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};

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
