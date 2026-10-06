/**
 * BillingSection — the native mirror of
 * `webapp/components/billing/BillingSection.tsx` (NP-303). Settings had no
 * billing exit at all; this is the second way into the Stripe portal, next to
 * the Plan page.
 */
/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockOpenBillingPortal = jest.fn(async () => true);
jest.mock("@/lib/entitlements/billing", () => {
  const actual = jest.requireActual("@/lib/entitlements/billing");
  return {
    ...actual,
    openBillingPortal: () => mockOpenBillingPortal(),
  };
});

import { BillingSection } from "@/components/billing/BillingSection";
import { MANAGE_BILLING_LABEL } from "@become/core";
import {
  configureEntitlementsStore,
  resetEntitlementsSnapshot,
  setEntitlementsToken,
} from "@/lib/entitlements";
/* eslint-enable import/first */

function jwtFor(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + 86400 }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig-${userId}`;
}

function snapshotFor(subscription: unknown) {
  return {
    role: "user",
    tier: "plus",
    enforced: true,
    grandfathered: false,
    subscription,
    checkoutAvailable: true,
    features: {},
  };
}

function fetchFor(body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
      headers: { get: () => null },
    }) as unknown as Response) as unknown as typeof fetch;
}

beforeEach(() => {
  mockOpenBillingPortal.mockClear();
  mockOpenBillingPortal.mockResolvedValue(true);
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
});

afterEach(() => {
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
});

describe("BillingSection (NP-303)", () => {
  it("renders nothing for a member with no manageable subscription", async () => {
    configureEntitlementsStore({
      baseUrl: "https://example.test",
      fetchImpl: fetchFor(snapshotFor(null)),
    });
    setEntitlementsToken(jwtFor("free-member"));

    const { queryByTestId } = render(<BillingSection />);
    await waitFor(() => {
      expect(queryByTestId("settings-billing-section")).toBeNull();
    });
  });

  it("renders the Billing card and Manage billing for a member with an active subscription", async () => {
    configureEntitlementsStore({
      baseUrl: "https://example.test",
      fetchImpl: fetchFor(
        snapshotFor({ status: "active", currentPeriodEnd: null, cancelAtPeriodEnd: false }),
      ),
    });
    setEntitlementsToken(jwtFor("plus-member"));

    const { getByTestId, getByText } = render(<BillingSection />);
    await waitFor(() => {
      expect(getByTestId("settings-billing-section")).toBeTruthy();
    });
    expect(getByText("Billing")).toBeTruthy();
    expect(getByText(MANAGE_BILLING_LABEL)).toBeTruthy();
  });

  it("renders for a past_due subscriber — the member whose card is the problem", async () => {
    configureEntitlementsStore({
      baseUrl: "https://example.test",
      fetchImpl: fetchFor(
        snapshotFor({ status: "past_due", currentPeriodEnd: null, cancelAtPeriodEnd: false }),
      ),
    });
    setEntitlementsToken(jwtFor("past-due-member"));

    const { getByTestId } = render(<BillingSection />);
    await waitFor(() => {
      expect(getByTestId("settings-billing-section")).toBeTruthy();
    });
  });

  it("opens the portal on press", async () => {
    configureEntitlementsStore({
      baseUrl: "https://example.test",
      fetchImpl: fetchFor(
        snapshotFor({ status: "active", currentPeriodEnd: null, cancelAtPeriodEnd: false }),
      ),
    });
    setEntitlementsToken(jwtFor("plus-member-2"));

    const { getByTestId } = render(<BillingSection />);
    await waitFor(() => {
      expect(getByTestId("settings-billing-section")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("manage-billing"));
    });

    expect(mockOpenBillingPortal).toHaveBeenCalledTimes(1);
  });
});
