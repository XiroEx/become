import { renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { ApiError } from "@become/api-client";
import {
  API_ERROR_FALLBACK,
  ApiErrorHandlerProvider,
  resetSessionExpiry,
  routeApiError,
  useApiErrorHandler,
} from "@/lib/errors";

// Every body here is the one the web route actually sends — see
// shared/api-client/tests/classifyApiError.test.ts for the list of sources.
const PLAN_GATE = {
  error: "You've built all 3 of your free programs.",
  requiresTier: "plus",
  feature: "custom-programs",
  limit: 3,
  remaining: 0,
  resetsAt: null,
  window: "lifetime",
};

const OWNERSHIP_403 = { error: "Not authorized to update this meal" };

const AI_CONSENT_403 = {
  error:
    "Become needs your permission before sending anything to its AI provider.",
  reason: "ai_consent_required",
  aiConsent: {
    version: "v1.0.0",
    provider: "Google Gemini",
    granted: false,
    decided: false,
    decidedAt: null,
    revokedAt: null,
    decidedVersion: null,
  },
};

const SPEND_CAP_429 = {
  error:
    "You've sent a lot of messages today. Give it a few hours and come back.",
  reason: "rate_limit",
  limit: 300,
  remaining: 0,
  resetsAt: "2026-09-30T04:00:00.000Z",
};

interface Routes {
  session?: string | null;
  onSessionExpired?: () => void;
  onPlanGate?: (e: unknown) => void;
  onAiConsent?: (e: unknown) => void;
}

/** One screen: a hook instance under a provider carrying the three answers. */
function renderScreen(routes: Routes = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiErrorHandlerProvider {...routes}>{children}</ApiErrorHandlerProvider>
  );
  return renderHook(() => useApiErrorHandler(), { wrapper });
}

beforeEach(() => {
  resetSessionExpiry();
});

describe("useApiErrorHandler", () => {
  it("a 401 from any screen signs the member out ONCE", () => {
    const onSessionExpired = jest.fn();
    const routes = { session: "jwt-abc", onSessionExpired };

    // Three screens, three hook instances, three requests that were all in
    // flight when the JWT died.
    const a = renderScreen(routes);
    const b = renderScreen(routes);
    const c = renderScreen(routes);
    const unauthorized = () => new ApiError(401, { error: "Unauthorized" });

    const first = a.result.current!(unauthorized());
    const second = b.result.current!(unauthorized());
    const third = c.result.current!(unauthorized());

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(first.kind).toBe("session-expired");
    // Every one of them is handled, so no screen also shows an error banner.
    expect([first.handled, second.handled, third.handled]).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("re-arms for the next session, so the NEXT member is signed out too", () => {
    const onSessionExpired = jest.fn();
    const first = renderScreen({ session: "jwt-abc", onSessionExpired });
    first.result.current!(new ApiError(401, { error: "Unauthorized" }));
    expect(onSessionExpired).toHaveBeenCalledTimes(1);

    const second = renderScreen({ session: "jwt-xyz", onSessionExpired });
    second.result.current!(new ApiError(401, { error: "Unauthorized" }));
    expect(onSessionExpired).toHaveBeenCalledTimes(2);
  });

  it("a 401 never opens the upgrade sheet or the consent sheet", () => {
    const onPlanGate = jest.fn();
    const onAiConsent = jest.fn();
    const { result } = renderScreen({
      session: "jwt-abc",
      onSessionExpired: jest.fn(),
      onPlanGate,
      onAiConsent,
    });
    result.current!(new ApiError(401, { error: "Unauthorized" }));
    expect(onPlanGate).not.toHaveBeenCalled();
    expect(onAiConsent).not.toHaveBeenCalled();
  });

  it("a 403 gate opens the upgrade sheet with the server's wording", () => {
    const onPlanGate = jest.fn();
    const onSessionExpired = jest.fn();
    const { result } = renderScreen({ onPlanGate, onSessionExpired });

    const handled = result.current!(new ApiError(403, PLAN_GATE));

    expect(handled.kind).toBe("plan-gate");
    expect(handled.handled).toBe(true);
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(onPlanGate).toHaveBeenCalledTimes(1);
    const gate = onPlanGate.mock.calls[0]![0] as {
      gate: { error: string; feature: string; requiresTier: string };
      message: string;
    };
    expect(gate.gate.feature).toBe("custom-programs");
    expect(gate.gate.requiresTier).toBe("plus");
    expect(gate.gate.error).toBe(PLAN_GATE.error);
    expect(gate.message).toBe(PLAN_GATE.error);
  });

  it("a 403 WITHOUT feature shows the ordinary error and never the upgrade sheet", () => {
    const onPlanGate = jest.fn();
    const onSessionExpired = jest.fn();
    const { result } = renderScreen({ onPlanGate, onSessionExpired });

    const handled = result.current!(new ApiError(403, OWNERSHIP_403));

    expect(handled.kind).toBe("forbidden");
    expect(handled.handled).toBe(false);
    expect(handled.message).toBe("Not authorized to update this meal");
    expect(onPlanGate).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("a 403 carrying requiresTier but no feature is still the ordinary error", () => {
    const onPlanGate = jest.fn();
    const { result } = renderScreen({ onPlanGate });
    const handled = result.current!(
      new ApiError(403, { error: "Not authorized", requiresTier: "plus" }),
    );
    expect(handled.kind).toBe("forbidden");
    expect(onPlanGate).not.toHaveBeenCalled();
  });

  it("a 403 ai_consent_required opens the consent sheet, not the upgrade sheet", () => {
    const onAiConsent = jest.fn();
    const onPlanGate = jest.fn();
    const onSessionExpired = jest.fn();
    const { result } = renderScreen({ onAiConsent, onPlanGate, onSessionExpired });

    const handled = result.current!(new ApiError(403, AI_CONSENT_403));

    expect(handled.kind).toBe("ai-consent");
    expect(handled.handled).toBe(true);
    expect(onPlanGate).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
    const refusal = onAiConsent.mock.calls[0]![0] as {
      aiConsent: { provider: string } | null;
      message: string;
    };
    expect(refusal.aiConsent?.provider).toBe("Google Gemini");
    expect(refusal.message).toBe(AI_CONSENT_403.error);
  });

  it("a 429 spend cap is an ordinary error — never an upsell", () => {
    const onPlanGate = jest.fn();
    const { result } = renderScreen({ onPlanGate, onSessionExpired: jest.fn() });

    const handled = result.current!(new ApiError(429, SPEND_CAP_429));

    expect(handled.kind).toBe("rate-limited");
    expect(handled.handled).toBe(false);
    expect(handled.message).toBe(SPEND_CAP_429.error);
    expect(handled.message).not.toMatch(/plus|upgrade/i);
    expect(onPlanGate).not.toHaveBeenCalled();
  });

  it("a 429 with Retry-After and no wording says when, in its own words", () => {
    const { result } = renderScreen({});
    const handled = result.current!(new ApiError(429, null, undefined, "30"));
    expect(handled.kind).toBe("rate-limited");
    expect(handled.message).toContain("30s");
    expect(handled.message).not.toMatch(/plus|upgrade/i);
  });

  it("a 409 comes back with its code as the message", () => {
    const { result } = renderScreen({});
    const handled = result.current!(new ApiError(409, { error: "no_customer" }));
    expect(handled.kind).toBe("conflict");
    expect(handled.handled).toBe(false);
    expect(handled.message).toBe("no_customer");
  });

  it("a dead connection is offline, with a line of its own", () => {
    const { result } = renderScreen({ onSessionExpired: jest.fn() });
    const handled = result.current!(new TypeError("Network request failed"));
    expect(handled.kind).toBe("offline");
    expect(handled.handled).toBe(false);
    expect(handled.message).toMatch(/connection/i);
  });

  it("a 500 comes back with the server's words when it sent any", () => {
    const { result } = renderScreen({});
    const handled = result.current!(new ApiError(500, { error: "Server error" }));
    expect(handled.kind).toBe("server");
    expect(handled.message).toBe("Server error");
  });

  it("a cancelled request routes nothing and shows nothing", () => {
    const onSessionExpired = jest.fn();
    const { result } = renderScreen({ onSessionExpired });
    const aborted = Object.assign(new Error("Aborted"), { name: "AbortError" });
    const handled = result.current!(aborted);
    expect(handled.handled).toBe(true);
    expect(handled.message).toBe("");
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("with no provider mounted nothing throws and the member still reads the refusal", () => {
    const { result } = renderHook(() => useApiErrorHandler());
    const gate = result.current!(new ApiError(403, PLAN_GATE));
    expect(gate.kind).toBe("plan-gate");
    expect(gate.handled).toBe(false);
    expect(gate.message).toBe(PLAN_GATE.error);

    // Nothing signs out, so the refusal comes back as an ordinary error with
    // the server's own word for it — verbatim, like every other class.
    const expired = result.current!(new ApiError(401, { error: "Unauthorized" }));
    expect(expired.kind).toBe("session-expired");
    expect(expired.handled).toBe(false);
    expect(expired.message).toBe("Unauthorized");

    // …and this app's own line when the server sent no words at all.
    const silent = result.current!(new ApiError(401, undefined));
    expect(silent.message).toBe(API_ERROR_FALLBACK["session-expired"]);
    expect(silent.message).toMatch(/sign in again/i);
  });
});

describe("routeApiError (the same decision outside React)", () => {
  it("routes a gate, a consent refusal and a 401 exactly as the hook does", () => {
    const onPlanGate = jest.fn();
    const onAiConsent = jest.fn();
    const onSessionExpired = jest.fn();
    const routes = { session: "jwt-abc", onPlanGate, onAiConsent, onSessionExpired };

    expect(routeApiError(new ApiError(403, PLAN_GATE), routes).kind).toBe("plan-gate");
    expect(routeApiError(new ApiError(403, AI_CONSENT_403), routes).kind).toBe("ai-consent");
    expect(routeApiError(new ApiError(403, OWNERSHIP_403), routes).handled).toBe(false);
    routeApiError(new ApiError(401, { error: "Unauthorized" }), routes);
    routeApiError(new ApiError(401, { error: "Unauthorized" }), routes);

    expect(onPlanGate).toHaveBeenCalledTimes(1);
    expect(onAiConsent).toHaveBeenCalledTimes(1);
    // Still once: the latch is the app's, not the screen's.
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });
});
