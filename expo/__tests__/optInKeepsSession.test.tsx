/* eslint-disable import/first */
/**
 * "Toggling any opt-in leaves the member signed in" — asserted through the
 * thing the member actually experiences, `useAuth`, with the REAL
 * SecureStore-backed session store over a fake expo-secure-store.
 *
 * Before one-key-per-purpose, `createHealthOptInStore()` defaulted to the
 * session store: flipping "Sync from Health" on replaced the JWT with "yes"
 * and flipping it off deleted it, so the next read signed the member out.
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
  };
});

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { apiFetch } from "@become/api-client";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { createBiometricsOptInStore } from "@/lib/auth/biometrics";
import {
  biometricsOptInSecureStore,
  healthOptInSecureStore,
  sessionStore,
} from "@/lib/auth/secureStoreToken";
import { useAuth } from "@/lib/auth/useAuth";
import { createHealthOptInStore } from "@/lib/health/opt-in";

const mockApiFetch = apiFetch as unknown as jest.Mock;
const fake = SecureStore as unknown as { __reset: () => void };

/** A real JWT shape: the session is only trusted if its own `exp` is ahead. */
const JWT = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(
  JSON.stringify({ userId: "u1", exp: Math.floor(Date.now() / 1000) + 3600 }),
  "utf8",
).toString("base64url")}.signature`;
const USER = { _id: "u1", email: "jon@example.com" };

/** The session now lives in one provider, so the hook is read through it. */
function withProvider({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  fake.__reset();
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async () => ({ user: USER }));
});

describe("an opt-in toggle never signs the member out", () => {
  it.each([
    [
      "health",
      () => createHealthOptInStore(healthOptInSecureStore),
    ],
    [
      "biometrics",
      () => createBiometricsOptInStore(biometricsOptInSecureStore),
    ],
  ])("%s: on then off, useAuth still reports the session", async (_name, make) => {
    await sessionStore.set(JWT);
    const optIn = make();

    const { result } = renderHook(() => useAuth(), { wrapper: withProvider });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.isAuthed).toBe(true);
    expect(result.current.token).toBe(JWT);

    await act(async () => {
      await optIn.setOptedIn(true);
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.isAuthed).toBe(true);
    expect(result.current.token).toBe(JWT);

    await act(async () => {
      await optIn.setOptedIn(false);
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.isAuthed).toBe(true);
    expect(result.current.token).toBe(JWT);
    expect(await optIn.isOptedIn()).toBe(false);
  });

  it("a cold open after toggling both opt-ins still finds the JWT", async () => {
    await sessionStore.set(JWT);
    await createHealthOptInStore(healthOptInSecureStore).setOptedIn(true);
    await createBiometricsOptInStore(biometricsOptInSecureStore).setOptedIn(
      true,
    );
    await createHealthOptInStore(healthOptInSecureStore).setOptedIn(false);

    // Fresh provider = fresh launch: it hydrates from SecureStore on mount.
    const { result } = renderHook(() => useAuth(), { wrapper: withProvider });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.token).toBe(JWT);
    expect(result.current.user).toEqual(USER);
    expect(result.current.isAuthed).toBe(true);
  });
});
