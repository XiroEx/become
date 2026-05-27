import {
  buildForegroundDisplay,
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

describe("buildForegroundDisplay", () => {
  it("returns category-specific copy for workout-reminder", () => {
    const d = buildForegroundDisplay({ category: "workout-reminder" });
    expect(d.title).toMatch(/train/i);
  });
  it("returns category-specific copy for streak-at-risk", () => {
    const d = buildForegroundDisplay({ category: "streak-at-risk" });
    expect(d.title).toMatch(/streak/i);
  });
  it("returns category-specific copy for re-engagement", () => {
    const d = buildForegroundDisplay({ category: "re-engagement" });
    expect(d.title).toMatch(/come back/i);
  });
  it("falls back to a generic Become title for unknown categories", () => {
    const d = buildForegroundDisplay({ category: "alien-event" });
    expect(d.title).toBe("Become");
  });
});

describe("handleNotificationTap", () => {
  it("forwards the resolved route through the provided navigator", () => {
    const navigate = jest.fn();
    const route = handleNotificationTap(
      { category: "re-engagement" },
      navigate,
    );
    expect(route).toBe("/(tabs)/mind");
    expect(navigate).toHaveBeenCalledWith("/(tabs)/mind");
  });

  it("forwards live-workout route when payload carries program + workout IDs", () => {
    const navigate = jest.fn();
    handleNotificationTap(
      {
        category: "workout-reminder",
        programId: "p1",
        workoutIndex: 4,
        phaseIndex: 1,
      },
      navigate,
    );
    expect(navigate).toHaveBeenCalledWith(
      "/(tabs)/programming/p1/workout/4/live",
    );
  });
});
