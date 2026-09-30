import { act, renderHook, waitFor } from "@testing-library/react-native";
import { z } from "zod";
import { useFetch } from "@/lib/hooks";
import { writeCache, clearAll, setCacheMemberId } from "@/lib/cache/lastKnown";

const Schema = z.object({ value: z.string() });

function makeFetch(
  responder: (url: string, init: RequestInit) => { status?: number; body?: unknown },
): typeof fetch {
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    const r = responder(url, init);
    const status = r.status ?? 200;
    const text = r.body !== undefined ? JSON.stringify(r.body) : "";
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
    } as Response;
  }) as typeof fetch;
}

describe("useFetch with lastKnownCache", () => {
  beforeEach(() => {
    setCacheMemberId("member-1");
  });

  afterEach(async () => {
    await clearAll();
    setCacheMemberId(null);
  });

  it("seeds synchronously and asynchronously from cache before network responds", async () => {
    await writeCache("/api/data", { value: "cached-value" }, "member-1");

    let networkResolve: (v: Response) => void = () => {};
    const fetchImpl = (async () => {
      return new Promise<Response>((res) => {
        networkResolve = res;
      });
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useFetch("/api/data", Schema, { fetchImpl, memberId: "member-1", useCache: true }),
    );

    // Immediately seeded from cache
    expect(result.current?.data).toEqual({ value: "cached-value" });
    expect(result.current?.isCached).toBe(true);
    expect(result.current?.loading).toBe(true);

    // Resolve network request
    await act(async () => {
      networkResolve({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ value: "fresh-value" }),
      } as Response);
    });

    await waitFor(() => {
      expect(result.current?.loading).toBe(false);
    });
    expect(result.current?.data).toEqual({ value: "fresh-value" });
    expect(result.current?.isCached).toBe(false);
  });

  it("preserves cached data when network fails (offline error)", async () => {
    await writeCache("/api/profile", { value: "saved-profile" }, "member-1");

    const fetchImpl = (async () => {
      throw new Error("Network request failed");
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useFetch("/api/profile", Schema, { fetchImpl, memberId: "member-1", useCache: true }),
    );

    await waitFor(() => {
      expect(result.current?.loading).toBe(false);
    });

    // Cached data is STILL present!
    expect(result.current?.data).toEqual({ value: "saved-profile" });
    expect(result.current?.isCached).toBe(true);
    // Error is also reported
    expect(result.current?.error).toBeTruthy();
  });

  it("preserves cached data when server returns 500 error", async () => {
    await writeCache("/api/settings", { value: "saved-settings" }, "member-1");

    const fetchImpl = makeFetch(() => ({ status: 500, body: { error: "Internal Server Error" } }));

    const { result } = renderHook(() =>
      useFetch("/api/settings", Schema, { fetchImpl, memberId: "member-1", useCache: true }),
    );

    await waitFor(() => {
      expect(result.current?.loading).toBe(false);
    });

    // Cached data is preserved
    expect(result.current?.data).toEqual({ value: "saved-settings" });
    expect(result.current?.error).toBeTruthy();
  });

  it("does not surface another member's cached data", async () => {
    // Member 1 has cache
    await writeCache("/api/secret", { value: "member-1-data" }, "member-1");

    // Member 2 accesses the same endpoint while network is slow/offline
    let networkResolve: (v: Response) => void = () => {};
    const fetchImpl = (async () => {
      return new Promise<Response>((res) => {
        networkResolve = res;
      });
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useFetch("/api/secret", Schema, { fetchImpl, memberId: "member-2", useCache: true }),
    );

    // Member 2 does NOT see member 1's data
    expect(result.current?.data).toBeNull();

    // Clean up promise
    await act(async () => {
      networkResolve({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ value: "member-2-data" }),
      } as Response);
    });
  });
});
