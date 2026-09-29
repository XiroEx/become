/**
 * Android Health Connect adapter (NP-199).
 *
 * The adapter is the BOUNDARY: everything above it speaks Become's units and
 * Become's vocabulary (pounds, `weight`/`steps`/`workouts`, read/write), and
 * everything below it speaks Health Connect's (kilograms, `Weight`,
 * `ExerciseSession`, `accessType`). `lib/health/healthConnect.ts` is the impl
 * that does the talking; it is INJECTED so jest can drive this file with a fake
 * and no native module (Health Connect needs a dev build — it is not in Expo
 * Go's module set).
 *
 * Two rules live here, and both exist because they were broken first:
 *
 *  1. **Permission is per metric AND per direction.** Health Connect grants
 *     `Weight/read` separately from `Weight/write`, so a single
 *     `isPermissionGranted()` — which is what this shell had — would let a
 *     write ride in on a read grant.
 *  2. **A refusal is a `HealthPermissionError`, never an empty list.** A sync
 *     that cannot tell "no permission" from "no data" silently stops working
 *     and reports success.
 */
import type {
  DateRange,
  HealthClient,
  HealthPermission,
  StepSample,
  WeightSample,
  WeightWrite,
  WorkoutWrite,
} from "./types";
import { HealthPermissionError, hasPermission } from "./types";
import { kgToLbs, lbsToKg } from "./units";

/** One Health Connect `Weight` record, in the units Health Connect uses. */
export interface AndroidWeightRecord {
  valueKg: number;
  timestamp: string;
  /** `metadata.id` — the record's own id, the server's de-duplication key. */
  externalId?: string;
  /** `zoneOffset`, normalised to minutes WEST of UTC. */
  tzOffsetMinutes?: number;
  /** `metadata.dataOrigin` — the package that wrote it. */
  originPackage?: string;
}

export interface AndroidClientImpl {
  /** Health Connect present and up to date on this phone? */
  isAvailable: () => Promise<boolean>;
  /** Show the Health Connect permission sheet for `wanted`; answer the grants. */
  requestPermissions: (
    wanted: readonly HealthPermission[],
  ) => Promise<HealthPermission[]>;
  /** What is granted right now, with no sheet. */
  grantedPermissions: () => Promise<HealthPermission[]>;
  queryWeightKg: (range: DateRange) => Promise<AndroidWeightRecord[]>;
  querySteps: (
    range: DateRange,
  ) => Promise<{ count: number; timestamp: string }[]>;
  writeWeightKg: (input: {
    valueKg: number;
    atISO: string;
    clientId?: string;
  }) => Promise<void>;
  writeWorkout: (workout: WorkoutWrite) => Promise<void>;
}

export function createAndroidAdapter(impl: AndroidClientImpl): HealthClient {
  async function assertGranted(
    metric: "weight" | "steps" | "workouts",
    direction: "read" | "write",
  ): Promise<void> {
    const granted = await impl.grantedPermissions();
    if (!hasPermission(granted, { metric, direction })) {
      throw new HealthPermissionError("android", metric, direction);
    }
  }

  return {
    platform: "android",
    isAvailable: () => impl.isAvailable(),
    ensurePermissions: (wanted) => impl.requestPermissions(wanted),

    async readWeight(range): Promise<WeightSample[]> {
      await assertGranted("weight", "read");
      const samples = await impl.queryWeightKg(range);
      return samples.map((s) => ({
        valueLbs: kgToLbs(s.valueKg),
        timestamp: s.timestamp,
        ...(s.externalId ? { externalId: s.externalId } : {}),
        ...(s.tzOffsetMinutes != null
          ? { tzOffsetMinutes: s.tzOffsetMinutes }
          : {}),
        ...(s.originPackage ? { originPackage: s.originPackage } : {}),
      }));
    },

    async readSteps(range): Promise<StepSample[]> {
      await assertGranted("steps", "read");
      const samples = await impl.querySteps(range);
      return samples.map((s) => ({ count: s.count, timestamp: s.timestamp }));
    },

    write: {
      async writeWeight(sample: WeightWrite): Promise<void> {
        await assertGranted("weight", "write");
        await impl.writeWeightKg({
          valueKg: lbsToKg(sample.valueLbs),
          atISO: sample.atISO,
          ...(sample.clientId ? { clientId: sample.clientId } : {}),
        });
      },

      async writeWorkout(workout: WorkoutWrite): Promise<void> {
        await assertGranted("workouts", "write");
        await impl.writeWorkout(workout);
      },
    },
  };
}
