/**
 * iOS HealthKit adapter implementation (NP-185 — weight, both directions).
 *
 * The real native bridge (`react-native-health`, see `lib/health/healthKit.ts`)
 * lives behind an injected impl so jest can drive this file with a fake and no
 * native module (HealthKit isn't shipped in Expo Go — it needs a dev build).
 *
 * HealthKit reports weight in kilograms (via `lib/health/healthKit.ts`, which
 * asks the native module for grams and divides by 1000 — the JS bridge has no
 * "kilogram" unit, only "gram"); this adapter normalises kilograms to pounds so
 * the rest of the app speaks one unit (`weight_lbs` mirrors the webapp). The
 * kg↔lbs conversion itself lives in `lib/health/units.ts`, shared with the
 * Android adapter, so a read and a write cannot disagree about the factor.
 *
 * WHY readWeight ASKS FOR NO PERMISSION CHECK HERE, UNLIKE ANDROID'S.
 * HealthKit deliberately hides READ authorisation from the requesting app —
 * Apple's own docs say `authorizationStatusForType` "doesn't reflect whether
 * the user has granted permission to read data," only whether a request was
 * ever made. So there is no reliable "is weight:read granted" to assert here;
 * `grantedPermissions` below only ever answers for WRITE (see
 * `lib/health/healthKit.ts`). A member who declined reads gets an empty
 * sample list back from the native query, not a thrown error — and
 * `importWeightFromHealth` (`lib/health/sync.ts`) already treats "nothing to
 * import" as success, not failure. The centralised permission ask still runs
 * once at launch (`ensureHealthPermissionsForSession`); this file just has
 * nothing trustworthy to gate a read ON.
 *
 * WRITE is the opposite: `authorizationStatusForType` IS accurate for write
 * types, so `write.writeWeight` below asserts the real grant first, exactly
 * like Android's `assertGranted` — the regression that fix prevents (a write
 * riding in on a read grant) is a platform fact here too, not only Android's.
 */
import type {
  DateRange,
  HealthClient,
  HealthPermission,
  StepSample,
  WeightSample,
  WeightWrite,
} from "./types";
import { HealthPermissionError, hasPermission } from "./types";
import { kgToLbs, lbsToKg } from "./units";

/** One HealthKit weight sample, in the units `healthKit.ts` hands up. */
export interface IosWeightRecord {
  valueKg: number;
  timestamp: string;
  /** The sample's own UUID — the server's de-duplication key. */
  externalId?: string;
  /**
   * HealthKit samples carry no recorded-zone metadata through this library
   * (unlike Health Connect's `zoneOffset`), so this is always absent for iOS;
   * `buildWeightImport` falls back to the device's current offset, the same
   * fallback a Health Connect record with no zone of its own already gets.
   */
  tzOffsetMinutes?: number;
}

export interface IosClientImpl {
  /** Is HealthKit available on this device at all (no on an iPad)? */
  isAvailable: () => Promise<boolean>;
  /**
   * Shows HealthKit's authorisation sheet for `wanted` (a no-op the moment a
   * permission set has already been asked for, which is how this library
   * expects to be driven — it keeps no "already asked" state of its own) and
   * answers what can actually be confirmed: every READ permission asked for
   * (HealthKit never reports a real refusal — see the file doc above) plus
   * whichever WRITE permissions `getAuthStatus` confirms.
   */
  requestPermissions: (
    wanted: readonly HealthPermission[],
  ) => Promise<HealthPermission[]>;
  /** What is known to be granted right now, no sheet — WRITE only, see above. */
  grantedPermissions: () => Promise<HealthPermission[]>;
  /**
   * Best-effort: Apple exposes no deep link straight to this app's entry
   * under Health ▸ Sharing, so this opens the Health app itself (NP-337 asks
   * for "send the member somewhere to fix it," not the exact screen).
   */
  openSettings?: () => void;
  queryWeightKg: (range: DateRange) => Promise<IosWeightRecord[]>;
  querySteps: (
    range: DateRange,
  ) => Promise<{ count: number; timestamp: string }[]>;
  /**
   * HealthKit has no equivalent of Health Connect's `clientRecordId` upsert —
   * every call inserts a NEW sample, so `clientId` travels for parity with
   * `WeightWrite` but is not acted on here. A retried write can therefore
   * leave two samples in Apple Health for the same weigh-in; that is a
   * platform limitation of this library, not a bug in this adapter.
   */
  writeWeightKg: (input: {
    valueKg: number;
    atISO: string;
    clientId?: string;
  }) => Promise<void>;
}

export function createIosAdapter(impl: IosClientImpl): HealthClient {
  async function assertWriteGranted(metric: "weight"): Promise<void> {
    const granted = await impl.grantedPermissions();
    if (!hasPermission(granted, { metric, direction: "write" })) {
      throw new HealthPermissionError("ios", metric, "write");
    }
  }

  return {
    platform: "ios",
    isAvailable: () => impl.isAvailable(),
    ensurePermissions: (wanted) => impl.requestPermissions(wanted),
    ...(impl.openSettings ? { openSettings: () => impl.openSettings?.() } : {}),

    async readWeight(range): Promise<WeightSample[]> {
      const samples = await impl.queryWeightKg(range);
      return samples.map((s) => ({
        valueLbs: kgToLbs(s.valueKg),
        timestamp: s.timestamp,
        ...(s.externalId ? { externalId: s.externalId } : {}),
        ...(s.tzOffsetMinutes != null
          ? { tzOffsetMinutes: s.tzOffsetMinutes }
          : {}),
      }));
    },

    async readSteps(range): Promise<StepSample[]> {
      // No internal gate, same reasoning as readWeight — and unreachable in
      // practice anyway: nothing in `permissionsForSession` ever asks for
      // `steps:read`, same as Android (`lib/health/healthConnect.ts`).
      const samples = await impl.querySteps(range);
      return samples.map((s) => ({ count: s.count, timestamp: s.timestamp }));
    },

    write: {
      async writeWeight(sample: WeightWrite): Promise<void> {
        await assertWriteGranted("weight");
        await impl.writeWeightKg({
          valueKg: lbsToKg(sample.valueLbs),
          atISO: sample.atISO,
          ...(sample.clientId ? { clientId: sample.clientId } : {}),
        });
      },
      // writeWorkout arrives with NP-186 — `HealthWriteClient.writeWorkout`
      // is optional for exactly this reason (`lib/health/types.ts`).
    },
  };
}
