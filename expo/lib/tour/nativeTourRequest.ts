/**
 * A member-initiated request to replay the native coach-mark tour (NP-207) —
 * the Settings/Help escape hatch the card's decline rule carves out: "never
 * re-prompting once settled unless the member asks for it".
 *
 * Same shape as `lib/programs/programEvents.ts`'s pub/sub: Settings fires
 * `requestNativeTourReplay()` and never touches tour state directly;
 * `NativeTourOverlay` (mounted once, in the signed-in app shell) is the only
 * subscriber and the only thing that actually resets and re-shows the tour.
 */

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to replay requests. Returns an unsubscribe function. */
export function subscribeNativeTourReplayRequests(
  listener: Listener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ask the mounted tour overlay to show the upfront prompt again. */
export function requestNativeTourReplay(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      // non-fatal — one bad subscriber must not break the others
    }
  }
}
