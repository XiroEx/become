/**
 * DEVICE DIAGNOSTICS — WHY SOMETHING SILENT FAILED ON A REAL PHONE.
 *
 * Checkout, Live Activities and the locked-phone rest alert all fail SILENTLY
 * by design (best-effort: the workout and the sheet must never break over
 * them), and the reasons only existed in memory (`handle.lastFailure`) or in
 * a console the owner of a TestFlight build cannot read. This module persists
 * the last reason for each of the three, so the Diagnostics block in Settings
 * can show it on the device.
 *
 * Storage is AsyncStorage, not SecureStore: these are small prefs, not
 * secrets — the same reason `lib/becoming/storage.ts` and the tour progress
 * use AsyncStorage. Every function takes an optional `storage` (DI for tests);
 * without one it lazy-requires AsyncStorage and no-ops when absent (Jest,
 * Expo Go), so importing this module from best-effort paths can never throw.
 */
import type { AsyncStorageLike } from "@/lib/query/persistor";

function defaultStorage(): AsyncStorageLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-async-storage/async-storage") as {
      default?: AsyncStorageLike;
    } & AsyncStorageLike;
    return mod.default ?? mod ?? null;
  } catch {
    return null;
  }
}

function storageOf(storage?: AsyncStorageLike | null): AsyncStorageLike | null {
  if (storage !== undefined) return storage;
  return defaultStorage();
}

/** Cap a recorded reason so one chatty Error cannot grow the row. */
export function truncateReason(reason: string, max = 160): string {
  if (reason.length <= max) return reason;
  return reason.slice(0, max);
}

function recordKey(key: string): string {
  return key;
}

export const DIAG_LIVE_ACTIVITY_KEY = "become.diag.liveActivity";
export const DIAG_REST_ALERT_KEY = "become.diag.restAlert";
export const DIAG_CHECKOUT_KEY = "become.diag.checkout";

/** `{ reason, at }` as stored — `at` is `Date.now()` when it was recorded. */
export interface FailureRecord {
  reason: string | null;
  at: number | null;
}

export interface RestAlertRecord {
  ok: boolean | null;
  reason: string | null;
  at: number | null;
}

async function writeJson(
  key: string,
  value: unknown,
  storage?: AsyncStorageLike | null,
): Promise<void> {
  try {
    const store = storageOf(storage);
    if (!store) return;
    await store.setItem(recordKey(key), JSON.stringify(value));
  } catch {
    /* diagnostics may never break the path that records them */
  }
}

async function readJson<T>(
  key: string,
  storage?: AsyncStorageLike | null,
): Promise<T | null> {
  try {
    const store = storageOf(storage);
    if (!store) return null;
    const raw = await store.getItem(recordKey(key));
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function clearKey(
  key: string,
  storage?: AsyncStorageLike | null,
): Promise<void> {
  try {
    const store = storageOf(storage);
    if (!store) return;
    await store.removeItem(recordKey(key));
  } catch {
    /* best-effort */
  }
}

/**
 * The last Live Activity start/update/end failure (`null` clears it — a clean
 * start means there is nothing to explain). Called from
 * `lib/live/liveActivity/workoutLiveActivity.ts#reportFailure`.
 */
export async function recordLiveActivityFailure(
  reason: string | null,
  atMs: number = Date.now(),
  storage?: AsyncStorageLike | null,
): Promise<void> {
  if (reason === null) {
    await clearKey(DIAG_LIVE_ACTIVITY_KEY, storage);
    return;
  }
  await writeJson(
    DIAG_LIVE_ACTIVITY_KEY,
    { reason: truncateReason(reason), at: atMs } satisfies FailureRecord,
    storage,
  );
}

export function readLiveActivityFailure(
  storage?: AsyncStorageLike | null,
): Promise<FailureRecord | null> {
  return readJson<FailureRecord>(DIAG_LIVE_ACTIVITY_KEY, storage);
}

/**
 * The last locked-phone rest-alert scheduling outcome. `ok: true` means the
 * OS accepted the notification; `ok: false` carries the reason
 * (`no-permission`, or the schedule throw's message). Called from
 * `lib/live/restAlert.ts#scheduleRestAlert`.
 */
export async function recordRestAlertResult(
  ok: boolean,
  reason: string | null,
  atMs: number = Date.now(),
  storage?: AsyncStorageLike | null,
): Promise<void> {
  await writeJson(
    DIAG_REST_ALERT_KEY,
    {
      ok,
      reason: reason === null ? null : truncateReason(reason),
      at: atMs,
    } satisfies RestAlertRecord,
    storage,
  );
}

export function readRestAlertResult(
  storage?: AsyncStorageLike | null,
): Promise<RestAlertRecord | null> {
  return readJson<RestAlertRecord>(DIAG_REST_ALERT_KEY, storage);
}

/**
 * The last checkout failure's machine reason (`network`, `schema`,
 * `http-<status>-<code>`, `open-failed: <message>`). Recorded from
 * `lib/entitlements/billing.ts` — both `startCheckout` and the browser
 * handover — so the sheet's `Reason:` line and this row are one value.
 */
export async function recordCheckoutFailure(
  reason: string,
  atMs: number = Date.now(),
  storage?: AsyncStorageLike | null,
): Promise<void> {
  await writeJson(
    DIAG_CHECKOUT_KEY,
    { reason: truncateReason(reason), at: atMs } satisfies FailureRecord,
    storage,
  );
}

export function readCheckoutFailure(
  storage?: AsyncStorageLike | null,
): Promise<FailureRecord | null> {
  return readJson<FailureRecord>(DIAG_CHECKOUT_KEY, storage);
}
