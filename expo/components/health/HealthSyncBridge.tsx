import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth/useAuth";
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
}

/**
 * Renders nothing. Reads the health switches ONCE for this process and, if the
 * Health → Become direction was on when the app opened, imports the member's
 * weigh-ins through `POST /api/weight`.
 *
 * WHY IT IS HERE AND NOT ON A SCREEN. The member this exists for weighs
 * themselves on a scale that talks to Health Connect and never types a number
 * into Become at all; there is no screen they can be relied on to open. And
 * reading the switches at launch is what makes "turning a direction off stops it
 * at the next launch" true — see `lib/health/switches.ts`.
 *
 * It is mounted inside the signed-in group, below the onboarding gate, because
 * the import needs a session (the route 401s without one) and because a member
 * who has not finished onboarding has nothing to sync into yet.
 */
export function HealthSyncBridge({
  run = runLaunchImport,
}: HealthSyncBridgeProps = {}): null {
  const { token } = useAuth();
  // Once per mount. A token that changes (a refresh, a re-sign-in) does not
  // re-import: the snapshot is the same and so are the samples.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    // Swallowed on purpose: a health store that is missing, locked or refused is
    // an ordinary state of the world, not something to take a launch down over.
    // Every step inside already reports its own outcome in the result.
    void run(token).catch(() => null);
  }, [run, token]);

  return null;
}

async function runLaunchImport(
  token: string,
): Promise<ImportWeightResult | null> {
  // The client first: on a platform with no health module (iOS until NP-185)
  // there is nothing to sync and no reason to read the switches at all.
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
