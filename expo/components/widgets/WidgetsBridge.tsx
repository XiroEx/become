import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import {
  clearWidgetsHandoff,
  handOffWidgetsToken,
} from "@/lib/widgets/handoff";

export interface WidgetsBridgeProps {
  /** The signed-in job: mint, store, read the feed, redraw. DI for tests. */
  handOff?: (sessionToken: string) => Promise<unknown>;
  /** The signed-out job: forget the token and draw the sign-in prompt. */
  onSignedOut?: () => Promise<unknown>;
}

/**
 * Renders nothing. Keeps the home-screen widgets in step with the session.
 *
 * WHY IT SITS AT THE ROOT, next to `TimezoneReporter`, and not inside `(app)`:
 * the transition it exists for is signed-in → signed-OUT, and a component
 * mounted behind `AuthGuard` is unmounted by that very transition — its effect
 * would never run and the widgets would keep the member's streak and calories on
 * the home screen of a phone they had just signed out of. At the root it sees
 * both directions.
 *
 * ONCE PER TOKEN, and once per sign-out. A re-render, a sliding-session refresh
 * that hands back the same JWT, a screen change — none of them re-mint: the
 * server is asked for a widgets token when the session actually CHANGES, which
 * is what "at each open" means for an app that is not relaunched all day.
 *
 * Every job is fire-and-forget and swallows its own failures. This is decoration
 * on someone else's home screen; it may never be the reason a launch or a
 * sign-out fails.
 */
export function WidgetsBridge({
  handOff = handOffWidgetsToken,
  onSignedOut = clearWidgetsHandoff,
}: WidgetsBridgeProps = {}): null {
  const { status, token } = useAuth();
  const handedOffFor = useRef<string | null>(null);
  const clearedForSignOut = useRef(false);

  useEffect(() => {
    // `loading` is the launch read of the secure store, not a verdict. Acting on
    // it would clear the token of a member who is about to be signed in.
    if (status === "loading") return;

    if (status === "signed-in" && token) {
      if (handedOffFor.current === token) return;
      handedOffFor.current = token;
      clearedForSignOut.current = false;
      void handOff(token).catch(() => null);
      return;
    }

    if (status === "signed-out") {
      if (clearedForSignOut.current) return;
      clearedForSignOut.current = true;
      handedOffFor.current = null;
      void onSignedOut().catch(() => null);
    }
  }, [handOff, onSignedOut, status, token]);

  return null;
}
