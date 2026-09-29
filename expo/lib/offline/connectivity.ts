/**
 * IS THIS DEVICE ONLINE — one answer, from NetInfo, for both consumers.
 *
 * Two things ask: the banner the member sees (`components/offline/
 * ConnectivityBanner.tsx`) and the write queue that replays what they typed
 * while it was false (`lib/offline/writes.ts`). They must never disagree, so
 * the mapping from a NetInfo state to a boolean lives here and nowhere else.
 *
 * ONLY AN EXPLICIT `false` IS OFFLINE. NetInfo reports `isConnected: null` and
 * `isInternetReachable: null` while it is still working the answer out — on
 * iOS that is the first moments of every launch — and treating "not yet known"
 * as "offline" would flash the banner at a member who is on wifi. So the
 * default is online and only a definite negative moves it:
 *
 *   isConnected === false        → the radio has nothing (airplane mode)
 *   isInternetReachable === false → associated but nothing gets out (captive
 *                                   portal, a wifi network with no uplink)
 *
 * NetInfo delivers its events as they happen — there is no polling interval
 * and nothing here debounces them, which is what makes the banner appear
 * within a second of the signal going (NP-190's acceptance).
 */
import NetInfo from "@react-native-community/netinfo";
import type { NetInfoLike } from "@/lib/query/offlineQueue";

/**
 * The connectivity contract the offline queue already declares
 * (`NetInfoLike`), re-exported under the name the app uses so a screen never
 * has to import the queue to talk about the network.
 */
export type ConnectivitySource = NetInfoLike;

/** The slice of a NetInfo state this app reads. */
export interface ConnectivitySnapshot {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}

/** True unless NetInfo definitely says otherwise. See the note above. */
export function isOnline(
  state: ConnectivitySnapshot | null | undefined,
): boolean {
  if (!state) return true;
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

/** The real device connectivity, backed by `@react-native-community/netinfo`. */
export const netInfoConnectivity: ConnectivitySource = {
  async isConnected(): Promise<boolean> {
    try {
      return isOnline(await NetInfo.fetch());
    } catch {
      // A refusal to answer is not an answer of "offline": behave as online
      // and let the write itself find out.
      return true;
    }
  },
  subscribe(listener: (online: boolean) => void): () => void {
    const unsubscribe = NetInfo.addEventListener((state) => {
      listener(isOnline(state));
    });
    return () => {
      unsubscribe();
    };
  },
};

/** An always-online source, for tests and for a platform without NetInfo. */
export function createStaticConnectivity(online = true): ConnectivitySource {
  return {
    async isConnected(): Promise<boolean> {
      return online;
    },
    subscribe(): () => void {
      return () => {};
    },
  };
}
