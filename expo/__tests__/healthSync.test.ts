/**
 * ─── Weight, both ways, over the one server route ────────────────────────────
 *
 * `POST /api/weight` already knows what an imported weigh-in is (NP-184,
 * `webapp/lib/healthImport.ts`). What is pinned here is that the native side
 * sends what that route needs and nothing it refuses:
 *
 *   • the DAY comes from the sample's own recorded zone, not from the phone's
 *     current one and not from the clock at sync time;
 *   • `externalId` travels, so the server recognises the same sample next launch
 *     and a re-import changes nothing;
 *   • a sample older than the 90-day window, or dated in the future, is dropped
 *     here rather than posted for a 400;
 *   • `tz` is NOT set by this code — the shared client merges it into every
 *     date-scoped write body, which is the one place it is computed.
 *
 * And that both directions obey the LAUNCH SNAPSHOT: switch off, nothing moves.
 */
import {
  HEALTH_IMPORT_BACKDATE_WINDOW_DAYS,
  buildWeightImport,
  dayKeyDistance,
  ensureHealthPermissionsForSession,
  exportWeighInToHealth,
  exportWorkoutToHealth,
  importWeightFromHealth,
  permissionsForSession,
  runHealthLaunchSync,
  sampleDayKey,
  weighInClientId,
  workoutClientId,
  type WeightImportBody,
} from "@/lib/health/sync";
import type { HealthSyncSession } from "@/lib/health/switches";
import type {
  HealthClient,
  HealthPermission,
  WeightSample,
  WeightWrite,
  WorkoutWrite,
} from "@/lib/health/types";

const ALL_ON: HealthSyncSession = { optedIn: true, read: true, write: true };
const READ_ONLY: HealthSyncSession = { optedIn: true, read: true, write: false };
const WRITE_ONLY: HealthSyncSession = { optedIn: true, read: false, write: true };
const OFF: HealthSyncSession = { optedIn: false, read: true, write: true };

/** 2026-05-27 12:00 in New York (EDT, 240 minutes west). */
const NOW = new Date("2026-05-27T16:00:00Z");
const NY = 240;

interface FakeClientOptions {
  samples?: WeightSample[];
  available?: boolean;
  granted?: HealthPermission[];
  writer?: boolean;
  readThrows?: boolean;
  writeThrows?: boolean;
}

function fakeClient(options: FakeClientOptions = {}): {
  client: HealthClient;
  weightWrites: WeightWrite[];
  workoutWrites: WorkoutWrite[];
  asked: HealthPermission[][];
} {
  const weightWrites: WeightWrite[] = [];
  const workoutWrites: WorkoutWrite[] = [];
  const asked: HealthPermission[][] = [];
  const granted = options.granted ?? [
    { metric: "weight", direction: "read" },
    { metric: "weight", direction: "write" },
    { metric: "workouts", direction: "write" },
  ];
  const client: HealthClient = {
    platform: "android",
    isAvailable: async () => options.available ?? true,
    ensurePermissions: async (wanted) => {
      asked.push([...wanted]);
      return granted;
    },
    readWeight: async () => {
      if (options.readThrows) throw new Error("Health Connect exploded");
      return options.samples ?? [];
    },
    readSteps: async () => [],
    ...(options.writer === false
      ? {}
      : {
          write: {
            writeWeight: async (sample) => {
              if (options.writeThrows) throw new Error("no");
              weightWrites.push(sample);
            },
            writeWorkout: async (workout) => {
              if (options.writeThrows) throw new Error("no");
              workoutWrites.push(workout);
            },
          },
        }),
  };
  return { client, weightWrites, workoutWrites, asked };
}

function recorder() {
  const bodies: WeightImportBody[] = [];
  return {
    bodies,
    post: async (body: WeightImportBody) => {
      bodies.push(body);
      return { applied: true };
    },
  };
}

describe("day keys", () => {
  it("a sample recorded at 9pm in New York belongs to that day, not the UTC one", () => {
    // 2026-06-02T01:30Z is 2026-06-01 21:30 in New York.
    expect(sampleDayKey("2026-06-02T01:30:00.000Z", NY)).toBe("2026-06-01");
    expect("2026-06-02T01:30:00.000Z".slice(0, 10)).toBe("2026-06-02");
  });

  it("a sample keeps the zone it was RECORDED in, even synced from elsewhere", () => {
    const sample: WeightSample = {
      valueLbs: 181.4,
      timestamp: "2026-05-27T22:30:00Z",
      // Recorded in Berlin (120 minutes EAST → -120 west): already the 28th.
      tzOffsetMinutes: -120,
    };
    const built = buildWeightImport(sample, {
      source: "health-connect",
      todayKey: "2026-05-28",
      deviceTzOffsetMinutes: NY,
    });
    expect(built.ok && built.body.date).toBe("2026-05-28");
  });

  it("falls back to the device zone when the platform stored none", () => {
    const built = buildWeightImport(
      { valueLbs: 181.4, timestamp: "2026-05-28T01:30:00Z" },
      {
        source: "health-connect",
        todayKey: "2026-05-28",
        deviceTzOffsetMinutes: NY,
      },
    );
    expect(built.ok && built.body.date).toBe("2026-05-27");
  });

  it("dayKeyDistance counts whole days back", () => {
    expect(dayKeyDistance("2026-05-27", "2026-05-27")).toBe(0);
    expect(dayKeyDistance("2026-05-27", "2026-05-20")).toBe(7);
    expect(dayKeyDistance("2026-05-27", "2026-05-28")).toBe(-1);
  });
});

describe("buildWeightImport", () => {
  const base = {
    source: "health-connect" as const,
    todayKey: "2026-05-27",
    deviceTzOffsetMinutes: NY,
  };

  it("carries weight, day, loggedAt, source and the sample id", () => {
    const built = buildWeightImport(
      {
        valueLbs: 181.4,
        timestamp: "2026-05-27T12:00:00Z",
        externalId: "hc-1",
      },
      base,
    );
    expect(built.ok && built.body).toEqual({
      weight: 181.4,
      date: "2026-05-27",
      loggedAt: "2026-05-27T12:00:00.000Z",
      source: "health-connect",
      externalId: "hc-1",
    });
  });

  it("never sends tz — the shared client owns that", () => {
    const built = buildWeightImport(
      { valueLbs: 181.4, timestamp: "2026-05-27T12:00:00Z" },
      base,
    );
    expect(built.ok && "tz" in built.body).toBe(false);
  });

  it("drops a sample the server's window would refuse", () => {
    const tooOld = buildWeightImport(
      { valueLbs: 181.4, timestamp: "2026-01-01T12:00:00Z" },
      base,
    );
    expect(tooOld).toEqual({ ok: false, reason: "too-old" });
  });

  it("keeps a sample at the edge of the window", () => {
    const edge = new Date(
      Date.parse("2026-05-27T12:00:00Z") -
        HEALTH_IMPORT_BACKDATE_WINDOW_DAYS * 86_400_000,
    ).toISOString();
    const built = buildWeightImport({ valueLbs: 181.4, timestamp: edge }, base);
    expect(built.ok).toBe(true);
  });

  it("drops a day in the future of the device's own today", () => {
    const built = buildWeightImport(
      { valueLbs: 181.4, timestamp: "2026-05-29T12:00:00Z" },
      base,
    );
    expect(built).toEqual({ ok: false, reason: "future-day" });
  });

  it("drops a sample with no usable value", () => {
    expect(
      buildWeightImport({ valueLbs: 0, timestamp: "2026-05-27T12:00:00Z" }, base),
    ).toEqual({ ok: false, reason: "no-value" });
    expect(
      buildWeightImport(
        { valueLbs: Number.NaN, timestamp: "2026-05-27T12:00:00Z" },
        base,
      ),
    ).toEqual({ ok: false, reason: "no-value" });
  });

  it("mirrors the server's window constant", () => {
    // webapp/lib/healthImport.ts → HEALTH_IMPORT_BACKDATE_WINDOW_DAYS
    expect(HEALTH_IMPORT_BACKDATE_WINDOW_DAYS).toBe(90);
  });
});

describe("importWeightFromHealth (Health → Become)", () => {
  const sample: WeightSample = {
    valueLbs: 181.4,
    timestamp: "2026-05-27T12:00:00Z",
    externalId: "hc-1",
  };

  it("posts each usable sample", async () => {
    const { client } = fakeClient({ samples: [sample] });
    const { post, bodies } = recorder();
    const result = await importWeightFromHealth({
      client,
      session: ALL_ON,
      post,
      now: NOW,
      deviceTzOffsetMinutes: NY,
    });
    expect(result).toMatchObject({ ran: true, read: 1, applied: 1, failed: 0 });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ externalId: "hc-1", date: "2026-05-27" });
  });

  it("asks for the READ permission and nothing else", async () => {
    const { client, asked } = fakeClient({ samples: [] });
    await importWeightFromHealth({
      client,
      session: ALL_ON,
      post: recorder().post,
      now: NOW,
    });
    expect(asked).toEqual([[{ metric: "weight", direction: "read" }]]);
  });

  it("does nothing at all when the read switch was off at launch", async () => {
    const { client, asked } = fakeClient({ samples: [sample] });
    const { post, bodies } = recorder();
    const result = await importWeightFromHealth({
      client,
      session: WRITE_ONLY,
      post,
      now: NOW,
    });
    expect(result).toMatchObject({ ran: false, reason: "switch-off", read: 0 });
    expect(bodies).toHaveLength(0);
    expect(asked).toHaveLength(0);
  });

  it("does nothing when the umbrella opt-in was off at launch", async () => {
    const { client } = fakeClient({ samples: [sample] });
    const result = await importWeightFromHealth({
      client,
      session: OFF,
      post: recorder().post,
      now: NOW,
    });
    expect(result.reason).toBe("switch-off");
  });

  it("reports an unavailable health store rather than failing", async () => {
    const { client } = fakeClient({ samples: [sample], available: false });
    const result = await importWeightFromHealth({
      client,
      session: ALL_ON,
      post: recorder().post,
      now: NOW,
    });
    expect(result).toMatchObject({ ran: false, reason: "unavailable" });
  });

  it("reports a declined permission rather than reading anyway", async () => {
    const { client } = fakeClient({ samples: [sample], granted: [] });
    const { post, bodies } = recorder();
    const result = await importWeightFromHealth({
      client,
      session: ALL_ON,
      post,
      now: NOW,
    });
    expect(result).toMatchObject({ ran: false, reason: "denied" });
    expect(bodies).toHaveLength(0);
  });

  it("counts a sample the server already had as a duplicate, not a failure", async () => {
    const { client } = fakeClient({ samples: [sample] });
    const result = await importWeightFromHealth({
      client,
      session: READ_ONLY,
      post: async () => ({ applied: false, duplicate: true }),
      now: NOW,
    });
    expect(result).toMatchObject({ read: 1, applied: 0, duplicate: 1, failed: 0 });
  });

  it("one refused sample does not stop the rest", async () => {
    const { client } = fakeClient({
      samples: [
        sample,
        { valueLbs: 180, timestamp: "2026-05-26T12:00:00Z", externalId: "hc-2" },
      ],
    });
    let calls = 0;
    const result = await importWeightFromHealth({
      client,
      session: ALL_ON,
      post: async () => {
        calls += 1;
        if (calls === 1) throw new Error("400");
        return { applied: true };
      },
      now: NOW,
    });
    expect(result).toMatchObject({ read: 2, applied: 1, failed: 1 });
  });

  it("a health store that throws is a failed sync, not a crash", async () => {
    const { client } = fakeClient({ readThrows: true });
    const result = await importWeightFromHealth({
      client,
      session: ALL_ON,
      post: recorder().post,
      now: NOW,
    });
    expect(result).toMatchObject({ ran: false, reason: "failed" });
  });

  it("skips what it cannot use and says so", async () => {
    const { client } = fakeClient({
      samples: [
        sample,
        { valueLbs: 170, timestamp: "2025-01-01T12:00:00Z" },
        { valueLbs: 0, timestamp: "2026-05-27T12:00:00Z" },
      ],
    });
    const result = await importWeightFromHealth({
      client,
      session: ALL_ON,
      post: recorder().post,
      now: NOW,
    });
    expect(result).toMatchObject({ read: 3, applied: 1, skipped: 2 });
  });
});

describe("export (Become → Health)", () => {
  const weighIn: WeightWrite = {
    valueLbs: 181.4,
    atISO: "2026-05-27T16:00:00Z",
    clientId: weighInClientId("2026-05-27"),
  };
  const workout: WorkoutWrite = {
    title: "Day 1",
    startISO: "2026-05-27T17:00:00Z",
    endISO: "2026-05-27T18:00:00Z",
    clientId: workoutClientId("attempt-1"),
  };

  it("writes a weigh-in when the write switch was on at launch", async () => {
    const { client, weightWrites } = fakeClient();
    expect(await exportWeighInToHealth({ client, session: ALL_ON }, weighIn)).toEqual(
      { written: true },
    );
    expect(weightWrites).toEqual([weighIn]);
  });

  it("writes a finished workout", async () => {
    const { client, workoutWrites } = fakeClient();
    expect(
      await exportWorkoutToHealth({ client, session: ALL_ON }, workout),
    ).toEqual({ written: true });
    expect(workoutWrites).toEqual([workout]);
  });

  it.each([
    ["the write switch was off", READ_ONLY],
    ["the umbrella was off", OFF],
  ])("writes nothing when %s", async (_name, session) => {
    const { client, weightWrites, workoutWrites } = fakeClient();
    expect(await exportWeighInToHealth({ client, session }, weighIn)).toEqual({
      written: false,
      reason: "switch-off",
    });
    expect(await exportWorkoutToHealth({ client, session }, workout)).toEqual({
      written: false,
      reason: "switch-off",
    });
    expect(weightWrites).toHaveLength(0);
    expect(workoutWrites).toHaveLength(0);
  });

  it("says so, quietly, when the platform has no writer (iOS until NP-185)", async () => {
    const { client } = fakeClient({ writer: false });
    expect(await exportWeighInToHealth({ client, session: ALL_ON }, weighIn)).toEqual(
      { written: false, reason: "no-writer" },
    );
    expect(
      await exportWeighInToHealth({ client: null, session: ALL_ON }, weighIn),
    ).toEqual({ written: false, reason: "no-writer" });
  });

  it("refuses a workout that does not end after it starts", async () => {
    const { client, workoutWrites } = fakeClient();
    const result = await exportWorkoutToHealth(
      { client, session: ALL_ON },
      { ...workout, endISO: workout.startISO },
    );
    expect(result).toEqual({ written: false, reason: "failed" });
    expect(workoutWrites).toHaveLength(0);
  });

  it("a throwing health store never reaches the caller", async () => {
    const { client } = fakeClient({ writeThrows: true });
    expect(await exportWeighInToHealth({ client, session: ALL_ON }, weighIn)).toEqual(
      { written: false, reason: "failed" },
    );
  });

  it("client ids are stable per day and per attempt (a retry replaces)", () => {
    expect(weighInClientId("2026-05-27")).toBe("become-weight-2026-05-27");
    expect(workoutClientId("attempt-1")).toBe("become-workout-attempt-1");
  });
});

describe("permissionsForSession", () => {
  it("asks for exactly what the switches justify", async () => {
    expect(permissionsForSession(ALL_ON)).toEqual([
      { metric: "weight", direction: "read" },
      { metric: "weight", direction: "write" },
      { metric: "workouts", direction: "write" },
    ]);
    expect(permissionsForSession(READ_ONLY)).toEqual([
      { metric: "weight", direction: "read" },
    ]);
    expect(permissionsForSession(WRITE_ONLY)).toEqual([
      { metric: "weight", direction: "write" },
      { metric: "workouts", direction: "write" },
    ]);
    expect(permissionsForSession(OFF)).toEqual([]);
  });

  it("asks for nothing at all when both switches are off", async () => {
    const { client, asked } = fakeClient();
    await ensureHealthPermissionsForSession(client, OFF);
    expect(asked).toHaveLength(0);
  });

  it("survives a permission sheet that throws", async () => {
    const client: HealthClient = {
      platform: "android",
      readWeight: async () => [],
      readSteps: async () => [],
      ensurePermissions: async () => {
        throw new Error("no activity");
      },
    };
    expect(await ensureHealthPermissionsForSession(client, ALL_ON)).toEqual([]);
  });
});

describe("runHealthLaunchSync (the real route)", () => {
  function fetchRecorder() {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
      });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, applied: true }),
      } as Response;
    }) as typeof fetch;
    return { impl, calls };
  }

  it("POSTs /api/weight with the sample's day and the shared client's tz", async () => {
    const { client } = fakeClient({
      samples: [
        { valueLbs: 181.4, timestamp: "2026-05-27T12:00:00Z", externalId: "hc-1" },
      ],
    });
    const { impl, calls } = fetchRecorder();
    const result = await runHealthLaunchSync({
      token: "jwt",
      client,
      session: ALL_ON,
      fetchImpl: impl,
      now: NOW,
    });
    expect(result).toMatchObject({ ran: true, applied: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/\/api\/weight/);
    expect(calls[0]!.body).toMatchObject({
      weight: 181.4,
      source: "health-connect",
      externalId: "hc-1",
    });
    // Merged by shared/api-client because /api/weight is date-scoped.
    expect(typeof calls[0]!.body.tz).toBe("number");
    expect(typeof calls[0]!.body.date).toBe("string");
  });

  it("does not run without a session token", async () => {
    const { client } = fakeClient({
      samples: [{ valueLbs: 181.4, timestamp: "2026-05-27T12:00:00Z" }],
    });
    const { impl, calls } = fetchRecorder();
    const result = await runHealthLaunchSync({
      token: null,
      client,
      session: ALL_ON,
      fetchImpl: impl,
    });
    expect(result.ran).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("does nothing when there is no health client at all", async () => {
    const result = await runHealthLaunchSync({
      token: "jwt",
      client: null,
      session: ALL_ON,
    });
    expect(result).toMatchObject({ ran: false, reason: "unavailable" });
  });

  it("a refusal from the route is counted, not thrown", async () => {
    const { client } = fakeClient({
      samples: [{ valueLbs: 181.4, timestamp: "2026-05-27T12:00:00Z" }],
    });
    const impl = (async () =>
      ({ ok: false, status: 400, text: async () => "{}" }) as Response) as typeof fetch;
    const result = await runHealthLaunchSync({
      token: "jwt",
      client,
      session: ALL_ON,
      fetchImpl: impl,
      now: NOW,
    });
    expect(result).toMatchObject({ ran: true, failed: 1, applied: 0 });
  });
});
