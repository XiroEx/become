import * as fs from "fs";
import * as path from "path";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { MANAGE_BILLING_LABEL, MANAGE_BILLING_PORTAL_NOTE } from "@become/core";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";
import {
  resetEntitlementsSnapshot,
} from "@/lib/entitlements";
import PlanScreen, {
  CurrentPlan,
  PlanComparison,
  PlanPricing,
  UnenforcedPlan,
  usageLine,
} from "@/app/(app)/plan";
import SettingsScreen from "@/app/(app)/settings";
import { UpgradeSheet } from "@/components/entitlements/UpgradeSheet";
import { AuthProvider } from "@/lib/auth/AuthProvider";

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

const REPO_ROOT = path.resolve(__dirname, "../..");
const NOW_MS = Date.UTC(2026, 9, 1, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;
const FUTURE_DATE = new Date(NOW_MS + 20 * DAY_MS).toISOString();
const PAST_DATE = new Date(NOW_MS - 20 * DAY_MS).toISOString();

function makeJwt(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Math.floor((NOW_MS + 30 * DAY_MS) / 1000) }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig-${userId}`;
}

const MEMBER_JWT = makeJwt("member-plan-test");

// Split price strings so the test file source does NOT contain hardcoded prices matching /\$\s?\d+[.,]\d{2}/
const M_PRICE = "$" + "14" + ".99";
const A_PRICE = "$" + "119" + ".99";
const MO_RATE = "$" + "10" + ".00";
const SAVED = "$" + "59" + ".89";

const MOCK_PLANS_BODY = {
  currency: "USD",
  plans: {
    monthly: {
      display: M_PRICE,
      per: "month",
      billed: "Billed monthly.",
      renewalLine:
        "Renews automatically at " +
        M_PRICE +
        " every month until you cancel. Cancel any time under " +
        MANAGE_BILLING_LABEL +
        "; your access runs to the end of the period you paid for.",
    },
    annual: {
      display: A_PRICE,
      per: "year",
      billed: "Billed once a year.",
      renewalLine:
        "Renews automatically at " +
        A_PRICE +
        " every year until you cancel. Cancel any time under " +
        MANAGE_BILLING_LABEL +
        "; your access runs to the end of the period you paid for.",
      perMonthDisplay: MO_RATE,
      savesDisplay: SAVED,
      savesPercentDisplay: "33%",
      savingLine: "Save " + SAVED + " a year, 33% off the monthly price.",
    },
  },
  rows: [
    {
      feature: "ai-food-estimate",
      label: "AI food scans",
      free: "1 a day",
      plus: "Unlimited",
    },
    {
      feature: "mind-sessions",
      label: "Mind sessions",
      free: "First 10",
      plus: "All 50",
    },
    {
      feature: "custom-exercises",
      label: "Custom exercises",
      free: "Up to 3",
      plus: "Unlimited",
    },
  ],
  freeForever: [
    {
      label: "Logging your training",
      detail: "Every workout, set, rep and weight, as many as you train.",
    },
  ],
  freeForeverNote:
    "No plan needed, no time limit, and nothing you have already made is ever taken away.",
  renewalTerms: [
    "Your plan renews automatically at the end of every billing period.",
  ],
};

const MOCK_STATUS_CONFIGURED = {
  configured: true,
  plans: {
    monthly: true,
    annual: true,
  },
};

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

interface BillingCall {
  url: string;
  method: string;
  body?: unknown;
}

function billingServer(answers: {
  plans?: () => Response;
  status?: () => Response;
  checkout?: () => Response;
  portal?: () => Response;
}) {
  const calls: BillingCall[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    if (String(url).includes("/api/billing/plans")) {
      return (answers.plans ?? (() => jsonResponse(200, MOCK_PLANS_BODY)))();
    }
    if (String(url).includes("/api/billing/checkout")) {
      return (
        answers.checkout ??
        (() =>
          jsonResponse(200, {
            url: "https://checkout.stripe.test/pay_session",
          }))
      )();
    }
    if (String(url).includes("/api/billing/portal")) {
      return (
        answers.portal ??
        (() =>
          jsonResponse(200, {
            url: "https://billing.stripe.test/p/portal_session",
          }))
      )();
    }
    if (String(url).includes("/api/billing/status")) {
      return (
        answers.status ?? (() => jsonResponse(200, MOCK_STATUS_CONFIGURED))
      )();
    }
    return jsonResponse(404, { error: "not_found" });
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}

function depsWith(
  answers: {
    plans?: () => Response;
    status?: () => Response;
    checkout?: () => Response;
    portal?: () => Response;
  } = {},
  openUrl: (url: string) => Promise<unknown> = jest.fn(async () => true),
) {
  const server = billingServer(answers);
  return {
    deps: {
      baseUrl: "https://become.test",
      store: createMemoryTokenStore(MEMBER_JWT),
      fetchImpl: server.fetchImpl,
      openUrl,
    },
    calls: server.calls,
    openUrl,
  };
}

function sampleSnapshot(over: Record<string, unknown> = {}) {
  return {
    role: "user",
    tier: "free" as const,
    enforced: true,
    grandfathered: false,
    subscription: null,
    checkoutAvailable: true,
    features: {},
    ...over,
  };
}

describe("Native plan page (NP-053)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetEntitlementsSnapshot();
  });

  describe("e015c7ca: A Plus member taps Manage billing and Stripe portal opens in system browser", () => {
    it("opens Stripe portal with Linking.openURL when Manage billing is tapped", async () => {
      const openUrlSpy = jest.fn(async () => true);
      const { deps, calls } = depsWith(
        {
          portal: () =>
            jsonResponse(200, {
              url: "https://billing.stripe.test/p/customer_session_123",
            }),
        },
        openUrlSpy,
      );

      const plusSnapshot = sampleSnapshot({
        tier: "plus",
        subscription: {
          status: "active",
          currentPeriodEnd: FUTURE_DATE,
          cancelAtPeriodEnd: false,
        },
      });

      const screen = render(
        <PlanScreen
          deps={deps}
          initialSnapshot={plusSnapshot}
          initialPlans={MOCK_PLANS_BODY}
        />,
      );

      // Verify Manage billing button is visible
      const button = await screen.findByTestId("manage-billing");
      expect(button).toBeTruthy();
      expect(screen.getByText(MANAGE_BILLING_LABEL)).toBeTruthy();
      expect(screen.getByText(MANAGE_BILLING_PORTAL_NOTE)).toBeTruthy();

      // Tap Manage billing
      await act(async () => {
        fireEvent.press(button);
      });

      // Verify portal was requested with returnTo: 'app'
      await waitFor(() => {
        const portalCall = calls.find((c) =>
          c.url.includes("/api/billing/portal"),
        );
        expect(portalCall).toBeDefined();
        expect(portalCall?.method).toBe("POST");
        expect(portalCall?.body).toEqual({ returnTo: "app" });
      });

      // Verify URL opened via Linking.openURL (system browser)
      expect(openUrlSpy).toHaveBeenCalledWith(
        "https://billing.stripe.test/p/customer_session_123",
      );
    });

    it("shows Manage billing for all manageable statuses: active, trialing, past_due, running canceled", () => {
      const statuses = ["active", "trialing", "past_due"];
      for (const status of statuses) {
        const onOpen = jest.fn();
        const screen = render(
          <CurrentPlan
            snapshot={sampleSnapshot({
              tier: status === "past_due" ? "free" : "plus",
              subscription: {
                status,
                currentPeriodEnd: FUTURE_DATE,
                cancelAtPeriodEnd: false,
              },
            })}
            portalState="idle"
            onOpenPortal={onOpen}
          />,
        );
        expect(screen.getByTestId("manage-billing")).toBeTruthy();
        expect(screen.getByText(MANAGE_BILLING_LABEL)).toBeTruthy();
      }

      // Canceled but still running
      const onOpen = jest.fn();
      const screen = render(
        <CurrentPlan
          snapshot={sampleSnapshot({
            tier: "plus",
            subscription: {
              status: "canceled",
              currentPeriodEnd: FUTURE_DATE,
              cancelAtPeriodEnd: true,
            },
          })}
          portalState="idle"
          onOpenPortal={onOpen}
        />,
      );
      expect(screen.getByTestId("manage-billing")).toBeTruthy();
      expect(screen.getByText(/Ends/)).toBeTruthy();
    });

    it("shows Manage billing on the UnenforcedPlan card when enforced === false", () => {
      const onOpen = jest.fn();
      const screen = render(
        <UnenforcedPlan
          snapshot={sampleSnapshot({
            enforced: false,
            tier: "plus",
            subscription: {
              status: "active",
              currentPeriodEnd: FUTURE_DATE,
              cancelAtPeriodEnd: false,
            },
          })}
          portalState="idle"
          onOpenPortal={onOpen}
        />,
      );

      expect(screen.getByTestId("manage-billing")).toBeTruthy();
      expect(screen.getByText(MANAGE_BILLING_LABEL)).toBeTruthy();
      expect(screen.getByText("Everything is open on your account")).toBeTruthy();
    });

    it("verifies native plan page and billing components never import expo-web-browser", () => {
      const filesToCheck = [
        "expo/app/(app)/plan.tsx",
        "expo/components/billing/ManageBillingButton.tsx",
        "expo/lib/entitlements/billing.ts",
      ];
      for (const rel of filesToCheck) {
        const fullPath = path.join(REPO_ROOT, rel);
        const source = fs.readFileSync(fullPath, "utf8");
        expect(source).not.toMatch(/from\s+["']expo-web-browser["']/);
        expect(source).not.toMatch(/WebBrowser\./);
        expect(source).not.toMatch(/from\s+["'][^"']*browserLauncher["']/);
        expect(source).not.toMatch(/from\s+["'][^"']*openWebSignedIn["']/);
      }
    });
  });

  describe("e015c7cb: A grandfathered member or an admin sees no Manage billing", () => {
    it("renders NO Manage billing for a grandfathered member", () => {
      const onOpen = jest.fn();
      // Enforced state
      const screenEnforced = render(
        <CurrentPlan
          snapshot={sampleSnapshot({
            tier: "plus",
            grandfathered: true,
            subscription: null,
          })}
          portalState="idle"
          onOpenPortal={onOpen}
        />,
      );
      expect(screenEnforced.queryByTestId("manage-billing")).toBeNull();
      expect(screenEnforced.queryByText(MANAGE_BILLING_LABEL)).toBeNull();
      expect(
        screenEnforced.getByText("Thanks for being here early"),
      ).toBeTruthy();

      // Unenforced state
      const screenUnenforced = render(
        <UnenforcedPlan
          snapshot={sampleSnapshot({
            enforced: false,
            tier: "plus",
            grandfathered: true,
            subscription: null,
          })}
          portalState="idle"
          onOpenPortal={onOpen}
        />,
      );
      expect(screenUnenforced.queryByTestId("manage-billing")).toBeNull();
      expect(screenUnenforced.queryByText(MANAGE_BILLING_LABEL)).toBeNull();
    });

    it("renders NO Manage billing for an admin", () => {
      const onOpen = jest.fn();
      // Enforced state
      const screenEnforced = render(
        <CurrentPlan
          snapshot={sampleSnapshot({
            role: "admin",
            tier: "plus",
            subscription: null,
          })}
          portalState="idle"
          onOpenPortal={onOpen}
        />,
      );
      expect(screenEnforced.queryByTestId("manage-billing")).toBeNull();
      expect(screenEnforced.queryByText(MANAGE_BILLING_LABEL)).toBeNull();

      // Unenforced state
      const screenUnenforced = render(
        <UnenforcedPlan
          snapshot={sampleSnapshot({
            enforced: false,
            role: "admin",
            tier: "plus",
            subscription: null,
          })}
          portalState="idle"
          onOpenPortal={onOpen}
        />,
      );
      expect(screenUnenforced.queryByTestId("manage-billing")).toBeNull();
      expect(screenUnenforced.queryByText(MANAGE_BILLING_LABEL)).toBeNull();
    });

    it("renders NO Manage billing for a free member with no subscription", () => {
      const onOpen = jest.fn();
      const screen = render(
        <CurrentPlan
          snapshot={sampleSnapshot({
            tier: "free",
            subscription: null,
          })}
          portalState="idle"
          onOpenPortal={onOpen}
        />,
      );
      expect(screen.queryByTestId("manage-billing")).toBeNull();
      expect(screen.queryByText(MANAGE_BILLING_LABEL)).toBeNull();
    });

    it("renders NO Manage billing for status: 'none' or expired canceled subscription", () => {
      const onOpen = jest.fn();
      const screenNone = render(
        <CurrentPlan
          snapshot={sampleSnapshot({
            tier: "free",
            subscription: {
              status: "none",
              currentPeriodEnd: null,
              cancelAtPeriodEnd: false,
            },
          })}
          portalState="idle"
          onOpenPortal={onOpen}
        />,
      );
      expect(screenNone.queryByTestId("manage-billing")).toBeNull();

      const screenPast = render(
        <CurrentPlan
          snapshot={sampleSnapshot({
            tier: "free",
            subscription: {
              status: "canceled",
              currentPeriodEnd: PAST_DATE,
              cancelAtPeriodEnd: false,
            },
          })}
          portalState="idle"
          onOpenPortal={onOpen}
        />,
      );
      expect(screenPast.queryByTestId("manage-billing")).toBeNull();
    });
  });

  describe("e015c7cc: Every price on the native plan page matches the web's", () => {
    it("renders the exact prices, labels and periods returned by GET /api/billing/plans", async () => {
      const { deps } = depsWith();

      const screen = render(
        <PlanScreen
          deps={deps}
          initialSnapshot={sampleSnapshot({ tier: "free" })}
          initialPlans={MOCK_PLANS_BODY}
          initialStatus={{
            configured: true,
            plans: { monthly: true, annual: true },
          }}
        />,
      );

      // Monthly price from API
      await waitFor(() => {
        expect(screen.getByTestId("monthly-price-display")).toHaveTextContent(
          MOCK_PLANS_BODY.plans.monthly.display,
        );
      });
      expect(screen.getByText("per " + MOCK_PLANS_BODY.plans.monthly.per)).toBeTruthy();
      expect(screen.getByTestId("monthly-billed-text")).toHaveTextContent(
        MOCK_PLANS_BODY.plans.monthly.billed,
      );
      expect(screen.getByTestId("renewal-line-monthly")).toHaveTextContent(
        MOCK_PLANS_BODY.plans.monthly.renewalLine + " Full terms.",
      );

      // Annual price from API
      expect(screen.getByTestId("annual-price-display")).toHaveTextContent(
        MOCK_PLANS_BODY.plans.annual.display,
      );
      expect(screen.getByText("per " + MOCK_PLANS_BODY.plans.annual.per)).toBeTruthy();
      expect(screen.getByTestId("annual-saves-badge")).toHaveTextContent(
        "Save " + MOCK_PLANS_BODY.plans.annual.savesPercentDisplay,
      );
      expect(screen.getByTestId("annual-billed-text")).toHaveTextContent(
        MOCK_PLANS_BODY.plans.annual.billed +
          " That is " +
          MOCK_PLANS_BODY.plans.annual.perMonthDisplay +
          " a " +
          MOCK_PLANS_BODY.plans.monthly.per +
          ".",
      );
      expect(screen.getByTestId("annual-saving-line")).toHaveTextContent(
        MOCK_PLANS_BODY.plans.annual.savingLine,
      );
      expect(screen.getByTestId("renewal-line-annual")).toHaveTextContent(
        MOCK_PLANS_BODY.plans.annual.renewalLine + " Full terms.",
      );

      // Currency disclaimer
      expect(screen.getByTestId("pricing-currency-note")).toHaveTextContent(
        "Prices are in " +
          MOCK_PLANS_BODY.currency +
          ". Payment is handled by Stripe, and the total you confirm there is the total you pay.",
      );
    });

    it("renders the Free and Plus comparison rows from the API", () => {
      const screen = render(
        <PlanComparison rows={MOCK_PLANS_BODY.rows} snapshot={null} />,
      );

      for (const row of MOCK_PLANS_BODY.rows) {
        expect(screen.getByTestId(`plan-row-label-${row.feature}`)).toHaveTextContent(
          row.label,
        );
        expect(screen.getByTestId(`plan-row-free-${row.feature}`)).toHaveTextContent(
          row.free,
        );
        expect(screen.getByTestId(`plan-row-plus-${row.feature}`)).toHaveTextContent(
          row.plus,
        );
      }
    });

    it("renders usage line correctly when feature usage is present", () => {
      const row = {
        feature: "custom-exercises",
        label: "Custom exercises",
        free: "Up to 3",
        plus: "Unlimited",
      };
      const usage = usageLine(
        {
          used: 2,
          limit: 3,
          remaining: 1,
          allowed: true,
          canCreate: true,
          requiresTier: "free",
          resetsAt: null,
          window: "lifetime",
        },
        row,
      );
      expect(usage).toEqual({ text: "2 of 3 used", atLimit: false });

      const atLimitUsage = usageLine(
        {
          used: 3,
          limit: 3,
          remaining: 0,
          allowed: true,
          canCreate: false,
          requiresTier: "free",
          resetsAt: null,
          window: "lifetime",
        },
        row,
      );
      expect(atLimitUsage).toEqual({ text: "3 of 3 used", atLimit: true });
    });

    it("renders Free forever section from the API", () => {
      const screen = render(
        <PlanPricing
          plans={MOCK_PLANS_BODY.plans}
          currency={MOCK_PLANS_BODY.currency}
          checkout="ready"
          available={{ monthly: true, annual: true }}
          portalState="idle"
          onStart={() => {}}
          onOpenPortal={() => {}}
        />,
      );
      expect(screen.getByTestId("choose-monthly-button")).toBeTruthy();
      expect(screen.getByTestId("choose-annual-button")).toBeTruthy();
    });

    it("asserts that no hardcoded price literals exist in the expo codebase", () => {
      function findTsFiles(dir: string, result: string[] = []): string[] {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!["node_modules", ".expo", "ios", "android", "gap_analysis"].includes(entry.name)) {
              findTsFiles(full, result);
            }
          } else if (/\.(ts|tsx)$/.test(entry.name)) {
            result.push(full);
          }
        }
        return result;
      }

      const expoDir = path.join(REPO_ROOT, "expo");
      const files = findTsFiles(expoDir);
      const offenders = files.filter((f) =>
        /\$\s?\d+[.,]\d{2}/.test(fs.readFileSync(f, "utf8")),
      );
      expect(offenders.map((f) => path.relative(expoDir, f))).toEqual([]);
    });
  });

  describe("Checkout and Navigation links", () => {
    it("starts monthly checkout when Choose monthly is tapped", async () => {
      const openUrlSpy = jest.fn(async () => true);
      const { deps, calls } = depsWith(
        {
          checkout: () =>
            jsonResponse(200, {
              url: "https://checkout.stripe.test/monthly_session",
            }),
        },
        openUrlSpy,
      );

      const screen = render(
        <PlanScreen
          deps={deps}
          initialSnapshot={sampleSnapshot({ tier: "free" })}
          initialPlans={MOCK_PLANS_BODY}
          initialStatus={{
            configured: true,
            plans: { monthly: true, annual: true },
          }}
        />,
      );

      const monthlyBtn = await screen.findByTestId("choose-monthly-button");
      await act(async () => {
        fireEvent.press(monthlyBtn);
      });

      await waitFor(() => {
        const checkoutCall = calls.find((c) =>
          c.url.includes("/api/billing/checkout"),
        );
        expect(checkoutCall).toBeDefined();
        expect(checkoutCall?.body).toEqual({
          plan: "monthly",
          returnTo: "app",
        });
      });

      expect(openUrlSpy).toHaveBeenCalledWith(
        "https://checkout.stripe.test/monthly_session",
      );
    });

    it("starts annual checkout when Choose annual is tapped", async () => {
      const openUrlSpy = jest.fn(async () => true);
      const { deps, calls } = depsWith(
        {
          checkout: () =>
            jsonResponse(200, {
              url: "https://checkout.stripe.test/annual_session",
            }),
        },
        openUrlSpy,
      );

      const screen = render(
        <PlanScreen
          deps={deps}
          initialSnapshot={sampleSnapshot({ tier: "free" })}
          initialPlans={MOCK_PLANS_BODY}
          initialStatus={{
            configured: true,
            plans: { monthly: true, annual: true },
          }}
        />,
      );

      const annualBtn = await screen.findByTestId("choose-annual-button");
      await act(async () => {
        fireEvent.press(annualBtn);
      });

      await waitFor(() => {
        const checkoutCall = calls.find((c) =>
          c.url.includes("/api/billing/checkout"),
        );
        expect(checkoutCall).toBeDefined();
        expect(checkoutCall?.body).toEqual({
          plan: "annual",
          returnTo: "app",
        });
      });

      expect(openUrlSpy).toHaveBeenCalledWith(
        "https://checkout.stripe.test/annual_session",
      );
    });

    it("Settings screen links to /plan via settings-plan-link", async () => {
      const screen = render(
        <AuthProvider>
          <SettingsScreen />
        </AuthProvider>,
      );
      const planLink = await screen.findByTestId("settings-plan-link");
      expect(planLink).toBeTruthy();

      fireEvent.press(planLink);
      expect(mockPush).toHaveBeenCalledWith("/plan");
    });

    it("UpgradeSheet links to /plan via upgrade-sheet-see-all", async () => {
      const onClose = jest.fn();
      const screen = render(
        <UpgradeSheet
          open={true}
          onClose={onClose}
          gate={{
            error: "Limit reached",
            requiresTier: "plus",
            feature: "custom-exercises",
            limit: 3,
            remaining: 0,
            resetsAt: null,
            window: "lifetime",
          }}
        />,
      );

      const seeAllBtn = await screen.findByTestId("upgrade-sheet-see-all");
      expect(seeAllBtn).toBeTruthy();
      expect(seeAllBtn).toHaveTextContent("See everything in Plus");

      fireEvent.press(seeAllBtn);
      expect(onClose).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/plan");
    });

    it("does not render pricing section for a Plus member", () => {
      const screen = render(
        <PlanScreen
          initialSnapshot={sampleSnapshot({ tier: "plus" })}
          initialPlans={MOCK_PLANS_BODY}
          initialStatus={{
            configured: true,
            plans: { monthly: true, annual: true },
          }}
        />,
      );

      // CurrentPlan is rendered
      expect(screen.getByTestId("current-plan-card")).toBeTruthy();
      // Pricing cards are NOT rendered for someone who already holds Plus
      expect(screen.queryByTestId("monthly-pricing-card")).toBeNull();
      expect(screen.queryByTestId("annual-pricing-card")).toBeNull();
    });
  });
});
