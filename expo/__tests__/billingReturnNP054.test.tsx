/**
 * COMING BACK FROM CHECKOUT OR THE PORTAL (NP-054).
 *
 * The purchase leaves the app entirely — `startCheckout` hands Stripe's URL to
 * the device browser — and Stripe returns the buyer to Safari on a PUBLIC page
 * (`/billing/return`, `/billing/cancelled`, `/billing/portal-return`, NP-051),
 * which carries a `become://?billing=…[&session_id=…]` button back into the
 * app. Three things are pinned here:
 *
 *   1. the resolver maps every return shape onto the plan page (`/plan`), with
 *      the `session_id` carried ONLY on a success return;
 *   2. the plan page's activation calls `GET /api/billing/status?session_id=`
 *      FIRST and `refresh()`es the entitlements store SECOND — the web's
 *      return-URL activation, ported;
 *   3. a remembered checkout/portal handover re-reads on the next foreground,
 *      retrying until the tier changes (the webhook usually lands first).
 *
 * The session id is only a hint and the server checks it against the signed-in
 * member; no amount or date is computed on the device.
 */

/* eslint-disable import/first */
// `expo-router` params differ per return shape, so the mock reads `mockParams`
// — a module-level object each test fills before rendering. `jest.mock` calls
// are hoisted, so the factory only dereferences it when a test runs.
const mockRouterFns = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
};
const mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockRouterFns.push,
    replace: mockRouterFns.replace,
    back: mockRouterFns.back,
  }),
  useLocalSearchParams: () => mockParams,
}));

import { act, render, waitFor } from "@testing-library/react-native";
import type { AppStateStatus } from "react-native";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";
import type { BillingDeps } from "@/lib/entitlements/billing";
import {
  BILLING_RETURN_RETRY_INTERVAL_MS,
  BILLING_RETURN_RETRY_MS,
  activateFromCheckoutReturn,
  clearBillingHandover,
  consumeBillingHandover,
  isSessionIdHint,
  onAppForeground,
  pendingBillingHandover,
  rememberBillingHandover,
  rereadBillingUntilTierChanges,
} from "@/lib/entitlements/billingReturn";
import { resolveWebPath } from "@/lib/navigation/webPathToRoute";
import PlanScreen from "@/app/(app)/plan";
/* eslint-enable import/first */

const MEMBER_JWT = (() => {
  const payload = Buffer.from(
    JSON.stringify({ userId: "member-np054", exp: 9_999_999_999 }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
})();

function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body ?? {}),
  } as unknown as Response;
}

function statusBody(over: Record<string, unknown> = {}) {
  return {
    configured: true,
    plans: { monthly: true, annual: true },
    ...over,
  };
}

interface Call {
  url: string;
  method: string;
}

function billingServer(statusAnswers: (() => Response)[]) {
  const calls: Call[] = [];
  let statusCalls = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    if (String(url).includes("/api/billing/status")) {
      const answer = statusAnswers[Math.min(statusCalls, statusAnswers.length - 1)];
      statusCalls += 1;
      return (answer ?? (() => jsonResponse(200, statusBody())))();
    }
    return jsonResponse(404, { error: "not_found" });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function depsWith(
  statusAnswers: (() => Response)[] = [() => jsonResponse(200, statusBody())],
) {
  const server = billingServer(statusAnswers);
  return {
    deps: {
      baseUrl: "https://become.test",
      store: createMemoryTokenStore(MEMBER_JWT),
      fetchImpl: server.fetchImpl,
    },
    calls: server.calls,
  };
}

describe("NP-054: the resolver maps every billing return onto the plan page", () => {
  it.each([
    "become://?billing=success&session_id=cs_test_123",
    "/billing/return?session_id=cs_test_123",
    "/billing/return?checkout=success&session_id=cs_test_123",
    "/dashboard/plan?checkout=success&session_id=cs_test_123",
  ])("success return %s lands on /plan with the session hint", (input) => {
    const target = resolveWebPath(input);
    expect(target.kind).toBe("native");
    if (target.kind !== "native") return;
    expect(target.pathname).toBe("/plan");
    expect(target.params.session_id).toBe("cs_test_123");
    expect(target.params.billing).toBe("success");
    expect(target.href).toContain("session_id=cs_test_123");
    expect(target.fallback).toBe("exact");
  });

  it.each([
    "become://?billing=cancelled",
    "become://?billing=portal-return",
    "/billing/cancelled",
    "/billing/cancelled?checkout=cancelled",
    "/billing/portal-return",
    "/dashboard/plan?checkout=cancelled",
    "/dashboard/plan?portal=return",
  ])("non-success return %s lands on /plan with nothing carried", (input) => {
    const target = resolveWebPath(input);
    expect(target.kind).toBe("native");
    if (target.kind !== "native") return;
    expect(target.pathname).toBe("/plan");
    expect(target.params.session_id).toBeUndefined();
    expect(target.href).toBe("/plan");
  });

  it("a success return without a session id still lands on /plan", () => {
    const target = resolveWebPath("/billing/return?checkout=success");
    expect(target.kind).toBe("native");
    if (target.kind !== "native") return;
    expect(target.pathname).toBe("/plan");
    expect(target.params.session_id).toBeUndefined();
  });
});

describe("NP-054: the session id is only a hint", () => {
  it("accepts cs_… and drops anything else", () => {
    expect(isSessionIdHint("cs_test_123")).toBe(true);
    expect(isSessionIdHint("cs_1")).toBe(false);
    expect(isSessionIdHint("javascript:alert(1)")).toBe(false);
    expect(isSessionIdHint("")).toBe(false);
    expect(isSessionIdHint(undefined)).toBe(false);
    expect(isSessionIdHint(null)).toBe(false);
    expect(isSessionIdHint(42)).toBe(false);
  });

  it("a forged id is never sent as the session hint", async () => {
    const { deps, calls } = depsWith();
    const reload = jest.fn(async () => null);
    await activateFromCheckoutReturn("javascript:alert(1)", {
      ...deps,
      reloadEntitlements: reload,
    });
    const statusCall = calls.find((c) => c.url.includes("/api/billing/status"));
    expect(statusCall).toBeDefined();
    expect(statusCall?.url).not.toContain("session_id=");
    expect(reload).toHaveBeenCalledWith(true);
  });
});

describe("NP-054: activation calls status with the hint, then refreshes", () => {
  it("queries GET /api/billing/status?session_id= and then reloads entitlements", async () => {
    const { deps, calls } = depsWith();
    const order: string[] = [];
    const trackingFetch = (async (url: string, init?: RequestInit) => {
      order.push(`fetch:${String(url)}`);
      return (deps.fetchImpl as typeof fetch)(url, init);
    }) as unknown as typeof fetch;
    const reload = jest.fn(async () => {
      order.push("reload");
      return null;
    });
    await activateFromCheckoutReturn("cs_test_abc123", {
      ...deps,
      fetchImpl: trackingFetch,
      reloadEntitlements: reload,
    });
    const statusCall = calls.find((c) => c.url.includes("/api/billing/status"));
    expect(statusCall).toBeDefined();
    expect(statusCall?.url).toContain("session_id=cs_test_abc123");
    expect(reload).toHaveBeenCalledWith(true);
    // Status FIRST, then the entitlements refresh — the web's order, ported.
    expect(order[0]).toContain("/api/billing/status?session_id=");
    expect(order[order.length - 1]).toBe("reload");
  });

  it("still refreshes when the status call fails (the webhook is the truth)", async () => {
    const { deps } = depsWith([() => jsonResponse(503, { error: "x" })]);
    const reload = jest.fn(async () => null);
    await expect(
      activateFromCheckoutReturn("cs_test_abc123", {
        ...deps,
        reloadEntitlements: reload,
      }),
    ).resolves.toBeUndefined();
    expect(reload).toHaveBeenCalledWith(true);
  });
});

describe("NP-054: the remembered handover re-reads on the next foreground", () => {
  beforeEach(() => {
    clearBillingHandover();
  });

  it("remembers checkout and portal handovers until consumed", async () => {
    expect(pendingBillingHandover()).toBeNull();
    rememberBillingHandover("checkout");
    expect(pendingBillingHandover()).toBe("checkout");
    rememberBillingHandover("portal");
    expect(pendingBillingHandover()).toBe("portal");
    const { deps } = depsWith();
    await consumeBillingHandover({
      ...deps,
      getTier: () => "free",
      reloadEntitlements: jest.fn(async () => null),
      now: () => BILLING_RETURN_RETRY_MS + 1,
      sleep: jest.fn(async () => {}),
    });
    expect(pendingBillingHandover()).toBeNull();
  });

  it("does nothing when no handover was remembered", async () => {
    const reload = jest.fn(async () => null);
    await expect(
      consumeBillingHandover({
        baseUrl: "https://become.test",
        reloadEntitlements: reload,
      }),
    ).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("stops retrying as soon as the tier changes", async () => {
    const { deps } = depsWith();
    let tier = "free";
    const reload = jest.fn(async () => {
      tier = "plus";
      return null;
    });
    const sleep = jest.fn(async () => {});
    let nowMs = 0;
    await rereadBillingUntilTierChanges({
      ...deps,
      getTier: () => tier,
      reloadEntitlements: reload,
      now: () => nowMs,
      sleep,
    });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries every 2s for up to 8s while the tier is unchanged", async () => {
    const { deps, calls } = depsWith();
    const reload = jest.fn(async () => null);
    const sleep = jest.fn(async () => {});
    let nowMs = 0;
    const sleeps: number[] = [];
    const sleeping = jest.fn(async (ms: number) => {
      sleeps.push(ms);
      nowMs += ms;
    });
    void sleep;
    await rereadBillingUntilTierChanges({
      ...deps,
      getTier: () => "free",
      reloadEntitlements: reload,
      now: () => nowMs,
      sleep: sleeping,
    });
    expect(BILLING_RETURN_RETRY_MS).toBe(8_000);
    expect(BILLING_RETURN_RETRY_INTERVAL_MS).toBe(2_000);
    expect(sleeps).toEqual([2_000, 2_000, 2_000, 2_000]);
    // One status read per attempt, plus the final attempt at the deadline.
    expect(
      calls.filter((c) => c.url.includes("/api/billing/status")).length,
    ).toBe(reload.mock.calls.length);
    expect(reload.mock.calls.length).toBeGreaterThan(1);
  });

  it("fires the re-read only when the app becomes active", () => {
    const seen: string[] = [];
    const subscribe = (listener: (s: AppStateStatus) => void) => {
      seen.push("subscribed");
      listener("background");
      listener("active");
      listener("active");
      return () => {
        seen.push("unsubscribed");
      };
    };
    const onForeground = jest.fn();
    const unsubscribe = onAppForeground(onForeground, subscribe);
    expect(onForeground).toHaveBeenCalledTimes(2);
    unsubscribe();
    expect(seen).toEqual(["subscribed", "unsubscribed"]);
  });
});

describe("NP-054: the plan page activates on arrival and re-reads on foreground", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearBillingHandover();
    for (const key of Object.keys(mockParams)) delete mockParams[key];
  });

  function renderPlanScreen(deps: BillingDeps) {
    return render(
      <PlanScreen
        deps={deps}
        initialPlans={{
          currency: "USD",
          plans: {
            monthly: {
              display: "X",
              per: "month",
              billed: "B",
              renewalLine: "R",
            },
            annual: {
              display: "Y",
              per: "year",
              billed: "B",
              renewalLine: "R",
            },
          },
          rows: [],
          freeForever: [],
          freeForeverNote: "N",
          renewalTerms: [],
        }}
        initialSnapshot={{
          role: "user",
          tier: "free",
          enforced: true,
          grandfathered: false,
          subscription: null,
          checkoutAvailable: true,
          features: {},
        }}
      />,
    );
  }

  it("calls status with the session hint then refreshes on a success return", async () => {
    mockParams.billing = "success";
    mockParams.session_id = "cs_test_arrival";
    const { deps, calls } = depsWith();
    const screen = renderPlanScreen(deps);
    await waitFor(() => {
      expect(
        calls.some((c) =>
          c.url.includes("/api/billing/status?session_id=cs_test_arrival"),
        ),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId("checkout-confirmation")).toBeTruthy();
    });
    screen.unmount();
  });

  it("shows nothing changed on a cancel return", async () => {
    mockParams.billing = "cancelled";
    const { deps, calls } = depsWith();
    const screen = renderPlanScreen(deps);
    await act(async () => {});
    expect(
      calls.some((c) => c.url.includes("session_id=")),
    ).toBe(false);
    expect(screen.queryByTestId("checkout-confirmation")).toBeNull();
    screen.unmount();
  });
});
