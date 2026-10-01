/**
 * ─── THE UPGRADE SHEET, AND THE PURCHASE THAT LEAVES THE APP (NP-052) ─────────
 *
 * Native counterpart of `webapp/tests/unit/entitlements/uiSurfaces.test.tsx` and
 * of the web sheet's own checkout-state tests. Every branch is driven through the
 * REAL component, the REAL entitlements store and a stubbed server, because all
 * three acceptance criteria are about what a member is shown and where the tap
 * takes them:
 *
 *   1. a free member at a cap sees the server's words and a button that opens
 *      Stripe Checkout in the DEVICE browser (Safari on iOS, Chrome on Android);
 *   2. with checkout not configured there is a "not yet" note and NO button;
 *   3. a member whose card failed is offered "Update payment method", which opens
 *      the Stripe portal in the device browser.
 *
 * Plus the three rules that travel with the sheet: a 429 never opens it, a 403
 * without `feature` + `requiresTier` never opens it, and no amount, trial or date
 * is ever written in it.
 *
 * `Linking.openURL` is injected as `deps.openUrl`, so the assertion is on the URL
 * that is handed OUT of the app. The ban on `expo-web-browser` is a separate,
 * textual assertion at the bottom: an in-app browser is still inside the app as
 * far as App Review 3.1.1(a) is concerned, and that is a store rejection rather
 * than a bug.
 */

import * as fs from "fs";
import * as path from "path";
import type { ReactTestInstance } from "react-test-renderer";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "@become/api-client";
import type { SheetGate } from "@become/core";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";
import { clearAll, setCacheMemberId } from "@/lib/cache/lastKnown";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import {
  CHECKOUT_OPENED_NOTE,
  CHECKOUT_WEB_NOTE,
  UpgradeSheet,
} from "@/components/entitlements/UpgradeSheet";
import { UpgradeSheetHost } from "@/components/entitlements/UpgradeSheetHost";
import { routeApiError } from "@/lib/errors";
import {
  configureEntitlementsStore,
  loadEntitlements,
  resetEntitlementsSnapshot,
  setEntitlementsToken,
} from "@/lib/entitlements";
import {
  CHECKOUT_PLAN,
  NATIVE_RETURN_TO,
  checkoutRefusalState,
  dismissLabel,
  type BillingDeps,
} from "@/lib/entitlements/billing";
import {
  getUpgradeSheetGate,
  hideUpgradeSheet,
  isSheetGate,
  showUpgradeSheet,
} from "@/lib/entitlements/upgradeSheet";

const REPO_ROOT = path.resolve(__dirname, "../..");
const NOW_MS = Date.UTC(2026, 8, 30, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

const read = (rel: string): string => {
  const file = path.join(REPO_ROOT, rel);
  expect(fs.existsSync(file)).toBe(true);
  return fs.readFileSync(file, "utf8");
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

function jwtFor(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Math.floor((NOW_MS + 30 * DAY_MS) / 1000) }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig-${userId}`;
}

const MEMBER = jwtFor("member-1");

/** The 403 `webapp/lib/entitlements.ts#gateResponse` sends, verbatim. */
const CAP_GATE: SheetGate = {
  error: "You've saved all 3 of your free custom exercises.",
  requiresTier: "plus",
  feature: "custom-exercises",
  limit: 3,
  remaining: 0,
  resetsAt: null,
  window: "lifetime",
};

function snapshot(checkoutAvailable: boolean, enforced = true) {
  return {
    role: "user",
    tier: "free",
    enforced,
    grandfathered: false,
    subscription: null,
    checkoutAvailable,
    features: {
      "custom-exercises": {
        allowed: true,
        canCreate: false,
        requiresTier: "plus",
        limit: 3,
        used: 3,
        remaining: 0,
        resetsAt: null,
        window: "lifetime",
      },
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  } as unknown as Response;
}

interface BillingCall {
  url: string;
  method: string;
  body: unknown;
  authorization: string | null;
}

/** The billing server, as a record of what it was asked and what it answered. */
function billingServer(
  answers: Partial<Record<"status" | "checkout" | "portal", () => Response>>,
): { fetchImpl: typeof fetch; calls: BillingCall[] } {
  const calls: BillingCall[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      authorization: headers.Authorization ?? null,
    });
    const which = String(url).includes("/api/billing/checkout")
      ? "checkout"
      : String(url).includes("/api/billing/status")
        ? "status"
        : "portal";
    const answer = answers[which];
    if (!answer) throw new Error(`no stub for ${which} (${url})`);
    return answer();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** Deps with a billing server attached, referentially stable for one test. */
function depsWith(
  answers: Partial<Record<"status" | "checkout" | "portal", () => Response>>,
  openUrl: (url: string) => Promise<unknown> = jest.fn(async () => true),
): { deps: BillingDeps; calls: BillingCall[]; openUrl: typeof openUrl } {
  const server = billingServer(answers);
  return {
    deps: {
      baseUrl: "https://example.test",
      store: createMemoryTokenStore(MEMBER),
      fetchImpl: server.fetchImpl,
      openUrl,
    },
    calls: server.calls,
    openUrl,
  };
}

/** Every string rendered anywhere in the tree, joined. */
function renderedText(node: ReactTestInstance): string {
  const parts: string[] = [];
  const walk = (n: ReactTestInstance | string): void => {
    if (typeof n === "string") {
      parts.push(n);
      return;
    }
    for (const child of n.children) walk(child as ReactTestInstance | string);
  };
  walk(node);
  return parts.join(" ");
}

let storage: AsyncStorageLike;
let entitlementsBody: unknown = snapshot(true);

const entitlementsFetch = (async () =>
  jsonResponse(200, entitlementsBody)) as unknown as typeof fetch;

/**
 * Put the plan snapshot in the store and WAIT for it, so the sheet's first render
 * already knows whether checkout is available. Without that wait every test would
 * also exercise the cold-open path, where the snapshot is unknown and the sheet
 * probes — which is a different test (below).
 */
async function withSnapshot(body: unknown): Promise<void> {
  entitlementsBody = body;
  setEntitlementsToken(MEMBER);
  await loadEntitlements(true);
}

beforeEach(async () => {
  storage = createMemoryAsyncStorage();
  await clearAll(storage);
  setCacheMemberId(null);
  configureEntitlementsStore({
    baseUrl: "https://example.test",
    fetchImpl: entitlementsFetch,
    storage,
  });
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
  hideUpgradeSheet();
  entitlementsBody = snapshot(true);
  jest.spyOn(Date, "now").mockImplementation(() => NOW_MS);
});

afterEach(async () => {
  jest.restoreAllMocks();
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
  hideUpgradeSheet();
  await clearAll(storage);
});

// ─── 1. The words, and the button that leaves the app ────────────────────────

describe("a free member at a cap", () => {
  it("sees the server's refusal verbatim, the allowance line, and no price", async () => {
    await withSnapshot(snapshot(true));
    const { deps } = depsWith({});

    const screen = render(
      <UpgradeSheet open gate={CAP_GATE} onClose={jest.fn()} deps={deps} />,
    );

    await waitFor(() => expect(screen.getByTestId("upgrade-sheet-cta")).toBeTruthy());

    // The 403's own wording, not a word of ours.
    expect(screen.getByTestId("upgrade-sheet-error")).toHaveTextContent(
      "You've saved all 3 of your free custom exercises.",
    );
    // `allowanceLine` from @become/core — the same sentence the web renders.
    expect(screen.getByTestId("upgrade-sheet-allowance")).toHaveTextContent(
      "You're using all 3 of your free slots. Delete one to free a slot, or upgrade for unlimited.",
    );
    expect(screen.getByTestId("upgrade-sheet-headline")).toHaveTextContent(
      "Unlimited custom exercises are a Plus feature",
    );
    expect(screen.getByTestId("upgrade-sheet-tier")).toHaveTextContent("Plus");

    // NO AMOUNT, NO TRIAL, NO DATE. A price typed into the app can only be
    // changed by a store release; the server's can change with a deploy.
    const text = renderedText(screen.UNSAFE_root);
    expect(text).not.toMatch(/\$|USD|£|€/);
    expect(text).not.toMatch(/\btrial\b/i);
    expect(text).not.toMatch(/per month|a month|per year|a year|monthly|annual/i);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("says the purchase continues on the website BEFORE the tap", async () => {
    await withSnapshot(snapshot(true));
    const { deps } = depsWith({});

    const screen = render(
      <UpgradeSheet open gate={CAP_GATE} onClose={jest.fn()} deps={deps} />,
    );

    const cta = await waitFor(() => screen.getByTestId("upgrade-sheet-cta"));
    // The CTA itself names where the purchase happens — an external-link button
    // that reads "Upgrade to Plus" and silently switches apps is the surprise
    // this wording exists to remove.
    expect(cta.props.accessibilityLabel).toBe("Upgrade to Plus on the website");
    expect(screen.getByTestId("upgrade-sheet-cta-note")).toHaveTextContent(
      CHECKOUT_WEB_NOTE,
    );
    expect(CHECKOUT_WEB_NOTE).toMatch(/website/);
    expect(CHECKOUT_WEB_NOTE).toMatch(/browser/);
  });

  it("hands Stripe's URL to the device browser, with plan monthly and returnTo app", async () => {
    await withSnapshot(snapshot(true));
    const { deps, calls, openUrl } = depsWith({
      checkout: () =>
        jsonResponse(200, { url: "https://checkout.stripe.com/c/pay/cs_test_123" }),
    });

    const screen = render(
      <UpgradeSheet open gate={CAP_GATE} onClose={jest.fn()} deps={deps} />,
    );
    const cta = await waitFor(() => screen.getByTestId("upgrade-sheet-cta"));

    await act(async () => {
      fireEvent.press(cta);
    });

    await waitFor(() => expect(openUrl).toHaveBeenCalledTimes(1));
    expect(openUrl).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_123");

    const checkout = calls.find((c) => c.url.includes("/api/billing/checkout"));
    expect(checkout).toBeDefined();
    expect(checkout?.method).toBe("POST");
    // `returnTo: 'app'` (NP-051): Stripe returns a native buyer to Safari, which
    // holds no session, so the dashboard would bounce them to /login seconds
    // after they paid. 'app' swaps in the public /billing/* pages.
    expect(checkout?.body).toEqual({ plan: CHECKOUT_PLAN, returnTo: NATIVE_RETURN_TO });
    expect(checkout?.body).toEqual({ plan: "monthly", returnTo: "app" });
    expect(checkout?.authorization).toBe(`Bearer ${MEMBER}`);

    // And the sheet is not left spinning: the member is in the browser now and
    // comes back to this screen.
    await waitFor(() =>
      expect(screen.getByTestId("upgrade-sheet-cta-opened")).toHaveTextContent(
        CHECKOUT_OPENED_NOTE,
      ),
    );
  });

  it("treats a browser that refused to open as retryable, never as not-for-sale", async () => {
    await withSnapshot(snapshot(true));
    const { deps } = depsWith(
      { checkout: () => jsonResponse(200, { url: "https://checkout.stripe.com/c/x" }) },
      jest.fn(async () => {
        throw new Error("no handler for https");
      }),
    );

    const screen = render(
      <UpgradeSheet open gate={CAP_GATE} onClose={jest.fn()} deps={deps} />,
    );
    const cta = await waitFor(() => screen.getByTestId("upgrade-sheet-cta"));
    await act(async () => {
      fireEvent.press(cta);
    });

    await waitFor(() =>
      expect(screen.getByTestId("upgrade-sheet-checkout-error")).toBeTruthy(),
    );
    expect(screen.getByTestId("upgrade-sheet-retry")).toBeTruthy();
    expect(screen.queryByTestId("upgrade-sheet-unavailable")).toBeNull();
  });
});

// ─── 2. Checkout not configured ──────────────────────────────────────────────

describe("with checkout not configured", () => {
  it("shows the not-yet note, no button, and does not even probe", async () => {
    await withSnapshot(snapshot(false));
    const { deps, calls } = depsWith({});

    const screen = render(
      <UpgradeSheet open gate={CAP_GATE} onClose={jest.fn()} deps={deps} />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("upgrade-sheet-unavailable")).toHaveTextContent(
        /Upgrades aren't open yet\. Everything you've made stays yours\./,
      ),
    );
    expect(screen.queryByTestId("upgrade-sheet-cta")).toBeNull();
    expect(screen.queryByTestId("upgrade-sheet-cta-note")).toBeNull();
    // The snapshot already said no. Probing could only confirm it, and every
    // millisecond of "checking" is a millisecond the sheet could show a button it
    // must take away.
    expect(calls).toHaveLength(0);
    // The refusal is still explained in the server's words, and the member's work
    // is still theirs.
    expect(screen.getByTestId("upgrade-sheet-error")).toHaveTextContent(
      "You've saved all 3 of your free custom exercises.",
    );
    expect(screen.getByTestId("upgrade-sheet-dismiss")).toHaveTextContent("Close");
  });

  it("falls back to the probe with no snapshot, and reads 404 as not-yet", async () => {
    // No plan snapshot at all (a cold open): `checkoutAvailable` is unknown, which
    // is the only case that costs a request.
    const { deps, calls } = depsWith({
      status: () => jsonResponse(404, { error: "Not found" }),
    });

    const screen = render(
      <UpgradeSheet open gate={CAP_GATE} onClose={jest.fn()} deps={deps} />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("upgrade-sheet-unavailable")).toBeTruthy(),
    );
    expect(screen.queryByTestId("upgrade-sheet-cta")).toBeNull();
    expect(calls.some((c) => c.url.includes("/api/billing/status"))).toBe(true);
  });

  it("draws the CTA when the probe says configured", async () => {
    const { deps } = depsWith({
      status: () => jsonResponse(200, { configured: true, mode: "test" }),
    });

    const screen = render(
      <UpgradeSheet open gate={CAP_GATE} onClose={jest.fn()} deps={deps} />,
    );

    await waitFor(() => expect(screen.getByTestId("upgrade-sheet-cta")).toBeTruthy());
  });

  it("reads a 503 from checkout itself as not-yet", async () => {
    await withSnapshot(snapshot(true));
    const { deps } = depsWith({
      checkout: () => jsonResponse(503, { error: "billing_not_configured" }),
    });

    const screen = render(
      <UpgradeSheet open gate={CAP_GATE} onClose={jest.fn()} deps={deps} />,
    );
    const cta = await waitFor(() => screen.getByTestId("upgrade-sheet-cta"));
    await act(async () => {
      fireEvent.press(cta);
    });

    await waitFor(() =>
      expect(screen.getByTestId("upgrade-sheet-unavailable")).toBeTruthy(),
    );
  });
});

// ─── 3. The card that failed ─────────────────────────────────────────────────

describe("a member whose card failed", () => {
  it("is offered Update payment method, which opens the portal in the browser", async () => {
    await withSnapshot(snapshot(true));
    const { deps, calls, openUrl } = depsWith({
      checkout: () =>
        jsonResponse(409, {
          error: "fix_payment_method",
          status: "past_due",
          portal: "/api/billing/portal",
        }),
      portal: () =>
        jsonResponse(200, { url: "https://billing.stripe.com/p/session/test_456" }),
    });

    const screen = render(
      <UpgradeSheet open gate={CAP_GATE} onClose={jest.fn()} deps={deps} />,
    );
    const cta = await waitFor(() => screen.getByTestId("upgrade-sheet-cta"));
    await act(async () => {
      fireEvent.press(cta);
    });

    // NOT "upgrades aren't open yet": there IS a subscription, it just cannot be
    // charged, and selling a second one would bill them twice.
    await waitFor(() =>
      expect(screen.getByTestId("upgrade-sheet-fix-payment")).toHaveTextContent(
        /Your payment method needs updating\./,
      ),
    );
    expect(screen.queryByTestId("upgrade-sheet-unavailable")).toBeNull();
    const portalButton = screen.getByTestId("upgrade-sheet-portal");
    expect(portalButton.props.accessibilityLabel).toBe("Update payment method");

    await act(async () => {
      fireEvent.press(portalButton);
    });

    await waitFor(() => expect(openUrl).toHaveBeenCalledTimes(1));
    expect(openUrl).toHaveBeenCalledWith(
      "https://billing.stripe.com/p/session/test_456",
    );
    const portalCall = calls.find((c) => c.url.includes("/api/billing/portal"));
    expect(portalCall?.method).toBe("POST");
    // The portal opens in Safari too, so it needs the public return page.
    expect(portalCall?.body).toEqual({ returnTo: "app" });
  });

  it("says try again when the portal would not open, and keeps the button", async () => {
    await withSnapshot(snapshot(true));
    const { deps } = depsWith({
      checkout: () =>
        jsonResponse(409, { error: "fix_payment_method", portal: "/api/billing/portal" }),
      portal: () => jsonResponse(503, { error: "billing_portal_not_configured" }),
    });

    const screen = render(
      <UpgradeSheet open gate={CAP_GATE} onClose={jest.fn()} deps={deps} />,
    );
    const cta = await waitFor(() => screen.getByTestId("upgrade-sheet-cta"));
    await act(async () => {
      fireEvent.press(cta);
    });
    const portalButton = await waitFor(() => screen.getByTestId("upgrade-sheet-portal"));
    await act(async () => {
      fireEvent.press(portalButton);
    });

    await waitFor(() =>
      expect(screen.getByTestId("upgrade-sheet-portal-failed")).toHaveTextContent(
        /Billing didn't open just now\./,
      ),
    );
    expect(screen.getByTestId("upgrade-sheet-portal")).toBeTruthy();
  });
});

// ─── The rest of the state machine ───────────────────────────────────────────

describe("the other refusals", () => {
  it.each([
    ["already_subscribed", 409],
    ["already_plus", 409],
  ])("shows nothing-to-buy for %s", async (code, status) => {
    await withSnapshot(snapshot(true));
    const { deps } = depsWith({ checkout: () => jsonResponse(status, { error: code }) });

    const screen = render(
      <UpgradeSheet open gate={CAP_GATE} onClose={jest.fn()} deps={deps} />,
    );
    const cta = await waitFor(() => screen.getByTestId("upgrade-sheet-cta"));
    await act(async () => {
      fireEvent.press(cta);
    });

    await waitFor(() =>
      expect(screen.getByTestId("upgrade-sheet-already-plus")).toHaveTextContent(
        /You already have Plus on this account/,
      ),
    );
    expect(screen.queryByTestId("upgrade-sheet-unavailable")).toBeNull();
  });

  it("offers a retry for a 502, which must never read as not-for-sale", async () => {
    await withSnapshot(snapshot(true));
    let attempts = 0;
    const { deps, openUrl } = depsWith({
      checkout: () => {
        attempts += 1;
        return attempts === 1
          ? jsonResponse(502, { error: "checkout_failed" })
          : jsonResponse(200, { url: "https://checkout.stripe.com/c/pay/second" });
      },
    });

    const screen = render(
      <UpgradeSheet open gate={CAP_GATE} onClose={jest.fn()} deps={deps} />,
    );
    const cta = await waitFor(() => screen.getByTestId("upgrade-sheet-cta"));
    await act(async () => {
      fireEvent.press(cta);
    });

    const retry = await waitFor(() => screen.getByTestId("upgrade-sheet-retry"));
    expect(screen.queryByTestId("upgrade-sheet-unavailable")).toBeNull();

    await act(async () => {
      fireEvent.press(retry);
    });
    await waitFor(() => expect(openUrl).toHaveBeenCalledTimes(1));
    expect(openUrl).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/second");
  });

  it("maps every refusal exactly as the web sheet does", () => {
    expect(checkoutRefusalState(404, null)).toBe("unavailable");
    expect(checkoutRefusalState(503, null)).toBe("unavailable");
    expect(checkoutRefusalState(503, { error: "billing_not_configured" })).toBe(
      "unavailable",
    );
    expect(checkoutRefusalState(409, { error: "fix_payment_method" })).toBe(
      "fix-payment",
    );
    expect(checkoutRefusalState(409, { error: "already_plus" })).toBe("already-plus");
    expect(checkoutRefusalState(409, { error: "already_subscribed" })).toBe(
      "already-plus",
    );
    // Everything unrecognised is retryable, and explicitly NOT "not for sale".
    expect(checkoutRefusalState(401, { error: "Unauthorized" })).toBe("error");
    expect(checkoutRefusalState(400, { error: "invalid_plan" })).toBe("error");
    expect(checkoutRefusalState(400, { error: "invalid_return_to" })).toBe("error");
    expect(checkoutRefusalState(502, { error: "checkout_failed" })).toBe("error");
    expect(checkoutRefusalState(500, "<html>502 Bad Gateway</html>")).toBe("error");
  });

  it("only says Not now while there is something to come back for", () => {
    expect(dismissLabel("ready")).toBe("Not now");
    expect(dismissLabel("starting")).toBe("Not now");
    expect(dismissLabel("checking")).toBe("Not now");
    expect(dismissLabel("unavailable")).toBe("Close");
    expect(dismissLabel("fix-payment")).toBe("Close");
    expect(dismissLabel("already-plus")).toBe("Close");
    expect(dismissLabel("error")).toBe("Close");
  });
});

// ─── The kill-switch, and what may never open the sheet ──────────────────────

describe("what may never open the sheet", () => {
  it("renders nothing at all while enforcement is off", async () => {
    await withSnapshot(snapshot(true, false));
    const { deps } = depsWith({});

    const screen = render(
      <UpgradeSheet open gate={CAP_GATE} onClose={jest.fn()} deps={deps} />,
    );

    await waitFor(() => expect(screen.queryByTestId("upgrade-sheet-cta")).toBeNull());
    expect(screen.queryByTestId("upgrade-sheet-error")).toBeNull();
    expect(screen.queryByTestId("upgrade-sheet-unavailable")).toBeNull();
  });

  it("renders nothing without a gate", () => {
    const screen = render(<UpgradeSheet open gate={null} onClose={jest.fn()} />);
    expect(screen.queryByTestId("upgrade-sheet-error")).toBeNull();
  });

  it("refuses a 429 and a 403 that is not a plan gate", () => {
    const onPlanGate = jest.fn((error: { gate: unknown }) =>
      showUpgradeSheet(error.gate as never),
    );

    // A spend ceiling is identical for free and Plus, so money cannot lift it.
    routeApiError(
      new ApiError(429, { error: "Too many requests", reason: "rate_limit" }),
      { onPlanGate: onPlanGate as never },
    );
    expect(onPlanGate).not.toHaveBeenCalled();
    expect(getUpgradeSheetGate()).toBeNull();

    // An ownership or role 403 carries no `feature` / `requiresTier`.
    routeApiError(new ApiError(403, { error: "Not your program" }), {
      onPlanGate: onPlanGate as never,
    });
    expect(onPlanGate).not.toHaveBeenCalled();
    expect(getUpgradeSheetGate()).toBeNull();

    // And the store itself refuses anything that is not a gate, so a future
    // caller handing it a raw error body gets nothing rather than a featureless
    // upsell with an error message in it.
    expect(isSheetGate({ error: "boom" })).toBe(false);
    expect(showUpgradeSheet({ error: "boom" } as never)).toBe(false);
    expect(showUpgradeSheet(null)).toBe(false);
    expect(getUpgradeSheetGate()).toBeNull();
  });
});

// ─── showUpgradeSheet, and the one host that answers it ──────────────────────

describe("showUpgradeSheet", () => {
  it("opens the one sheet from anywhere, and a plan-gate 403 routes into it", async () => {
    await withSnapshot(snapshot(true));
    const { deps } = depsWith({});

    const screen = render(<UpgradeSheetHost deps={deps} />);
    expect(screen.queryByTestId("upgrade-sheet-error")).toBeNull();

    // The same path `lib/errors/useApiErrorHandler` takes for a real 403.
    const routed: { kind?: string; handled?: boolean } = {};
    await act(async () => {
      const outcome = routeApiError(
        new ApiError(403, {
          error: "You've used your AI food scan for today.",
          feature: "ai-food-estimate",
          requiresTier: "plus",
          limit: 1,
          remaining: 0,
          resetsAt: "2026-10-01T04:00:00.000Z",
          window: "day",
        }),
        { onPlanGate: (error) => void showUpgradeSheet(error.gate) },
      );
      routed.kind = outcome.kind;
      routed.handled = outcome.handled;
    });
    expect(routed.handled).toBe(true);
    expect(routed.kind).toBe("plan-gate");

    await waitFor(() =>
      expect(screen.getByTestId("upgrade-sheet-error")).toHaveTextContent(
        "You've used your AI food scan for today.",
      ),
    );
    // The windowed allowance line comes from the gate's own numbers.
    expect(screen.getByTestId("upgrade-sheet-allowance")).toHaveTextContent(
      "0 of 1 left. Resets at midnight.",
    );

    // Dismissing closes the one sheet.
    const dismiss = screen.getByTestId("upgrade-sheet-dismiss");
    await act(async () => {
      fireEvent.press(dismiss);
    });
    await waitFor(() => expect(getUpgradeSheetGate()).toBeNull());
    expect(screen.queryByTestId("upgrade-sheet-error")).toBeNull();
  });
});

// ─── The store rules, as text ────────────────────────────────────────────────
//
// Two of this card's rules are not visible in a rendered tree: WHICH browser the
// purchase opens in, and whether the native refusal mapping still agrees with the
// web's. Both are checked by reading the sources.

describe("the purchase never happens inside the app", () => {
  const nativeBillingSources = [
    "expo/lib/entitlements/billing.ts",
    "expo/components/entitlements/UpgradeSheet.tsx",
    "expo/components/entitlements/UpgradeSheetHost.tsx",
    "expo/components/entitlements/TierGate.tsx",
  ];

  it("opens the checkout URL with Linking.openURL and never expo-web-browser", () => {
    for (const rel of nativeBillingSources) {
      const source = read(rel);
      // An in-app browser (SFSafariViewController / Custom Tabs) is still
      // "inside the app" under App Review 3.1.1(a). Plus may be sold from the
      // iOS app only through an EXTERNAL link on the US storefront.
      expect(source).not.toMatch(/from\s+["']expo-web-browser["']/);
      expect(source).not.toMatch(/WebBrowser\./);
      // The two in-app-browser helpers this app already has, by import.
      expect(source).not.toMatch(/from\s+["'][^"']*browserLauncher["']/);
      expect(source).not.toMatch(/from\s+["'][^"']*openWebSignedIn["']/);
    }
    const billing = read("expo/lib/entitlements/billing.ts");
    expect(billing).toMatch(/import\s+\{\s*Linking\s*\}\s+from\s+["']react-native["']/);
    expect(billing).toMatch(/deps\.openUrl\s*\?\?\s*Linking\.openURL/);
  });

  it("sends returnTo: 'app' on both billing POSTs (NP-051)", () => {
    const billing = read("expo/lib/entitlements/billing.ts");
    expect(billing).toMatch(/NATIVE_RETURN_TO[^\n]*=\s*"app"/);
    // Checkout and portal, both of which land the member in Safari.
    expect(
      billing.match(/returnTo:\s*NATIVE_RETURN_TO/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
  });

  it("keeps the refusal mapping in step with webapp/components/UpgradeSheet.tsx", () => {
    const web = read("webapp/components/UpgradeSheet.tsx");
    const native = read("expo/lib/entitlements/billing.ts");

    // The web's own function body, so a change there that is not mirrored here
    // fails on this side rather than on a member's phone.
    const webBody = /export function checkoutRefusalState\([\s\S]*?\n\}/.exec(web)?.[0];
    expect(webBody).toBeTruthy();
    const nativeBody = /export function checkoutRefusalState\([\s\S]*?\n\}/.exec(
      native,
    )?.[0];
    expect(nativeBody).toBeTruthy();

    for (const token of [
      "404",
      "503",
      "billing_not_configured",
      "fix_payment_method",
      "already_plus",
      "already_subscribed",
    ]) {
      expect(webBody).toContain(token);
      expect(nativeBody).toContain(token);
    }
    // Same state union, same seven members.
    for (const state of [
      "checking",
      "ready",
      "starting",
      "unavailable",
      "fix-payment",
      "already-plus",
      "error",
    ]) {
      expect(web).toContain(`'${state}'`);
      expect(native).toContain(`"${state}"`);
    }
  });

  it("writes no amount, trial or date into the sheet's source", () => {
    const sheet = read("expo/components/entitlements/UpgradeSheet.tsx");
    // A price in the app can only be changed by an App Store release. Prices live
    // in PLAN_PRICING on the server and reach a client only as display strings
    // from GET /api/billing/plans, which this sheet does not read.
    expect(sheet).not.toMatch(/\$\d/);
    expect(sheet).not.toMatch(/\bPLAN_PRICING\b/);
    expect(sheet).not.toMatch(/\d+-day|\bfree trial\b/i);
  });
});
