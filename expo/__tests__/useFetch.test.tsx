import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useState } from "react";
import { z } from "zod";
import { useFetch } from "@/lib/hooks";
import { clearAll } from "@/lib/cache/lastKnown";

const Schema = z.object({ message: z.string() });

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

describe("useFetch", () => {
  afterEach(async () => {
    await clearAll();
  });
  it("happy path: returns parsed data and toggles loading", async () => {
    const fetchImpl = makeFetch(() => ({ body: { message: "hi" } }));
    const { result } = renderHook(() =>
      useFetch("/api/test", Schema, { fetchImpl }),
    );
    expect(result.current?.loading).toBe(true);
    await waitFor(() => {
      expect(result.current?.loading).toBe(false);
    });
    expect(result.current?.data).toEqual({ message: "hi" });
    expect(result.current?.error).toBeNull();
  });

  it("error path: 500 surfaces an ApiError", async () => {
    const fetchImpl = makeFetch(() => ({ status: 500, body: { msg: "boom" } }));
    const { result } = renderHook(() =>
      useFetch("/api/test", Schema, { fetchImpl }),
    );
    await waitFor(() => {
      expect(result.current?.loading).toBe(false);
    });
    expect(result.current?.data).toBeNull();
    const err = result.current?.error as { name: string; status: number };
    expect(err?.name).toBe("ApiError");
    expect(err?.status).toBe(500);
  });

  it("skip=true delays the initial fetch until refetch is called", async () => {
    const fetchSpy = jest.fn(
      makeFetch(() => ({ body: { message: "hello" } })),
    );
    const { result } = renderHook(() =>
      useFetch("/api/test", Schema, { fetchImpl: fetchSpy, skip: true }),
    );
    // Give it a tick to confirm no auto-fetch.
    await act(() => Promise.resolve());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current?.loading).toBe(false);

    await act(async () => {
      await result.current?.refetch();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.current?.data).toEqual({ message: "hello" });
  });

  it("refetch triggers a new request and updates data", async () => {
    let n = 0;
    const fetchImpl = makeFetch(() => ({
      body: { message: `call-${++n}` },
    }));
    const { result } = renderHook(() =>
      useFetch("/api/test", Schema, { fetchImpl }),
    );
    await waitFor(() => {
      expect(result.current?.data).toEqual({ message: "call-1" });
    });
    await act(async () => {
      await result.current?.refetch();
    });
    expect(result.current?.data).toEqual({ message: "call-2" });
  });

  it("cancels in-flight request on unmount (no state updates after unmount)", async () => {
    const holder: {
      resolve: ((value: { status: number; body: unknown }) => void) | null;
      abortedCount: number;
    } = { resolve: null, abortedCount: 0 };
    const fetchImpl = (async (
      _input: string | URL | Request,
      init: RequestInit = {},
    ): Promise<Response> => {
      return new Promise<Response>((res, rej) => {
        const signal = init.signal as AbortSignal | undefined;
        signal?.addEventListener("abort", () => {
          holder.abortedCount += 1;
          rej(new Error("aborted"));
        });
        holder.resolve = (value) => {
          res({
            ok: value.status >= 200 && value.status < 300,
            status: value.status,
            text: async () => JSON.stringify(value.body),
          } as Response);
        };
      });
    }) as typeof fetch;
    const { result, unmount } = renderHook(() =>
      useFetch("/api/test", Schema, { fetchImpl }),
    );
    expect(result.current?.loading).toBe(true);
    unmount();
    expect(holder.abortedCount).toBe(1);
    // Resolve after unmount — should not throw or update state (mountedRef=false).
    holder.resolve?.({ status: 200, body: { message: "late" } });
    await act(() => Promise.resolve());
  });

  it("a tab-gated path going from null to real flips loading on the SAME render, not one later (NP-270)", async () => {
    // My Stuff's recipes/foods tabs pass `path=null, skip=true` while another
    // tab is active, then both flip together the instant the member taps the
    // tab. `loading` must already be true on the render that carries the new
    // path — not a render later — or the tab's empty state paints ahead of
    // the fetch.
    const fetchImpl = makeFetch(() => ({ body: { message: "hi" } }));
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useFetch(active ? "/api/test" : null, Schema, {
          fetchImpl,
          skip: !active,
        }),
      { initialProps: { active: false } },
    );
    expect(result.current?.loading).toBe(false);
    expect(result.current?.data).toBeNull();

    rerender({ active: true });
    // Loading is true on THIS render — before the effect's own run() call —
    // and the stale (empty) data has not been replaced by anything, so a
    // caller gating its empty state on `!loading` never shows it here.
    expect(result.current?.loading).toBe(true);

    await waitFor(() => {
      expect(result.current?.data).toEqual({ message: "hi" });
    });
    expect(result.current?.loading).toBe(false);
  });

  it("switching the fetch target back off (active → inactive) resets loading without fetching", async () => {
    const fetchSpy = jest.fn(makeFetch(() => ({ body: { message: "hi" } })));
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useFetch(active ? "/api/test" : null, Schema, {
          fetchImpl: fetchSpy,
          skip: !active,
        }),
      { initialProps: { active: true } },
    );
    await waitFor(() => {
      expect(result.current?.loading).toBe(false);
    });
    rerender({ active: false });
    expect(result.current?.loading).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not loop: an unrelated re-render with the same path/skip leaves loading untouched", async () => {
    const fetchImpl = makeFetch(() => ({ body: { message: "hi" } }));
    const { result } = renderHook(() => {
      const [, setTick] = useState(0);
      const fetched = useFetch("/api/test", Schema, { fetchImpl });
      return { ...fetched, bump: () => setTick((n) => n + 1) };
    });
    await waitFor(() => {
      expect(result.current?.loading).toBe(false);
    });
    act(() => {
      result.current.bump();
    });
    expect(result.current?.loading).toBe(false);
  });

  it("schema mismatch surfaces a SchemaValidationError", async () => {
    const fetchImpl = makeFetch(() => ({ body: { message: 123 } }));
    const { result } = renderHook(() =>
      useFetch("/api/test", Schema, { fetchImpl }),
    );
    await waitFor(() => {
      expect(result.current?.loading).toBe(false);
    });
    const err = result.current?.error as { name: string };
    expect(err?.name).toBe("SchemaValidationError");
  });
});
