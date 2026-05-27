import { registerPushToken } from "@/lib/push/registerPushToken";

function makeFetch(
  responder: (
    url: string,
    init: RequestInit,
    attempt: number,
  ) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>,
): {
  fetch: typeof fetch;
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  let attempt = 0;
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    attempt += 1;
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    const r = await responder(url, init, attempt);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => (r.body !== undefined ? JSON.stringify(r.body) : ""),
    } as Response;
  }) as typeof fetch;
  return { fetch: fn, calls };
}

describe("registerPushToken", () => {
  const baseInput = {
    token: "ExponentPushToken[abc]",
    jwt: "jwt-xyz",
    retryDelayMs: 1, // keep retries fast
    setTimeoutImpl: ((fn: () => void) => {
      // synchronous fake — fire immediately
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout,
  };

  it("happy path: 2xx on first attempt returns ok=true with attempts=1", async () => {
    const spy = makeFetch(() => ({ status: 200, body: { ok: true } }));
    const r = await registerPushToken({ ...baseInput, fetchImpl: spy.fetch });
    expect(r).toMatchObject({ ok: true, attempts: 1, lastStatus: 200 });
    expect(spy.calls).toHaveLength(1);
  });

  it("posts the token + Bearer JWT to /api/push/subscribe", async () => {
    const spy = makeFetch(() => ({ status: 200 }));
    await registerPushToken({ ...baseInput, fetchImpl: spy.fetch });
    expect(spy.calls[0]!.url).toBe(
      "https://become.redbtn.io/api/push/subscribe",
    );
    const headers = spy.calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer jwt-xyz");
    expect(spy.calls[0]!.init.body).toBe(
      JSON.stringify({ token: "ExponentPushToken[abc]" }),
    );
  });

  it("retries on 5xx then succeeds", async () => {
    const spy = makeFetch((_url, _init, attempt) =>
      attempt < 3 ? { status: 503 } : { status: 200 },
    );
    const r = await registerPushToken({
      ...baseInput,
      fetchImpl: spy.fetch,
      maxRetries: 3,
    });
    expect(r).toMatchObject({ ok: true, attempts: 3 });
    expect(spy.calls).toHaveLength(3);
  });

  it("does NOT retry on 4xx — single attempt, ok=false", async () => {
    const spy = makeFetch(() => ({ status: 401 }));
    const r = await registerPushToken({
      ...baseInput,
      fetchImpl: spy.fetch,
      maxRetries: 3,
    });
    expect(r).toMatchObject({ ok: false, attempts: 1, lastStatus: 401 });
    expect(spy.calls).toHaveLength(1);
  });

  it("after maxRetries 5xxs, returns ok=false with the last status", async () => {
    const spy = makeFetch(() => ({ status: 502 }));
    const r = await registerPushToken({
      ...baseInput,
      fetchImpl: spy.fetch,
      maxRetries: 2,
    });
    expect(r).toMatchObject({ ok: false, attempts: 2, lastStatus: 502 });
    expect(spy.calls).toHaveLength(2);
  });

  it("retries on network failure (thrown error)", async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n += 1;
      if (n < 2) throw new Error("network");
      return {
        ok: true,
        status: 200,
        text: async () => "{}",
      } as Response;
    }) as typeof fetch;
    const r = await registerPushToken({
      ...baseInput,
      fetchImpl,
      maxRetries: 3,
    });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
  });
});
