/**
 * ─── THE NATIVE PLAN SNAPSHOT (NP-049) ────────────────────────────────────────
 *
 * Web equivalent: `webapp/hooks/useEntitlements.ts`. This is the same module,
 * with the same four rules, expressed as a store rather than a hook so that the
 * code which is NOT a component — a delete handler, the offline replay — can
 * take part in them.
 *
 * `GET /api/me/entitlements` is read HERE and nowhere else. A screen with three
 * gated components makes one request, and every one of them reads the same
 * answer.
 *
 * Caching, deliberately in three layers:
 *
 *   1. a module snapshot + a 60s TTL, so a screen that mounts three gated
 *      components issues ONE request and a tab switch issues none;
 *   2. `lib/cache/lastKnown` (AsyncStorage), so a cold open paints the plan
 *      state it last saw instead of flashing a lock, then revalidates. The seed
 *      is MEMBER-SCOPED by that module and never stamps the TTL fresh, so it
 *      cannot outlive what it seeds;
 *   3. ORDERING, which is the layer that is easiest to lose. Sharing an
 *      in-flight request is what makes "one request per screen" true, but a
 *      request only carries the answer as of the moment it was DISPATCHED. A
 *      caller that has since changed something — deleted a custom exercise,
 *      say — may not be served from it, AND its answer may not stamp the cache
 *      fresh when it lands. `requestSeq` / `supersededSeq` are that rule.
 *
 * Without layer 3 a member sitting at 3/3 who deletes one stays locked for a
 * further full minute: `refresh()` joins the mount's still-open request, which
 * answers with the PRE-delete counts and then certifies them fresh. Refreshing
 * after a delete exists to prevent exactly that.
 *
 * TWO RULES TRAVEL WITH EVERY READER OF THIS STORE:
 *
 *   • read `canCreate`, never recompute it from `limit` and `used` — the
 *     kill-switch and the admin bypass both live inside the server's
 *     calculation, and `allowed` is TRUE for a capped free member on purpose
 *     (that is what lets them edit and DELETE what they own);
 *   • when `enforced` is false, render no lock, no counter and no plan card.
 *     That single check is what lets the whole paywall ship dark.
 *
 * And the store fails OPEN. Offline, a 500, a body the schema rejects: the last
 * snapshot stands and nothing new is locked. The server is the gate; a UI lock
 * is only an explanation.
 */

import {
  EntitlementsResponseSchema,
  apiFetch,
} from "@become/api-client";
import type {
  AllowanceWindow,
  EntitlementsSnapshot,
  Feature,
  FeatureEntitlement,
  SubscriptionSnapshot,
  Tier,
} from "@become/core";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { decodeJwtPayload } from "@/lib/auth/jwt";
import {
  clearCache,
  getCachedSync,
  readCache,
  writeCache,
} from "@/lib/cache/lastKnown";
import type { AsyncStorageLike } from "@/lib/query/persistor";

/** The last-known-cache key the persisted seed lives under. */
export const ENTITLEMENTS_CACHE_KEY = "entitlements";

/** How long a fetched snapshot is reused before revalidating. Same 60s as the
 *  web hook — `__tests__/entitlementsWebParity.test.ts` reads both numbers. */
export const ENTITLEMENTS_TTL_MS = 60_000;

/** How stale a persisted seed may be before it is ignored on first paint. */
export const ENTITLEMENTS_SEED_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// ─── Module state ────────────────────────────────────────────────────────────

let snapshot: EntitlementsSnapshot | null = null;
let fetchedAt = 0;
/** Whose snapshot this is. Sign-out is a navigation, not a process restart, so
 *  the module cache outlives the session that filled it — without this the next
 *  person to sign in on the device would see the previous member's plan. */
let fetchedForToken: string | null = null;
let inflight: Promise<EntitlementsSnapshot | null> | null = null;
/** Monotonic id handed to every dispatched request. More than one request can
 *  be on the wire at a time (see `load`), so an id — not the promise — is what
 *  says which one currently owns the `inflight` slot. */
let requestSeq = 0;
/** The id of the request `inflight` holds. */
let inflightSeq = 0;
/** Requests with an id at or below this one were dispatched BEFORE something
 *  the client already knows about changed the answer: a forced refresh, an
 *  explicit `invalidateEntitlements()`, or an identity change. They are stale
 *  by construction, so they may neither be adopted by a new caller nor written
 *  to the cache when they land. */
let supersededSeq = 0;
/** The session the snapshot is read for. Set by `AuthProvider`. */
let sessionToken: string | null = null;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

// ─── Injection points (tests, and a local backend) ───────────────────────────

interface StoreConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  storage?: AsyncStorageLike;
}

let config: StoreConfig = { baseUrl: WEBAPP_BASE_URL };

/**
 * Point the store at another backend, `fetch` or storage. Everything is
 * injectable for the same reason the auth provider's is: this is a network read
 * that must be testable without a device.
 */
export function configureEntitlementsStore(next: Partial<StoreConfig>): void {
  config = { ...config, ...next };
}

// ─── Normalisation ───────────────────────────────────────────────────────────
//
// The wire shape is `EntitlementsResponseSchema` (shared/api-client), whose
// every field is optional and `.passthrough()` so a server that grows a field
// cannot break a shipped store build. What the app READS is `@become/core`'s
// `EntitlementsSnapshot` — the same type the web reads — so the wire shape is
// narrowed here, once, instead of at every call site.

function isSnapshotLike(
  value: unknown,
): value is { enforced: boolean; features: Record<string, unknown> } {
  if (value === null || typeof value !== "object") return false;
  const v = value as { enforced?: unknown; features?: unknown };
  return (
    typeof v.enforced === "boolean" &&
    typeof v.features === "object" &&
    v.features !== null
  );
}

function normalizeSubscription(raw: unknown): SubscriptionSnapshot | null {
  if (raw === null || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.status !== "string") return null;
  return {
    status: s.status,
    currentPeriodEnd:
      typeof s.currentPeriodEnd === "string" ? s.currentPeriodEnd : null,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd === true,
  };
}

function normalizeFeature(raw: unknown): FeatureEntitlement | null {
  if (raw === null || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  // Both booleans are required: a feature entry missing `canCreate` cannot be
  // repaired by recomputing it from limit/used, and guessing would either lock
  // somebody who may create or unlock somebody the server refuses.
  if (typeof f.allowed !== "boolean" || typeof f.canCreate !== "boolean") {
    return null;
  }
  return {
    allowed: f.allowed,
    canCreate: f.canCreate,
    requiresTier: (typeof f.requiresTier === "string"
      ? f.requiresTier
      : "plus") as Tier,
    limit: typeof f.limit === "number" ? f.limit : null,
    used: typeof f.used === "number" ? f.used : 0,
    remaining: typeof f.remaining === "number" ? f.remaining : null,
    resetsAt: typeof f.resetsAt === "string" ? f.resetsAt : null,
    window: (typeof f.window === "string" ? f.window : "lifetime") as AllowanceWindow,
  };
}

/**
 * The wire body (or a persisted seed) as the snapshot the app reads, or null
 * when it is not one.
 *
 * `enforced` must be a real boolean: defaulting it either way is a decision
 * about the launch-day contract that no client is allowed to make.
 */
export function toEntitlementsSnapshot(raw: unknown): EntitlementsSnapshot | null {
  if (!isSnapshotLike(raw)) return null;
  const r = raw as Record<string, unknown>;
  const features: Partial<Record<Feature, FeatureEntitlement>> = {};
  for (const [key, value] of Object.entries(
    r.features as Record<string, unknown>,
  )) {
    const entitlement = normalizeFeature(value);
    if (entitlement) features[key as Feature] = entitlement;
  }
  return {
    role: typeof r.role === "string" ? r.role : "user",
    tier: (typeof r.tier === "string" ? r.tier : "free") as Tier,
    enforced: r.enforced as boolean,
    grandfathered: r.grandfathered === true,
    subscription: normalizeSubscription(r.subscription),
    checkoutAvailable: r.checkoutAvailable === true,
    features,
  };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** The shared snapshot as of now, or null when there is none. */
export function getEntitlementsSnapshot(): EntitlementsSnapshot | null {
  return snapshot;
}

/** The session the snapshot is read for. Exported for `useSyncExternalStore`. */
export function getEntitlementsToken(): string | null {
  return sessionToken;
}

/** One feature's state, or null. Read `canCreate` off it; never recompute it. */
export function getFeatureEntitlement(
  feature: Feature,
): FeatureEntitlement | null {
  return snapshot?.features?.[feature] ?? null;
}

/**
 * Subscribe to every change of the snapshot or the session. Returns the
 * unsubscribe.
 */
export function subscribeToEntitlements(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ─── The session ─────────────────────────────────────────────────────────────

/** The member the persisted seed is scoped to — the same id `AuthProvider`
 *  hands `setCacheMemberId`, so the two agree on whose cache this is. */
function memberScope(token: string | null): string | null | undefined {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (payload?.userId) return String(payload.userId);
  return undefined;
}

/**
 * Tell the store which session it is reading for. Called by `AuthProvider` on
 * every session change, so a sign-in, a sliding-session roll and a sign-out all
 * arrive here.
 *
 * A DIFFERENT token drops the snapshot immediately rather than at the next
 * read: it is not stale data, it is somebody else's plan.
 */
export function setEntitlementsToken(token: string | null): void {
  if (token === sessionToken) return;
  sessionToken = token;
  resetEntitlementsSnapshot();
}

// ─── The request ─────────────────────────────────────────────────────────────

/**
 * One request, identified by `seq` and dispatched for `token`.
 *
 * Never rejects: every failure path leaves the last snapshot standing. A gate
 * is a product boundary, not a security one, and the server refuses either way.
 */
async function fetchSnapshot(
  seq: number,
  token: string | null,
): Promise<EntitlementsSnapshot | null> {
  // Signed out — nothing to read. The snapshot was already dropped in `load`.
  if (!token) return snapshot;
  try {
    // `apiFetch` puts `tz` (minutes west of UTC, from the device clock) on the
    // query for every date-scoped read, which `/api/me/*` is. It is what makes
    // `resetsAt` the member's local midnight / Monday rather than UTC's — the
    // windowed ALLOWANCES themselves are keyed on the member's stored zone
    // server-side and never on this number.
    const raw = await apiFetch("/api/me/entitlements", EntitlementsResponseSchema, {
      method: "GET",
      getToken: () => token,
      baseUrl: config.baseUrl,
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
    });
    const data = toEntitlementsSnapshot(raw);
    if (!data) return snapshot;
    // Landed after the client learned this answer was out of date. Writing it
    // would be wrong twice over: the stale counts would replace the truth, AND
    // `fetchedAt` would certify them fresh for another whole TTL — the lock
    // outliving the delete that cleared it, which is the bug this guards.
    // Dropping it leaves the cache exactly as stale as it already was, so the
    // next reader refetches, and it fails OPEN: a discard never locks anything.
    if (seq <= supersededSeq) return snapshot;
    snapshot = data;
    fetchedAt = Date.now();
    fetchedForToken = token;
    void writeCache(
      ENTITLEMENTS_CACHE_KEY,
      data,
      memberScope(token),
      config.storage,
    );
    emit();
    return snapshot;
  } catch {
    // Offline, a 5xx, a body the schema rejected — the last snapshot stands.
    return snapshot;
  }
}

async function load(force: boolean): Promise<EntitlementsSnapshot | null> {
  // Identity check FIRST: a different (or absent) token means the cached
  // snapshot belongs to someone else.
  const token = sessionToken;
  if (snapshot && token !== fetchedForToken) resetEntitlementsSnapshot();

  if (!force && snapshot && Date.now() - fetchedAt < ENTITLEMENTS_TTL_MS) {
    return snapshot;
  }

  // Adopting the request already on the wire is what makes "one request per
  // screen" true, and it holds for an ordinary read.
  //
  // It does NOT hold for a FORCED read. `refresh()` is called because the
  // member just created or deleted something; a request dispatched before that
  // write cannot possibly contain it, and adopting it would answer with the
  // pre-change counts and then certify them for a full TTL.
  //
  // Nor does it hold for a request already marked superseded — after an
  // `invalidateEntitlements()` the next reader is promised the truth, not the
  // answer that was already in the air when the row was deleted.
  if (!force && inflight && inflightSeq > supersededSeq) return inflight;

  const seq = ++requestSeq;
  // A forced read declares everything already on the wire out of date. Merely
  // declining to adopt them is not enough: one could still land first and stamp
  // its stale answer over the top.
  if (force) supersededSeq = seq - 1;

  const request = fetchSnapshot(seq, token).finally(() => {
    // Only the current occupant may vacate the slot — an older request settling
    // late must not clear a newer one out of it.
    if (inflightSeq === seq) inflight = null;
  });
  inflight = request;
  inflightSeq = seq;
  return request;
}

/**
 * Fetch (or revalidate) the shared snapshot.
 *
 * `force` is "I just changed something": it dispatches its own request and
 * declares everything already on the wire out of date.
 */
export function loadEntitlements(
  force = false,
): Promise<EntitlementsSnapshot | null> {
  return load(force);
}

// ─── The persisted seed ──────────────────────────────────────────────────────

/**
 * Paint the plan state this member last saw, from AsyncStorage.
 *
 * Never fatal, never throws, and never stamps `fetchedAt`: a seed is a first
 * paint, not a fresh read, so the very next `loadEntitlements()` still goes to
 * the network. Scoped to the member by `lib/cache/lastKnown`, and dropped with
 * every other `become.cache.*` key on sign-out.
 */
export async function seedEntitlementsFromCache(): Promise<EntitlementsSnapshot | null> {
  if (snapshot) return snapshot;
  // SIGNED OUT PAINTS NOTHING. Without this the seed is read with no member to
  // scope it to, `lib/cache/lastKnown` falls back to whichever member id is
  // still active, and the snapshot the app had just dropped on sign-out is
  // painted straight back — the previous member's tier, on the next member's
  // first screen. There is no plan to show somebody who is not signed in.
  if (!sessionToken) return snapshot;
  const memberId = memberScope(sessionToken);
  const cached =
    getCachedSync<unknown>(
      ENTITLEMENTS_CACHE_KEY,
      memberId,
      ENTITLEMENTS_SEED_MAX_AGE_MS,
    ) ??
    (await readCache<unknown>(
      ENTITLEMENTS_CACHE_KEY,
      memberId,
      ENTITLEMENTS_SEED_MAX_AGE_MS,
      config.storage,
    ));
  // A real response (or a sign-out) can land while storage is being read. It
  // wins: the seed is the oldest thing we have.
  if (snapshot) return snapshot;
  if (memberId !== memberScope(sessionToken)) return snapshot;
  const seeded = toEntitlementsSnapshot(cached);
  if (!seeded) return snapshot;
  snapshot = seeded;
  fetchedForToken = sessionToken;
  emit();
  return snapshot;
}

// ─── Invalidation ────────────────────────────────────────────────────────────

/**
 * Mark the snapshot STALE without dropping it and without fetching.
 *
 * The delete-side counterpart to a forced `loadEntitlements(true)`. Deleting a
 * row frees an inventory slot server-side immediately, but the TTL means the
 * client keeps answering `canCreate: false` from the snapshot it took while the
 * member was still at the cap — the lock outlives the thing that cleared it,
 * and the only way out (delete one) looks like it did nothing.
 *
 * It invalidates rather than refetches on purpose, so a screen that renders no
 * gate at all can call it from a delete handler without suddenly issuing
 * entitlement requests. The next real reader picks up the truth. A screen that
 * stays mounted through the delete should force a read instead: it needs the
 * lock to clear on screen now, not on the next mount.
 */
export function invalidateEntitlements(): void {
  fetchedAt = 0;
  // Expiring the TTL is only half of it. A request already on the wire was
  // dispatched before the delete that prompted this call, so when it lands it
  // writes its pre-delete counts and sets `fetchedAt` again — restoring the
  // very window this call just cleared, invisibly.
  supersededSeq = requestSeq;
}

/**
 * Drop the in-memory snapshot. Called on an identity change and on sign-out.
 *
 * Synchronous and total: after this the app knows nothing about anybody's plan,
 * which renders no lock and no counter at all.
 */
export function resetEntitlementsSnapshot(): void {
  snapshot = null;
  fetchedAt = 0;
  fetchedForToken = null;
  // A request dispatched for the PREVIOUS identity is not merely stale, it is
  // somebody else's plan. It must never land in the cache.
  supersededSeq = requestSeq;
  emit();
}

/**
 * Sign-out: drop the snapshot AND the persisted seed, and forget the session.
 *
 * `AuthProvider`'s `clearAllLastKnownCache()` already removes every
 * `become.cache.*` key, so this is belt and braces for a caller that ends a
 * session without going through it (a test, a deleted account).
 */
export async function clearEntitlements(): Promise<void> {
  const memberId = memberScope(sessionToken);
  sessionToken = null;
  resetEntitlementsSnapshot();
  await clearCache(ENTITLEMENTS_CACHE_KEY, memberId, config.storage);
}
