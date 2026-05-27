/**
 * Android Health Connect adapter implementation.
 *
 * Like the iOS half, the real native bridge (`react-native-health-connect`)
 * needs a dev build. P16 ships the shape only — the real impl is injected at
 * boot. Health Connect reports weight in kilograms too.
 */
import type { DateRange, HealthClient, StepSample, WeightSample } from "./types";
import { HealthPermissionError } from "./types";
import { kgToLbs } from "./ios";

export interface AndroidClientImpl {
  isPermissionGranted: () => Promise<boolean>;
  queryWeightKg: (range: DateRange) => Promise<
    { valueKg: number; timestamp: string }[]
  >;
  querySteps: (range: DateRange) => Promise<
    { count: number; timestamp: string }[]
  >;
}

export function createAndroidAdapter(impl: AndroidClientImpl): HealthClient {
  return {
    platform: "android",
    async readWeight(range): Promise<WeightSample[]> {
      if (!(await impl.isPermissionGranted())) {
        throw new HealthPermissionError("android", "weight");
      }
      const samples = await impl.queryWeightKg(range);
      return samples.map((s) => ({
        valueLbs: kgToLbs(s.valueKg),
        timestamp: s.timestamp,
      }));
    },
    async readSteps(range): Promise<StepSample[]> {
      if (!(await impl.isPermissionGranted())) {
        throw new HealthPermissionError("android", "steps");
      }
      const samples = await impl.querySteps(range);
      return samples.map((s) => ({ count: s.count, timestamp: s.timestamp }));
    },
  };
}
