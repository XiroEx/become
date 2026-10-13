/**
 * ─── NATIVE TOUR PROGRESS (NP-207) ────────────────────────────────────────
 *
 * Persists the native coach-mark tour's outcome under its own isolated key —
 * `NATIVE_TOUR_PROGRESS_KEY` ("native-onboarding") from `tourConfig.ts` — and
 * NEVER the web's `WEB_TOUR_PROGRESS_KEY` ("become-onboarding"). Every write
 * runs the stored key through `assertValidNativeTourProgressKey` so a future
 * edit that tries to repoint this module at the web key fails loudly at the
 * call site instead of silently crossing the wire into `/api/tutorial-progress`
 * (which this module never calls — there is no fetch here at all, unlike the
 * web's `createFetchAdapter`).
 *
 * Shape is deliberately small: just the settled status and when it was set.
 * The tour has no per-step resume behaviour to persist — once a member has
 * answered the upfront prompt, dismissed mid-step or finished the last hub,
 * the only thing worth remembering is "don't ask again" (NP-207's "settled"
 * rule). Resuming a half-seen tour on next launch would be a second kind of
 * annoying the card never asked for.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import {
  NATIVE_TOUR_PROGRESS_KEY,
  assertValidNativeTourProgressKey,
} from "@/lib/tour/tourConfig";

/** Every state the tour can settle into, plus "unset" (never run). */
export type NativeTourStatus =
  | "unset"
  | "completed"
  | "declined"
  | "dismissed";

export interface NativeTourProgress {
  status: NativeTourStatus;
  /** ms epoch of the last write — support/debugging only, never read for logic. */
  updatedAt: number;
}

const UNSET_PROGRESS: NativeTourProgress = { status: "unset", updatedAt: 0 };

function isKnownStatus(value: unknown): value is NativeTourStatus {
  return (
    value === "unset" ||
    value === "completed" ||
    value === "declined" ||
    value === "dismissed"
  );
}

/**
 * Reads the stored progress. A missing entry, a corrupt JSON blob, or a
 * storage failure all read as "unset" — the safe default that lets the
 * upfront prompt show rather than silently skip a member who should see it.
 */
export async function getNativeTourProgress(
  storage: AsyncStorageLike = AsyncStorage,
): Promise<NativeTourProgress> {
  try {
    const raw = await storage.getItem(NATIVE_TOUR_PROGRESS_KEY);
    if (!raw) return UNSET_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<NativeTourProgress> | null;
    if (!parsed || !isKnownStatus(parsed.status)) return UNSET_PROGRESS;
    return {
      status: parsed.status,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return UNSET_PROGRESS;
  }
}

/** Declined upfront, dismissed mid-step, or completed — all equally "settled". */
export function hasSettledNativeTour(progress: NativeTourProgress): boolean {
  return (
    progress.status === "completed" ||
    progress.status === "declined" ||
    progress.status === "dismissed"
  );
}

/**
 * Writes the tour's outcome. Guarded by `assertValidNativeTourProgressKey`
 * against the one mistake this module exists to make impossible: writing to
 * the web's progress key. A storage failure here is swallowed — worst case
 * the tour re-prompts next launch, which is annoying but never breaks a
 * screen the way an unhandled rejection would.
 */
export async function setNativeTourStatus(
  status: Exclude<NativeTourStatus, "unset">,
  storage: AsyncStorageLike = AsyncStorage,
): Promise<void> {
  assertValidNativeTourProgressKey(NATIVE_TOUR_PROGRESS_KEY);
  const progress: NativeTourProgress = { status, updatedAt: Date.now() };
  try {
    await storage.setItem(NATIVE_TOUR_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    /* best-effort — see module doc */
  }
}

/**
 * Clears the stored outcome so the tour prompts again. The ONLY caller is the
 * Settings/Help "ask again" action (NP-207's one re-prompt path) —
 * `components/tour/NativeTourOverlay.tsx` never calls this on its own.
 */
export async function resetNativeTourProgress(
  storage: AsyncStorageLike = AsyncStorage,
): Promise<void> {
  try {
    await storage.removeItem(NATIVE_TOUR_PROGRESS_KEY);
  } catch {
    /* best-effort */
  }
}
