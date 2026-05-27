/**
 * iOS HealthKit adapter implementation.
 *
 * The actual native bridge (react-native-health) lives in a dev build because
 * HealthKit isn't shipped in Expo Go. P16 ships the adapter shape only — the
 * real native impl is injected at app boot in the dev build, and a fake impl
 * is injected in jest.
 *
 * HealthKit reports weight in kilograms; this adapter normalises to pounds so
 * the rest of the app speaks one unit (`weight_lbs` mirrors the webapp).
 */
import type { DateRange, HealthClient, StepSample, WeightSample } from "./types";
import { HealthPermissionError } from "./types";

export interface IosClientImpl {
  isPermissionGranted: () => Promise<boolean>;
  queryWeightKg: (range: DateRange) => Promise<
    { valueKg: number; timestamp: string }[]
  >;
  querySteps: (range: DateRange) => Promise<
    { count: number; timestamp: string }[]
  >;
}

export function kgToLbs(valueKg: number): number {
  return valueKg * 2.2046226218;
}

export function createIosAdapter(impl: IosClientImpl): HealthClient {
  return {
    platform: "ios",
    async readWeight(range): Promise<WeightSample[]> {
      if (!(await impl.isPermissionGranted())) {
        throw new HealthPermissionError("ios", "weight");
      }
      const samples = await impl.queryWeightKg(range);
      return samples.map((s) => ({
        valueLbs: kgToLbs(s.valueKg),
        timestamp: s.timestamp,
      }));
    },
    async readSteps(range): Promise<StepSample[]> {
      if (!(await impl.isPermissionGranted())) {
        throw new HealthPermissionError("ios", "steps");
      }
      const samples = await impl.querySteps(range);
      return samples.map((s) => ({ count: s.count, timestamp: s.timestamp }));
    },
  };
}
