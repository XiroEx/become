/**
 * THE PLAN SNAPSHOT'S ORDERING RULES (NP-049), driven without a renderer.
 *
 * Port of `webapp/tests/unit/entitlements/refreshRace.test.ts`, plus the two
 * halves native adds: a persisted seed and a snapshot that dies with the
 * session.
 *
 * The bug these exist for, in the web's words:
 *
 *   a member sitting at 3/3 opens a screen on a slow connection and taps Delete
 *   before the mount's entitlements fetch has come back. The delete handler
 *   calls `refresh()`. `refresh()` finds a request already in flight and returns
 *   it. That request was dispatched BEFORE the delete, so it answers 3/3 — and
 *   then stamps `fetchedAt = Date.now()`, certifying the pre-delete counts fresh
 *   for another full minute.
 *
 * The create control stays locked, the only way out of an inventory cap looks
 * like it did nothing, and every later read is served from the stale snapshot.
 */

import { clearAll, setCacheMemberId, writeCache } from "@/lib/cache/lastKnown";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import {
  ENTITLEMENTS_CACHE_KEY,
  ENTITLEMENTS_TTL_MS,
  clearEntitlements,
  configureEntitlementsStore,
  getEntitlementsSnapshot,
  invalidateEntitlements,
  loadEntitlements,
  resetEntitlementsSnapshot,
  seedEntitlementsFromCache,
  setEntitlementsToken,
  toEntitlementsSnapshot,
} from "@/lib/entitlements/store";

// ─── A session token the store can read a member id out of ───────────────────

const b64url = (value: string): string =>
  Buffer.from(value, "utf8").toString("base64").replace(/=+$/, "");

const jwtFor = (userId: string): string =>
  `h.${b64url(JSON.stringify({ userId, exp: 4_000_000_000 }))}.s`;

const MEMBER_1 = jwtFor("member-1");
const MEMBER_2 = jwtFor("member-2");

// ─── A fetch the test decides the timing of ──────────────────────────────────

interface Pending {
  url: string;
  token: string | null;
  settle: (body: unknown, status?: number) => void;
}

const requests: Pending[] = [];

const fetchImpl = ((url: string, init?: { headers?: Record<string, string> }) =>
  new Promise((resolve) => {
    const auth = init?.headers?.Authorization ?? null;
    requests.push({
      url: String(url),
      token: auth ? auth.replace(/^Bearer /, "") : null,
      settle: (body, status = 200) =>
        resolve({
          ok: status >= 200 && status < 300,
          status,
          text: async () => JSON.stringify(body),
          headers: { get: () => null },
        } as unknown as Response),
    });
  })) as unknown as typeof fetch;

/**
 * `apiFetch` awaits the token before it reaches `fetchImpl`, so a dispatched
 * request only shows up in `requests` a microtask later. Every assertion about
 * how MANY requests are on the wire has to give it that tick.
 */
const dispatched = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

// ─── Fixtures: the same member, at the cap and one slot freed ────────────────

function plan(canCreate: boolean, remaining: number) {
  return {
    role: "user",
    tier: "free",
    enforced: true,
    grandfathered: false,
    subscription: null,
    checkoutAvailable: false,
    features: {
      "custom-exercises": {
        allowed: true,
        canCreate,
        requiresTier: "plus",
        limit: 3,
        used: 3 - remaining,
        remaining,
        resetsAt: null,
        window: "lifetime",
      },
    },
  };
}

const LOCKED = plan(false, 0);
const FREED = plan(true, 1);
/** Another member entirely: Plus, nothing capped. */
const OTHER_MEMBER = {
  role: "user",
  tier: "plus",
  enforced: true,
  grandfathered: false,
  subscription: { status: "active", currentPeriodEnd: null, cancelAtPeriodEnd: false },
  checkoutAvailable: true,
  features: {
    "custom-exercises": {
      allowed: true,
      canCreate: true,
      requiresTier: "plus",
      limit: null,
      used: 12,
      remaining: null,
      resetsAt: null,
      window: "lifetime",
    },
  },
};

const canCreate = (): boolean | null =>
  getEntitlementsSnapshot()?.features["custom-exercises"]?.canCreate ?? null;

let storage: AsyncStorageLike;

beforeEach(async () => {
  requests.length = 0;
  storage = createMemoryAsyncStorage();
  await clearAll(storage);
  setCacheMemberId(null);
  configureEntitlementsStore({
    baseUrl: "https://example.test",
    fetchImpl,
    storage,
  });
  // Also marks anything a previous test left in flight as superseded, so no
  // dangling request can leak into the next one.
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
  setEntitlementsToken(MEMBER_1);
});

afterEach(async () => {
  jest.restoreAllMocks();
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
  await clearAll(storage);
});

// ─── One request per screen ──────────────────────────────────────────────────

describe("the shared snapshot", () => {
  it("issues ONE request for three readers on the same screen", async () => {
    const a = loadEntitlements(false);
    const b = loadEntitlements(false);
    const c = loadEntitlements(false);
    await dispatched();
    expect(requests).toHaveLength(1);

    requests[0]!.settle(LOCKED);
    await Promise.all([a, b, c]);

    expect(canCreate()).toBe(false);
    expect(requests).toHaveLength(1);
  });

  it("sends the session as a bearer token and a numeric tz", async () => {
    const read = loadEntitlements(false);
    await dispatched();
    expect(requests[0]!.token).toBe(MEMBER_1);
    // `tz` is minutes WEST of UTC, from the device clock — never an IANA zone.
    // The windowed allowances themselves key on the member's STORED zone
    // server-side; this only decides what `resetsAt` is expressed against.
    expect(requests[0]!.url).toMatch(/\/api\/me\/entitlements\?tz=-?\d+$/);
    requests[0]!.settle(LOCKED);
    await read;
  });

  it("serves a read inside the TTL from the cache, and refetches after it", async () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    const first = loadEntitlements(false);
    await dispatched();
    requests[0]!.settle(LOCKED);
    await first;

    now += ENTITLEMENTS_TTL_MS - 1;
    await loadEntitlements(false);
    await dispatched();
    expect(requests).toHaveLength(1);

    now += 2;
    const third = loadEntitlements(false);
    await dispatched();
    expect(requests).toHaveLength(2);
    requests[1]!.settle(FREED);
    await third;
    expect(canCreate()).toBe(true);
  });

  it("keeps the last snapshot when the request fails — a blip locks nothing", async () => {
    const first = loadEntitlements(false);
    await dispatched();
    requests[0]!.settle(FREED);
    await first;

    invalidateEntitlements();
    const second = loadEntitlements(false);
    await dispatched();
    requests[1]!.settle({ error: "nope" }, 500);
    await second;

    expect(canCreate()).toBe(true);
  });
});

// ─── The delete that has to clear the lock now ───────────────────────────────

describe("a delete frees its slot immediately", () => {
  it("a forced refresh does not adopt the request that was already in flight", async () => {
    const mount = loadEntitlements(false);
    await dispatched();
    expect(requests).toHaveLength(1);

    // The member deletes one while that request is still open.
    const afterDelete = loadEntitlements(true);
    await dispatched();
    expect(requests).toHaveLength(2);

    // The pre-delete answer lands first, exactly as it would on a phone.
    requests[0]!.settle(LOCKED);
    requests[1]!.settle(FREED);
    await Promise.all([mount, afterDelete]);

    expect(canCreate()).toBe(true);

    // …and the stale answer must not have been certified fresh: a read inside
    // the TTL is served from the cache, so whatever is cached is what the
    // member sees for the next minute.
    await loadEntitlements(false);
    await dispatched();
    expect(requests).toHaveLength(2);
    expect(canCreate()).toBe(true);
  });

  it("a superseded response never overwrites the fresher one, whatever the order", async () => {
    const mount = loadEntitlements(false);
    await dispatched();
    const afterDelete = loadEntitlements(true);
    await dispatched();

    // The forced request wins the race; the stale one dawdles and lands after.
    requests[1]!.settle(FREED);
    await afterDelete;
    requests[0]!.settle(LOCKED);
    await mount;

    await loadEntitlements(false);
    await dispatched();
    expect(canCreate()).toBe(true);
    expect(requests).toHaveLength(2);
  });

  it("invalidateEntitlements survives a response that was already in the air", async () => {
    const mount = loadEntitlements(false);
    await dispatched();
    expect(requests).toHaveLength(1);

    // A screen that renders no gate invalidates rather than refetching. The
    // next real reader is promised the truth.
    invalidateEntitlements();
    requests[0]!.settle(LOCKED);
    await mount;

    const next = loadEntitlements(false);
    await dispatched();
    expect(requests).toHaveLength(2);
    requests[1]!.settle(FREED);
    await next;
    expect(canCreate()).toBe(true);
  });
});

// ─── Whose plan is this? ─────────────────────────────────────────────────────

describe("the snapshot belongs to a session", () => {
  it("a different token drops the previous member's snapshot on the spot", async () => {
    const first = loadEntitlements(false);
    await dispatched();
    requests[0]!.settle(LOCKED);
    await first;
    expect(canCreate()).toBe(false);

    setEntitlementsToken(MEMBER_2);
    expect(getEntitlementsSnapshot()).toBeNull();

    const second = loadEntitlements(false);
    await dispatched();
    expect(requests).toHaveLength(2);
    expect(requests[1]!.token).toBe(MEMBER_2);
    requests[1]!.settle(OTHER_MEMBER);
    await second;
    expect(getEntitlementsSnapshot()?.tier).toBe("plus");
  });

  it("a response dispatched for the previous member never lands", async () => {
    const first = loadEntitlements(false);
    await dispatched();
    setEntitlementsToken(MEMBER_2);

    // Member 1's answer arrives after the switch. It is not stale data, it is
    // somebody else's plan.
    requests[0]!.settle(LOCKED);
    await first;
    expect(getEntitlementsSnapshot()).toBeNull();
  });

  it("signing out drops the snapshot and the persisted seed", async () => {
    const first = loadEntitlements(false);
    await dispatched();
    requests[0]!.settle(LOCKED);
    await first;
    expect(getEntitlementsSnapshot()).not.toBeNull();

    await clearEntitlements();
    expect(getEntitlementsSnapshot()).toBeNull();

    // And nothing is left on disk for the next member to paint from.
    setEntitlementsToken(MEMBER_1);
    expect(await seedEntitlementsFromCache()).toBeNull();
  });

  it("signed out, it reads nothing at all", async () => {
    setEntitlementsToken(null);
    await loadEntitlements(false);
    await dispatched();
    expect(requests).toHaveLength(0);
    expect(getEntitlementsSnapshot()).toBeNull();
  });
});

// ─── The persisted seed ──────────────────────────────────────────────────────

describe("the persisted seed", () => {
  it("paints the plan state this member last saw, then still revalidates", async () => {
    const first = loadEntitlements(false);
    await dispatched();
    requests[0]!.settle(LOCKED);
    await first;

    // A relaunch: same member, same storage, no snapshot in memory.
    resetEntitlementsSnapshot();
    expect(getEntitlementsSnapshot()).toBeNull();

    const seeded = await seedEntitlementsFromCache();
    expect(seeded?.features["custom-exercises"]?.canCreate).toBe(false);

    // A seed is a first paint, never a fresh read: the next load goes out.
    const revalidate = loadEntitlements(false);
    await dispatched();
    expect(requests).toHaveLength(2);
    requests[1]!.settle(FREED);
    await revalidate;
    expect(canCreate()).toBe(true);
  });

  it("never paints another member's plan", async () => {
    const first = loadEntitlements(false);
    await dispatched();
    requests[0]!.settle(LOCKED);
    await first;

    setEntitlementsToken(MEMBER_2);
    expect(await seedEntitlementsFromCache()).toBeNull();
  });

  it("ignores a seed that is not a snapshot", async () => {
    await writeCache(ENTITLEMENTS_CACHE_KEY, { tier: "plus" }, "member-1", storage);
    resetEntitlementsSnapshot();
    expect(await seedEntitlementsFromCache()).toBeNull();
  });
});

// ─── Narrowing the wire shape ────────────────────────────────────────────────

describe("toEntitlementsSnapshot", () => {
  it("never guesses the kill-switch", () => {
    // `enforced` decides whether the app shows a paywall at all. A body without
    // it is not a snapshot, and defaulting it either way is a decision no
    // client is allowed to make.
    expect(toEntitlementsSnapshot({ features: {} })).toBeNull();
    expect(toEntitlementsSnapshot({ enforced: "true", features: {} })).toBeNull();
    expect(toEntitlementsSnapshot(null)).toBeNull();
    expect(toEntitlementsSnapshot({ enforced: false, features: {} })?.enforced).toBe(false);
  });

  it("drops a feature entry that carries no canCreate", () => {
    // There is no repairing one: recomputing it from limit and used is exactly
    // what the server's calculation exists to prevent.
    const snapshot = toEntitlementsSnapshot({
      enforced: true,
      features: {
        vision: { allowed: false },
        "custom-meals": { allowed: true, canCreate: false },
      },
    });
    expect(snapshot?.features.vision).toBeUndefined();
    expect(snapshot?.features["custom-meals"]?.canCreate).toBe(false);
  });

  it("fills the optional halves of the wire shape without inventing numbers", () => {
    const snapshot = toEntitlementsSnapshot({
      enforced: true,
      features: { vision: { allowed: false, canCreate: false } },
    });
    expect(snapshot?.features.vision).toEqual({
      allowed: false,
      canCreate: false,
      requiresTier: "plus",
      limit: null,
      used: 0,
      remaining: null,
      resetsAt: null,
      window: "lifetime",
    });
  });
});
