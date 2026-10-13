/**
 * ─── ONE AI CONSENT PROMPT, RAISED FROM ANYWHERE (NP-046) ─────────────────────
 *
 * App Store Review Guideline 5.1.2(i) requires explicit permission before personal
 * data reaches a third-party AI provider.
 *
 * When an AI endpoint refuses with 403 `reason: 'ai_consent_required'`, the error
 * handler routes it here: `raiseAiConsentPrompt(error, options)`.
 *
 * A single `<AiConsentPromptHost />` mounted at the app root (`app/_layout.tsx`)
 * subscribes to this module store and renders the consent sheet with the gate's
 * AI copy (`showTerms: false`, `showAi: true`).
 *
 * - On agree: POSTs `source: "prompt"` with `accepted: true`, closes the sheet,
 *   and retries the caller's action once. Safe because every AI route checks
 *   consent before charging an allowance unit.
 * - On decline (unticked + continue, or dismiss): POSTs `source: "prompt"` with
 *   `accepted: false`, closes the sheet, and leaves the non-AI path working
 *   (invoking `onDecline` if provided).
 */

import type { AiConsentError } from "@become/api-client";
import { classifyApiError } from "@become/api-client";
import { AI_PROVIDER } from "@become/core";

export interface AiConsentPromptOptions {
  /** The refusal error from classifyApiError */
  error?: AiConsentError | null;
  /** Provider name override from status / refusal (defaults to status or AI_PROVIDER) */
  provider?: string;
  /** Callback / action to retry once upon agreement */
  onRetry?: () => void | Promise<void>;
  /** Alias for onRetry */
  onAgree?: () => void | Promise<void>;
  /** Callback if the member declines (leaves non-AI path working) */
  onDecline?: () => void | Promise<void>;
}

export interface AiConsentPromptState {
  open: boolean;
  error: AiConsentError | null;
  provider: string;
  onAgree?: () => void | Promise<void>;
  onDecline?: () => void | Promise<void>;
}

let promptState: AiConsentPromptState = {
  open: false,
  error: null,
  provider: AI_PROVIDER,
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Show the AI consent sheet. */
export function showAiConsentPrompt(options?: AiConsentPromptOptions): boolean {
  const provider =
    options?.provider ??
    options?.error?.aiConsent?.provider ??
    AI_PROVIDER;

  promptState = {
    open: true,
    error: options?.error ?? null,
    provider,
    onAgree: options?.onAgree ?? options?.onRetry,
    onDecline: options?.onDecline,
  };
  emit();
  return true;
}

/** Hide the AI consent sheet. */
export function hideAiConsentPrompt(): void {
  if (!promptState.open) return;
  promptState = {
    open: false,
    error: null,
    provider: AI_PROVIDER,
  };
  emit();
}

/** Read the current prompt state (for useSyncExternalStore). */
export function getAiConsentPromptState(): AiConsentPromptState {
  return promptState;
}

/** Subscribe to prompt opens and closes. */
export function subscribeToAiConsentPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Route handler callback for error handler (NP-010 / NP-046).
 * Opens the consent sheet when an `ai-consent` classification is routed.
 */
export function raiseAiConsentPrompt(
  error?: AiConsentError | null,
  options?: AiConsentPromptOptions,
): void {
  showAiConsentPrompt({
    ...options,
    error: error ?? options?.error,
    provider: options?.provider ?? error?.aiConsent?.provider,
  });
}

export interface ExecuteWithAiConsentOptions {
  onDecline?: () => void | Promise<void>;
  handleApiError?: (err: unknown, opts?: AiConsentPromptOptions) => void;
}

/**
 * Executes an AI action. If the call fails with an `ai-consent` refusal,
 * opens the consent sheet. On agree, retries the action once; on decline,
 * leaves the non-AI path working (calling `onDecline` if provided).
 */
export async function executeWithAiConsent<T>(
  action: () => Promise<T>,
  options: ExecuteWithAiConsentOptions = {},
): Promise<T | undefined> {
  try {
    return await action();
  } catch (err) {
    const classification = classifyApiError(err);
    if (classification.kind === "ai-consent") {
      return new Promise<T | undefined>((resolve, reject) => {
        let retried = false;
        const promptOptions: AiConsentPromptOptions = {
          error: classification,
          provider: classification.aiConsent?.provider,
          onAgree: async () => {
            if (retried) return;
            retried = true;
            try {
              const res = await action();
              resolve(res);
            } catch (retryErr) {
              reject(retryErr);
            }
          },
          onDecline: async () => {
            await options.onDecline?.();
            resolve(undefined);
          },
        };

        if (options.handleApiError) {
          options.handleApiError(err, promptOptions);
        } else {
          showAiConsentPrompt(promptOptions);
        }
      });
    }

    if (options.handleApiError) {
      options.handleApiError(err);
    }
    throw err;
  }
}
