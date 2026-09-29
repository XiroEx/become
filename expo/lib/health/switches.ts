/**
 * THE OFF SWITCHES — one per direction — and the LAUNCH SNAPSHOT the sync
 * reads them through.
 *
 * Three answers, each its own SecureStore key
 * (`lib/auth/secureStoreToken.ts`), all default OFF:
 *
 *   `health.optedIn`  the umbrella. Off means Become does not touch the
 *                     platform health store at all.
 *   `read`            Health → Become. Weigh-ins recorded elsewhere (a smart
 *                     scale, another app) are imported.
 *   `write`           Become → Health. Weigh-ins logged here and finished
 *                     workouts are written back.
 *
 * WHY A SNAPSHOT, AND WHY "NEXT LAUNCH". The switches are read ONCE per
 * process, at launch, and the sync consults that frozen value — never the
 * store. So turning a direction off stops it at the next launch, which is:
 *
 *  1. what the member is told, and true on both platforms for the same reason;
 *  2. the honest description of the platform underneath. Health Connect's own
 *     `revokeAllPermissions()` "does not take effect until the app process
 *     restarts" (its docs say so, and say not to hang an in-app disconnect
 *     toggle on it: track the state yourself and stop syncing yourself — which
 *     is exactly this file). HealthKit's authorisation cache behaves the same
 *     way across a session;
 *  3. what makes a half-finished sync coherent. A switch flipped mid-import
 *     would otherwise leave some of a member's samples posted and some not,
 *     with nothing recording which.
 *
 * The toggle itself writes through IMMEDIATELY — nothing is lost if the app is
 * killed — it is only the running session that keeps its answer.
 */
import {
  healthOptInSecureStore,
  healthSyncReadSecureStore,
  healthSyncWriteSecureStore,
  createMemoryTokenStore,
  type TokenStore,
} from "@/lib/auth/secureStoreToken";
import { createHealthOptInStore, type HealthOptInStore } from "./opt-in";
import type { HealthDirection } from "./types";

/** Which directions the member has turned on. */
export interface HealthSwitches {
  read: boolean;
  write: boolean;
}

/** Both directions off — the default, and the answer before launch has read. */
export const HEALTH_SWITCHES_OFF: HealthSwitches = { read: false, write: false };

export interface HealthSwitchStore {
  get: (direction: HealthDirection) => Promise<boolean>;
  set: (direction: HealthDirection, value: boolean) => Promise<void>;
  load: () => Promise<HealthSwitches>;
}

/**
 * `read` and `write` are the stores for the two direction keys. They are
 * REQUIRED and named at the call site for the same reason the opt-in's store is
 * (`lib/health/opt-in.ts`): a store that defaults to something is a store that
 * can end up writing over the session JWT.
 *
 * The `"yes"` / absent serialisation is reused from the opt-in store, so all
 * three flags are stored identically.
 */
export function createHealthSwitchStore(stores: {
  read: TokenStore;
  write: TokenStore;
}): HealthSwitchStore {
  const flags: Record<HealthDirection, HealthOptInStore> = {
    read: createHealthOptInStore(stores.read),
    write: createHealthOptInStore(stores.write),
  };
  return {
    get: (direction) => flags[direction].isOptedIn(),
    set: (direction, value) => flags[direction].setOptedIn(value),
    async load(): Promise<HealthSwitches> {
      const [read, write] = await Promise.all([
        flags.read.isOptedIn(),
        flags.write.isOptedIn(),
      ]);
      return { read, write };
    },
  };
}

/** The real switches, on the two `become.sync.health.*` keys. */
export const healthSwitchStore: HealthSwitchStore = createHealthSwitchStore({
  read: healthSyncReadSecureStore,
  write: healthSyncWriteSecureStore,
});

/** Convenience for tests: in-memory switches, no SecureStore required. */
export function createMemoryHealthSwitchStore(
  initial: Partial<HealthSwitches> = {},
): HealthSwitchStore {
  return createHealthSwitchStore({
    read: createMemoryTokenStore(initial.read ? "yes" : null),
    write: createMemoryTokenStore(initial.write ? "yes" : null),
  });
}

/** The umbrella opt-in plus both directions, as read at launch. */
export interface HealthSyncSession extends HealthSwitches {
  optedIn: boolean;
}

/** Nothing on. What the app answers until launch has read the switches. */
export const HEALTH_SYNC_SESSION_OFF: HealthSyncSession = {
  optedIn: false,
  read: false,
  write: false,
};

/** May Become import weigh-ins from the platform health store right now? */
export function canImportFromHealth(session: HealthSyncSession): boolean {
  return session.optedIn && session.read;
}

/** May Become write weigh-ins and workouts back to it right now? */
export function canExportToHealth(session: HealthSyncSession): boolean {
  return session.optedIn && session.write;
}

export interface ReadHealthSyncSessionDeps {
  optIn?: HealthOptInStore;
  switches?: HealthSwitchStore;
}

/**
 * Read the three flags. A store that throws (a Keystore that is not ready yet,
 * for instance) reads as OFF: the failure mode of a health integration must be
 * "does nothing", never "does it anyway".
 */
export async function readHealthSyncSession(
  deps: ReadHealthSyncSessionDeps = {},
): Promise<HealthSyncSession> {
  const optInStore =
    deps.optIn ?? createHealthOptInStore(healthOptInSecureStore);
  const switchStore = deps.switches ?? healthSwitchStore;
  try {
    const [optedIn, switches] = await Promise.all([
      optInStore.isOptedIn(),
      switchStore.load(),
    ]);
    return { optedIn, ...switches };
  } catch {
    return HEALTH_SYNC_SESSION_OFF;
  }
}

/**
 * THE SNAPSHOT, and the only mutable state in the health integration. Written
 * once per process by `initHealthSyncSession` (the launch bridge) and read by
 * everything that syncs, so a switch flipped after launch takes effect at the
 * NEXT launch and not mid-session.
 */
let launchSession: HealthSyncSession = HEALTH_SYNC_SESSION_OFF;
let launchRead = false;

/**
 * Read the switches for this process. Called once, at launch, by
 * `components/health/HealthSyncBridge.tsx`. A second call is ignored and
 * answers the same snapshot — that is what makes "the next launch" a real
 * boundary rather than a description of when we happen to re-read.
 */
export async function initHealthSyncSession(
  deps: ReadHealthSyncSessionDeps = {},
): Promise<HealthSyncSession> {
  if (launchRead) return launchSession;
  launchSession = await readHealthSyncSession(deps);
  launchRead = true;
  return launchSession;
}

/** This process's snapshot: all-off until launch has read the switches. */
export function currentHealthSyncSession(): HealthSyncSession {
  return launchSession;
}

/** @internal Tests only — the snapshot would otherwise leak between cases. */
export function __resetHealthSyncSession(): void {
  launchSession = HEALTH_SYNC_SESSION_OFF;
  launchRead = false;
}
