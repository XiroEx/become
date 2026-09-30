// "May this member's data be sent to the AI provider?" — the server side.
//
// App Store Review Guideline 5.1.2(i): "You must clearly disclose where
// personal data will be shared with third parties, including with third-party
// AI, and obtain explicit permission before doing so."
//
// Become sends meal photos and descriptions, workout-generation inputs (which
// can include injury notes), Mind session inputs and coach-chat text to Google
// Gemini through the redbtn platform. This module is the permission for that,
// and requireAiConsent() is the gate every dispatching route takes.
//
// SERVER-ONLY (imports mongoose through the model). A client component takes
// its constants from lib/legal (client-safe) and its 403 parsing from
// lib/aiConsentClient.ts.
//
// THREE PROPERTIES, AND EACH ONE IS THE POINT:
//
//   EXPLICIT   Absent means never asked, which answers FALSE. There is no
//              "they used the app, so they must have meant yes" branch here,
//              and there must never be one: the whole guideline is that
//              silence is not permission. The gate also fails CLOSED, unlike
//              every client-side lock in this app — a database blip must not
//              hand a stranger's injury notes to a third party.
//
//   RECORDED   The answer, the version of the ask it answers, when it was
//              given and where from. A refusal is recorded too, so the member
//              is not asked again on every app open.
//
//   REVOCABLE  revokeAiConsent() flips it back and stamps `revokedAt`. The
//              next dispatch is refused with no deploy, no support ticket and
//              no cache to wait out: the gate reads the row per request.

import { NextResponse } from 'next/server'
import User, { type IUserAiConsent } from '@/models/User'
import {
  AI_CONSENT_REASON,
  AI_CONSENT_REFUSAL_MESSAGE,
  AI_CONSENT_VERSION,
  AI_PROVIDER,
} from '@/lib/legal'

export interface AiConsentStatus {
  /** What the app is asking permission for right now. */
  version: string
  /** The provider the permission names, so a client never hardcodes it. */
  provider: string
  /** May data be sent to the provider at this moment? */
  granted: boolean
  /** Has this member answered the CURRENT version of the ask at all? A false
   *  here is what makes the gate open; a false `granted` with `decided: true`
   *  is a member who said no and must not be nagged. */
  decided: boolean
  decidedAt: string | null
  revokedAt: string | null
  /** The version they actually answered, which may be an older one. */
  decidedVersion: string | null
}

/**
 * Pure: may this record's owner have their data sent right now?
 *
 * A stored answer for an OLDER version does not carry forward. That is the
 * conservative reading and the right one: the version only moves when what
 * leaves the app changes, and permission for the old set is not permission for
 * the new one.
 */
export function aiConsentGranted(
  consent: Pick<IUserAiConsent, 'granted' | 'version'> | null | undefined,
  version: string = AI_CONSENT_VERSION,
): boolean {
  return !!consent && consent.granted === true && consent.version === version
}

/** Pure: has this member answered the current ask, either way? */
export function aiConsentDecided(
  consent: Pick<IUserAiConsent, 'version'> | null | undefined,
  version: string = AI_CONSENT_VERSION,
): boolean {
  return !!consent && consent.version === version
}

/** Pure: the record a fresh decision writes. */
export function newAiConsent(
  granted: boolean,
  source: IUserAiConsent['source'],
  now: Date = new Date(),
  previous?: IUserAiConsent | null,
): IUserAiConsent {
  const wasGranted = !!previous?.granted
  return {
    version: AI_CONSENT_VERSION,
    granted,
    decidedAt: now,
    source,
    // Only a withdrawal of a permission that was actually held is a
    // revocation. A plain "no thanks" the first time is a refusal, and dating
    // it as a revocation would claim data flowed when none ever did.
    ...(!granted && wasGranted ? { revokedAt: now } : {}),
  }
}

export function aiConsentStatus(consent: IUserAiConsent | null | undefined): AiConsentStatus {
  return {
    version: AI_CONSENT_VERSION,
    provider: AI_PROVIDER,
    granted: aiConsentGranted(consent),
    decided: aiConsentDecided(consent),
    decidedAt: consent?.decidedAt ? new Date(consent.decidedAt).toISOString() : null,
    revokedAt: consent?.revokedAt ? new Date(consent.revokedAt).toISOString() : null,
    decidedVersion: consent?.version ?? null,
  }
}

export async function readAiConsent(userId: string): Promise<IUserAiConsent | null> {
  const row = await User.findById(userId)
    .select('aiConsent')
    .lean<{ aiConsent?: IUserAiConsent } | null>()
  return row?.aiConsent ?? null
}

/**
 * Record a decision. A plain $set on one sub-document — deliberately NOT a
 * hydrated save(), for the same reason lib/consent.ts is not: a legacy row
 * holding a pre-collapse tier value must not fail validation on the one write
 * that answers a privacy question.
 */
export async function recordAiConsent(
  userId: string,
  granted: boolean,
  source: IUserAiConsent['source'],
): Promise<IUserAiConsent> {
  const previous = await readAiConsent(userId)
  const aiConsent = newAiConsent(granted, source, new Date(), previous)
  await User.updateOne({ _id: userId }, { $set: { aiConsent } })
  return aiConsent
}

/** Withdraw the permission. Same write, one argument, named for what it is. */
export async function revokeAiConsent(
  userId: string,
  source: IUserAiConsent['source'] = 'settings',
): Promise<IUserAiConsent> {
  return recordAiConsent(userId, false, source)
}

/**
 * The same question for a route that does not refuse outright, but WITHHOLDS
 * the member's own content from a dispatch that is otherwise about shared
 * data — the food-report pipeline, where the reporter's photo and note are
 * theirs while the catalogue row being checked (name, brand, barcode, numbers)
 * is nobody's personal data.
 *
 * Fails closed, like the gate: an unreadable row withholds the content.
 */
export async function aiConsentAllows(userId: string): Promise<boolean> {
  try {
    return aiConsentGranted(await readAiConsent(userId))
  } catch (error) {
    console.error('[ai-consent] read failed, withholding member content:', error)
    return false
  }
}

export interface AiConsentOk { ok: true }
export type AiConsentGate = AiConsentOk | { ok: false; response: NextResponse }

/**
 * THE GATE. Every route that dispatches anything a member wrote, photographed
 * or is described by to the AI provider calls this before it charges an
 * allowance and before it triggers a run.
 *
 * Order inside a dispatching route, unchanged apart from one line:
 *   auth → validate body → CONSENT → charge → trigger → refund on failure.
 * Consent sits before the charge because a member who has not agreed must not
 * pay a unit to find that out, and after validation because a malformed body
 * is a 400 whatever the member has agreed to.
 *
 * Refused as 403 with `reason: AI_CONSENT_REASON` and NO `feature` /
 * `requiresTier`, so gateFrom() cannot mistake it for a paywall: this is a
 * permission, not a price.
 *
 * FAILS CLOSED. If the row cannot be read, nothing is sent. Every other lock
 * in this app fails open because the cost of a false lock is an annoyed member;
 * here the cost of a false unlock is personal data at a third party that the
 * member never agreed to, which cannot be taken back.
 */
export async function requireAiConsent(user: { userId: string }): Promise<AiConsentGate> {
  let consent: IUserAiConsent | null = null
  try {
    consent = await readAiConsent(user.userId)
  } catch (error) {
    console.error('[ai-consent] read failed, refusing the dispatch:', error)
    return { ok: false, response: refusal(null) }
  }
  if (aiConsentGranted(consent)) return { ok: true }
  return { ok: false, response: refusal(consent) }
}

function refusal(consent: IUserAiConsent | null): NextResponse {
  return NextResponse.json(
    {
      error: AI_CONSENT_REFUSAL_MESSAGE,
      reason: AI_CONSENT_REASON,
      aiConsent: aiConsentStatus(consent),
    },
    { status: 403 },
  )
}
