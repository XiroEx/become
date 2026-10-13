/**
 * iOS HealthKit adapter implementation.
 *
 * The actual native bridge (react-native-health) lives in a dev build because
 * HealthKit isn't shipped in Expo Go. P16 ships the adapter shape only — the
 * real native impl is injected at app boot in the dev build, and a fake impl
 * is injected in jest.
 *
 * HealthKit reports weight in kilograms; this adapter normalises to pounds so
 * the rest of the app speaks one unit (`weight_lbs` mirrors the webapp). The
 * conversion itself lives in `lib/health/units.ts`, shared with the Android
 * adapter, so a read and a write cannot disagree about the factor.
 *
 * WRITING is not here yet: NP-185 / NP-186 add the `write` half of
 * `HealthClient` for iOS, which is the shape Android already implements in
 * `lib/health/android.ts`. Everything above the adapter — the switches, the
 * launch snapshot, the sync and the server route — is platform-neutral and
 * waiting for it.
 */
import type { DateRange, HealthClient, StepSample, WeightSample } from "./types";
import { HealthPermissionError } from "./types";
import { kgToLbs } from "./units";

export interface IosClientImpl {
  isPermissionGranted: () => Promise<boolean>;
  queryWeightKg: (range: DateRange) => Promise<
    { valueKg: number; timestamp: string }[]
  >;
  querySteps: (range: DateRange) => Promise<
    { count: number; timestamp: string }[]
  >;
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
