/**
 * ─── COMING BACK FROM CHECKOUT OR THE PORTAL (NP-054) ────────────────────────
 *
 * After paying in Safari the buyer returns from the public return page
 * (`webapp/app/billing/*`) through `become://?billing=…[&session_id=…]`. The
 * resolver maps the return onto the plan page; the plan page activates from
 * `session_id` via `GET /api/billing/status?session_id=` (the server checks
 * the session's `client_reference_id` against the signed-in member — the id
 * is only a hint) and then forces an entitlements refresh, the way the web
 * activates from `session_id` on its return URL
 * (`webapp/app/dashboard/plan/PlanPageClient.tsx`).
 *
 * A cancel return changes nothing. A portal return re-reads status and
 * entitlements so a cancellation (`subscription.cancelAtPeriodEnd`) shows
 * without a manual refresh. And because the member may switch back manually
 * — no link, no params — opening a checkout or portal URL is remembered, and
 * the next foreground re-reads and retries until the tier changes.
 *
 * Device verification (a real iPhone / Android opening the app from the
 * return page) is deferred to NP-044/NP-008; what is pinned here is the
 * mapping, the activation call, and the foreground re-read.
 */

import { act, render, renderHook } from "@testing-library/react-native";
import type { AppStateStatus } from "react-native";
import { NATIVE_ROUTES, resolveWebPath } from "@/lib/navigation/webPathToRoute";
import { CurrentPlan } from "@/app/(app)/plan";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  useLocalSearchParams: () => ({}),
}));
import {
  BILLING_RETURN_TTL_MS,
  billingForegroundPass,
  clearBillingReturn,
  markBillingReturnOpened,
  resetBillingReturnForTests,
  takeBillingReturn,
  useBillingForegroundRefresh,
} from "@/lib/entitlements/billingReturn";
import { fetchBillingStatus } from "@/lib/entitlements/billing";

describe("NP-054 billing return (e015c7d0/e015c7d1/e015c7d2)", () => {
  beforeEach(() => {
    resetBillingReturnForTests();
    jest.clearAllMocks();
  });

  describe("resolver: return path with session_id maps to the plan page", () => {
    it("e015c7d0: become:// success return with session_id lands on /plan with the id", () => {
      const target = resolveWebPath(
        "become://?billing=success&session_id=cs_test_123",
      );
      expect(target.kind).toBe("native");
      if (target.kind !== "native") return;
      expect(target.pathname).toBe(NATIVE_ROUTES.plan);
      expect(target.params).toMatchObject({
        billing: "success",
        session_id: "cs_test_123",
      });
      expect(target.href).toContain("session_id=cs_test_123");
      expect(target.fallback).toBe("exact");
    });

    it("e015c7d0: /billing/return with session_id lands on /plan with the id", () => {
      const target = resolveWebPath(
        "/billing/return?session_id=cs_test_456",
      );
      expect(target.kind).toBe("native");
      if (target.kind !== "native") return;
      expect(target.pathname).toBe(NATIVE_ROUTES.plan);
      expect(target.params).toMatchObject({
        billing: "success",
        session_id: "cs_test_456",
      });
    });

    it("e015c7d0: /dashboard/plan with checkout=success keeps its query on /plan", () => {
      const target = resolveWebPath(
        "/dashboard/plan?checkout=success&session_id=cs_test_789",
      );
      expect(target.kind).toBe("native");
      if (target.kind !== "native") return;
      expect(target.pathname).toBe(NATIVE_ROUTES.plan);
      expect(target.params).toMatchObject({
        checkout: "success",
        session_id: "cs_test_789",
      });
      expect(target.fallback).toBe("exact");
    });

    it("e015c7d1: cancel return lands on /plan unchanged (no session, nothing to activate)", () => {
      for (const input of [
        "become://?billing=cancelled",
        "/billing/cancelled",
        "/billing/cancelled?checkout=cancelled",
      ]) {
        const target = resolveWebPath(input);
        expect(target.kind).toBe("native");
        if (target.kind !== "native") continue;
        expect(target.pathname).toBe(NATIVE_ROUTES.plan);
        expect(target.params.session_id).toBeUndefined();
        expect(target.fallback).toBe("exact");
      }
    });

    it("e015c7d2: portal return lands on /plan", () => {
      for (const input of [
        "become://?billing=portal-return",
        "/billing/portal-return",
      ]) {
        const target = resolveWebPath(input);
        expect(target.kind).toBe("native");
        if (target.kind !== "native") continue;
        expect(target.pathname).toBe(NATIVE_ROUTES.plan);
        expect(target.fallback).toBe("exact");
      }
    });

    it("a bare launch still resolves to the launch route, not the plan page", () => {
      const target = resolveWebPath("/");
      expect(target.kind).toBe("native");
      if (target.kind !== "native") return;
      expect(target.pathname).toBe(NATIVE_ROUTES.launch);
    });
  });

  describe("activation: GET /api/billing/status?session_id= then refresh()", () => {
    function statusServer(seen: string[]) {
      return (async (url: string) => {
        seen.push(String(url));
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            configured: true,
            plans: { monthly: true, annual: true },
            subscription: {
              status: "active",
              plan: "monthly",
              currentPeriodEnd: new Date(
                Date.now() + 30 * 24 * 3600 * 1000,
              ).toISOString(),
              cancelAtPeriodEnd: false,
              managed: true,
            },
          }),
          text: async () => "{}",
        } as unknown as Response);
      }) as unknown as typeof fetch;
    }

    it("e015c7d0: fetchBillingStatus sends the session id as a query hint", async () => {
      const seen: string[] = [];
      const result = await fetchBillingStatus(
        {
          baseUrl: "https://become.test",
          store: createMemoryTokenStore("jwt"),
          fetchImpl: statusServer(seen),
        },
        "cs_test_abc123",
      );
      expect(result?.configured).toBe(true);
      expect(seen.some((u) => u.includes("session_id=cs_test_abc123"))).toBe(
        true,
      );
    });

    it("e015c7d1: without a session id the status path carries no query", async () => {
      const seen: string[] = [];
      await fetchBillingStatus({
        baseUrl: "https://become.test",
        store: createMemoryTokenStore("jwt"),
        fetchImpl: statusServer(seen),
      });
      expect(
        seen.some((u) => u.includes("/api/billing/status?")),
      ).toBe(false);
    });

    it("a forged session id is dropped client-side and never sent", async () => {
      const seen: string[] = [];
      await fetchBillingStatus(
        {
          baseUrl: "https://become.test",
          store: createMemoryTokenStore("jwt"),
          fetchImpl: statusServer(seen),
        },
        "not-a-session'; DROP TABLE users;--",
      );
      expect(seen.some((u) => u.includes("session_id="))).toBe(false);
    });

    it("e015c7d0/e015c7d2: one pass reads status then refreshes, reporting the tier", async () => {
      const order: string[] = [];
      const pass = await billingForegroundPass({
        sessionId: "cs_test_1",
        fetchStatus: async (sessionId?: string | null) => {
          order.push(`status:${sessionId ?? "none"}`);
          return { tier: "plus" };
        },
        refreshEntitlements: async () => {
          order.push("refresh");
        },
        readTierIsPlus: () => true,
      });
      expect(pass).toEqual({ tierIsPlus: true });
      // Status (activation) runs before the entitlements refresh — the web's
      // order, ported.
      expect(order).toEqual(["status:cs_test_1", "refresh"]);
    });

    it("a failed status read is swallowed — the webhook stays the source of truth", async () => {
      let refreshed = false;
      const pass = await billingForegroundPass({
        sessionId: "cs_test_1",
        fetchStatus: async () => {
          throw new Error("offline");
        },
        refreshEntitlements: async () => {
          refreshed = true;
        },
        readTierIsPlus: () => false,
      });
      expect(pass).toEqual({ tierIsPlus: false });
      expect(refreshed).toBe(true);
    });
  });

  describe("foreground: a remembered handover re-reads until the tier changes", () => {
    it("mark/take remembers a checkout or portal open, and clear forgets it", () => {
      expect(takeBillingReturn()).toBeNull();
      markBillingReturnOpened("checkout", 1_000);
      expect(takeBillingReturn(1_001)).toMatchObject({ kind: "checkout" });
      markBillingReturnOpened("portal", 2_000);
      expect(takeBillingReturn(2_001)).toMatchObject({ kind: "portal" });
      clearBillingReturn();
      expect(takeBillingReturn(2_002)).toBeNull();
    });

    it("an expired memory reads as no handover", () => {
      markBillingReturnOpened("checkout", 0);
      expect(takeBillingReturn(BILLING_RETURN_TTL_MS + 1)).toBeNull();
      // Expired reads clear, so a second read is still null.
      expect(takeBillingReturn(BILLING_RETURN_TTL_MS + 2)).toBeNull();
    });

    it("e015c7d0: foreground after a remembered checkout polls until Plus lands", async () => {
      jest.useFakeTimers();
      try {
        markBillingReturnOpened("checkout", Date.now());

        let passes = 0;
        let plus = false;
        const listeners: Array<(s: AppStateStatus) => void> = [];
        const subscribeToAppState = (fn: (s: AppStateStatus) => void) => {
          listeners.push(fn);
          return () => {};
        };

        const { unmount } = renderHook(() =>
          useBillingForegroundRefresh(
            async () => {
              passes += 1;
              if (passes >= 3) plus = true;
              return { tierIsPlus: plus };
            },
            {
              subscribeToAppState,
              now: () => Date.now(),
              retryWindowMs: 30_000,
              retryDelayMs: 2_000,
            },
          ),
        );

        await act(async () => {
          for (const fn of listeners) fn("active");
        });
        // First pass runs immediately.
        expect(passes).toBe(1);
        // Still free: retries fire on the delay until Plus lands.
        await act(async () => {
          jest.advanceTimersByTime(2_000);
          await Promise.resolve();
          await Promise.resolve();
        });
        await act(async () => {
          jest.advanceTimersByTime(2_000);
          await Promise.resolve();
          await Promise.resolve();
        });
        expect(passes).toBeGreaterThanOrEqual(3);
        expect(takeBillingReturn()).toBeNull();
        unmount();
      } finally {
        jest.useRealTimers();
      }
    });

    it("no remembered handover means no read on foreground", async () => {
      clearBillingReturn();
      let passes = 0;
      const listeners: Array<(s: AppStateStatus) => void> = [];
      const { unmount } = renderHook(() =>
        useBillingForegroundRefresh(
          async () => {
            passes += 1;
            return { tierIsPlus: false };
          },
          {
            subscribeToAppState: (fn: (s: AppStateStatus) => void) => {
              listeners.push(fn);
              return () => {};
            },
          },
        ),
      );
      await act(async () => {
        for (const fn of listeners) fn("active");
      });
      expect(passes).toBe(0);
      unmount();
    });
  });

  describe("portal cancellation copy (e015c7d2)", () => {
    it("CurrentPlan shows Ends instead of Renews when cancelAtPeriodEnd is true", () => {
      const periodEnd = new Date(Date.now() + 20 * 24 * 3600 * 1000);
      const screen = render(
        <CurrentPlan
          snapshot={{
            role: "user",
            tier: "plus",
            enforced: true,
            grandfathered: false,
            subscription: {
              status: "active",
              currentPeriodEnd: periodEnd.toISOString(),
              cancelAtPeriodEnd: true,
            },
            checkoutAvailable: true,
            features: {},
          }}
          portalState="idle"
          onOpenPortal={() => {}}
        />,
      );
      expect(screen.getByTestId("current-plan-subtitle")).toHaveTextContent(
        /Ends/,
      );
    });
  });
}
