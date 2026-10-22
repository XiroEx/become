/**
 * NP-186 — APPLE HEALTH WORKOUTS: WRITE COMPLETED BECOME WORKOUTS.
 *
 * A completed Become workout appears in Apple Health, and counts toward the
 * Activity rings, when the member allows it. The whole path is exercised
 * here against a STUBBED HealthKit module — the callback-style
 * `react-native-health` surface, never the native side:
 *
 *   stubbed module → `createHealthKitImpl` → `createIosAdapter` →
 *   `exportWorkoutToHealth`
 *
 * (id: e015caca) Finishing a workout natively writes one workout to Apple
 * Health with the right start and end.
 * (id: e015cacb) Retrying a save does not write a second workout to Apple
 * Health.
 */
import { createHealthKitImpl, type HealthKitModule } from "@/lib/health/healthKit";
import { createIosAdapter } from "@/lib/health/ios";
import {
  exportWorkoutToHealth,
  workoutClientId,
} from "@/lib/health/sync";
import type { HealthSyncSession } from "@/lib/health/switches";
import type { WorkoutWrite } from "@/lib/health/types";
import { createMemoryWorkoutExportStore } from "@/lib/health/workoutIds";

const ALL_ON: HealthSyncSession = { optedIn: true, read: true, write: true };

const START = "2026-05-27T17:00:00Z";
const END = "2026-05-27T18:02:00Z";

interface StubbedHealthKit {
  module: HealthKitModule;
  workoutCalls: { type: string; startDate: string; endDate: string }[];
}

/** The stubbed HealthKit module: records every `saveWorkout`, answers a fresh UUID. */
function stubHealthKitModule(): StubbedHealthKit {
  const workoutCalls: StubbedHealthKit["workoutCalls"] = [];
  let n = 0;
  const module: HealthKitModule = {
    initHealthKit: (_permissions, cb) => cb("", {}),
    isAvailable: (cb) => cb(null, true),
    getAuthStatus: (_permissions, cb) =>
      cb("", { permissions: { read: [2], write: [2] } }),
    getWeightSamples: (_options, cb) => cb("", []),
    saveWeight: (_options, cb) => cb("", null),
    saveWorkout: (options, cb) => {
      workoutCalls.push({
        type: options.type,
        startDate: options.startDate,
        endDate: options.endDate,
      });
      n += 1;
      cb("", `hk-workout-uuid-${n}`);
    },
    getStepCount: (_options, cb) => cb("", { value: 0, startDate: "", endDate: "" }),
  };
  return { module, workoutCalls };
}

function workout(clientId: string): WorkoutWrite {
  return {
    title: "Push Day",
    startISO: START,
    endISO: END,
    clientId,
  };
}

describe("NP-186 end to end over a stubbed HealthKit module", () => {
  it("(id: e015caca) finishing a workout writes one workout with the right start and end", async () => {
    const stubbed = stubHealthKitModule();
    const adapter = createIosAdapter(createHealthKitImpl(stubbed.module), {
      workoutIds: createMemoryWorkoutExportStore(),
    });
    const result = await exportWorkoutToHealth(
      { client: adapter, session: ALL_ON },
      workout(workoutClientId("attempt-1")),
    );
    expect(result).toEqual({ written: true });
    expect(stubbed.workoutCalls).toEqual([
      {
        type: "TraditionalStrengthTraining",
        startDate: START,
        endDate: END,
      },
    ]);
  });

  it("(id: e015cacb) retrying the same save does not write a second workout", async () => {
    const stubbed = stubHealthKitModule();
    const workoutIds = createMemoryWorkoutExportStore();
    const adapter = createIosAdapter(createHealthKitImpl(stubbed.module), {
      workoutIds,
    });
    const deps = { client: adapter, session: ALL_ON };
    const body = workout(workoutClientId("attempt-1"));

    // First save: writes, and keeps the HealthKit id under the attempt id.
    expect(await exportWorkoutToHealth(deps, body)).toEqual({ written: true });
    expect(stubbed.workoutCalls).toHaveLength(1);
    expect(workoutIds.entries()).toEqual({
      [workoutClientId("attempt-1")]: "hk-workout-uuid-1",
    });

    // Retry of the same attempt (same clientId): resolves, writes nothing.
    expect(await exportWorkoutToHealth(deps, body)).toEqual({ written: true });
    expect(await exportWorkoutToHealth(deps, body)).toEqual({ written: true });
    expect(stubbed.workoutCalls).toHaveLength(1);
  });

  it("a different attempt is a different workout", async () => {
    const stubbed = stubHealthKitModule();
    const adapter = createIosAdapter(createHealthKitImpl(stubbed.module), {
      workoutIds: createMemoryWorkoutExportStore(),
    });
    const deps = { client: adapter, session: ALL_ON };
    expect(await exportWorkoutToHealth(deps, workout(workoutClientId("a")))).toEqual({
      written: true,
    });
    expect(await exportWorkoutToHealth(deps, workout(workoutClientId("b")))).toEqual({
      written: true,
    });
    expect(stubbed.workoutCalls).toHaveLength(2);
  });

  it("nothing is written when the write switch was off at launch", async () => {
    const stubbed = stubHealthKitModule();
    const adapter = createIosAdapter(createHealthKitImpl(stubbed.module), {
      workoutIds: createMemoryWorkoutExportStore(),
    });
    const result = await exportWorkoutToHealth(
      { client: adapter, session: { optedIn: true, read: true, write: false } },
      workout(workoutClientId("attempt-1")),
    );
    expect(result).toEqual({ written: false, reason: "switch-off" });
    expect(stubbed.workoutCalls).toHaveLength(0);
  });
});
