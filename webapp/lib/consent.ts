// The server side of "did this member agree, and to which text?".
//
// SERVER-ONLY (imports mongoose through the model). A client component takes
// the constants it needs from lib/legal, which is client-safe.
//
// Three writers, one shape:
//   - verify-link, for a sign-up whose form carried the tick (`source: 'signup'`)
//   - POST /api/me/consent, from the in-app gate           (`source: 'gate'`)
//   - (reserved) the Stripe checkout mirror                (`source: 'checkout'`)
// and one reader, GET /api/me/consent, which the gate polls once per app load.
//
// "Current" means the stored version equals LEGAL_VERSION. There is no
// grace, no "close enough": a member who agreed to v1.0.0 has not agreed to
// v1.1.0, and the gate asks again. That is why lib/legal/index.ts warns about
// bumping LEGAL_VERSION for a typo.

import User, { type IUserConsent } from '@/models/User'
import { LEGAL_MINIMUM_AGE, LEGAL_VERSION } from '@/lib/legal'

export interface ConsentStatus {
  /** What the app is asking members to agree to right now. */
  termsVersion: string
  minimumAge: number
  /** True when the member's stored agreement is for THIS version. */
  current: boolean
  /** The stored agreement, if any — possibly for an older version. */
  acceptedVersion: string | null
  acceptedAt: string | null
}

/** Pure: the decision, given what the row holds. */
export function consentIsCurrent(
  consent: Pick<IUserConsent, 'termsVersion'> | null | undefined,
  version: string = LEGAL_VERSION,
): boolean {
  return !!consent && consent.termsVersion === version
}

/** Pure: the record a fresh agreement writes. */
export function newConsent(source: IUserConsent['source'], now: Date = new Date()): IUserConsent {
  return {
    termsVersion: LEGAL_VERSION,
    acceptedAt: now,
    minimumAge: LEGAL_MINIMUM_AGE,
    source,
  }
}

export function consentStatus(consent: IUserConsent | null | undefined): ConsentStatus {
  return {
    termsVersion: LEGAL_VERSION,
    minimumAge: LEGAL_MINIMUM_AGE,
    current: consentIsCurrent(consent),
    acceptedVersion: consent?.termsVersion ?? null,
    acceptedAt: consent?.acceptedAt ? new Date(consent.acceptedAt).toISOString() : null,
  }
}

export async function readConsent(userId: string): Promise<IUserConsent | null> {
  const row = await User.findById(userId).select('consent').lean<{ consent?: IUserConsent } | null>()
  return row?.consent ?? null
}

/**
 * Record an agreement. A plain $set on one sub-document — deliberately NOT a
 * hydrated save(), so a legacy row (pre-collapse tier value, see
 * lib/authBridge.ts) cannot fail validation on the one write that lets its
 * owner into the app.
 */
export async function recordConsent(userId: string, source: IUserConsent['source']): Promise<IUserConsent> {
  const consent = newConsent(source)
  await User.updateOne({ _id: userId }, { $set: { consent } })
  return consent
}
