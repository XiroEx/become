// Member-facing account deletion, and the 7-day window that makes it safe.
//
// WHY THIS EXISTS AT ALL
// Apple's App Review guideline 5.1.1(v) checks this BY HAND: from a signed-in
// account, a reviewer must find "Delete account" without leaving the app and
// without being told to send an email. Google Play's Data safety form asks for
// a PUBLIC web URL where deletion can be requested. GDPR Article 17 and the
// CCPA/CPRA right to delete both say the same thing in law: erasure has to be
// something a member can ask for themselves, not a favour support grants.
//
// WHY DELETION IS NOT IMMEDIATE
// One mis-tap would otherwise destroy a training history nobody can rebuild.
// So a request is a SOFT delete: the account is marked, every push
// subscription is dropped there and then, the device is signed out, and the
// data is purged by the scheduled sweep once the window has elapsed. During
// the window the member can undo it from a link emailed to the address on the
// account — which is also the identity check that makes the undo safe.
//
// The window is SEVEN DAYS, not thirty. Thirty is the outer bound the Privacy
// Policy commits to for finishing the job; seven is how long we keep the data
// recoverable. Both numbers are real and they answer different questions.
//
// NOTHING IN THIS FILE MAY IMPORT `crypto`, OR ANY OTHER NODE BUILT-IN.
// It is imported by the Settings screen and by the native app's danger zone,
// both of which are CLIENT bundles; a `crypto` import here would drag a Node
// built-in into the browser build. The HMAC that signs the undo link therefore
// lives next door in lib/accountRestoreToken.ts, which is server-only, and this
// file holds the constants and the pure arithmetic that both sides need.

/** How long a member has to change their mind. */
export const ACCOUNT_DELETION_GRACE_DAYS = 7

/** The PUBLIC page Play's Data safety form points at. No session required. */
export const DELETION_REQUEST_PATH = '/delete-account'

/** Where the emailed undo link lands. Public; the token is the credential. */
export const ACCOUNT_RESTORE_PATH = '/account/restore'

/** The in-app danger zone, deep-linked from the public page and the email. */
export const SETTINGS_DANGER_ZONE_PATH = '/dashboard/settings?tab=settings#danger-zone'

/** Which client asked. Recorded so a store reviewer's request is traceable. */
export type DeletionSource = 'web' | 'ios' | 'android'

export const DELETION_SOURCES: readonly DeletionSource[] = ['web', 'ios', 'android'] as const

export function isDeletionSource(value: unknown): value is DeletionSource {
  return typeof value === 'string' && (DELETION_SOURCES as readonly string[]).includes(value)
}

const DAY_MS = 24 * 60 * 60 * 1000

/** When the sweep is allowed to purge a request made at `requestedAt`. */
export function purgeDueAt(requestedAt: Date, graceDays: number = ACCOUNT_DELETION_GRACE_DAYS): Date {
  return new Date(requestedAt.getTime() + graceDays * DAY_MS)
}

/** Whole days left in the window, floored at 0. For copy, never for the sweep. */
export function daysRemaining(scheduledPurgeAt: Date, now: Date): number {
  const ms = scheduledPurgeAt.getTime() - now.getTime()
  if (ms <= 0) return 0
  return Math.ceil(ms / DAY_MS)
}

/** `https://…/account/restore?u=<id>&t=<token>` — the link in the email. */
export function buildRestoreUrl(base: string, userId: string, token: string): string {
  const url = new URL(ACCOUNT_RESTORE_PATH, base.endsWith('/') ? base : `${base}/`)
  url.searchParams.set('u', userId)
  url.searchParams.set('t', token)
  return url.toString()
}

export interface PendingDeletion {
  requestedAt: Date
  scheduledPurgeAt: Date
  source: DeletionSource
}

/** The wire shape both clients read. ISO strings, so it survives JSON. */
export interface DeletionStatus {
  requestedAt: string
  scheduledPurgeAt: string
  source: DeletionSource
  daysRemaining: number
}

export function deletionStatus(pending: PendingDeletion, now: Date): DeletionStatus {
  return {
    requestedAt: pending.requestedAt.toISOString(),
    scheduledPurgeAt: pending.scheduledPurgeAt.toISOString(),
    source: pending.source,
    daysRemaining: daysRemaining(pending.scheduledPurgeAt, now),
  }
}

/** The sweep's predicate. Due means due — no grace on top of the grace. */
export function isPurgeDue(pending: Pick<PendingDeletion, 'scheduledPurgeAt'>, now: Date): boolean {
  return pending.scheduledPurgeAt.getTime() <= now.getTime()
}
