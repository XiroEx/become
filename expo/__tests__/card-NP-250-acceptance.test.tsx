/**
 * NP-250: the plan screen after checkout.
 *
 *   1. A `become://?billing=success&session_id=…` return reaches "Payment
 *      received" even when the screen re-renders while the activation is in
 *      flight with a NEW `deps` object each time — which is exactly what the
 *      real route did (`deps = {}` default + the entitlements reload
 *      re-rendering it), so the banner sat on "Confirming your payment".
 *   2. The activation runs once per return, not once per render.
 *   3. The Mind sessions row carries the web's "The Mind path runs N
 *      sessions." subtitle, and the Plus accents use the web's purple.
 */

/* eslint-disable import/first */
const mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

import { useState } from "react";
import { render, waitFor } from "@testing-library/react-native";
import {
  MAX_CHAPTER,
  SESSIONS_PER_CHAPTER,
  type EntitlementsSnapshot,
} from "@become/core";
import type { BillingPlansResponse } from "@become/api-client";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";
import type { BillingDeps } from "@/lib/entitlements/billing";
import { clearBillingHandover } from "@/lib/entitlements/billingReturn";
import PlanScreen, {
  PLAN_COLUMN_WIDTH,
  PlanComparison,
  rowDetail,
} from "@/app/(app)/plan";
/* eslint-enable import/first */

const MEMBER_JWT = (() => {
  const payload = Buffer.from(
    JSON.stringify({ userId: "member-np250", exp: 9_999_999_999 }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
})();

function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body ?? {}),
  } as unknown as Response;
}

const PLANS: BillingPlansResponse = {
  currency: "USD",
  plans: {
    monthly: { display: "X", per: "month", billed: "B", renewalLine: "R" },
    annual: { display: "Y", per: "year", billed: "B", renewalLine: "R" },
  },
  rows: [],
  freeForever: [],
  freeForeverNote: "N",
  renewalTerms: [],
};

const SNAPSHOT: EntitlementsSnapshot = {
  role: "user",
  tier: "free",
  enforced: true,
  grandfathered: false,
  subscription: null,
  checkoutAvailable: true,
  features: {},
};

describe("NP-250: checkout return reaches 'Payment received'", () => {
  beforeEach(() => {
    clearBillingHandover();
    for (const key of Object.keys(mockParams)) delete mockParams[key];
  });

  it("confirms even though every render hands the screen a new deps object", async () => {
    mockParams.billing = "success";
    mockParams.session_id = "cs_test_np250";

    const statusUrls: string[] = [];
    const fetchImpl = (async (url: string) => {
      if (String(url).includes("/api/billing/status")) {
        statusUrls.push(String(url));
        return jsonResponse(200, {
          configured: true,
          plans: { monthly: true, annual: true },
        });
      }
      return jsonResponse(404, {});
    }) as unknown as typeof fetch;
    const store = createMemoryTokenStore(MEMBER_JWT);

    let bump: () => void = () => {};
    let renders = 0;
    // The real route: a fresh deps object on every render, and the
    // entitlements reload (part of the activation) re-renders the screen.
    function Host() {
      const [, setTick] = useState(0);
      bump = () => setTick((t) => t + 1);
      renders += 1;
      const deps = {
        baseUrl: "https://become.test",
        store,
        fetchImpl,
        reloadEntitlements: async () => {
          bump();
          await new Promise((r) => setTimeout(r, 0));
          bump();
          return null;
        },
      } as BillingDeps;
      return (
        <PlanScreen
          deps={deps}
          initialPlans={PLANS}
          initialSnapshot={SNAPSHOT}
        />
      );
    }

    const screen = render(<Host />);
    expect(screen.getByText("Confirming your payment")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Payment received")).toBeTruthy();
    });
    expect(screen.queryByText("Confirming your payment")).toBeNull();
    expect(renders).toBeGreaterThan(2);

    // One activation for the one return — not one per render.
    const hinted = statusUrls.filter((u) => u.includes("session_id=cs_test_np250"));
    expect(hinted).toHaveLength(1);
    screen.unmount();
  });

  it("confirms with no deps passed at all (the production route)", async () => {
    mockParams.billing = "success";
    mockParams.session_id = "cs_test_np250_default";
    const originalFetch = global.fetch;
    global.fetch = (async () =>
      jsonResponse(200, {
        configured: true,
        plans: { monthly: true, annual: true },
      })) as unknown as typeof fetch;
    try {
      const screen = render(
        <PlanScreen initialPlans={PLANS} initialSnapshot={SNAPSHOT} />,
      );
      await waitFor(() => {
        expect(screen.getByText("Payment received")).toBeTruthy();
      });
      screen.unmount();
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("NP-250: plan comparison matches the web", () => {
  const rows = [
    { feature: "mind-sessions", label: "Mind sessions", free: "First 10", plus: "All 50" },
    { feature: "workout-generation", label: "Workout generation", free: "3 a week", plus: "Unlimited" },
  ];

  it("subtitles the Mind sessions row with the length of the Mind path", () => {
    const total = SESSIONS_PER_CHAPTER * MAX_CHAPTER;
    expect(rowDetail(rows[0]!)).toBe(`The Mind path runs ${total} sessions.`);
    expect(rowDetail(rows[1]!)).toBeNull();

    const screen = render(<PlanComparison rows={rows} snapshot={SNAPSHOT} />);
    expect(
      screen.getByTestId("plan-row-detail-mind-sessions").props.children,
    ).toBe(`The Mind path runs ${total} sessions.`);
    expect(screen.queryByTestId("plan-row-detail-workout-generation")).toBeNull();
  });

  it("uses the purple Plus accent and web-width columns", () => {
    const screen = render(<PlanComparison rows={rows} snapshot={SNAPSHOT} />);
    const header = screen.getByTestId("plan-comparison-plus-header");
    expect(String(header.props.className)).toContain("text-mindset");
    const plusCell = screen.getByTestId("plan-row-plus-mind-sessions");
    expect(String(plusCell.props.className)).toContain("text-mindset");
    expect(String(plusCell.props.className)).not.toContain("text-primary");
    expect(PLAN_COLUMN_WIDTH).toBe(72);
  });
});
