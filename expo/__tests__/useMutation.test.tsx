import { act, renderHook, waitFor } from "@testing-library/react-native";
import { z } from "zod";
import { useMutation } from "@/lib/hooks";

const ResponseSchema = z.object({ ok: z.literal(true), id: z.string() });

function makeFetch(
  responder: (url: string, init: RequestInit) => {
    status?: number;
    body?: unknown;
  },
): { fetch: typeof fetch; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    const r = responder(url, init);
    const status = r.status ?? 200;
    const text = r.body !== undefined ? JSON.stringify(r.body) : "";
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
    } as Response;
  }) as typeof fetch;
  return { fetch: fn, calls };
}

describe("useMutation", () => {
  it("happy path: mutate resolves and sets data + onSuccess fires", async () => {
    const onSuccess = jest.fn();
    const spy = makeFetch(() => ({ body: { ok: true, id: "abc" } }));
    const { result } = renderHook(() =>
      useMutation<{ weight: number }, z.infer<typeof ResponseSchema>>(
        "/api/weight",
        ResponseSchema,
        { fetchImpl: spy.fetch, onSuccess },
      ),
    );
    let resolved: unknown;
    await act(async () => {
      resolved = await result.current?.mutate({ weight: 180 });
    });
    expect(resolved).toEqual({ ok: true, id: "abc" });
    expect(result.current?.data).toEqual({ ok: true, id: "abc" });
    expect(result.current?.error).toBeNull();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("sends body as JSON and defaults to POST", async () => {
    const spy = makeFetch(() => ({ body: { ok: true, id: "x" } }));
    const { result } = renderHook(() =>
      useMutation<{ weight: number }, z.infer<typeof ResponseSchema>>(
        "/api/weight",
        ResponseSchema,
        { fetchImpl: spy.fetch },
      ),
    );
    await act(async () => {
      await result.current?.mutate({ weight: 175 });
    });
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]!.init.method).toBe("POST");
    expect(spy.calls[0]!.init.body).toBe(JSON.stringify({ weight: 175 }));
  });

  it("error path: rejects, sets error, fires onError, rolls back optimistic data", async () => {
    const onError = jest.fn();
    const spy = makeFetch(() => ({ status: 500, body: { msg: "boom" } }));
    const { result } = renderHook(() =>
      useMutation<{ weight: number }, z.infer<typeof ResponseSchema>>(
        "/api/weight",
        ResponseSchema,
        {
          fetchImpl: spy.fetch,
          onError,
          optimisticData: (input) => ({ ok: true, id: `optimistic-${input.weight}` }),
        },
      ),
    );
    await act(async () => {
      await expect(result.current?.mutate({ weight: 200 })).rejects.toMatchObject({
        name: "ApiError",
      });
    });
    expect(result.current?.data).toBeNull();
    const err = result.current?.error as { name: string; status: number };
    expect(err?.name).toBe("ApiError");
    expect(err?.status).toBe(500);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("optimistic data is visible before the request resolves", async () => {
    let resolveCall: (() => void) | null = null;
    const fetchImpl = (async () =>
      await new Promise<Response>((res) => {
        resolveCall = () =>
          res({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ ok: true, id: "server-id" }),
          } as Response);
      })) as typeof fetch;
    const { result } = renderHook(() =>
      useMutation<{ weight: number }, z.infer<typeof ResponseSchema>>(
        "/api/weight",
        ResponseSchema,
        {
          fetchImpl,
          optimisticData: () => ({ ok: true, id: "optimistic" }),
        },
      ),
    );
    let pending: Promise<unknown> | undefined;
    await act(async () => {
      pending = result.current?.mutate({ weight: 180 });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current?.data).toEqual({ ok: true, id: "optimistic" });
    });
    await act(async () => {
      resolveCall?.();
      await pending;
    });
    expect(result.current?.data).toEqual({ ok: true, id: "server-id" });
  });

  it("reset clears data + error + loading", async () => {
    const spy = makeFetch(() => ({ body: { ok: true, id: "x" } }));
    const { result } = renderHook(() =>
      useMutation<{ weight: number }, z.infer<typeof ResponseSchema>>(
        "/api/weight",
        ResponseSchema,
        { fetchImpl: spy.fetch },
      ),
    );
    await act(async () => {
      await result.current?.mutate({ weight: 180 });
    });
    expect(result.current?.data).toEqual({ ok: true, id: "x" });
    act(() => {
      result.current?.reset();
    });
    expect(result.current?.data).toBeNull();
    expect(result.current?.error).toBeNull();
    expect(result.current?.loading).toBe(false);
  });

  it("supports multiple sequential mutations", async () => {
    let n = 0;
    const spy = makeFetch(() => ({ body: { ok: true, id: `id-${++n}` } }));
    const { result } = renderHook(() =>
      useMutation<{ weight: number }, z.infer<typeof ResponseSchema>>(
        "/api/weight",
        ResponseSchema,
        { fetchImpl: spy.fetch },
      ),
    );
    await act(async () => {
      await result.current?.mutate({ weight: 180 });
    });
    expect(result.current?.data?.id).toBe("id-1");
    await act(async () => {
      await result.current?.mutate({ weight: 181 });
    });
    expect(result.current?.data?.id).toBe("id-2");
  });
});
