/**
 * ─── Workouts done OUTSIDE Become, read in from Health (card 6adf69c7) ───────
 *
 * Jon, 2026-10-26: a walk Whoop recorded, a Strava run, an Apple Watch session
 * should sync in from Apple Health / Health Connect, show on the calendar as an
 * extra activity and tick off "I did a workout today" — without completing the
 * program slot (the server's half: `webapp/tests/unit/externalWorkouts.test.ts`).
 *
 * What only the PHONE can decide, and is pinned here:
 *
 *   • only TRACKED sessions are sent — one typed in by hand is skipped;
 *   • Become's own exports never come back in (Android `dataOrigin`);
 *   • the day is the session's OWN local day, from its own zone offset
 *     (seconds east → minutes west), the device offset only as a fallback;
 *   • the future and anything past the 90-day window are dropped, not posted;
 *   • batches respect the server's bound, and nothing here throws.
 */
import {
  WORKOUT_IMPORT_BATCH,
  __resetHealthPermissionsAskedThisProcess,
  buildWorkoutImport,
  importWorkoutsFromHealth,
  runHealthLaunchSync,
  type WorkoutImportItem,
} from "@/lib/health/sync";
import {
  OWN_PACKAGE,
  RECORDING_METHOD_ACTIVELY_RECORDED,
  RECORDING_METHOD_MANUAL_ENTRY,
  SDK_AVAILABLE,
  createHealthConnectImpl,
  type HealthConnectModule,
  type HealthConnectPermission,
} from "@/lib/health/healthConnect";
import { createAndroidAdapter } from "@/lib/health/android";
import {
  activityDisplayName,
  androidOriginAppLabel,
  healthConnectExerciseTypeName,
} from "@/lib/health/activityNames";
import type { HealthSyncSession } from "@/lib/health/switches";
import type { HealthClient, HealthPermission, WorkoutSample } from "@/lib/health/types";
import * as fs from "fs";
import * as path from "path";

const ALL_ON: HealthSyncSession = { optedIn: true, read: true, write: true };
const WRITE_ONLY: HealthSyncSession = { optedIn: true, read: false, write: true };

/** 2026-10-26 12:00 in New York (EDT, 240 minutes west). */
const NOW = new Date("2026-10-26T16:00:00Z");
const NY = 240;

beforeEach(() => {
  __resetHealthPermissionsAskedThisProcess();
});

function sample(over: Partial<WorkoutSample> = {}): WorkoutSample {
  return {
    externalId: "hc-walk-1",
    startISO: "2026-10-26T11:00:00.000Z",
    endISO: "2026-10-26T11:45:00.000Z",
    activityType: "WALKING",
    activityName: "Walking",
    tracked: true,
    ...over,
  };
}

const BUILD = {
  source: "health-connect" as const,
  todayKey: "2026-10-26",
  deviceTzOffsetMinutes: NY,
};

describe("buildWorkoutImport", () => {
  it("sends a tracked session on its own local day", () => {
    const built = buildWorkoutImport(sample({ distanceKm: 3.4567, energyKcal: 180.4 }), BUILD);
    expect(built).toEqual({
      ok: true,
      item: {
        source: "health-connect",
        externalId: "hc-walk-1",
        date: "2026-10-26",
        startedAt: "2026-10-26T11:00:00.000Z",
        endedAt: "2026-10-26T11:45:00.000Z",
        activityType: "WALKING",
        activityName: "Walking",
        distanceKm: 3.46,
        energyKcal: 180,
      },
    });
  });

  it("skips a session the member typed in by hand — Jon's rule", () => {
    expect(buildWorkoutImport(sample({ tracked: false }), BUILD)).toEqual({ ok: false, reason: "untracked" });
  });

  it("dates a late-evening session by ITS zone, not the phone's", () => {
    // 00:30 in Berlin (UTC+2, −120 minutes west) on the 26th is 22:30Z on
    // the 25th, which the phone in New York would call the 25th. The
    // session's own zone says the 26th, and its own zone wins.
    const berlin = sample({ startISO: "2026-10-25T22:30:00.000Z", endISO: "2026-10-25T23:10:00.000Z", tzOffsetMinutes: -120 });
    const built = buildWorkoutImport(berlin, BUILD);
    expect(built.ok && built.item.date).toBe("2026-10-26");
    const noZone = buildWorkoutImport({ ...berlin, tzOffsetMinutes: undefined }, BUILD);
    expect(noZone.ok && noZone.item.date).toBe("2026-10-25");
  });

  it("drops the future, the too-old, a backwards span and a missing id", () => {
    expect(buildWorkoutImport(sample({ startISO: "2026-10-28T11:00:00Z", endISO: "2026-10-28T12:00:00Z" }), BUILD))
      .toEqual({ ok: false, reason: "future-day" });
    expect(buildWorkoutImport(sample({ startISO: "2026-06-01T11:00:00Z", endISO: "2026-06-01T12:00:00Z" }), BUILD))
      .toEqual({ ok: false, reason: "too-old" });
    expect(buildWorkoutImport(sample({ endISO: "2026-10-26T10:00:00.000Z" }), BUILD))
      .toEqual({ ok: false, reason: "bad-span" });
    expect(buildWorkoutImport(sample({ externalId: "" }), BUILD))
      .toEqual({ ok: false, reason: "no-id" });
  });
});

describe("Health Connect's exercise sessions (the Android impl)", () => {
  function fakeModule(records: unknown[]) {
    const reads: string[] = [];
    let granted: HealthConnectPermission[] = [
      { accessType: "read", recordType: "ExerciseSession" },
    ];
    const module: HealthConnectModule = {
      getSdkStatus: async () => SDK_AVAILABLE,
      initialize: async () => true,
      getGrantedPermissions: async () => granted,
      openHealthConnectSettings: () => {},
      requestPermission: async (p) => p,
      readRecords: async (recordType) => {
        reads.push(recordType);
        return { records };
      },
      insertRecords: async () => [],
    };
    return { module, reads, revoke: () => { granted = []; } };
  }

  const session = (over: Record<string, unknown> = {}) => ({
    startTime: "2026-10-26T11:00:00.000Z",
    endTime: "2026-10-26T11:45:00.000Z",
    startZoneOffset: { totalSeconds: -14400 },
    exerciseType: 79,
    metadata: {
      id: "hc-1",
      dataOrigin: "com.strava",
      recordingMethod: RECORDING_METHOD_ACTIVELY_RECORDED,
    },
    ...over,
  });

  it("reads ExerciseSession, names it, dates it by its zone and names the app", async () => {
    const fake = fakeModule([session()]);
    const client = createAndroidAdapter(createHealthConnectImpl(fake.module));
    const out = await client.readWorkouts!({ startISO: "a", endISO: "b" });
    expect(fake.reads).toEqual(["ExerciseSession"]);
    expect(out).toEqual([
      {
        externalId: "hc-1",
        startISO: "2026-10-26T11:00:00.000Z",
        endISO: "2026-10-26T11:45:00.000Z",
        activityType: "WALKING",
        activityName: "Walking",
        tracked: true,
        tzOffsetMinutes: 240,
        originApp: "Strava",
      },
    ]);
  });

  it("drops Become's own sessions and marks a typed-in one untracked", async () => {
    const fake = fakeModule([
      session({ metadata: { id: "ours", dataOrigin: OWN_PACKAGE, recordingMethod: 1 } }),
      session({ metadata: { id: "typed", dataOrigin: "com.google.android.apps.fitness", recordingMethod: RECORDING_METHOD_MANUAL_ENTRY } }),
    ]);
    const out = await createAndroidAdapter(createHealthConnectImpl(fake.module)).readWorkouts!({ startISO: "a", endISO: "b" });
    expect(out.map((w) => [w.externalId, w.tracked])).toEqual([["typed", false]]);
  });

  it("refuses the read without its own grant — never an empty list", async () => {
    const fake = fakeModule([session()]);
    fake.revoke();
    const client = createAndroidAdapter(createHealthConnectImpl(fake.module));
    await expect(client.readWorkouts!({ startISO: "a", endISO: "b" })).rejects.toThrow(/read workouts/);
  });
});

describe("activity names", () => {
  it("speaks people, not constants", () => {
    expect(activityDisplayName("WALKING")).toBe("Walking");
    expect(activityDisplayName("RUNNING_TREADMILL")).toBe("Treadmill run");
    expect(activityDisplayName("TraditionalStrengthTraining")).toBe("Strength training");
    expect(activityDisplayName("StairClimbing")).toBe("Stair climbing");
    expect(activityDisplayName(undefined)).toBe("Workout");
    expect(healthConnectExerciseTypeName(56)).toBe("RUNNING");
    expect(healthConnectExerciseTypeName(999)).toBe("OTHER_WORKOUT");
    expect(androidOriginAppLabel("com.whoop.android")).toBe("WHOOP");
    expect(androidOriginAppLabel("com.unknown.thing")).toBeUndefined();
  });
});

function fakeClient(options: {
  samples?: WorkoutSample[];
  granted?: HealthPermission[];
  readThrows?: boolean;
  noReader?: boolean;
} = {}) {
  const asked: HealthPermission[][] = [];
  const client: HealthClient = {
    platform: "android",
    isAvailable: async () => true,
    ensurePermissions: async (wanted) => {
      asked.push([...wanted]);
      return options.granted ?? [
        { metric: "weight", direction: "read" },
        { metric: "workouts", direction: "read" },
      ];
    },
    readWeight: async () => [],
    readSteps: async () => [],
    ...(options.noReader
      ? {}
      : {
          readWorkouts: async () => {
            if (options.readThrows) throw new Error("boom");
            return options.samples ?? [];
          },
        }),
  };
  return { client, asked };
}

describe("importWorkoutsFromHealth", () => {
  function poster(answer: (items: WorkoutImportItem[]) => unknown = (items) => ({
    results: items.map(() => ({ applied: true })),
  })) {
    const batches: WorkoutImportItem[][] = [];
    return {
      batches,
      post: async (items: WorkoutImportItem[]) => {
        batches.push(items);
        return answer(items) as { results: { applied?: boolean; duplicate?: boolean; error?: string }[] };
      },
    };
  }

  it("does nothing with the read switch off", async () => {
    const { client } = fakeClient({ samples: [sample()] });
    const p = poster();
    const result = await importWorkoutsFromHealth({ client, session: WRITE_ONLY, post: p.post, now: NOW });
    expect(result).toMatchObject({ ran: false, reason: "switch-off" });
    expect(p.batches).toHaveLength(0);
  });

  it("sends tracked sessions, skips typed ones, and counts the answer per item", async () => {
    const { client } = fakeClient({
      samples: [sample(), sample({ externalId: "typed", tracked: false }), sample({ externalId: "again" })],
    });
    const p = poster(() => ({ results: [{ applied: true }, { applied: false, duplicate: true }] }));
    const result = await importWorkoutsFromHealth({
      client, session: ALL_ON, post: p.post, now: NOW, deviceTzOffsetMinutes: NY,
    });
    expect(p.batches).toHaveLength(1);
    expect(p.batches[0]!.map((i) => i.externalId)).toEqual(["hc-walk-1", "again"]);
    expect(result).toMatchObject({ ran: true, read: 3, applied: 1, duplicate: 1, skipped: 1, failed: 0 });
  });

  it("chunks a first sync to the server's batch bound", async () => {
    const samples = Array.from({ length: WORKOUT_IMPORT_BATCH + 7 }, (_, i) => sample({ externalId: `w-${i}` }));
    const { client } = fakeClient({ samples });
    const p = poster();
    const result = await importWorkoutsFromHealth({ client, session: ALL_ON, post: p.post, now: NOW });
    expect(p.batches.map((b) => b.length)).toEqual([WORKOUT_IMPORT_BATCH, 7]);
    expect(result.applied).toBe(WORKOUT_IMPORT_BATCH + 7);
  });

  it("a refused grant, a failing read and a failing post are reported, never thrown", async () => {
    const denied = await importWorkoutsFromHealth({
      client: fakeClient({ granted: [{ metric: "weight", direction: "read" }] }).client,
      session: ALL_ON, post: poster().post, now: NOW,
    });
    expect(denied).toMatchObject({ ran: false, reason: "denied" });

    __resetHealthPermissionsAskedThisProcess();
    const broken = await importWorkoutsFromHealth({
      client: fakeClient({ readThrows: true }).client, session: ALL_ON, post: poster().post, now: NOW,
    });
    expect(broken).toMatchObject({ ran: false, reason: "failed" });

    __resetHealthPermissionsAskedThisProcess();
    const dropped = await importWorkoutsFromHealth({
      client: fakeClient({ samples: [sample()] }).client,
      session: ALL_ON,
      post: async () => { throw new Error("offline"); },
      now: NOW,
    });
    expect(dropped).toMatchObject({ ran: true, failed: 1, applied: 0 });
  });

  it("a platform with no workout reader imports none", async () => {
    const result = await importWorkoutsFromHealth({
      client: fakeClient({ noReader: true }).client, session: ALL_ON, post: poster().post, now: NOW,
    });
    expect(result).toMatchObject({ ran: false, reason: "no-reader" });
  });

  it("the batch bound is the server's", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../webapp/lib/workout/externalWorkouts.ts"),
      "utf8",
    );
    const m = /export const EXTERNAL_WORKOUT_MAX_BATCH = (\d+)/.exec(src);
    expect(Number(m?.[1])).toBe(WORKOUT_IMPORT_BATCH);
  });
});

describe("runHealthLaunchSync, with a workout reader", () => {
  it("posts weight to /api/weight and sessions to /api/workouts/external, tz merged by the shared client", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push({ url: String(input), body });
      const n = Array.isArray(body.workouts) ? body.workouts.length : 0;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(
          n ? { success: true, results: Array.from({ length: n }, () => ({ applied: true })) } : { success: true, applied: true },
        ),
      } as Response;
    }) as typeof fetch;
    const { client } = fakeClient({ samples: [sample()] });
    const result = await runHealthLaunchSync({ token: "jwt", client, session: ALL_ON, fetchImpl, now: NOW });

    const workoutCall = calls.find((c) => /\/api\/workouts\/external/.test(c.url));
    expect(workoutCall).toBeDefined();
    expect(typeof workoutCall!.body.tz).toBe("number");
    expect((workoutCall!.body.workouts as WorkoutImportItem[])[0]).toMatchObject({
      source: "health-connect",
      externalId: "hc-walk-1",
      date: "2026-10-26",
    });
    expect(result.workouts).toMatchObject({ ran: true, applied: 1 });
  });
});
