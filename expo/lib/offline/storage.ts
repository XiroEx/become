/**
 * Where the offline queue's snapshot lives between launches.
 *
 * AsyncStorage, not SecureStore, and deliberately: the queue holds a weight and
 * a mood with the day they were logged on — not a secret — and SecureStore is
 * a Keychain/Keystore item with a ~2KB practical ceiling on Android, which a
 * week of queued writes can reach. The session JWT stays where it is
 * (`lib/auth/secureStoreToken.ts`); nothing here ever persists it.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AsyncStorageLike } from "@/lib/query/persistor";

export const deviceStorage: AsyncStorageLike = {
  getItem(key: string): Promise<string | null> {
    return AsyncStorage.getItem(key);
  },
  setItem(key: string, value: string): Promise<void> {
    return AsyncStorage.setItem(key, value);
  },
  removeItem(key: string): Promise<void> {
    return AsyncStorage.removeItem(key);
  },
};
