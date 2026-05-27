import { createOfflineQueryClientConfig } from "@/lib/query/client";

describe("createOfflineQueryClientConfig", () => {
  it("returns offline-first defaults", () => {
    const cfg = createOfflineQueryClientConfig();
    expect(cfg.defaultOptions.queries.networkMode).toBe("offlineFirst");
    expect(cfg.defaultOptions.mutations.networkMode).toBe("offlineFirst");
    expect(cfg.defaultOptions.queries.refetchOnReconnect).toBe(true);
  });

  it("retry count defaults to 3 (queries + mutations)", () => {
    const cfg = createOfflineQueryClientConfig();
    expect(cfg.defaultOptions.queries.retry).toBe(3);
    expect(cfg.defaultOptions.mutations.retry).toBe(3);
  });

  it("retryDelay grows exponentially up to maxBackoffMs", () => {
    const cfg = createOfflineQueryClientConfig({
      initialBackoffMs: 100,
      maxBackoffMs: 1000,
    });
    const delay = cfg.defaultOptions.queries.retryDelay;
    expect(delay(0)).toBe(100);
    expect(delay(1)).toBe(200);
    expect(delay(2)).toBe(400);
    expect(delay(3)).toBe(800);
    // Capped at max
    expect(delay(4)).toBe(1000);
    expect(delay(10)).toBe(1000);
  });

  it("staleTime defaults to 5 minutes", () => {
    const cfg = createOfflineQueryClientConfig();
    expect(cfg.defaultOptions.queries.staleTime).toBe(5 * 60 * 1000);
  });

  it("inputs override defaults", () => {
    const cfg = createOfflineQueryClientConfig({
      maxRetries: 5,
      staleTimeMs: 60 * 1000,
    });
    expect(cfg.defaultOptions.queries.retry).toBe(5);
    expect(cfg.defaultOptions.queries.staleTime).toBe(60 * 1000);
  });
});
