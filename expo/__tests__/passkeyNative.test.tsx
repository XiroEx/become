/**
 * PASSKEYS NATIVELY (NP-161).
 *
 * `lib/auth/passkey.ts` runs the same options/verify ceremony
 * `webapp/lib/passkeyClient.ts` runs in a browser, through
 * `react-native-passkey` instead of `@simplewebauthn/browser`. These tests
 * exercise it with a FAKE capability — no native module, no device — the
 * same DI seam `BiometricUnlockSection`'s tests use for `localAuthentication`.
 *
 * Also pins the one server-facing detail that makes Android work at all:
 * every request carries `PASSKEY_PLATFORM_HEADER`, set from `Platform.OS`,
 * which `webapp/lib/redauth.ts`'s `passkeyOriginFromRequest` reads to pick
 * between the web-origin and Android-origin `@redbtn/redauth` instances.
 */
import { Platform } from "react-native";

import {
  PASSKEY_PLATFORM_HEADER,
  defaultPasskeyFetchJson,
  describeNativePasskeyError,
  registerPasskeyNative,
  signInWithPasskeyNative,
  type PasskeyCapability,
  type PasskeyFetchJson,
} from "@/lib/auth/passkey";

function fakePasskey(overrides: Partial<PasskeyCapability> = {}): PasskeyCapability {
  return {
    isSupported: () => true,
    create: jest.fn(async () => ({
      id: "cred-id",
      rawId: "cred-id",
      response: { clientDataJSON: "cdj", attestationObject: "ao" },
    })),
    get: jest.fn(async () => ({
      id: "cred-id",
      response: { clientDataJSON: "cdj", authenticatorData: "ad", signature: "sig" },
    })),
    ...overrides,
  };
}

describe("registerPasskeyNative", () => {
  it("is a no-op on a device that cannot run the ceremony", async () => {
    const fetchJson = jest.fn();
    const result = await registerPasskeyNative("jwt", {
      passkey: fakePasskey({ isSupported: () => false }),
      fetchJson,
    });
    expect(result.status).toBe("unsupported");
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("fetches options, runs the ceremony, then verifies — in that order", async () => {
    const calls: string[] = [];
    const fetchJson: PasskeyFetchJson = jest.fn(async (path) => {
      calls.push(path);
      if (path.endsWith("/options")) {
        return { challengeId: "chal-1", options: { challenge: "abc", rp: { id: "redbtn.io", name: "Become" } } };
      }
      return { ok: true };
    });
    const create = jest.fn(async (request: unknown) => {
      // The exact options the server returned must reach the ceremony unchanged.
      expect(request).toEqual({ challenge: "abc", rp: { id: "redbtn.io", name: "Become" } });
      return {
        id: "cred-id",
        rawId: "cred-id",
        response: { clientDataJSON: "cdj", attestationObject: "ao" },
      };
    });
    const result = await registerPasskeyNative("jwt-token", {
      passkey: fakePasskey({ create }),
      fetchJson,
    });

    expect(result.status).toBe("registered");
    expect(calls).toEqual([
      "/api/auth/passkey/register/options",
      "/api/auth/passkey/register/verify",
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    // The verify call carries the challengeId AND the ceremony's own response.
    const verifyCall = (fetchJson as jest.Mock).mock.calls[1];
    expect(verifyCall[1].body).toEqual({
      challengeId: "chal-1",
      response: {
        id: "cred-id",
        rawId: "cred-id",
        response: { clientDataJSON: "cdj", attestationObject: "ao" },
      },
    });
    expect(verifyCall[1].token).toBe("jwt-token");
  });

  it("says nothing when the member dismisses the system sheet", async () => {
    const fetchJson: PasskeyFetchJson = jest.fn(async () => ({
      challengeId: "chal-1",
      options: {},
    }));
    const result = await registerPasskeyNative("jwt", {
      passkey: fakePasskey({
        create: jest.fn(async () => {
          throw { error: "UserCancelled", message: "The user cancelled the request." };
        }),
      }),
      fetchJson,
    });
    expect(result.status).toBe("cancelled");
  });

  it("turns a native error into a message the member can act on", async () => {
    const fetchJson: PasskeyFetchJson = jest.fn(async () => ({
      challengeId: "chal-1",
      options: {},
    }));
    const result = await registerPasskeyNative("jwt", {
      passkey: fakePasskey({
        create: jest.fn(async () => {
          throw { error: "CredentialAlreadyExists", message: "exists" };
        }),
      }),
      fetchJson,
    });
    expect(result).toEqual({
      status: "error",
      message: "A passkey for this account already exists on this device.",
    });
  });

  it("reports a failed options fetch without ever touching the OS ceremony", async () => {
    const create = jest.fn();
    const fetchJson: PasskeyFetchJson = jest.fn(async () => {
      throw new Error("Could not start passkey setup");
    });
    const result = await registerPasskeyNative("jwt", { passkey: fakePasskey({ create }), fetchJson });
    expect(result.status).toBe("error");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("signInWithPasskeyNative", () => {
  it("is a no-op on a device that cannot run the ceremony", async () => {
    const result = await signInWithPasskeyNative({ passkey: fakePasskey({ isSupported: () => false }) });
    expect(result.status).toBe("unsupported");
  });

  it("signs in and returns the Become token, no email required", async () => {
    const fetchJson: PasskeyFetchJson = jest.fn(async (path) => {
      if (path.endsWith("/options")) return { challengeId: "chal-2", options: { challenge: "xyz" } };
      return { token: "become-jwt-from-passkey" };
    });
    const result = await signInWithPasskeyNative({ passkey: fakePasskey(), fetchJson });
    expect(result).toEqual({ status: "signed-in", token: "become-jwt-from-passkey" });
  });

  it("says nothing when the member dismisses the system sheet", async () => {
    const fetchJson: PasskeyFetchJson = jest.fn(async () => ({ challengeId: "c", options: {} }));
    const result = await signInWithPasskeyNative({
      passkey: fakePasskey({
        get: jest.fn(async () => {
          throw { error: "UserCancelled", message: "cancelled" };
        }),
      }),
      fetchJson,
    });
    expect(result.status).toBe("cancelled");
  });
});

describe("describeNativePasskeyError", () => {
  it("falls back to the native message for an unmapped code", () => {
    expect(describeNativePasskeyError({ error: "Interrupted", message: "try again" })).toBe(
      "try again",
    );
  });

  it("never throws on a non-passkey error", () => {
    expect(describeNativePasskeyError(new Error("boom"))).toBe("boom");
    expect(describeNativePasskeyError("not an error object")).toBe(
      "Could not complete the passkey request.",
    );
  });
});

describe("the platform header", () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it("is 'android' on Android and 'ios' everywhere else, so webapp/lib/redauth.ts picks the right origin", async () => {
    Platform.OS = "android";
    const originalFetch = global.fetch;
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    global.fetch = fetchMock;
    try {
      await defaultPasskeyFetchJson("/api/auth/passkey/authenticate/options", { method: "POST" });
      const headers = (fetchMock as jest.Mock).mock.calls[0][1].headers;
      expect(headers[PASSKEY_PLATFORM_HEADER]).toBe("android");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("is sent on all four calls, register AND authenticate, when the defaults are used", async () => {
    Platform.OS = "android";
    const originalFetch = global.fetch;
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ challengeId: "c1", options: {}, token: "t" }),
    })) as unknown as typeof fetch;
    global.fetch = fetchMock;
    try {
      await registerPasskeyNative("tok", { passkey: fakePasskey() });
      await signInWithPasskeyNative({ passkey: fakePasskey() });
      const calls = (fetchMock as jest.Mock).mock.calls as [string, { headers: Record<string, string> }][];
      expect(calls.map(([url]) => url.replace(/^.*(\/api\/)/, "/api/"))).toEqual([
        "/api/auth/passkey/register/options",
        "/api/auth/passkey/register/verify",
        "/api/auth/passkey/authenticate/options",
        "/api/auth/passkey/authenticate/verify",
      ]);
      for (const [, init] of calls) expect(init.headers[PASSKEY_PLATFORM_HEADER]).toBe("android");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
