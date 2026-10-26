/**
 * iOS HealthKit adapter implementation (NP-185 weight, NP-186 workouts).
 *
 * The native bridge (`react-native-health`, wrapped as `IosClientImpl` in
 * `lib/health/healthKit.ts`) is INJECTED, exactly like the Android half
 * (`lib/health/android.ts` + `lib/health/healthConnect.ts`): jest drives this
 * file with a fake `IosClientImpl` and never touches HealthKit, and the real
 * app wires the real module once, in `lib/health/client.ts`.
 *
 * HealthKit reports weight in kilograms; this adapter normalises to pounds so
 * the rest of the app speaks one unit (`valueLbs`). The conversion lives in
 * `lib/health/units.ts`, shared with Android, so a read and a write cannot
 * disagree about the factor.
 *
 * THE READ-PERMISSION BLIND SPOT. HealthKit will not tell an app whether a
 * SHARE (read) authorization was denied — `getRequestStatusForAuthorization`
 * and `authorizationStatusForType` only answer reliably for a WRITE
 * (update) permission; for a read, the OS deliberately hides "denied" behind
 * the same answer as "no data recorded", so an app cannot infer what a
 * person refused. That is Apple's own privacy design, not a gap in this
 * module: a request that resolves without error is treated as GRANTED here
 * (the same blind spot HealthKit itself has — it will not say otherwise), and
 * a decline shows up downstream as an empty read, never as a thrown
 * `HealthPermissionError` the way Android's read-permission denial does.
 *
 * THE WRITE HALF IS ASSERTED. Unlike read, HealthKit DOES answer a write
 * authorization status truthfully (`authorizationStatusForType` for an
 * update type), so `write.writeWeight` and `write.writeWorkout` each check
 * their OWN permission before writing and throw `HealthPermissionError` when
 * it is not `SharingAuthorized` — the same contract Android's writers have.
 * The workout permission (`Workout`) is separate from the weight one, and
 * the member's write switch gates both together (one switch per direction,
 * `lib/health/switches.ts`).
 *
 * RETRIES WRITE ONCE. HealthKit's `saveWorkout` takes no client marker (the
 * native side passes `metadata: nil`), so unlike Health Connect's
 * `clientRecordId` the platform cannot match a retry. The adapter keeps the
 * returned HealthKit UUID under the attempt's `clientId`
 * (`lib/health/workoutIds.ts`): a retry for an id that already has one
 * resolves without writing again.
 */
import type { DateRange, HealthClient, HealthPermission, StepSample, WeightSample, WeightWrite, WorkoutSample, WorkoutWrite } from "./types";
import { HealthPermissionError } from "./types";
import { kgToLbs, lbsToKg } from "./units";
import {
  createWorkoutExportStore,
  type WorkoutExportStore,
} from "./workoutIds";

/** One HealthKit weight sample, in the units HealthKit uses. */
export interface IosWeightSample {
  valueKg: number;
  timestamp: string;
  /** The sample's own HealthKit UUID — the server's de-duplication key. */
  externalId?: string;
}

export interface IosClientImpl {
  /** HealthKit present on this device at all (false on iPad in some OS
   * versions, and always false on a simulator with no Health app data). */
  isAvailable: () => Promise<boolean>;
  /**
   * Shows HealthKit's one-time authorization sheet for exactly `wanted`
   * (share types for a `read`, update types for a `write`). Resolves once the
   * person has answered — HealthKit does not report WHAT they answered for a
   * read (see the file comment); resolving without error is the only signal
   * this call gives for that direction.
   */
  requestAuthorization: (wanted: readonly HealthPermission[]) => Promise<void>;
  /**
   * Whether an UPDATE (write) authorization for `metric` is actually
   * granted — the one direction HealthKit will answer truthfully. Weight
   * and workouts are separate HealthKit permissions, checked separately.
   */
  isWriteAuthorized: (metric: "weight" | "workouts") => Promise<boolean>;
  queryWeightKg: (range: DateRange) => Promise<IosWeightSample[]>;
  querySteps: (range: DateRange) => Promise<{ count: number; timestamp: string }[]>;
  /**
   * Workouts another app recorded (card 6adf69c7), Become's own already
   * dropped. HealthKit hides a declined READ behind an empty answer, the same
   * blind spot weight has — a member who said no simply imports nothing.
   */
  queryWorkouts?: (range: DateRange) => Promise<WorkoutSample[]>;
  writeWeightKg: (input: {
    valueKg: number;
    atISO: string;
    /** Become's own id for the sample, so a retry replaces rather than
     * duplicates — `HKMetadataKeyExternalUUID` on the written sample. */
    clientId?: string;
  }) => Promise<void>;
  /**
   * Write one finished workout. Answers the saved workout's own HealthKit
   * UUID string — the adapter keeps it under `clientId`
   * (`lib/health/workoutIds.ts`) so a retry writes once.
   */
  writeWorkout: (input: {
    startISO: string;
    endISO: string;
    /** Total active energy, kilocalories, when known. */
    energyKcal?: number;
    /** Become's own id for the attempt, so a retry resolves without a
     * second workout. */
    clientId?: string;
  }) => Promise<string>;
  /** Apple Health's own Settings path for this app (NP-337's Android
   * `openSettings` has no HealthKit equivalent — there is no deep link into
   * the per-app Health permission screen — so this is left undefined and the
   * denied-notice UI simply shows no "Open" action on iOS. */
  openSettings?: () => void;
}

export interface CreateIosAdapterDeps {
  /**
   * Where finished attempts' HealthKit workout ids are kept. Defaults to
   * the AsyncStorage-backed store — a parameter so tests hand it an
   * in-memory map instead.
   */
  workoutIds?: WorkoutExportStore;
}

export function createIosAdapter(
  impl: IosClientImpl,
  deps: CreateIosAdapterDeps = {},
): HealthClient {
  const workoutIds = deps.workoutIds ?? createWorkoutExportStore();
  return {
    platform: "ios",
    isAvailable: () => impl.isAvailable(),

    /**
     * Asks HealthKit for `wanted` and answers what this adapter can claim is
     * granted. A WRITE entry is only reported granted when
     * `isWriteAuthorized` actually confirms it — weight and workouts each
     * against their OWN HealthKit permission. A READ entry is reported
     * granted once asked — the blind spot documented above — so the caller
     * (`lib/health/sync.ts`) proceeds to read, and a decline shows up as an
     * empty answer rather than a permission error.
     */
    async ensurePermissions(
      wanted: readonly HealthPermission[],
    ): Promise<HealthPermission[]> {
      await impl.requestAuthorization(wanted);
      const granted: HealthPermission[] = [];
      for (const p of wanted) {
        if (p.direction === "write") {
          if (
            (p.metric === "weight" &&
              (await impl.isWriteAuthorized("weight"))) ||
            (p.metric === "workouts" &&
              (await impl.isWriteAuthorized("workouts")))
          ) {
            granted.push(p);
          }
          continue;
        }
        granted.push(p);
      }
      return granted;
    },

    ...(impl.openSettings ? { openSettings: () => impl.openSettings?.() } : {}),

    async readWeight(range: DateRange): Promise<WeightSample[]> {
      const samples = await impl.queryWeightKg(range);
      return samples.map((s) => ({
        valueLbs: kgToLbs(s.valueKg),
        timestamp: s.timestamp,
        ...(s.externalId ? { externalId: s.externalId } : {}),
      }));
    },

    async readSteps(range: DateRange): Promise<StepSample[]> {
      const samples = await impl.querySteps(range);
      return samples.map((s) => ({ count: s.count, timestamp: s.timestamp }));
    },

    ...(impl.queryWorkouts
      ? {
          readWorkouts: async (range: DateRange): Promise<WorkoutSample[]> =>
            (await impl.queryWorkouts?.(range)) ?? [],
        }
      : {}),

    write: {
      async writeWeight(sample: WeightWrite): Promise<void> {
        if (!(await impl.isWriteAuthorized("weight"))) {
          throw new HealthPermissionError("ios", "weight", "write");
        }
        await impl.writeWeightKg({
          valueKg: lbsToKg(sample.valueLbs),
          atISO: sample.atISO,
          ...(sample.clientId ? { clientId: sample.clientId } : {}),
        });
      },
      async writeWorkout(workout: WorkoutWrite): Promise<void> {
        if (!(await impl.isWriteAuthorized("workouts"))) {
          throw new HealthPermissionError("ios", "workouts", "write");
        }
        // HealthKit cannot match a retry the way Health Connect's
        // `clientRecordId` does, so the adapter does: an attempt that
        // already has its HealthKit workout resolves without writing again.
        if (workout.clientId) {
          const existing = await workoutIds.getHealthKitId(workout.clientId);
          if (existing) return;
        }
        const healthKitId = await impl.writeWorkout({
          startISO: workout.startISO,
          endISO: workout.endISO,
          ...(workout.energyKcal != null
            ? { energyKcal: workout.energyKcal }
            : {}),
          ...(workout.clientId ? { clientId: workout.clientId } : {}),
        });
        if (workout.clientId && healthKitId) {
          await workoutIds.setHealthKitId(workout.clientId, healthKitId);
        }
      },
    },
  };
}
