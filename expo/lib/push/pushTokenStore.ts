import AsyncStorage from "@react-native-async-storage/async-storage";

export const PUSH_TOKEN_STORAGE_KEY = "become.push.token";

export interface PushTokenStore {
  get: () => Promise<string | null>;
  set: (token: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const devicePushTokenStore: PushTokenStore = {
  async get(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  async set(token: string): Promise<void> {
    try {
      await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
    } catch {
      // ignore
    }
  },
  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
  },
};

export function createMemoryPushTokenStore(initial?: string | null): PushTokenStore {
  let val: string | null = initial ?? null;
  return {
    async get() {
      return val;
    },
    async set(token: string) {
      val = token;
    },
    async clear() {
      val = null;
    },
  };
}

let activePushTokenStore: PushTokenStore = devicePushTokenStore;

export function getPushTokenStore(): PushTokenStore {
  return activePushTokenStore;
}

export function setPushTokenStore(store: PushTokenStore): void {
  activePushTokenStore = store;
}

export async function getStoredPushToken(): Promise<string | null> {
  return getPushTokenStore().get();
}

export async function setStoredPushToken(token: string): Promise<void> {
  await getPushTokenStore().set(token);
}

export async function clearStoredPushToken(): Promise<void> {
  await getPushTokenStore().clear();
}
