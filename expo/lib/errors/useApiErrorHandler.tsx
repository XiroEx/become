/**
 * ─── One place a refused request is answered ──────────────────────────────────
 *
 * `classifyApiError` (shared/api-client) says WHAT a failure was. This says
 * what the app DOES about it, and there is one of it on purpose: the three
 * classes that need a screen of their own must never be re-derived beside a
 * fetch call.
 *
 *   session-expired  → sign out (NP-002). Exactly ONCE per session, however
 *                      many requests were in flight when the JWT died.
 *   plan-gate        → the upgrade sheet (NP-052), rendering `gate.error`
 *                      verbatim. Only a 403 carrying BOTH `feature` and
 *                      `requiresTier` ever gets here.
 *   ai-consent       → the consent sheet (NP-046).
 *
 * Everything else — an ownership 403, a 429 spend ceiling, a 409, an outage, a
 * dead connection — comes back to the caller with the server's own words and no
 * sheet at all. The two rules that carry the most weight:
 *
 *   • a 403 without `feature` shows the ordinary error, NEVER the upgrade sheet;
 *   • a 429 is never an upsell.
 *
 * WHY THE SHEETS ARE PROPS. The upgrade sheet, the consent sheet and the native
 * sign-out are three other cards. This hook is useful before any of them exist
 * and must not import them: mount `ApiErrorHandlerProvider` once, high up, hand
 * it the three callbacks, and every screen below gets them by calling
 * `useApiErrorHandler()`. With no provider (or a route left unset) the failure
 * simply comes back as an ordinary error with the server's wording — which is
 * still an improvement on signing a member out for a paywall.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  classifyApiError,
  isAbortError,
  type AiConsentError,
  type ApiErrorClassification,
  type ApiErrorKind,
  type PlanGateError,
  type SessionExpiredError,
} from "@become/api-client";

export interface ApiErrorRoutes {
  /**
   * The session this handler is armed for — the JWT, or null when signed out.
   *
   * It is what makes "sign out once" mean once per SESSION rather than once per
   * app launch: three screens whose requests all 401 produce one sign-out, and
   * the next member to sign in is armed again.
   */
  session?: string | null;
  /** Clear the session and land on the sign-in screen (NP-002). */
  onSessionExpired?: (error: SessionExpiredError) => void;
  /** Raise the upgrade sheet for this gate (NP-052). */
  onPlanGate?: (error: PlanGateError) => void;
  /** Ask for the AI permission (NP-046). */
  onAiConsent?: (error: AiConsentError) => void;
}

export interface HandledApiError {
  /** The full classification, for a caller that needs a field by name. */
  classification: ApiErrorClassification;
  kind: ApiErrorKind;
  /**
   * TRUE when a sheet or the sign-out has taken this over: the screen must not
   * also show an error of its own. False means "this one is yours" — render
   * `message`.
   */
  handled: boolean;
  /**
   * What to show when `handled` is false. The server's own words whenever it
   * sent any — they are never rewritten, reworded or added to — and otherwise
   * one short line per class from `API_ERROR_FALLBACK`.
   */
  message: string;
}

/**
 * The line to show when the server sent no words of its own. Nothing here names
 * a tier, a price or an upgrade: the only refusal Plus can answer is a
 * plan-gate, and that one always arrives with the server's wording and goes to
 * the sheet rather than to a banner.
 */
export const API_ERROR_FALLBACK: Record<ApiErrorKind, string> = {
  "session-expired": "Your session has ended. Please sign in again.",
  "plan-gate": "That is not included on your plan.",
  "ai-consent": "This needs your permission first.",
  forbidden: "You do not have access to that.",
  "rate-limited": "You have done that a lot just now. Give it a few minutes and try again.",
  conflict: "That changed while you were working on it. Reload and try again.",
  client: "That did not work. Try again.",
  server: "Become is having a problem. Try again in a moment.",
  offline: "No connection. Check your signal and try again.",
  "invalid-response": "Become got an unexpected answer. Try again.",
};

// ─── The sign-out latch ──────────────────────────────────────────────────────
//
// MODULE level, not per hook: a 401 arriving on three screens at once is three
// hook instances, and a latch inside one of them would sign the member out
// three times — three navigations, and on the web version of this bug, three
// toasts. `null` means "not fired since the app started".

let signedOutFor: { session: string | null } | null = null;

/**
 * Re-arm the sign-out. Called automatically when the provider is handed a
 * different `session`; exported for tests and for anything that establishes a
 * session without re-rendering the provider.
 */
export function resetSessionExpiry(): void {
  signedOutFor = null;
}

/** Has the sign-out already fired for this session? (For tests and assertions.) */
export function sessionExpiryFired(session: string | null = null): boolean {
  return signedOutFor !== null && signedOutFor.session === session;
}

// ─── The router ──────────────────────────────────────────────────────────────

/**
 * Classify a thrown error and route it. Pure apart from the sign-out latch, and
 * exported so the code that is NOT a component — the AI run client, the offline
 * queue replay — answers a refusal exactly the way a screen does.
 */
export function routeApiError(
  err: unknown,
  routes: ApiErrorRoutes = {},
): HandledApiError {
  const classification = classifyApiError(err);

  // A cancelled request is nobody's error: a screen unmounted, or a newer
  // request replaced this one. Nothing to route and nothing to show.
  if (isAbortError(err)) {
    return { classification, kind: classification.kind, handled: true, message: "" };
  }

  const session = routes.session ?? null;

  switch (classification.kind) {
    case "session-expired": {
      if (!routes.onSessionExpired) break;
      if (signedOutFor !== null && signedOutFor.session === session) {
        // Already signed out for this session — the other screens' 401s.
        return {
          classification,
          kind: classification.kind,
          handled: true,
          message: "",
        };
      }
      signedOutFor = { session };
      routes.onSessionExpired(classification);
      return { classification, kind: classification.kind, handled: true, message: "" };
    }
    case "plan-gate": {
      if (!routes.onPlanGate) break;
      routes.onPlanGate(classification);
      return { classification, kind: classification.kind, handled: true, message: "" };
    }
    case "ai-consent": {
      if (!routes.onAiConsent) break;
      routes.onAiConsent(classification);
      return { classification, kind: classification.kind, handled: true, message: "" };
    }
    default:
      break;
  }

  return {
    classification,
    kind: classification.kind,
    handled: false,
    message: messageFor(classification),
  };
}

/** The server's wording verbatim, or this class's fallback line. */
export function messageFor(classification: ApiErrorClassification): string {
  if (classification.message) return classification.message;
  if (
    classification.kind === "rate-limited" &&
    typeof classification.retryAfterSeconds === "number"
  ) {
    return `You have done that a lot just now. Try again in ${classification.retryAfterSeconds}s.`;
  }
  return API_ERROR_FALLBACK[classification.kind];
}

// ─── The provider and the hook ───────────────────────────────────────────────

const ApiErrorRoutesContext = createContext<ApiErrorRoutes>({});

export interface ApiErrorHandlerProviderProps extends ApiErrorRoutes {
  children: ReactNode;
}

/**
 * Mount once, above everything that makes a request, and hand it the three
 * answers. A different `session` re-arms the sign-out.
 */
export function ApiErrorHandlerProvider({
  session = null,
  onSessionExpired,
  onPlanGate,
  onAiConsent,
  children,
}: ApiErrorHandlerProviderProps) {
  const value = useMemo<ApiErrorRoutes>(() => {
    // A new session is a new chance to be signed out. Done here rather than in
    // an effect so the arming is in place before the first render's requests
    // can come back.
    if (signedOutFor !== null && signedOutFor.session !== session) {
      resetSessionExpiry();
    }
    return { session, onSessionExpired, onPlanGate, onAiConsent };
  }, [session, onSessionExpired, onPlanGate, onAiConsent]);

  return (
    <ApiErrorRoutesContext.Provider value={value}>
      {children}
    </ApiErrorRoutesContext.Provider>
  );
}

/**
 * THE hook. `const handleApiError = useApiErrorHandler()`, then
 * `const { handled, message } = handleApiError(err)` wherever a request can
 * fail — and show `message` only when `handled` is false.
 */
export function useApiErrorHandler(): (err: unknown) => HandledApiError {
  const routes = useContext(ApiErrorRoutesContext);
  return useCallback((err: unknown) => routeApiError(err, routes), [routes]);
}
