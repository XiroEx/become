import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import type { BrowserLauncher } from "@/lib/programs/browserLauncher";
import { CONSENT_ERROR_SAVE } from "@become/core";
import { ConsentSheet } from "./ConsentSheet";

export interface ConsentGateProps {
  children: ReactNode;
  /** Explicit token override for testing or environments without AuthProvider */
  token?: string | null;
  /** Custom baseUrl override (defaults to WEBAPP_BASE_URL) */
  baseUrl?: string;
  /** Custom fetch implementation for tests */
  fetchImpl?: typeof fetch;
  /** Custom browser launcher for testing link clicks */
  launcher?: BrowserLauncher;
}

interface ConsentStatusBody {
  termsVersion?: string;
  minimumAge?: number;
  current?: boolean;
  acceptedVersion?: string | null;
  acceptedAt?: string | null;
  ai?: {
    version?: string;
    provider?: string;
    granted?: boolean;
    decided?: boolean;
    decidedAt?: string | null;
    revokedAt?: string | null;
    decidedVersion?: string | null;
  };
}

/**
 * Module-level: once every open question is answered in this launch session,
 * never asked again for the life of the bundle.
 */
let settledCurrent = false;

/** Testing hook to clear settled state between tests. */
export function resetConsentSettled(): void {
  settledCurrent = false;
}

function useSafeAuthToken(): string | null {
  try {
    const auth = useAuth();
    return auth.token;
  } catch {
    return null;
  }
}

/**
 * THE IN-APP CONSENT GATE (NP-045).
 *
 * Sits in the signed-in layout before onboarding (NP-003):
 *   1. Fetches GET /api/me/consent once per launch.
 *   2. If current Terms or AI question are unanswered, renders a full-screen
 *      blocking sheet (ConsentSheet).
 *   3. Terms tick is required; AI tick is optional but unanswered is asked again.
 *   4. Fails open on network errors and 5xx so a flaky connection never locks
 *      a member out of the app.
 *   5. When agreeing:
 *      - If Terms needed: POST /api/me/consent { accepted: true, ai?: boolean }
 *      - If only AI needed: POST /api/me/ai-consent { accepted: boolean, source: 'gate' }
 */
export function ConsentGate({
  children,
  token: propToken,
  baseUrl,
  fetchImpl,
  launcher,
}: ConsentGateProps) {
  const contextToken = useSafeAuthToken();
  const effectiveToken = propToken !== undefined ? propToken : contextToken;

  const [open, setOpen] = useState(false);
  const [needsTerms, setNeedsTerms] = useState(false);
  const [needsAi, setNeedsAi] = useState(false);
  const [checked, setChecked] = useState(false);
  const [aiChecked, setAiChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settledCurrent) return;
    if (!effectiveToken) return;

    let cancelled = false;
    (async () => {
      try {
        const effectiveBaseUrl = baseUrl ?? WEBAPP_BASE_URL;
        const effectiveFetch = fetchImpl ?? fetch;
        const res = await effectiveFetch(`${effectiveBaseUrl}/api/me/consent`, {
          headers: { Authorization: `Bearer ${effectiveToken}` },
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json().catch(() => null)) as ConsentStatusBody | null;
        if (cancelled || !body) return;

        const termsOpen = body.current === false;
        // `decided` is the question, not `granted`: a member who said no has
        // answered, and re-asking every open would nag them into a yes.
        const aiOpen = body.ai?.decided === false;
        if (!termsOpen && !aiOpen) {
          settledCurrent = true;
          return;
        }
        setNeedsTerms(termsOpen);
        setNeedsAi(aiOpen);
        setOpen(true);
      } catch {
        // Fail open — see header comment and card rules.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveToken, baseUrl, fetchImpl]);

  const agree = useCallback(async () => {
    if ((needsTerms && !checked) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const effectiveBaseUrl = baseUrl ?? WEBAPP_BASE_URL;
      const effectiveFetch = fetchImpl ?? fetch;
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${effectiveToken ?? ""}`,
      };

      const res = needsTerms
        ? await effectiveFetch(`${effectiveBaseUrl}/api/me/consent`, {
            method: "POST",
            headers,
            body: JSON.stringify(needsAi ? { accepted: true, ai: aiChecked } : { accepted: true }),
          })
        : await effectiveFetch(`${effectiveBaseUrl}/api/me/ai-consent`, {
            method: "POST",
            headers,
            body: JSON.stringify({ accepted: aiChecked, source: "gate" }),
          });

      if (!res.ok) throw new Error(`status ${res.status}`);
      settledCurrent = true;
      setOpen(false);
    } catch {
      setError(CONSENT_ERROR_SAVE);
    } finally {
      setBusy(false);
    }
  }, [needsTerms, checked, busy, effectiveToken, baseUrl, fetchImpl, needsAi, aiChecked]);

  return (
    <>
      {!open && children}
      {open && (
        <ConsentSheet
          visible={open}
          checked={checked}
          onCheckedChange={setChecked}
          onAgree={agree}
          busy={busy}
          error={error}
          showTerms={needsTerms}
          showAi={needsAi}
          aiChecked={aiChecked}
          onAiCheckedChange={setAiChecked}
          launcher={launcher}
        />
      )}
    </>
  );
}
