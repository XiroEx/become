/**
 * ─── THE ONE MOUNT POINT FOR THE AI CONSENT PROMPT (NP-046) ───────────────────
 *
 * Mounted ONCE, at the root (`app/_layout.tsx`), above every route. It renders
 * nothing until an AI refusal triggers `raiseAiConsentPrompt` or something calls
 * `showAiConsentPrompt`.
 *
 * Mirrors `UpgradeSheetHost` (NP-052):
 * - Sits at the root so it outlives any single screen.
 * - Subscribes to the module store in `lib/ai/aiConsentPrompt.ts`.
 * - Renders `ConsentSheet` with the gate's AI copy (`showTerms: false`, `showAi: true`).
 * - Never pre-ticks the box.
 * - On agree (`aiChecked: true`): POSTs `source: "prompt"`, closes, and retries the action once.
 * - On decline (`aiChecked: false` or dismiss): POSTs `source: "prompt"` with `accepted: false`,
 *   closes, and leaves non-AI path working.
 */

import { useCallback, useState, useSyncExternalStore } from "react";
import { ConsentSheet } from "@/components/auth/ConsentSheet";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import type { BrowserLauncher } from "@/lib/programs/browserLauncher";
import { CONSENT_ERROR_SAVE } from "@become/core";
import {
  getAiConsentPromptState,
  hideAiConsentPrompt,
  subscribeToAiConsentPrompt,
  type AiConsentPromptState,
} from "@/lib/ai/aiConsentPrompt";

export interface AiConsentPromptDeps {
  token?: string | null;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  launcher?: BrowserLauncher;
}

export interface AiConsentPromptHostProps {
  deps?: AiConsentPromptDeps;
}

function useSafeAuthToken(): string | null {
  try {
    const auth = useAuth();
    return auth.token;
  } catch {
    return null;
  }
}

interface ModalProps {
  state: AiConsentPromptState;
  deps?: AiConsentPromptDeps;
}

function AiConsentPromptModal({ state, deps }: ModalProps) {
  const contextToken = useSafeAuthToken();
  const effectiveToken = deps?.token !== undefined ? deps.token : contextToken;

  const [aiChecked, setAiChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAgree = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const baseUrl = deps?.baseUrl ?? WEBAPP_BASE_URL;
      const fetchImpl = deps?.fetchImpl ?? fetch;
      const token = effectiveToken ?? "";

      const res = await fetchImpl(`${baseUrl}/api/me/ai-consent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          accepted: aiChecked,
          source: "prompt",
        }),
      });

      if (!res.ok) throw new Error(`status ${res.status}`);

      const onAgreeCb = state.onAgree;
      const onDeclineCb = state.onDecline;

      hideAiConsentPrompt();

      if (aiChecked) {
        if (onAgreeCb) {
          await onAgreeCb();
        }
      } else {
        if (onDeclineCb) {
          await onDeclineCb();
        }
      }
    } catch {
      setError(CONSENT_ERROR_SAVE);
    } finally {
      setBusy(false);
    }
  }, [busy, effectiveToken, deps, aiChecked, state.onAgree, state.onDecline]);

  const handleClose = useCallback(() => {
    const onDeclineCb = state.onDecline;
    hideAiConsentPrompt();
    if (onDeclineCb) {
      void onDeclineCb();
    }
  }, [state.onDecline]);

  return (
    <ConsentSheet
      visible={true}
      checked={true}
      onCheckedChange={() => {}}
      onAgree={handleAgree}
      onClose={handleClose}
      busy={busy}
      error={error}
      showTerms={false}
      showAi={true}
      aiChecked={aiChecked}
      onAiCheckedChange={setAiChecked}
      provider={state.provider}
      launcher={deps?.launcher}
      testID="ai-consent-prompt"
    />
  );
}

export function AiConsentPromptHost({ deps }: AiConsentPromptHostProps = {}) {
  const state = useSyncExternalStore(
    subscribeToAiConsentPrompt,
    getAiConsentPromptState,
    getAiConsentPromptState,
  );

  if (!state.open) return null;

  return <AiConsentPromptModal state={state} deps={deps} />;
}

export default AiConsentPromptHost;
