import { useEffect, useMemo, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
import { useAuth } from "@/lib/auth/useAuth";
import {
  netInfoConnectivity,
  type ConnectivitySource,
} from "@/lib/offline/connectivity";
import { getOfflineWrites, type OfflineWrites } from "@/lib/offline/writes";
import {
  getWorkoutSaveQueue,
  type WorkoutSaveQueue,
} from "@/lib/offline/workoutSaves";

/**
 * THE ONE MOUNT POINT for everything offline. It lives at the root
 * (`app/_layout.tsx`), above every route, and does three things:
 *
 *   1. shows the banner the moment NetInfo says the connection is gone, and
 *      hides it the moment it is back. NetInfo pushes its events, nothing here
 *      polls or debounces, so "within a second" is the delivery time of one
 *      callback;
 *   2. starts the write queue — re-hydrating the snapshot a previous launch
 *      left on disk, and replaying it on reconnect;
 *   3. CLEARS the queue when the session ends. A pending weigh-in belongs to
 *      the member who typed it; the next person to sign in on this device must
 *      not have it delivered under their token. Every sign-out arrives here as
 *      `status === "signed-out"` — the member tapping Sign out, a 401, an
 *      expired `exp`, a failed unlock — so there is one teardown and not four.
 *
 * Both dependencies are injectable so a test can drive connectivity by hand
 * and assert on a queue it owns.
 */
export interface ConnectivityBannerProps {
  connectivity?: ConnectivitySource;
  writes?: OfflineWrites;
  workoutSaves?: WorkoutSaveQueue;
}

export function ConnectivityBanner({
  connectivity = netInfoConnectivity,
  writes,
  workoutSaves,
}: ConnectivityBannerProps = {}) {
  const { status } = useAuth();
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState<boolean>(true);
  // The first answer from `isConnected()` must not overwrite a LATER event: on
  // a slow launch the subscription can fire before the initial read resolves.
  const sawEvent = useRef<boolean>(false);
  // The app's one queue unless a test hands us another.
  const queue = useMemo<OfflineWrites>(
    () => writes ?? getOfflineWrites(),
    [writes],
  );
  // The app's one WORKOUT queue unless a test hands us another. It replays
  // the live workout's own saves — autosaves and the completing save — in
  // order when the connection returns, each carrying its attempt id so a
  // replay after a crash or after local midnight never duplicates.
  const workoutQueue = useMemo<WorkoutSaveQueue>(
    () => workoutSaves ?? getWorkoutSaveQueue(),
    [workoutSaves],
  );

  useEffect(() => {
    let alive = true;
    const unsubscribe = connectivity.subscribe((next) => {
      if (!alive) return;
      sawEvent.current = true;
      setOnline(next);
    });
    void connectivity.isConnected().then((next) => {
      if (!alive || sawEvent.current) return;
      setOnline(next);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [connectivity]);

  useEffect(() => {
    void queue.start();
    void workoutQueue.start();
    return () => {
      queue.stop();
      workoutQueue.stop();
    };
  }, [queue, workoutQueue]);

  useEffect(() => {
    // `loading` is the launch read of the secure store, not a signed-out state:
    // clearing on it would wipe a snapshot before the session that owns it has
    // even been read back.
    if (status === "signed-out") {
      void queue.clear();
      void workoutQueue.clear();
    }
  }, [status, queue, workoutQueue]);

  return <OfflineBanner online={online} topInset={insets.top} />;
}
