import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { useOnForeground, type UseOnForegroundOptions } from "@/lib/time/localDay";
import {
  canImportFromHealth,
  initHealthSyncSession,
} from "@/lib/health/switches";
import { getHealthClient } from "@/lib/health/client";
import {
  ensureHealthPermissionsForSession,
  runHealthLaunchSync,
  type ImportWeightResult,
} from "@/lib/health/sync";

export interface HealthSyncBridgeProps {
  /** The whole launch job (DI for tests). */
  run?: (token: string) => Promise<ImportWeightResult | null>;
  /** DI for tests: swaps the real AppState subscription for a fake one. */
  subscribeToAppState?: UseOnForegroundOptions["subscribeToAppState"];
}

/**
 * Renders nothing. Reads the health switches ONCE for this process and, if the
 * Health → Become direction was on when the app opened, imports the member's
 * weigh-ins through `POST /api/weight` — at launch, and again every time the
 * app returns to the foreground (NP-185).
 *
 * WHY IT IS HERE AND NOT ON A SCREEN. The member this exists for weighs
 * themselves on a scale that talks to Apple Health or Health Connect and never
 * types a number into Become at all; there is no screen they can be relied on
 * to open. And reading the switches at launch is what makes "turning a
 * direction off stops it at the next launch" true — see `lib/health/switches.ts`.
 *
 * WHY FOREGROUND TOO. A member who weighs in mid-day, or finishes writing to
 * Health from another app, should see it in Become without force-quitting
 * first. `runHealthLaunchSync` is safe to call repeatedly — the server's
 * `externalId` de-duplication (`webapp/lib/healthImport.ts`) makes a repeat
 * sample a no-op — so there is no cursor to lose and nothing to throttle here
 * beyond what re-running the whole import on every foreground costs.
 *
 * It is mounted inside the signed-in group, below the onboarding gate, because
 * the import needs a session (the route 401s without one) and because a member
 * who has not finished onboarding has nothing to sync into yet.
 */
export function HealthSyncBridge({
  run = runLaunchImport,
  subscribeToAppState,
}: HealthSyncBridgeProps = {}): null {
  const { token } = useAuth();
  // Once per mount for the LAUNCH run. A token that changes (a refresh, a
  // re-sign-in) does not re-import: the snapshot is the same and so are the
  // samples.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    // Swallowed on purpose: a health store that is missing, locked or refused is
    // an ordinary state of the world, not something to take a launch down over.
    // Every step inside already reports its own outcome in the result.
    void run(token).catch(() => null);
  }, [run, token]);

  // The SAME import, run again on every return to the foreground — not
  // gated on `started`, because a member who signs in while the app is
  // already foregrounded (the auth-restore race) still deserves the
  // launch-equivalent run the next time they come back, and a rejected run
  // is swallowed exactly like the launch one.
  useOnForeground(
    () => {
      if (!token) return;
      void run(token).catch(() => null);
    },
    subscribeToAppState ? { subscribeToAppState } : {},
  );

  return null;
}

async function runLaunchImport(
  token: string,
): Promise<ImportWeightResult | null> {
  // The client first: on a platform with no health module there is nothing
  // to sync and no reason to read the switches at all.
  const client = getHealthClient();
  if (!client) return null;
  const session = await initHealthSyncSession();
  // One permission sheet per launch at most, for exactly what the switches
  // justify — including the WRITE grant, so mirroring a weigh-in later in the
  // session does not interrupt the member mid-log to ask for it.
  await ensureHealthPermissionsForSession(client, session);
  if (!canImportFromHealth(session)) return null;
  return runHealthLaunchSync({ token, session, client });
}
