/**
 * ─── COMING BACK FROM CHECKOUT OR THE PORTAL (NP-054) ────────────────────────
 *
 * The purchase leaves the app entirely: `startCheckout` hands Stripe's URL to
 * the device browser, and Stripe returns the buyer to Safari — which has never
 * held their session — on a PUBLIC page (`/billing/return`,
 * `/billing/cancelled`, `/billing/portal-return`, NP-051). That page carries a
 * `become://?billing=…[&session_id=…]` button back into the app, and the
 * resolver lands it on the plan page (`/plan`), the only screen that tells a
 * member which plan they are on.
 *
 * Two halves, and both are needed:
 *
 *   1. ON ARRIVAL the plan page calls `GET /api/billing/status?session_id=`
 *      (which activates from the session after checking `client_reference_id`
 *      against the signed-in member) and then `refresh()`es the entitlements
 *      store — the web's return-URL activation
 *      (`webapp/app/dashboard/plan/PlanPageClient.tsx`), ported rather than
 *      reinvented. The session id is only a hint and the server checks it
 *      against the signed-in member; no amount or date is computed on the
 *      device.
 *   2. ON FOREGROUND the app re-reads status and entitlements whenever it
 *      becomes active after a checkout or portal handover was remembered. The
 *      member may come back through the app switcher rather than the return
 *      button — no params, no activation — and the webhook usually lands
 *      first, so the re-read retries for a few seconds until the tier changes.
 *
 * A portal cancellation shows as `subscription.cancelAtPeriodEnd`: Plus until
 * the period end, then it stops. That is the snapshot's own field, rendered by
 * the plan page's `CurrentPlan` card — this module only makes sure the fresh
 * snapshot is read.
 */

import { AppState, type AppStateStatus } from "react-native";
import { fetchBillingStatus, type BillingDeps } from "./billing";
import { loadEntitlements } from "./store";

/** What the app remembers about leaving for the browser. */
export type BillingHandoverKind = "checkout" | "portal";

/** How long the foreground re-read keeps retrying after a handover. */
export const BILLING_RETURN_RETRY_MS = 8_000;

/** How long between re-read attempts. */
export const BILLING_RETURN_RETRY_INTERVAL_MS = 2_000;

/** The tier the re-read is waiting to see change. */
export type BillingTierReader = () => string | null | undefined;

export interface BillingReturnDeps extends BillingDeps {
  /**
   * The tier as of now. Defaults to reading the entitlements snapshot, so the
   * retry stops as soon as the webhook (or the activation) lands.
   */
  getTier?: BillingTierReader;
  /** Force a fresh entitlements read. Defaults to the store's `loadEntitlements`. */
  reloadEntitlements?: (force: boolean) => Promise<unknown>;
  /** Clock injection, so a test does not wait out the retry window. */
  now?: () => number;
  /** Sleep injection, so a test does not wait out the retry window. */
  sleep?: (ms: number) => Promise<void>;
  /** Subscribe to foreground/background changes (DI for tests). */
  subscribeToAppState?: (
    listener: (status: AppStateStatus) => void,
  ) => () => void;
}

function defaultSubscribeToAppState(
  listener: (status: AppStateStatus) => void,
): () => void {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultNow(): number {
  return Date.now();
}

/**
 * Is this a Stripe Checkout Session id and nothing else?
 *
 * The value arrives on a query string a member (or anybody who can send them
 * a link) can edit, and it is about to be sent to the server as a hint. The
 * server still checks it against the signed-in member — this only stops
 * arbitrary text being sent as a session id in the first place.
 */
export function isSessionIdHint(value: unknown): value is string {
  return (
    typeof value === "string" && /^cs_[A-Za-z0-9_]{4,200}$/.test(value.trim())
  );
}

/**
 * Activate from a success return, then refresh plan state.
 *
 * The status call carries the session hint (the server activates from it after
 * checking it against the member); the refresh is what makes the plan page
 * show it — a forced read, so it cannot be served from a pre-purchase request
 * still in flight. Never throws: the webhook remains the source of truth, and
 * this only saves the member the seconds Stripe takes to call us.
 *
 * Order matters and is pinned by test: status FIRST, then entitlements.
 */
export async function activateFromCheckoutReturn(
  sessionId: string | null | undefined,
  deps: BillingReturnDeps = {},
): Promise<void> {
  const hint = typeof sessionId === "string" ? sessionId.trim() : "";
  try {
    await fetchBillingStatus(
      deps,
      isSessionIdHint(hint) ? hint : undefined,
    );
  } catch {
    // Never fatal — the refresh below still picks up the webhook's answer.
  }
  try {
    const reload = deps.reloadEntitlements ?? loadEntitlements;
    await reload(true);
  } catch {
    // The store fails open; a failed refresh leaves the last snapshot standing.
  }
}

/**
 * Re-read status and entitlements, retrying until the tier changes.
 *
 * The webhook usually lands first, so the first read already shows Plus and
 * this returns after one pass. When it has not landed yet the reads repeat
 * every `BILLING_RETURN_RETRY_INTERVAL_MS` until `BILLING_RETURN_RETRY_MS`
 * have passed or the tier moves — whichever comes first. Never throws.
 */
export async function rereadBillingUntilTierChanges(
  deps: BillingReturnDeps = {},
): Promise<void> {
  const getTier =
    deps.getTier ??
    (() => {
      try {
        // Lazy so this module does not cycle-import the store at load time.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const store = require("./store") as {
          getEntitlementsSnapshot: () => { tier?: unknown } | null;
        };
        const snapshot = store.getEntitlementsSnapshot();
        return typeof snapshot?.tier === "string" ? snapshot.tier : null;
      } catch {
        return null;
      }
    });
  const reload = deps.reloadEntitlements ?? loadEntitlements;
  const now = deps.now ?? defaultNow;
  const sleep = deps.sleep ?? defaultSleep;
  const startedTier = getTier();
  const deadline = now() + BILLING_RETURN_RETRY_MS;
  for (;;) {
    try {
      await fetchBillingStatus(deps);
    } catch {
      // A failed status read must not skip the entitlements refresh.
    }
    try {
      await reload(true);
    } catch {
      // The store fails open.
    }
    if (getTier() !== startedTier) return;
    if (now() >= deadline) return;
    await sleep(BILLING_RETURN_RETRY_INTERVAL_MS);
  }
}

// ─── The remembered handover ─────────────────────────────────────────────────

let pendingHandover: BillingHandoverKind | null = null;

/**
 * Remember that a checkout or portal URL was opened in the device browser.
 * Called wherever the handover happens — the plan page and the sheet both
 * open through `openExternally`, so both call this first.
 */
export function rememberBillingHandover(kind: BillingHandoverKind): void {
  pendingHandover = kind;
}

/** What handover, if any, is still waiting for its foreground re-read. */
export function pendingBillingHandover(): BillingHandoverKind | null {
  return pendingHandover;
}

/** Clear the remembered handover (tests, and sign-out). */
export function clearBillingHandover(): void {
  pendingHandover = null;
}

/**
 * The foreground re-read behind `BillingReturnBridge`.
 *
 * Returns true when there was a handover to consume. Consumes it FIRST, so a
 * second foregrounding while the first re-read is still retrying does not
 * stack a second one.
 */
export async function consumeBillingHandover(
  deps: BillingReturnDeps = {},
): Promise<boolean> {
  if (!pendingHandover) return false;
  pendingHandover = null;
  await rereadBillingUntilTierChanges(deps);
  return true;
}

/**
 * Call `onForeground` whenever the app becomes active.
 *
 * A tiny wrapper over `AppState`, injectable so a test needs no device. The
 * listener fires only on transitions INTO `active` — the subscription itself
 * mounting while the app is already active is not a return from anywhere.
 */
export function onAppForeground(
  onForeground: () => void,
  subscribe: BillingReturnDeps["subscribeToAppState"] = defaultSubscribeToAppState,
): () => void {
  const subscribeFn = subscribe ?? defaultSubscribeToAppState;
  return subscribeFn((status) => {
    if (status === "active") onForeground();
  });
}
