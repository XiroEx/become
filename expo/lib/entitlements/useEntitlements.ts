/**
 * THE hook over the plan snapshot — the native `webapp/hooks/useEntitlements`.
 *
 * Every gated surface calls this and reads three things off it:
 *
 *   • `enforced` — false means render NOTHING tier-aware. No lock, no counter,
 *     no plan card. That single check is what lets the paywall ship dark, and it
 *     is also what an unknown snapshot reads as, so a network blip never locks
 *     anybody (the server is the gate; a lock is only an explanation).
 *   • `canCreate(feature)` — may they create another one RIGHT NOW. Never
 *     recomputed from `limit` and `used`: the kill-switch and the admin bypass
 *     live inside the server's calculation, and `allowed` is true for a capped
 *     free member on purpose so they can still edit and DELETE what they own.
 *   • `refresh()` — call it after a 403, after a create, and after a DELETE. A
 *     delete frees an inventory slot immediately, and without this the lock
 *     survives it for up to the TTL.
 *
 * The store underneath is shared, so three gated components on one screen make
 * one request. The hook itself holds no cache.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type {
  EntitlementsSnapshot,
  Feature,
  FeatureEntitlement,
} from "@become/core";
import {
  getEntitlementsSnapshot,
  getEntitlementsToken,
  loadEntitlements,
  seedEntitlementsFromCache,
  subscribeToEntitlements,
} from "@/lib/entitlements/store";

export interface UseEntitlements {
  /** The shared snapshot, or null while nothing is known. */
  data: EntitlementsSnapshot | null;
  /** True until the first read for this session has settled. */
  loading: boolean;
  /** Is the kill-switch on? FALSE (and unknown) means render nothing tier-aware. */
  enforced: boolean;
  /**
   * Refetch now, with its own request. Call after a 403, a create or a DELETE.
   * Never joins a request that was already on the wire — that one was dispatched
   * before the change and would re-certify the pre-change counts.
   */
  refresh: () => Promise<void>;
  /** One feature's state, or null when the snapshot does not carry it. */
  feature: (feature: Feature) => FeatureEntitlement | null;
  /**
   * May they create another one? The server's `canCreate`, never a recomputation
   * of it. True while the switch is off and true while the snapshot is unknown,
   * because a UI lock is explanatory and the route refuses either way.
   */
  canCreate: (feature: Feature) => boolean;
}

export function useEntitlements(): UseEntitlements {
  // The session, reactively: a sign-in or sign-out re-runs the effect below,
  // which is what makes the next member's plan a fresh read rather than the
  // previous member's snapshot.
  const token = useSyncExternalStore(
    subscribeToEntitlements,
    getEntitlementsToken,
    getEntitlementsToken,
  );
  const [data, setData] = useState<EntitlementsSnapshot | null>(
    getEntitlementsSnapshot,
  );
  const [loading, setLoading] = useState<boolean>(
    getEntitlementsSnapshot() === null,
  );

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeToEntitlements(() => {
      if (!cancelled) setData(getEntitlementsSnapshot());
    });

    // The persisted seed, so a cold open paints what it last saw instead of
    // flashing a lock. Read from storage (asynchronous) and published through
    // the same listener as everything else.
    void seedEntitlementsFromCache().then(() => {
      if (!cancelled) setData(getEntitlementsSnapshot());
    });

    void loadEntitlements(false).then(() => {
      if (cancelled) return;
      setData(getEntitlementsSnapshot());
      setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [token]);

  const refresh = useCallback(async (): Promise<void> => {
    await loadEntitlements(true);
    setData(getEntitlementsSnapshot());
  }, []);

  const feature = useCallback(
    (f: Feature): FeatureEntitlement | null => data?.features?.[f] ?? null,
    [data],
  );

  const canCreate = useCallback(
    (f: Feature): boolean => {
      if (!data || data.enforced === false) return true;
      return data.features?.[f]?.canCreate !== false;
    },
    [data],
  );

  return {
    data,
    loading,
    enforced: data?.enforced === true,
    refresh,
    feature,
    canCreate,
  };
}

export default useEntitlements;
