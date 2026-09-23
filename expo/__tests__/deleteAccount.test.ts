import {
  requestAccountDeletion,
  restoreAccount,
} from "@/lib/account/deleteAccount";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";

/**
 * The client half of account deletion in the store builds.
 *
 * Three behaviours are load-bearing for the App Store / Play review, and all
 * three are asserted here rather than left to the screen:
 *   · the request says WHICH platform asked;
 *   · the JWT is dropped from the token store on success — the server cannot
 *     revoke a JWT, so this is the whole of "the device is signed out";
 *   · the caller can see how many push registrations the server dropped, which
 *     is how "the native push token is dropped at request time" is observable
 *     from the app at all.
 */

function makeFetch(
  responder: (
    url: string,
    init: RequestInit,
  ) => { status: number; body?: unknown },
): { fetch: typeof fetch; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    const r = responder(url, init);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body ?? null,
    } as Response;
  }) as typeof fetch;
  return { fetch: fn, calls };
}

const DELETION = {
  requestedAt: "2026-09-20T10:00:00.000Z",
  scheduledPurgeAt: "2026-09-27T10:00:00.000Z",
  daysRemaining: 7,
};

describe("requestAccountDeletion", () => {
  it("DELETEs the member-facing route with the Bearer token and the platform", async () => {
    const spy = makeFetch(() => ({
      status: 200,
      body: { deletion: DELETION, pushSubscriptionsDropped: 3 },
    }));
    const store = createMemoryTokenStore("jwt-xyz");

    const result = await requestAccountDeletion({
      jwt: "jwt-xyz",
      source: "ios",
      fetchImpl: spy.fetch,
      tokenStore: store,
    });

    expect(result.ok).toBe(true);
    expect(spy.calls[0]!.url).toBe("https://become.redbtn.io/api/me/account");
    expect(spy.calls[0]!.init.method).toBe("DELETE");
    const headers = spy.calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer jwt-xyz");
    expect(spy.calls[0]!.init.body).toBe(JSON.stringify({ source: "ios" }));
  });

  it("signs the device out by dropping the stored JWT", async () => {
    const spy = makeFetch(() => ({ status: 200, body: { deletion: DELETION } }));
    const store = createMemoryTokenStore("jwt-xyz");

    const result = await requestAccountDeletion({
      jwt: "jwt-xyz",
      source: "android",
      fetchImpl: spy.fetch,
      tokenStore: store,
    });

    expect(result.signedOut).toBe(true);
    expect(await store.get()).toBeNull();
  });

  it("reports how many push registrations the server dropped", async () => {
    const spy = makeFetch(() => ({
      status: 200,
      body: { deletion: DELETION, pushSubscriptionsDropped: 2, restoreEmailSent: true },
    }));
    const result = await requestAccountDeletion({
      jwt: "jwt",
      source: "ios",
      fetchImpl: spy.fetch,
      tokenStore: createMemoryTokenStore("jwt"),
    });
    expect(result.pushSubscriptionsDropped).toBe(2);
    expect(result.restoreEmailSent).toBe(true);
  });

  it("keeps the session when the server refuses — a failed deletion is not a sign-out", async () => {
    const spy = makeFetch(() => ({ status: 401, body: { error: "Unauthorized" } }));
    const store = createMemoryTokenStore("jwt-xyz");

    const result = await requestAccountDeletion({
      jwt: "jwt-xyz",
      source: "ios",
      fetchImpl: spy.fetch,
      tokenStore: store,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.signedOut).toBe(false);
    expect(await store.get()).toBe("jwt-xyz");
  });

  it("does not retry — a deletion must read as happened or failed, never maybe", async () => {
    let calls = 0;
    const fn = (async () => {
      calls += 1;
      throw new Error("offline");
    }) as unknown as typeof fetch;

    const result = await requestAccountDeletion({
      jwt: "jwt",
      source: "ios",
      fetchImpl: fn,
      tokenStore: createMemoryTokenStore("jwt"),
    });

    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network");
    expect(result.signedOut).toBe(false);
  });

  it("treats a 200 with no deletion body as a failure", async () => {
    const spy = makeFetch(() => ({ status: 200, body: {} }));
    const store = createMemoryTokenStore("jwt");
    const result = await requestAccountDeletion({
      jwt: "jwt",
      source: "ios",
      fetchImpl: spy.fetch,
      tokenStore: store,
    });
    expect(result.ok).toBe(false);
    expect(await store.get()).toBe("jwt");
  });
});

describe("restoreAccount", () => {
  it("POSTs the token pair with NO Authorization header", async () => {
    const spy = makeFetch(() => ({ status: 200, body: { restored: true } }));
    const outcome = await restoreAccount({
      userId: "u1",
      token: "t1",
      fetchImpl: spy.fetch,
    });

    expect(outcome).toBe("restored");
    expect(spy.calls[0]!.url).toBe(
      "https://become.redbtn.io/api/me/account/restore",
    );
    expect(spy.calls[0]!.init.method).toBe("POST");
    const headers = spy.calls[0]!.init.headers as Record<string, string>;
    // The link is opened by somebody this app just signed out. Demanding a
    // session here would break the only way back.
    expect(headers.Authorization).toBeUndefined();
    expect(spy.calls[0]!.init.body).toBe(JSON.stringify({ u: "u1", t: "t1" }));
  });

  it("passes the server's reason through, rather than flattening it", async () => {
    const pending = makeFetch(() => ({
      status: 404,
      body: { restored: false, reason: "nothing_pending" },
    }));
    expect(
      await restoreAccount({ userId: "u1", token: "t1", fetchImpl: pending.fetch }),
    ).toBe("nothing_pending");

    const forged = makeFetch(() => ({
      status: 400,
      body: { restored: false, reason: "invalid_link" },
    }));
    expect(
      await restoreAccount({ userId: "u1", token: "bad", fetchImpl: forged.fetch }),
    ).toBe("invalid_link");
  });

  it("refuses a half-built link without calling the server", async () => {
    let calls = 0;
    const fn = (async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    expect(await restoreAccount({ userId: "", token: "t", fetchImpl: fn })).toBe(
      "invalid_link",
    );
    expect(await restoreAccount({ userId: "u", token: "", fetchImpl: fn })).toBe(
      "invalid_link",
    );
    expect(calls).toBe(0);
  });
});
