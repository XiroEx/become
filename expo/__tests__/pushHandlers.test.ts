import {
  ensureNotificationPermission,
  handleNotificationTap,
  type PermissionFetcher,
} from "@/lib/push/handlers";

describe("ensureNotificationPermission", () => {
  type Counters = { getCalls: number; requestCalls: number };
  function makeFetcher(
    initial: "granted" | "denied" | "blocked" | "undetermined",
    afterRequest: "granted" | "denied" | "blocked" = "denied",
  ): PermissionFetcher & Counters {
    const counters: Counters = { getCalls: 0, requestCalls: 0 };
    const fetcher: PermissionFetcher & Counters = {
      ...counters,
      get: async () => {
        counters.getCalls += 1;
        fetcher.getCalls = counters.getCalls;
        return { status: initial };
      },
      request: async () => {
        counters.requestCalls += 1;
        fetcher.requestCalls = counters.requestCalls;
        return { status: afterRequest };
      },
    };
    return fetcher;
  }

  it("returns granted without prompting when already granted", async () => {
    const fetcher = makeFetcher("granted");
    const r = await ensureNotificationPermission(fetcher);
    expect(r.status).toBe("granted");
    expect(fetcher.requestCalls).toBe(0);
  });

  it("returns denied without re-prompting when already denied", async () => {
    const fetcher = makeFetcher("denied");
    const r = await ensureNotificationPermission(fetcher);
    expect(r.status).toBe("denied");
    expect(fetcher.requestCalls).toBe(0);
  });

  it("returns blocked without prompting when blocked", async () => {
    const fetcher = makeFetcher("blocked");
    const r = await ensureNotificationPermission(fetcher);
    expect(r.status).toBe("blocked");
    expect(fetcher.requestCalls).toBe(0);
  });

  it("prompts only when current status is undetermined", async () => {
    const fetcher = makeFetcher("undetermined", "granted");
    const r = await ensureNotificationPermission(fetcher);
    expect(r.status).toBe("granted");
    expect(fetcher.requestCalls).toBe(1);
  });
});

describe("handleNotificationTap", () => {
  it("routes the payload's url — the only routing input", () => {
    const navigate = jest.fn();
    const route = handleNotificationTap({ url: "/dashboard/mind" }, navigate);
    expect(route).toBe("/(tabs)/mind");
    expect(navigate).toHaveBeenCalledWith("/(tabs)/mind");
  });

  it("opens Home for a payload with no url", () => {
    const navigate = jest.fn();
    const route = handleNotificationTap({}, navigate);
    expect(route).toBe("/(tabs)/dashboard");
    expect(navigate).toHaveBeenCalledWith("/(tabs)/dashboard");
  });
});
