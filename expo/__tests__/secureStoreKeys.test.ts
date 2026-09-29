/* eslint-disable import/first */
/**
 * ONE SECURE-STORE KEY PER PURPOSE.
 *
 * The regression this pins: `createHealthOptInStore()` defaulted to the single
 * `secureTokenStore`, which read and wrote `become.auth_token` — the session
 * JWT. Turning "Sync from Health" on wrote "yes" over the member's token and
 * turning it off deleted it, so a toggle signed them out. The biometrics
 * opt-in had the same shape.
 *
 * These tests drive the REAL SecureStore-backed stores against a fake
 * expo-secure-store, so they assert on the actual keys that reach the
 * Keychain/Keystore — not on an in-memory stand-in that could hide a collision.
 */
jest.mock("expo-secure-store", () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    async getItemAsync(key: string): Promise<string | null> {
      return mem.has(key) ? (mem.get(key) as string) : null;
    },
    async setItemAsync(key: string, value: string): Promise<void> {
      mem.set(key, value);
    },
    async deleteItemAsync(key: string): Promise<void> {
      mem.delete(key);
    },
    __reset(): void {
      mem.clear();
    },
    __keys(): string[] {
      return [...mem.keys()].sort();
    },
  };
});

import * as SecureStore from "expo-secure-store";
import {
  SECURE_STORE_KEYS,
  biometricsOptInSecureStore,
  createSecureStore,
  healthOptInSecureStore,
  healthSyncReadSecureStore,
  healthSyncWriteSecureStore,
  sessionStore,
} from "@/lib/auth/secureStoreToken";
import * as secureStoreModule from "@/lib/auth/secureStoreToken";
import { createBiometricsOptInStore } from "@/lib/auth/biometrics";
import { createHealthOptInStore } from "@/lib/health/opt-in";
import { createHealthSwitchStore } from "@/lib/health/switches";

const fake = SecureStore as unknown as {
  __reset: () => void;
  __keys: () => string[];
};

const JWT = "header.payload.signature";

beforeEach(() => {
  fake.__reset();
});

describe("SECURE_STORE_KEYS", () => {
  it("gives each purpose its own key", () => {
    expect(SECURE_STORE_KEYS).toEqual({
      session: "become.session",
      healthOptIn: "become.optin.health",
      healthSyncRead: "become.sync.health.read",
      healthSyncWrite: "become.sync.health.write",
      biometricsOptIn: "become.optin.biometrics",
    });
    const values = Object.values(SECURE_STORE_KEYS);
    expect(new Set(values).size).toBe(values.length);
  });

  it("no longer exports the single-key store that every purpose shared", () => {
    expect(
      (secureStoreModule as Record<string, unknown>)["secureTokenStore"],
    ).toBeUndefined();
  });

  it("writes each purpose to its own key and nowhere else", async () => {
    await sessionStore.set(JWT);
    await healthOptInSecureStore.set("yes");
    await healthSyncReadSecureStore.set("yes");
    await healthSyncWriteSecureStore.set("yes");
    await biometricsOptInSecureStore.set("yes");

    expect(fake.__keys()).toEqual([
      "become.optin.biometrics",
      "become.optin.health",
      "become.session",
      "become.sync.health.read",
      "become.sync.health.write",
    ]);
    expect(await SecureStore.getItemAsync("become.session")).toBe(JWT);
    expect(await SecureStore.getItemAsync("become.optin.health")).toBe("yes");
    expect(await SecureStore.getItemAsync("become.optin.biometrics")).toBe(
      "yes",
    );
  });

  it("createSecureStore reads and writes only the key it was built with", async () => {
    const store = createSecureStore(SECURE_STORE_KEYS.healthOptIn);
    await store.set("yes");
    expect(await SecureStore.getItemAsync("become.optin.health")).toBe("yes");
    expect(await SecureStore.getItemAsync("become.session")).toBeNull();
    await store.clear();
    expect(fake.__keys()).toEqual([]);
  });
});

describe("toggling an opt-in leaves the session token untouched", () => {
  it("health: on, then off, and the member is still signed in", async () => {
    await sessionStore.set(JWT);
    const health = createHealthOptInStore(healthOptInSecureStore);

    await health.setOptedIn(true);
    expect(await health.isOptedIn()).toBe(true);
    expect(await sessionStore.get()).toBe(JWT);

    await health.setOptedIn(false);
    expect(await health.isOptedIn()).toBe(false);
    // The bug: setOptedIn(false) used to DELETE the JWT.
    expect(await sessionStore.get()).toBe(JWT);
    expect(await SecureStore.getItemAsync("become.session")).toBe(JWT);
  });

  it("biometrics: on, then off, and the member is still signed in", async () => {
    await sessionStore.set(JWT);
    const biometrics = createBiometricsOptInStore(biometricsOptInSecureStore);

    await biometrics.setOptedIn(true);
    expect(await biometrics.isOptedIn()).toBe(true);
    expect(await sessionStore.get()).toBe(JWT);

    await biometrics.setOptedIn(false);
    expect(await biometrics.isOptedIn()).toBe(false);
    expect(await sessionStore.get()).toBe(JWT);
  });

  // The direction switches (NP-199) are two more flags with the same shape, so
  // they are the same hazard: three health keys, none of them the session.
  it("health: the direction switches touch neither the opt-in nor the session", async () => {
    await sessionStore.set(JWT);
    const health = createHealthOptInStore(healthOptInSecureStore);
    await health.setOptedIn(true);
    const switches = createHealthSwitchStore({
      read: healthSyncReadSecureStore,
      write: healthSyncWriteSecureStore,
    });

    await switches.set("read", true);
    await switches.set("write", true);
    await switches.set("read", false);

    expect(await switches.get("read")).toBe(false);
    expect(await switches.get("write")).toBe(true);
    expect(await health.isOptedIn()).toBe(true);
    expect(await sessionStore.get()).toBe(JWT);
  });

  it("the two opt-ins do not overwrite each other either", async () => {
    await sessionStore.set(JWT);
    const health = createHealthOptInStore(healthOptInSecureStore);
    const biometrics = createBiometricsOptInStore(biometricsOptInSecureStore);

    await health.setOptedIn(true);
    await biometrics.setOptedIn(true);
    await health.setOptedIn(false);

    expect(await health.isOptedIn()).toBe(false);
    expect(await biometrics.isOptedIn()).toBe(true);
    expect(await sessionStore.get()).toBe(JWT);
  });

  it("signing out clears the session and nothing else", async () => {
    await sessionStore.set(JWT);
    const health = createHealthOptInStore(healthOptInSecureStore);
    await health.setOptedIn(true);

    await sessionStore.clear();

    expect(await sessionStore.get()).toBeNull();
    expect(await health.isOptedIn()).toBe(true);
  });
});
