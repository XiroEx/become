/**
 * ─── The off switches, one per direction, and "the next launch" ──────────────
 *
 * What is pinned here is the promise the Settings copy makes and the sync keeps:
 *
 *   turning a direction off stops it AT THE NEXT LAUNCH.
 *
 * Which means two things, and both are asserted below: the switch is written
 * through immediately (nothing is lost if the app is killed), and the RUNNING
 * process keeps the answer it read at launch — so a half-finished import cannot
 * be cut in two by a toggle, and the platform's own behaviour (Health Connect's
 * permission revocation "does not take effect until the app process restarts")
 * is described honestly rather than pretended away.
 *
 * Also pinned: everything defaults OFF, and a store that throws reads as OFF. A
 * health integration that fails open is not a bug, it is a breach.
 */
import {
  HEALTH_SWITCHES_OFF,
  HEALTH_SYNC_SESSION_OFF,
  __resetHealthSyncSession,
  canExportToHealth,
  canImportFromHealth,
  createHealthSwitchStore,
  createMemoryHealthSwitchStore,
  currentHealthSyncSession,
  initHealthSyncSession,
  readHealthSyncSession,
  type HealthSwitchStore,
} from "@/lib/health/switches";
import { createMemoryHealthOptInStore } from "@/lib/health/opt-in";
import { createMemoryTokenStore, type TokenStore } from "@/lib/auth/secureStoreToken";

beforeEach(() => {
  __resetHealthSyncSession();
});

describe("the two direction switches", () => {
  it("default to off", async () => {
    const store = createMemoryHealthSwitchStore();
    expect(await store.load()).toEqual(HEALTH_SWITCHES_OFF);
    expect(await store.get("read")).toBe(false);
    expect(await store.get("write")).toBe(false);
  });

  it("are independent of each other", async () => {
    const store = createMemoryHealthSwitchStore();
    await store.set("read", true);
    expect(await store.load()).toEqual({ read: true, write: false });
    await store.set("write", true);
    await store.set("read", false);
    expect(await store.load()).toEqual({ read: false, write: true });
  });

  it("write through to their own keys, serialised like the opt-in", async () => {
    const read = createMemoryTokenStore();
    const write = createMemoryTokenStore();
    const store = createHealthSwitchStore({ read, write });
    await store.set("read", true);
    expect(await read.get()).toBe("yes");
    expect(await write.get()).toBeNull();
    await store.set("read", false);
    expect(await read.get()).toBeNull();
  });
});

describe("readHealthSyncSession", () => {
  it("reads the umbrella opt-in and both directions", async () => {
    const session = await readHealthSyncSession({
      optIn: createMemoryHealthOptInStore(true),
      switches: createMemoryHealthSwitchStore({ read: true, write: true }),
    });
    expect(session).toEqual({ optedIn: true, read: true, write: true });
  });

  it("is all-off when a store throws", async () => {
    const exploding: TokenStore = {
      get: async () => {
        throw new Error("keystore not ready");
      },
      set: async () => {},
      clear: async () => {},
    };
    const session = await readHealthSyncSession({
      optIn: createMemoryHealthOptInStore(true),
      switches: createHealthSwitchStore({
        read: exploding,
        write: createMemoryTokenStore(),
      }),
    });
    expect(session).toEqual(HEALTH_SYNC_SESSION_OFF);
  });
});

describe("the umbrella opt-in gates both directions", () => {
  it.each([
    [{ optedIn: false, read: true, write: true }, false, false],
    [{ optedIn: true, read: true, write: false }, true, false],
    [{ optedIn: true, read: false, write: true }, false, true],
    [{ optedIn: true, read: true, write: true }, true, true],
  ])("%j → import %s, export %s", (session, canImport, canExport) => {
    expect(canImportFromHealth(session)).toBe(canImport);
    expect(canExportToHealth(session)).toBe(canExport);
  });
});

describe("the launch snapshot", () => {
  it("is all-off before launch has read anything", () => {
    expect(currentHealthSyncSession()).toEqual(HEALTH_SYNC_SESSION_OFF);
  });

  it("is the value the switches held at launch", async () => {
    const session = await initHealthSyncSession({
      optIn: createMemoryHealthOptInStore(true),
      switches: createMemoryHealthSwitchStore({ read: true, write: true }),
    });
    expect(session).toEqual({ optedIn: true, read: true, write: true });
    expect(currentHealthSyncSession()).toEqual(session);
  });

  // THE ACCEPTANCE CRITERION, as code: each direction turned off stops at the
  // NEXT launch, and not before.
  it.each(["read", "write"] as const)(
    "turning %s off does not change this process, and is what the next launch reads",
    async (direction) => {
      const switches: HealthSwitchStore = createMemoryHealthSwitchStore({
        read: true,
        write: true,
      });
      const optIn = createMemoryHealthOptInStore(true);

      await initHealthSyncSession({ optIn, switches });
      expect(canImportFromHealth(currentHealthSyncSession())).toBe(true);
      expect(canExportToHealth(currentHealthSyncSession())).toBe(true);

      // The member flips it off in Settings, mid-session.
      await switches.set(direction, false);

      // Written through immediately…
      expect(await switches.get(direction)).toBe(false);
      // …and the running process is unchanged: no half-done sync.
      expect(currentHealthSyncSession()).toEqual({
        optedIn: true,
        read: true,
        write: true,
      });
      // A second read inside the same process answers the snapshot, not the store.
      expect(await initHealthSyncSession({ optIn, switches })).toEqual({
        optedIn: true,
        read: true,
        write: true,
      });

      // Next launch (a fresh process) reads the stores again, and it is off.
      __resetHealthSyncSession();
      const relaunched = await initHealthSyncSession({ optIn, switches });
      expect(relaunched[direction]).toBe(false);
      if (direction === "read") {
        expect(canImportFromHealth(relaunched)).toBe(false);
        expect(canExportToHealth(relaunched)).toBe(true);
      } else {
        expect(canExportToHealth(relaunched)).toBe(false);
        expect(canImportFromHealth(relaunched)).toBe(true);
      }
    },
  );

  it("turning the umbrella off at the next launch stops both directions", async () => {
    const switches = createMemoryHealthSwitchStore({ read: true, write: true });
    const optIn = createMemoryHealthOptInStore(true);
    await initHealthSyncSession({ optIn, switches });

    await optIn.setOptedIn(false);
    __resetHealthSyncSession();

    const relaunched = await initHealthSyncSession({ optIn, switches });
    expect(relaunched.optedIn).toBe(false);
    expect(canImportFromHealth(relaunched)).toBe(false);
    expect(canExportToHealth(relaunched)).toBe(false);
  });
});
