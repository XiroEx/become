/**
 * WHERE YOU ARE IN A WORKOUT, ON THIS PHONE (NP-087).
 *
 * Web equivalent: the `localStorage` half of `webapp/lib/workout/position.ts`.
 *
 * The pure half — the key, the scopes, the 12-hour age rule, the parse and
 * `resolveStartStep` — is the shared copy in `@become/core`
 * (`training/workout/position.ts`), and it says in its own header that the
 * web's read/write/clear wrappers could not travel because React Native has no
 * `localStorage`. This file is the native wrapper for them, over the same
 * `KeyValueStore` contract the live-workout draft cache already uses, so a
 * test can hand it an in-memory map instead of AsyncStorage.
 *
 * It writes exactly what the web writes, under exactly the key the web writes
 * it under, so the two apps describe a position the same way even though the
 * storage behind them is per-device.
 *
 * Every function is total and fail-soft: a missing, stale, corrupt or
 * unwritable entry just means "no opinion", and the caller falls back to the
 * first incomplete set — which is what the screen did before a position was
 * remembered at all.
 */

import {
  isWritablePosition,
  parsePosition,
  positionKey,
  type WorkoutPosition,
} from "@become/core";
import {
  asyncStorageKeyValueStore,
  type KeyValueStore,
} from "@/lib/live/liveWorkoutCache";

export type { WorkoutPosition };

/** Read the remembered position for a scope, or null when there isn't one. */
export async function readWorkoutPosition(
  scope: string,
  store: KeyValueStore = asyncStorageKeyValueStore,
  now: number = Date.now(),
): Promise<WorkoutPosition | null> {
  if (!scope) return null;
  try {
    const raw = await store.get(positionKey(scope));
    if (!raw) return null;
    return parsePosition(JSON.parse(raw) as unknown, now);
  } catch {
    return null;
  }
}

/** Remember the exercise and set the member is standing on. */
export async function writeWorkoutPosition(
  scope: string,
  exerciseIndex: number,
  setIndex: number,
  store: KeyValueStore = asyncStorageKeyValueStore,
  now: number = Date.now(),
): Promise<void> {
  if (!isWritablePosition(scope, exerciseIndex, setIndex)) return;
  try {
    const value: WorkoutPosition = { exerciseIndex, setIndex, at: now };
    await store.set(positionKey(scope), JSON.stringify(value));
  } catch {
    // Storage full or unavailable — the fallback is the first incomplete set.
  }
}

/** Forget the position (the workout is over, or was restarted). */
export async function clearWorkoutPosition(
  scope: string,
  store: KeyValueStore = asyncStorageKeyValueStore,
): Promise<void> {
  if (!scope) return;
  try {
    await store.remove(positionKey(scope));
  } catch {
    // Non-blocking.
  }
}
