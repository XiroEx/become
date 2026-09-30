// The client half of the AI consent gate: parsing the server's refusal, and
// raising the ask.
//
// CLIENT-SAFE. lib/aiConsent.ts imports mongoose through the model, so a
// component may only take TYPES and constants from lib/legal and functions
// from here — the same split as lib/entitlements.ts / lib/entitlementsClient.ts.
//
// WHY AN EVENT AND NOT A PROP. Every AI call in the app goes through
// lib/ai/runStore.ts#start, and it is not a React component: it has no way to
// render a sheet, and the ~20 surfaces that call it must not each grow their
// own copy of one. So the store announces the refusal and ONE listener
// (components/AiConsentPrompt.tsx, mounted in the dashboard layout) answers it.
// That is also what makes the ask correct for the background dispatches — the
// Mind pre-composition on app open, MindJourney's suggestions — which have no
// modal of their own to hang it off.

import { AI_CONSENT_REASON } from '@/lib/legal'

export { AI_CONSENT_REASON }

/** The JSON shape of lib/aiConsent.ts#AiConsentStatus, as it arrives here. */
export interface AiConsentStatusPayload {
  version: string
  provider: string
  granted: boolean
  decided: boolean
  decidedAt: string | null
  revokedAt: string | null
  decidedVersion: string | null
}

/** The window event the run store fires and the prompt listens for. */
export const AI_CONSENT_EVENT = 'become:ai-consent-required'

export interface AiConsentRefusal {
  error: string
  status: AiConsentStatusPayload | null
}

/**
 * Is this response the "you never said we could" refusal?
 *
 * Strict on purpose: a 403 that does not name the reason is somebody else's
 * 403 (ownership, role, a paywall) and must fall through to the caller's own
 * error handling, exactly as gateFrom() only accepts a 403 carrying both
 * `feature` and `requiresTier`.
 */
export function aiConsentRefusalFrom(status: number, body: unknown): AiConsentRefusal | null {
  if (status !== 403 || body === null || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (b.reason !== AI_CONSENT_REASON) return null
  const payload =
    b.aiConsent && typeof b.aiConsent === 'object' ? (b.aiConsent as AiConsentStatusPayload) : null
  return { error: typeof b.error === 'string' ? b.error : '', status: payload }
}

/** Ask the mounted prompt to put the question to the member. No-op on the
 *  server, and harmless when nothing is listening. */
export function requestAiConsent(detail?: AiConsentRefusal): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent<AiConsentRefusal | undefined>(AI_CONSENT_EVENT, { detail }),
    )
  } catch {
    // A browser that cannot construct a CustomEvent cannot show the sheet
    // either; the member still reaches the toggle in Settings.
  }
}
