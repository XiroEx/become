import {
  asyncStorageKeyValueStore,
  type KeyValueStore,
} from "@/lib/live/liveWorkoutCache";

/**
 * THE HEALTHKIT WORKOUT DEDUP STORE (NP-186).
 *
 * HealthKit's `saveWorkout` takes no client marker — the native side passes
 * `metadata: nil`, so unlike Health Connect's `clientRecordId` there is
 * nothing the platform can match a retry against. The only thing that can say
 * "this attempt already has its HealthKit workout" is Become itself: after a
 * write, the returned HealthKit UUID is kept here under the attempt's
 * `clientId` (`become-workout-<attemptId>`, `lib/health/sync.ts`), and a
 * retry for an id that already has one is a no-op instead of a second
 * workout.
 *
 * One entry per finished attempt, written once and read on retries only — it
 * never grows without bound in any way that matters (a member finishes a
 * handful of workouts a week). Storage failures are silent: a missed read
 * risks a duplicate the way no store at all would, and a missed write is
 * retried by the next save of the same attempt.
 */
export interface WorkoutExportStore {
  /** The HealthKit UUID already written for `clientId`, or null. */
  getHealthKitId: (clientId: string) => Promise<string | null>;
  /** Remember the HealthKit UUID written for `clientId`. */
  setHealthKitId: (clientId: string, healthKitId: string) => Promise<void>;
}

/** Storage key for one attempt's HealthKit workout id. */
export function workoutExportKey(clientId: string): string {
  return `become.health.workout-hkid.${clientId}`;
}

export function createWorkoutExportStore(
  store: KeyValueStore = asyncStorageKeyValueStore,
): WorkoutExportStore {
  return {
    async getHealthKitId(clientId): Promise<string | null> {
      try {
        return await store.get(workoutExportKey(clientId));
      } catch {
        return null;
      }
    },
    async setHealthKitId(clientId, healthKitId): Promise<void> {
      try {
        await store.set(workoutExportKey(clientId), healthKitId);
      } catch {
        // Non-blocking: the next save of the same attempt retries the write.
      }
    },
  };
}

/** Convenience for tests: an in-memory store, no AsyncStorage required. */
export function createMemoryWorkoutExportStore(
  initial: Record<string, string> = {},
): WorkoutExportStore & { entries: () => Record<string, string> } {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    async getHealthKitId(clientId): Promise<string | null> {
      return map.has(clientId) ? map.get(clientId)! : null;
    },
    async setHealthKitId(clientId, healthKitId): Promise<void> {
      map.set(clientId, healthKitId);
    },
    entries: () => Object.fromEntries(map),
  };
}
