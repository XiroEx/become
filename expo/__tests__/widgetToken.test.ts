/**
 * ─── The token hand-off: what the widget is allowed to hold ──────────────────
 *
 * `POST /api/widgets/token` is the only way a widget surface gets a credential,
 * and the rules below are the server's, not this client's
 * (`webapp/lib/widgets/token.ts`, AGENTS.md § The widgets token):
 *
 *   • the SESSION mints it — the request carries the member's JWT;
 *   • what comes back must be `scope: 'widgets'`, or it is not a widgets token
 *     and must not be stored where a widget will read it;
 *   • a refusal (401, or 403 while a deletion is pending) and a network failure
 *     are DIFFERENT answers: the first means the stored token is dead too, the
 *     second means nothing at all about it;
 *   • it is never `apiFetch`, because a background hand-off may not sign the
 *     member out through the unauthorized handler.
 */
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";
import {
  clearWidgetsToken,
  loadWidgetsToken,
  mintWidgetsToken,
  storeWidgetsToken,
} from "@/lib/widgets/token";

const SESSION = "session.jwt.value";
const BASE = "https://become.test";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const WIDGETS_TOKEN = {
  token: "widgets.jwt.value",
  scope: "widgets",
  expiresIn: 15552000,
  expiresAt: "2027-03-28T00:00:00.000Z",
  refreshAfterSeconds: 900,
};

describe("mintWidgetsToken", () => {
  it("posts to /api/widgets/token with the SESSION token", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(WIDGETS_TOKEN);
    }) as unknown as typeof fetch;

    const result = await mintWidgetsToken(SESSION, { baseUrl: BASE, fetchImpl });

    expect(result).toEqual({
      kind: "ok",
      token: "widgets.jwt.value",
      refreshAfterSeconds: 900,
    });
    expect(calls[0]?.url).toBe(`${BASE}/api/widgets/token`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(
      (calls[0]?.init?.headers as Record<string, string>)?.Authorization,
    ).toBe(`Bearer ${SESSION}`);
  });

  it("reports a 401 as a refusal — the session is finished", async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ error: "Unauthorized" }, 401),
    ) as unknown as typeof fetch;
    expect(await mintWidgetsToken(SESSION, { baseUrl: BASE, fetchImpl })).toEqual(
      { kind: "refused", status: 401 },
    );
  });

  // Minting is refused while a deletion is pending, or the next open would hand
  // the token straight back after the counter bump that killed the last one.
  it("reports a 403 deletion_pending as a refusal", async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ error: "deletion_pending" }, 403),
    ) as unknown as typeof fetch;
    expect(await mintWidgetsToken(SESSION, { baseUrl: BASE, fetchImpl })).toEqual(
      { kind: "refused", status: 403 },
    );
  });

  it("refuses a 200 whose scope is not `widgets`", async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ ...WIDGETS_TOKEN, scope: "ai-tools" }),
    ) as unknown as typeof fetch;
    expect(await mintWidgetsToken(SESSION, { baseUrl: BASE, fetchImpl })).toEqual(
      { kind: "refused", status: 200 },
    );
  });

  it("refuses a 200 with no token in it", async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ scope: "widgets" }),
    ) as unknown as typeof fetch;
    expect(await mintWidgetsToken(SESSION, { baseUrl: BASE, fetchImpl })).toEqual(
      { kind: "refused", status: 200 },
    );
  });

  it("treats a 5xx as unreachable, not as a refusal", async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ error: "Internal server error" }, 500),
    ) as unknown as typeof fetch;
    expect(await mintWidgetsToken(SESSION, { baseUrl: BASE, fetchImpl })).toEqual(
      { kind: "unreachable" },
    );
  });

  it("treats a thrown fetch as unreachable and never rethrows", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await mintWidgetsToken(SESSION, { baseUrl: BASE, fetchImpl })).toEqual(
      { kind: "unreachable" },
    );
  });

  it("treats a body that is not JSON as unreachable", async () => {
    const fetchImpl = jest.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("not json");
          },
        }) as unknown as Response,
    ) as unknown as typeof fetch;
    expect(await mintWidgetsToken(SESSION, { baseUrl: BASE, fetchImpl })).toEqual(
      { kind: "unreachable" },
    );
  });

  it("does not report a refusal to the app's unauthorized handler", async () => {
    // The proof is that no handler is involved at all: a raw fetch is used, so a
    // 401 here cannot reach `setUnauthorizedHandler` and sign the member out.
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ error: "Unauthorized" }, 401),
    ) as unknown as typeof fetch;
    await mintWidgetsToken(SESSION, { baseUrl: BASE, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("the stored widgets token", () => {
  it("round-trips through its own store", async () => {
    const store = createMemoryTokenStore();
    await storeWidgetsToken("widgets.jwt.value", store);
    expect(await loadWidgetsToken(store)).toBe("widgets.jwt.value");
    await clearWidgetsToken(store);
    expect(await loadWidgetsToken(store)).toBeNull();
  });

  it("reads a store that throws as 'no token', never as an error", async () => {
    const store = {
      get: async (): Promise<string | null> => {
        throw new Error("keystore unavailable");
      },
      set: async (): Promise<void> => undefined,
      clear: async (): Promise<void> => undefined,
    };
    expect(await loadWidgetsToken(store)).toBeNull();
  });

  it("a store that refuses to delete does not throw out of the clear", async () => {
    const store = {
      get: async (): Promise<string | null> => "widgets.jwt.value",
      set: async (): Promise<void> => undefined,
      clear: async (): Promise<void> => {
        throw new Error("keystore unavailable");
      },
    };
    await expect(clearWidgetsToken(store)).resolves.toBeUndefined();
  });
});
