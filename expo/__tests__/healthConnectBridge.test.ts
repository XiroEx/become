/**
 * ─── The Health Connect bridge: what we send it, what we believe back ────────
 *
 * Driven against a FAKE `react-native-health-connect` module — the real one has
 * no native side outside an Android dev build, and these are the mappings that
 * are wrong-in-silence if they are wrong at all:
 *
 *   • kilograms in, kilograms out (`Mass` / `MassResult`);
 *   • `zoneOffset.totalSeconds` is seconds EAST, the wire is minutes WEST;
 *   • our own writes are not somebody else's data — a read must not re-import
 *     the row Become just wrote, or every launch would re-stamp the day;
 *   • the permission sheet is only raised for what is actually missing.
 */
import {
  EXERCISE_TYPE_STRENGTH_TRAINING,
  HEALTH_CONNECT_PERMISSIONS,
  OWN_PACKAGE,
  RECORD_TYPES,
  SDK_AVAILABLE,
  androidManifestPermission,
  createHealthConnectImpl,
  fromHealthConnectPermission,
  toHealthConnectPermission,
  zoneOffsetToMinutesWest,
  type HealthConnectModule,
  type HealthConnectPermission,
} from "@/lib/health/healthConnect";
import type { HealthPermission } from "@/lib/health/types";

interface FakeOptions {
  sdkStatus?: number;
  initialized?: boolean;
  granted?: HealthConnectPermission[];
  grantOnRequest?: HealthConnectPermission[];
  records?: Record<string, unknown[]>;
}

function fakeModule(options: FakeOptions = {}) {
  const requested: HealthConnectPermission[][] = [];
  const inserted: unknown[][] = [];
  const reads: { recordType: string; options: unknown }[] = [];
  let granted = options.granted ?? [];
  let settingsOpened = 0;
  const module: HealthConnectModule = {
    getSdkStatus: async () => options.sdkStatus ?? SDK_AVAILABLE,
    initialize: async () => options.initialized ?? true,
    getGrantedPermissions: async () => granted,
    openHealthConnectSettings: () => {
      settingsOpened += 1;
    },
    requestPermission: async (permissions) => {
      requested.push(permissions);
      const answer = options.grantOnRequest ?? permissions;
      granted = [...granted, ...answer];
      return answer;
    },
    readRecords: async (recordType, readOptions) => {
      reads.push({ recordType, options: readOptions });
      return { records: options.records?.[recordType] ?? [] };
    },
    insertRecords: async (records) => {
      inserted.push(records);
      return ["inserted-id"];
    },
  };
  return { module, requested, inserted, reads, settingsOpened: () => settingsOpened };
}

const RANGE = {
  startISO: "2026-05-01T00:00:00.000Z",
  endISO: "2026-05-27T16:00:00.000Z",
};

describe("permission mapping", () => {
  it("maps Become's metrics to Health Connect record types", () => {
    expect(toHealthConnectPermission({ metric: "weight", direction: "read" })).toEqual(
      { accessType: "read", recordType: "Weight" },
    );
    expect(
      toHealthConnectPermission({ metric: "workouts", direction: "write" }),
    ).toEqual({ accessType: "write", recordType: "ExerciseSession" });
    expect(RECORD_TYPES).toEqual({
      weight: "Weight",
      steps: "Steps",
      workouts: "ExerciseSession",
    });
  });

  it("maps Health Connect's answer back, and drops what we do not model", () => {
    expect(
      fromHealthConnectPermission({ accessType: "write", recordType: "Weight" }),
    ).toEqual({ metric: "weight", direction: "write" });
    expect(
      fromHealthConnectPermission({
        accessType: "write",
        recordType: "ExerciseRoute",
      }),
    ).toBeNull();
  });

  it("asks for three permissions, and workout READ is not one of them", () => {
    expect(HEALTH_CONNECT_PERMISSIONS).toEqual([
      { metric: "weight", direction: "read" },
      { metric: "weight", direction: "write" },
      { metric: "workouts", direction: "write" },
    ]);
    expect(
      HEALTH_CONNECT_PERMISSIONS.map(androidManifestPermission),
    ).toEqual([
      "android.permission.health.READ_WEIGHT",
      "android.permission.health.WRITE_WEIGHT",
      "android.permission.health.WRITE_EXERCISE",
    ]);
  });
});

describe("availability", () => {
  it("is true only when the SDK is available and initialises", async () => {
    const available = createHealthConnectImpl(fakeModule().module);
    expect(await available.isAvailable()).toBe(true);

    const needsUpdate = createHealthConnectImpl(
      fakeModule({ sdkStatus: 2 }).module,
    );
    expect(await needsUpdate.isAvailable()).toBe(false);

    const wontInit = createHealthConnectImpl(
      fakeModule({ initialized: false }).module,
    );
    expect(await wontInit.isAvailable()).toBe(false);
  });
});

describe("requesting permissions", () => {
  const wanted: HealthPermission[] = [
    { metric: "weight", direction: "read" },
    { metric: "weight", direction: "write" },
  ];

  it("raises the sheet for the missing ones only", async () => {
    const fake = fakeModule({
      granted: [{ accessType: "read", recordType: "Weight" }],
    });
    const impl = createHealthConnectImpl(fake.module);
    const granted = await impl.requestPermissions(wanted);
    expect(fake.requested).toEqual([
      [{ accessType: "write", recordType: "Weight" }],
    ]);
    expect(granted).toEqual([
      { metric: "weight", direction: "read" },
      { metric: "weight", direction: "write" },
    ]);
  });

  it("does not raise the sheet at all when everything is already granted", async () => {
    const fake = fakeModule({
      granted: [
        { accessType: "read", recordType: "Weight" },
        { accessType: "write", recordType: "Weight" },
      ],
    });
    const impl = createHealthConnectImpl(fake.module);
    await impl.requestPermissions(wanted);
    expect(fake.requested).toEqual([]);
  });

  it("reports a declined permission as not granted", async () => {
    const fake = fakeModule({ grantOnRequest: [] });
    const impl = createHealthConnectImpl(fake.module);
    expect(await impl.requestPermissions(wanted)).toEqual([]);
  });
});

describe("opening Health Connect's own settings (NP-337)", () => {
  it("delegates to the module", () => {
    const fake = fakeModule();
    const impl = createHealthConnectImpl(fake.module);
    impl.openSettings?.();
    expect(fake.settingsOpened()).toBe(1);
  });
});

describe("reading weight", () => {
  it("reads kilograms, the record id, the recorded zone and the origin", async () => {
    const fake = fakeModule({
      records: {
        Weight: [
          {
            time: "2026-05-27T12:00:00.000Z",
            // UTC-4 — New York in summer — is 240 minutes WEST.
            zoneOffset: { totalSeconds: -14400 },
            weight: { inKilograms: 82.3 },
            metadata: { id: "hc-1", dataOrigin: "com.withings.wiscale2" },
          },
        ],
      },
    });
    const impl = createHealthConnectImpl(fake.module);
    const records = await impl.queryWeightKg(RANGE);
    expect(records).toEqual([
      {
        valueKg: 82.3,
        timestamp: "2026-05-27T12:00:00.000Z",
        externalId: "hc-1",
        tzOffsetMinutes: 240,
        originPackage: "com.withings.wiscale2",
      },
    ]);
    expect(fake.reads[0]).toEqual({
      recordType: "Weight",
      options: {
        timeRangeFilter: {
          operator: "between",
          startTime: RANGE.startISO,
          endTime: RANGE.endISO,
        },
        ascendingOrder: true,
      },
    });
  });

  it("converts a zone offset EAST of UTC to a negative minutes-west", () => {
    expect(zoneOffsetToMinutesWest({ totalSeconds: 7200 })).toBe(-120);
    expect(zoneOffsetToMinutesWest({ totalSeconds: 0 })).toBe(0);
    expect(zoneOffsetToMinutesWest(undefined)).toBeUndefined();
    expect(zoneOffsetToMinutesWest({})).toBeUndefined();
  });

  // THE LOOP GUARD. Become writes weigh-ins to Health Connect; Health Connect
  // hands them back. Re-importing one would re-stamp the day as imported.
  it("drops the rows Become itself wrote", async () => {
    const fake = fakeModule({
      records: {
        Weight: [
          {
            time: "2026-05-27T12:00:00.000Z",
            weight: { inKilograms: 82.3 },
            metadata: { id: "ours", dataOrigin: OWN_PACKAGE },
          },
          {
            time: "2026-05-26T12:00:00.000Z",
            weight: { inKilograms: 82.9 },
            metadata: { id: "theirs", dataOrigin: "com.google.android.apps.fitness" },
          },
        ],
      },
    });
    const impl = createHealthConnectImpl(fake.module);
    const records = await impl.queryWeightKg(RANGE);
    expect(records.map((r) => r.externalId)).toEqual(["theirs"]);
  });

  it("drops a row with no readable mass", async () => {
    const fake = fakeModule({
      records: { Weight: [{ time: "2026-05-27T12:00:00.000Z", weight: {} }] },
    });
    const impl = createHealthConnectImpl(fake.module);
    expect(await impl.queryWeightKg(RANGE)).toEqual([]);
  });

  it("reads steps off the interval's start", async () => {
    const fake = fakeModule({
      records: {
        Steps: [
          {
            startTime: "2026-05-27T00:00:00.000Z",
            endTime: "2026-05-27T23:59:00.000Z",
            count: 8123,
          },
        ],
      },
    });
    const impl = createHealthConnectImpl(fake.module);
    expect(await impl.querySteps(RANGE)).toEqual([
      { count: 8123, timestamp: "2026-05-27T00:00:00.000Z" },
    ]);
  });
});

describe("writing", () => {
  it("inserts a Weight record in kilograms, keyed by our own client id", async () => {
    const fake = fakeModule();
    const impl = createHealthConnectImpl(fake.module);
    await impl.writeWeightKg({
      valueKg: 82.3,
      atISO: "2026-05-27T16:00:00.000Z",
      clientId: "become-weight-2026-05-27",
    });
    expect(fake.inserted).toEqual([
      [
        {
          recordType: "Weight",
          time: "2026-05-27T16:00:00.000Z",
          weight: { value: 82.3, unit: "kilograms" },
          metadata: {
            recordingMethod: 3,
            clientRecordId: "become-weight-2026-05-27",
          },
        },
      ],
    ]);
  });

  it("inserts an ExerciseSession for a finished workout", async () => {
    const fake = fakeModule();
    const impl = createHealthConnectImpl(fake.module);
    await impl.writeWorkout({
      title: "Day 1 — Push",
      startISO: "2026-05-27T17:00:00.000Z",
      endISO: "2026-05-27T18:02:00.000Z",
      clientId: "become-workout-attempt-1",
    });
    expect(fake.inserted[0]).toEqual([
      {
        recordType: "ExerciseSession",
        startTime: "2026-05-27T17:00:00.000Z",
        endTime: "2026-05-27T18:02:00.000Z",
        exerciseType: EXERCISE_TYPE_STRENGTH_TRAINING,
        title: "Day 1 — Push",
        metadata: {
          recordingMethod: 1,
          clientRecordId: "become-workout-attempt-1",
        },
      },
    ]);
  });
});
