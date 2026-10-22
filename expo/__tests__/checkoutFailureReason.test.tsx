/**
 * CHECKOUT FAILURE REASONS — the machine `Reason:` under the friendly error.
 *
 * The production route answers 200 while the TestFlight phone shows
 * "Checkout didn't start", so the failure is client-side and the sheet must
 * say WHICH client-side thing failed: `network` (fetch threw), `schema` (a
 * 2xx the shared schema rejected), `http-<status>-<code>` (a refused checkout
 * the state machine files as retryable), or `open-failed: <message>` (Stripe
 * answered, the browser refused). Every reason is also recorded for the
 * Settings Diagnostics block.
 */
import { render, waitFor } from "@testing-library/react-native";
import { ApiError } from "@become/api-client";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";
import {
  createMemoryAsyncStorage,
  type AsyncStorageLike,
} from "@/lib/query/persistor";
import {
  checkoutHttpReason,
  openExternallyDetailed,
  startCheckout,
  type BillingDeps,
} from "@/lib/entitlements/billing";
import { CheckoutAction } from "@/components/entitlements/UpgradeSheet";
import {
  readCheckoutFailure,
  recordCheckoutFailure,
} from "@/lib/diagnostics/deviceDiagnostics";

function jwtFor(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + 3600 }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig-${userId}`;
}

const MEMBER = jwtFor("member-1");

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  } as unknown as Response;
}

function depsWith(
  fetchImpl: typeof fetch,
  openUrl?: (url: string) => Promise<unknown>,
): { deps: BillingDeps; storage: AsyncStorageLike } {
  const storage = createMemoryAsyncStorage();
  return {
    deps: {
      baseUrl: "https://example.test",
      store: createMemoryTokenStore(MEMBER),
      fetchImpl,
      ...(openUrl ? { openUrl } : {}),
      diagnosticsStorage: storage,
    },
    storage,
  };
}

describe("checkout failure reasons", () => {
  it("reports network when the request never gets an answer", async () => {
    const { deps, storage } = depsWith(async () => {
      throw new Error("Network request failed");
    });
    const result = await startCheckout("monthly", deps);
    expect(result).toEqual({
      kind: "state",
      state: "error",
      reason: "network",
    });
    await expect(readCheckoutFailure(storage)).resolves.toMatchObject({
      reason: "network",
    });
  });

  it("reports schema when a 2xx answers what the schema rejects", async () => {
    const { deps, storage } = depsWith(
      (async () => jsonResponse(200, { noUrlHere: true })) as unknown as typeof fetch,
    );
    const result = await startCheckout("monthly", deps);
    expect(result).toEqual({
      kind: "state",
      state: "error",
      reason: "schema",
    });
    await expect(readCheckoutFailure(storage)).resolves.toMatchObject({
      reason: "schema",
    });
  });

  it("reports http-<status>-<code> for a retryable refusal", async () => {
    const { deps, storage } = depsWith(
      (async () =>
        jsonResponse(502, { error: "checkout_failed" })) as unknown as typeof fetch,
    );
    const result = await startCheckout("monthly", deps);
    expect(result).toEqual({
      kind: "state",
      state: "error",
      reason: "http-502-checkout_failed",
    });
    expect(checkoutHttpReason(502, { error: "checkout_failed" })).toBe(
      "http-502-checkout_failed",
    );
    await expect(readCheckoutFailure(storage)).resolves.toMatchObject({
      reason: "http-502-checkout_failed",
    });
  });

  it("carries no reason on a non-error refusal (already-plus)", async () => {
    const { deps, storage } = depsWith(
      (async () =>
        jsonResponse(409, { error: "already_plus" })) as unknown as typeof fetch,
    );
    const result = await startCheckout("monthly", deps);
    expect(result).toEqual({ kind: "state", state: "already-plus" });
    await expect(readCheckoutFailure(storage)).resolves.toBeNull();
  });

  it("reports open-failed with the rejection message when the browser refuses", async () => {
    const openUrl = jest.fn(async () => {
      throw new Error("no handler for https");
    });
    const { deps, storage } = depsWith(
      (async () =>
        jsonResponse(200, {
          url: "https://checkout.stripe.com/c/pay/cs_test_123",
        })) as unknown as typeof fetch,
      openUrl,
    );
    const started = await startCheckout("monthly", deps);
    expect(started.kind).toBe("url");
    if (started.kind !== "url") return;
    const outcome = await openExternallyDetailed(started.url, deps);
    expect(outcome).toEqual({
      opened: false,
      reason: "open-failed: no handler for https",
    });
    await expect(readCheckoutFailure(storage)).resolves.toMatchObject({
      reason: "open-failed: no handler for https",
    });
  });

  it("reports nothing when the browser opens", async () => {
    const openUrl = jest.fn(async () => true);
    const { deps, storage } = depsWith(
      (async () => jsonResponse(200, { url: "https://x.test" })) as unknown as typeof fetch,
      openUrl,
    );
    const outcome = await openExternallyDetailed("https://x.test", deps);
    expect(outcome).toEqual({ opened: true });
    expect(openUrl).toHaveBeenCalledWith("https://x.test");
    await expect(readCheckoutFailure(storage)).resolves.toBeNull();
  });

  it("renders the reason under the friendly sentence, and nothing without one", async () => {
    const noop = jest.fn();
    const withReason = render(
      <CheckoutAction
        state="error"
        tierName="Plus"
        portalState="idle"
        browserOpened={false}
        onStart={noop}
        onOpenPortal={noop}
        reason="open-failed: no handler for https"
        testID="reason-sheet"
      />,
    );
    await waitFor(() =>
      expect(withReason.getByTestId("reason-sheet-checkout-error")).toHaveTextContent(
        /Checkout didn't start\. That one is on us, and nothing was charged\./,
      ),
    );
    expect(
      withReason.getByTestId("reason-sheet-checkout-error-reason"),
    ).toHaveTextContent("Reason: open-failed: no handler for https");
    withReason.unmount();

    const withoutReason = render(
      <CheckoutAction
        state="error"
        tierName="Plus"
        portalState="idle"
        browserOpened={false}
        onStart={noop}
        onOpenPortal={noop}
        testID="reason-sheet"
      />,
    );
    await waitFor(() =>
      expect(withoutReason.getByTestId("reason-sheet-checkout-error")).toBeTruthy(),
    );
    expect(
      withoutReason.queryByTestId("reason-sheet-checkout-error-reason"),
    ).toBeNull();
    withoutReason.unmount();
  });

  it("a non-error ApiError still maps through the state machine untouched", () => {
    expect(new ApiError(409, { error: "already_plus" }).status).toBe(409);
    expect(checkoutHttpReason(401, { error: "Unauthorized" })).toBe(
      "http-401-Unauthorized",
    );
    expect(checkoutHttpReason(500, "<html>bad</html>")).toBe("http-500-unknown");
  });

  it("recordCheckoutFailure round-trips the last reason with its time", async () => {
    const storage = createMemoryAsyncStorage();
    await expect(readCheckoutFailure(storage)).resolves.toBeNull();
    await recordCheckoutFailure("network", 1727600000000, storage);
    await expect(readCheckoutFailure(storage)).resolves.toEqual({
      reason: "network",
      at: 1727600000000,
    });
  });
});
