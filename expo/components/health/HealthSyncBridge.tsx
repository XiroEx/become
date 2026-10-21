import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
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
  /** The whole launch/foreground job (DI for tests). */
  run?: (token: string) => Promise<ImportWeightResult | null>;
  /** Subscribe to foreground/background changes (DI for tests). */
  subscribeToAppState?: (
    listener: (status: AppStateStatus) => void,
  ) => () => void;
}

function defaultSubscribe(
  listener: (status: AppStateStatus) => void,
): () => void {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
}

/**
 * Renders nothing. Reads the health switches ONCE for this process and, if the
 * Health → Become direction was on when the app opened, imports the member's
 * weigh-ins through `POST /api/weight` — at launch, AND every time the app
 * returns to the foreground (NP-185: a weigh-in entered in Apple Health while
 * Become was backgrounded should not wait for the next cold start).
 *
 * WHY IT IS HERE AND NOT ON A SCREEN. The member this exists for weighs
 * themselves on a scale that talks to Health Connect / HealthKit and never
 * types a number into Become at all; there is no screen they can be relied on
 * to open. And reading the switches at launch is what makes "turning a
 * direction off stops it at the next launch" true — see `lib/health/switches.ts`:
 * the foreground re-sync below reuses that SAME launch snapshot, never
 * re-reading the switches mid-session, so a direction turned off keeps
 * meaning "at the next launch" even though the import itself now runs more
 * than once per process.
 *
 * It is mounted inside the signed-in group, below the onboarding gate, because
 * the import needs a session (the route 401s without one) and because a member
 * who has not finished onboarding has nothing to sync into yet.
 */
export function HealthSyncBridge({
  run = runImport,
  subscribeToAppState = defaultSubscribe,
}: HealthSyncBridgeProps = {}): null {
  const { token } = useAuth();
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  });
  // Once per mount for the LAUNCH run specifically — a token that changes (a
  // refresh, a re-sign-in) does not re-import at launch; the foreground
  // listener below is the only other trigger.
  const started = useRef(false);

  const runSync = useCallback(async (): Promise<void> => {
    const jwt = tokenRef.current;
    if (!jwt) return;
    // Swallowed on purpose: a health store that is missing, locked or refused is
    // an ordinary state of the world, not something to take a launch down over.
    // Every step inside already reports its own outcome in the result.
    await run(jwt).catch(() => null);
  }, [run]);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void runSync();
    const unsubscribe = subscribeToAppState((status) => {
      if (status === "active") void runSync();
    });
    return unsubscribe;
    // runSync is stable per `run` via the token ref; re-run on sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, subscribeToAppState]);

  return null;
}

async function runImport(token: string): Promise<ImportWeightResult | null> {
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
