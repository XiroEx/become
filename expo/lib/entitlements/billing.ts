/**
 * ─── THE NATIVE SIDE OF BUYING PLUS (NP-052) ──────────────────────────────────
 *
 * The web sheet starts a Stripe Checkout session and then does
 * `window.location.assign(url)`. On a phone there is no such thing: decision
 * 9/20 is that Plus may be sold from the iOS app only through an EXTERNAL LINK
 * on the US storefront (App Review 3.1.1(a)), so the purchase has to leave the
 * app entirely.
 *
 * Hence the two rules this module exists to hold:
 *
 *   1. `Linking.openURL` and NEVER `expo-web-browser`. An in-app browser
 *      (`SFSafariViewController` / Custom Tabs) is still "inside the app" as far
 *      as 3.1.1 is concerned, and it is the single easiest way to fail review on
 *      a monetisation rule. `__tests__/upgradeSheet.test.tsx` reads these files
 *      as text and fails if an import of `expo-web-browser` ever appears on the
 *      checkout path.
 *   2. `returnTo: 'app'` on both POSTs (NP-051). Stripe returns a native buyer
 *      to Safari, which has never held their session — `middleware.ts` guards
 *      `/dashboard/*`, so without this they land on `/login` seconds after being
 *      charged. `'app'` swaps in the PUBLIC `/billing/*` pages, which render
 *      signed out and carry a `become://` button back into the app.
 *
 * The STATE MACHINE is the web's, ported rather than reinvented:
 * `webapp/components/UpgradeSheet.tsx#checkoutRefusalState`. It cannot be
 * imported (it lives in a Next.js client component) and it must not drift, so
 * `__tests__/upgradeSheet.test.tsx` reads that file and asserts the same codes
 * and statuses appear on both sides. A REFUSED checkout is not an ABSENT one:
 * only 404 / 503 / `billing_not_configured` mean "there is nothing to buy", and
 * the member whose card just failed must be offered the portal rather than told
 * the product is not for sale.
 *
 * NOTHING HERE NAMES AN AMOUNT, A TRIAL OR A DATE. Prices live in one constant
 * on the server (`PLAN_PRICING`) and reach a client only as display strings from
 * `GET /api/billing/plans`, which this module does not read.
 */

import { Linking } from "react-native";
import {
  ApiError,
  BillingPlansResponseSchema,
  BillingStatusResponseSchema,
  CheckoutResponseSchema,
  PortalResponseSchema,
  apiFetch,
  type BillingPlan,
  type BillingPlansResponse,
  type BillingReturnTarget,
  type BillingStatusResponse,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { sessionStore, type TokenStore } from "@/lib/auth/secureStoreToken";

/**
 * What the sheet knows about checkout right now. The same union as
 * `webapp/components/UpgradeSheet.tsx#CheckoutState`.
 *
 * The first four are the availability probe's answers; the last three are
 * refusals of a checkout that was actually ATTEMPTED, and they are separate
 * states because they need separate exits: a card to fix, a purchase that would
 * be a second one, and a failure worth retrying. Only 'unavailable' means "not
 * for sale yet".
 */
export type CheckoutState =
  | "checking"
  | "ready"
  | "starting"
  | "unavailable"
  | "fix-payment"
  | "already-plus"
  | "error";

/** Where the "update your card" button is while the portal call is in flight. */
export type PortalState = "idle" | "opening" | "failed";

/**
 * The plan the SHEET can start. Monthly, and deliberately only monthly: the
 * sheet appears mid-task, on top of whatever the member was doing, and asking
 * them to compare billing periods there is the wrong question at the wrong
 * moment. The annual price lives on the plan page (NP-050), which posts its own.
 */
export const CHECKOUT_PLAN: BillingPlan = "monthly";

/**
 * Who Stripe returns this buyer to. ALWAYS 'app' from the phone (NP-051) — see
 * the header: 'web' would land them on a signed-out `/dashboard/plan`.
 */
export const NATIVE_RETURN_TO: BillingReturnTarget = "app";

/**
 * Fallback only. The 409 that raises 'fix-payment' carries the portal path in
 * its body and THAT is what gets followed; this is what we use if a future
 * response stops sending it, so the button still goes somewhere real.
 */
export const PORTAL_PATH = "/api/billing/portal";

export const CHECKOUT_PATH = "/api/billing/checkout";
export const BILLING_STATUS_PATH = "/api/billing/status";
export const BILLING_PLANS_PATH = "/api/billing/plans";

/** Which billing periods actually have a price configured. */
export interface PlanAvailability {
  monthly: boolean;
  annual: boolean;
}

export interface BillingStatusResult {
  configured: boolean;
  plans: PlanAvailability;
  subscription?: BillingStatusResponse["subscription"];
}

/** Everything this module touches outside itself, so a test needs no device. */
export interface BillingDeps {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Where the session JWT lives. Defaults to `become.session`. */
  store?: TokenStore;
  /**
   * How a URL leaves the app. Defaults to `Linking.openURL`, which hands it to
   * Safari / Chrome. NEVER `expo-web-browser` — see the file header.
   */
  openUrl?: (url: string) => Promise<unknown>;
  /** Which plan to buy. Defaults to CHECKOUT_PLAN ('monthly'). */
  plan?: BillingPlan;
}

function baseUrlOf(deps: BillingDeps): string {
  return (deps.baseUrl ?? WEBAPP_BASE_URL).replace(/\/$/, "");
}

/**
 * The session, read straight from the secure store rather than from React —
 * `openWebSignedIn` does the same, and it keeps this module callable from
 * outside a component tree.
 */
function tokenReader(deps: BillingDeps): () => Promise<string | undefined> {
  const store = deps.store ?? sessionStore;
  return async () => {
    try {
      return (await store.get()) ?? undefined;
    } catch {
      return undefined;
    }
  };
}

/** `baseUrl` + `getToken` + `fetchImpl`, so the three calls cannot drift. */
function requestOptions(deps: BillingDeps) {
  return {
    baseUrl: baseUrlOf(deps),
    getToken: tokenReader(deps),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  };
}

/** A non-empty string field off an unknown JSON body, or undefined. */
export function readBodyString(body: unknown, key: string): string | undefined {
  if (body === null || typeof body !== "object") return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : undefined;
}

/**
 * Map a refused `POST /api/billing/checkout` onto the state the sheet shows.
 *
 * Ported from `webapp/components/UpgradeSheet.tsx#checkoutRefusalState`, and the
 * codes are the route's own: 400 `invalid_plan`, 400 `invalid_return_to`,
 * 503 `billing_not_configured`, 409 `already_subscribed` /
 * `fix_payment_method` / `already_plus`, 502 `checkout_failed`.
 *
 *  • 404 and 503 are the only "there is nothing to buy" answers — a route that
 *    does not exist yet, and a Stripe that is not configured. The STATUS is
 *    checked before the code so a 503 with no body still reads correctly.
 *  • Everything unrecognised — a 401 on an expired token, a 400 from a plan or a
 *    `returnTo` this build sent wrong, a 502, a 500 from a proxy, a body that is
 *    not JSON — is 'error': transient, retryable, and explicitly NOT "not for
 *    sale".
 */
export function checkoutRefusalState(status: number, body: unknown): CheckoutState {
  const code = readBodyString(body, "error");
  if (status === 404 || status === 503 || code === "billing_not_configured") {
    return "unavailable";
  }
  if (code === "fix_payment_method") return "fix-payment";
  if (code === "already_plus" || code === "already_subscribed") return "already-plus";
  return "error";
}

/**
 * The dismiss button's label. "Not now" implies there is something to come back
 * for; in every state where there is not — or where the member already has what
 * this sheet is selling — it is just Close.
 */
export function dismissLabel(state: CheckoutState): string {
  return state === "ready" || state === "starting" || state === "checking"
    ? "Not now"
    : "Close";
}

/**
 * Hand a URL to the DEVICE browser — Safari on iOS, Chrome on Android.
 *
 * Resolves false when the handover itself failed, which the sheet reads as a
 * retryable error rather than a closed shop.
 */
export async function openExternally(
  url: string,
  deps: BillingDeps = {},
): Promise<boolean> {
  const open = deps.openUrl ?? Linking.openURL;
  try {
    await open(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Is checkout live? Only called when the entitlements snapshot does not already
 * answer it (`checkoutAvailable`), because a snapshot that says no is final —
 * probing would only confirm it, and every millisecond of `checking` in between
 * is a millisecond in which the sheet could show something it must take away.
 *
 * Anything other than a 200 with `configured: true` is 'unavailable': a 404
 * (route not built yet), a 503 (not configured), a body the schema rejects.
 */
export async function probeCheckoutAvailable(
  deps: BillingDeps = {},
): Promise<"ready" | "unavailable"> {
  try {
    const body = await apiFetch(BILLING_STATUS_PATH, BillingStatusResponseSchema, {
      method: "GET",
      ...requestOptions(deps),
    });
    return body.configured === true ? "ready" : "unavailable";
  } catch {
    return "unavailable";
  }
}

/**
 * Query GET /api/billing/status for configured status, per-plan availability,
 * and subscription details.
 *
 * `sessionId` is the success-return hint: the status route activates from the
 * session (after checking `client_reference_id` against the signed-in member)
 * instead of waiting for the webhook. It is only a hint — a forged id is
 * dropped server-side — and nothing about the response is trusted beyond what
 * the server says.
 */
export async function fetchBillingStatus(
  deps: BillingDeps = {},
  sessionId?: string,
): Promise<BillingStatusResult | null> {
  try {
    const path =
      sessionId && sessionId.length > 0
        ? `${BILLING_STATUS_PATH}?session_id=${encodeURIComponent(sessionId)}`
        : BILLING_STATUS_PATH;
    const body = await apiFetch(path, BillingStatusResponseSchema, {
      method: "GET",
      ...requestOptions(deps),
    });
    return {
      configured: body.configured === true,
      plans: {
        monthly: body.plans?.monthly === true,
        annual: body.plans?.annual === true,
      },
      subscription: body.subscription,
    };
  } catch {
    return null;
  }
}

/**
 * Query GET /api/billing/plans — the prices and the Free/Plus table from the API.
 */
export async function fetchBillingPlans(
  deps: BillingDeps = {},
): Promise<BillingPlansResponse | null> {
  try {
    return await apiFetch(BILLING_PLANS_PATH, BillingPlansResponseSchema, {
      method: "GET",
      ...requestOptions(deps),
    });
  } catch {
    return null;
  }
}

/** What `startCheckout` came back with. */
export type CheckoutStart =
  /** Stripe's hosted page. Open it with `openExternally`, never in-app. */
  | { kind: "url"; url: string }
  /** A refusal (or a failure), already mapped onto a sheet state. */
  | { kind: "state"; state: CheckoutState; portalPath?: string };

/**
 * Start a Stripe Checkout session for this member.
 *
 * `plan` and `returnTo` are the only two fields the route reads, and both are
 * sent explicitly: the route treats a missing `plan` as monthly and a missing
 * `returnTo` as 'web' — and on a phone that second default is the bug NP-051
 * exists to fix.
 */
export async function startCheckout(
  planOrDeps?: BillingPlan | BillingDeps,
  maybeDeps?: BillingDeps,
): Promise<CheckoutStart> {
  const plan: BillingPlan =
    typeof planOrDeps === "string"
      ? planOrDeps
      : planOrDeps?.plan ?? CHECKOUT_PLAN;
  const deps: BillingDeps =
    typeof planOrDeps === "string" ? maybeDeps ?? {} : planOrDeps ?? {};

  try {
    const body = await apiFetch(CHECKOUT_PATH, CheckoutResponseSchema, {
      method: "POST",
      body: { plan, returnTo: NATIVE_RETURN_TO },
      ...requestOptions(deps),
    });
    return { kind: "url", url: body.url };
  } catch (err) {
    if (err instanceof ApiError) {
      const state = checkoutRefusalState(err.status, err.body);
      // The route hands back the path to send them to; follow it rather than
      // assuming one.
      const portalPath = readBodyString(err.body, "portal");
      return portalPath ? { kind: "state", state, portalPath } : { kind: "state", state };
    }
    // A dropped connection, or a 2xx with nowhere to go (the schema rejected
    // it). Both are a retry, and NEITHER is "upgrades aren't open yet" — that
    // answer is sticky for the life of the sheet and this one is over in a
    // second.
    return { kind: "state", state: "error" };
  }
}

/**
 * Open Stripe's hosted billing portal — where a card is updated, and the only
 * way out of a failed payment. In the device browser, for the same reason
 * checkout is: the portal is where a subscription is bought back into good
 * standing.
 *
 * Returns false when there was nothing to open, which the sheet shows as "try
 * that again in a moment".
 */
export async function openBillingPortal(
  path: string = PORTAL_PATH,
  deps: BillingDeps = {},
): Promise<boolean> {
  let url: string;
  try {
    const body = await apiFetch(path, PortalResponseSchema, {
      method: "POST",
      body: { returnTo: NATIVE_RETURN_TO },
      ...requestOptions(deps),
    });
    url = body.url;
  } catch {
    // 503 (no portal configuration saved in the Stripe dashboard), 409 (no
    // customer in this mode), 502 — none of them are anything a member can act
    // on beyond trying again.
    return false;
  }
  return openExternally(url, deps);
}
