import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useSSE } from "@/lib/hooks";
import type { EventSourceLike, EventSourceFactory } from "@/lib/hooks/useSSE";

type Listener = (event: { data?: string }) => void;

class FakeEventSource implements EventSourceLike {
  closed = false;
  listeners: Record<string, Listener[]> = {
    open: [],
    message: [],
    error: [],
    close: [],
  };
  addEventListener(
    type: "open" | "message" | "error" | "close",
    fn: Listener,
  ): void {
    this.listeners[type]!.push(fn);
  }
  removeEventListener(
    type: "open" | "message" | "error" | "close",
    fn: Listener,
  ): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== fn);
  }
  close(): void {
    this.closed = true;
  }
  fire(type: "open" | "message" | "error" | "close", event: { data?: string } = {}): void {
    for (const l of this.listeners[type] ?? []) l(event);
  }
}

function makeFactoryAndInstances(): {
  factory: EventSourceFactory;
  instances: FakeEventSource[];
} {
  const instances: FakeEventSource[] = [];
  const factory: EventSourceFactory = () => {
    const es = new FakeEventSource();
    instances.push(es);
    return es;
  };
  return { factory, instances };
}

describe("useSSE", () => {
  it("appends a parsed message and fires onMessage callback", async () => {
    const { factory, instances } = makeFactoryAndInstances();
    const onMessage = jest.fn();
    const { result } = renderHook(() =>
      useSSE<{ text: string }>("/api/stream", { factory, onMessage }),
    );
    await waitFor(() => {
      expect(instances).toHaveLength(1);
    });
    act(() => {
      instances[0]!.fire("open");
      instances[0]!.fire("message", { data: JSON.stringify({ text: "hi" }) });
    });
    expect(result.current?.messages).toEqual([{ text: "hi" }]);
    expect(onMessage).toHaveBeenCalledWith({ text: "hi" });
    expect(result.current?.connected).toBe(true);
  });

  it("supports custom parse function for non-JSON streams", () => {
    const { factory, instances } = makeFactoryAndInstances();
    const { result } = renderHook(() =>
      useSSE<string>("/api/stream", {
        factory,
        parse: (raw) => raw.toUpperCase(),
      }),
    );
    act(() => {
      instances[0]!.fire("open");
      instances[0]!.fire("message", { data: "hello" });
    });
    expect(result.current?.messages).toEqual(["HELLO"]);
  });

  it("surfaces a parse error without crashing the hook", () => {
    const { factory, instances } = makeFactoryAndInstances();
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useSSE<{ text: string }>("/api/stream", { factory, onError }),
    );
    act(() => {
      instances[0]!.fire("open");
      instances[0]!.fire("message", { data: "{not-json" });
    });
    expect(result.current?.error).toBeTruthy();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current?.messages).toEqual([]);
  });

  it("close() halts auto-reconnect", () => {
    const { factory, instances } = makeFactoryAndInstances();
    const setTimeoutImpl = jest.fn() as unknown as typeof setTimeout;
    const { result } = renderHook(() =>
      useSSE<unknown>("/api/stream", {
        factory,
        setTimeoutImpl,
      }),
    );
    act(() => {
      instances[0]!.fire("open");
      result.current?.close();
    });
    expect(instances[0]!.closed).toBe(true);
    act(() => {
      instances[0]!.fire("close");
    });
    expect(setTimeoutImpl).not.toHaveBeenCalled();
    expect(instances).toHaveLength(1);
  });

  it("reconnects on close event using setTimeoutImpl with exponential backoff", () => {
    const { factory, instances } = makeFactoryAndInstances();
    let scheduled: { fn: () => void; delay: number } | null = null;
    const setTimeoutImpl = jest.fn((fn: () => void, delay: number) => {
      scheduled = { fn, delay };
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
    renderHook(() =>
      useSSE<unknown>("/api/stream", {
        factory,
        setTimeoutImpl,
        initialBackoffMs: 100,
        maxBackoffMs: 10000,
      }),
    );
    act(() => {
      instances[0]!.fire("close");
    });
    expect(setTimeoutImpl).toHaveBeenCalledTimes(1);
    expect(scheduled!.delay).toBe(100);
    act(() => {
      scheduled!.fn();
    });
    expect(instances).toHaveLength(2);
    // Next failure should double the backoff.
    act(() => {
      instances[1]!.fire("close");
    });
    expect(setTimeoutImpl).toHaveBeenCalledTimes(2);
    expect(scheduled!.delay).toBe(200);
  });

  it("manual reconnect() spins up a fresh EventSource and resets backoff", () => {
    const { factory, instances } = makeFactoryAndInstances();
    const { result } = renderHook(() =>
      useSSE<unknown>("/api/stream", { factory, initialBackoffMs: 100 }),
    );
    expect(instances).toHaveLength(1);
    act(() => {
      result.current?.reconnect();
    });
    expect(instances).toHaveLength(2);
    expect(instances[0]!.closed).toBe(true);
  });

  it("closes the EventSource on unmount", () => {
    const { factory, instances } = makeFactoryAndInstances();
    const { unmount } = renderHook(() =>
      useSSE<unknown>("/api/stream", { factory }),
    );
    expect(instances[0]!.closed).toBe(false);
    unmount();
    expect(instances[0]!.closed).toBe(true);
  });
});
