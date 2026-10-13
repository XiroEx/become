// Member-facing account deletion — the pure half.
//
// WHY THIS SHAPE
//
// Apple checks account deletion BY HAND (App Store Review Guideline 5.1.1(v)):
// a reviewer signs in, looks for "Delete account" and expects to find it
// without leaving the app and without composing an email. Google Play's Data
// safety form asks the same question from the outside — a public URL where
// deletion can be requested. Both are satisfied by one server-side feature; the
// surfaces differ, the rules must not.
//
// The rules, once, here, so the web page, the two store builds, the cron purge
// and the copy in the Privacy Policy cannot drift apart:
//
//   • A request is a SOFT delete with a fixed, short reversal window
//     (RESTORE_WINDOW_DAYS). GDPR Article 17 and the US state statutes all
//     allow a reasonable period to action an erasure request; what they do not
//     allow is an indefinite one, which is why the purge is scheduled at the
//     moment of the request rather than "when someone gets round to it".
//   • The window is 7 days and the outer promise is LEGAL_DELETION_DAYS (30).
//     The first is what actually happens; the second is what the policy
//     commits to. They may never be reordered — a purge that lands after the
//     promised day would make the policy false.
//   • The reversal is bound to `requestedAt`. Cancel a deletion and every link
//     minted for it stops working, because the timestamp it was signed over is
//     gone (see lib/accountRestoreToken.ts).
//   • Requesting is CONFIRMED: an authenticated DELETE with no body cannot
//     delete an account by accident (a mis-wired client, a retried request, a
//     tool fuzzing routes). The phrase below is the confirmation, and it is a
//     constant rather than typed prose so the web UI, the native UI and the
//     tests all send the same thing.

/** How long a member may undo a deletion request. Short enough to be a real
 *  deletion, long enough to survive "that was the wrong button" plus a
 *  weekend. */
export const RESTORE_WINDOW_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

/** What a client must send to request deletion. Not a boolean: a stray
 *  `{}`, a retried GET-turned-DELETE or a truthy default cannot spell it. */
export const DELETE_CONFIRMATION = 'DELETE'

/** Where the request came from. Recorded because "was it reachable in the
 *  store build?" is a question we should be able to answer from data. */
export type DeletionSource = 'web' | 'ios' | 'android' | 'unknown'

export const DELETION_SOURCES: readonly DeletionSource[] = ['web', 'ios', 'android', 'unknown']

/** The record stored on the user document. */
export interface DeletionRequest {
  requestedAt: Date
  /** The instant the purge becomes due. Stored, not derived at read time, so
   *  changing RESTORE_WINDOW_DAYS never moves a promise already made. */
  purgeAfter: Date
  requestedFrom: DeletionSource
}

/** What every surface shows a member about a pending request. */
export interface DeletionStatus {
  pending: boolean
  requestedAt: string | null
  /** ISO. The last instant the restore link works, which is also the purge due
   *  date: while a request is pending those are the same clock. */
  restorableUntil: string | null
  /** Whole days left, floored at 0. Copy says "N days"; nobody says "0.4". */
  daysLeft: number
  restoreWindowDays: number
}

export function normalizeSource(value: unknown): DeletionSource {
  return DELETION_SOURCES.includes(value as DeletionSource) ? (value as DeletionSource) : 'unknown'
}

/** The record to write for a request made at `now`. */
export function planDeletion(now: Date, source: unknown = 'unknown'): DeletionRequest {
  const requestedAt = new Date(now.getTime())
  return {
    requestedAt,
    purgeAfter: new Date(requestedAt.getTime() + RESTORE_WINDOW_DAYS * DAY_MS),
    requestedFrom: normalizeSource(source),
  }
}

/** Anything shaped like a stored record, including a lean Mongo document. */
export interface StoredDeletion {
  requestedAt?: Date | string | null
  purgeAfter?: Date | string | null
  requestedFrom?: string | null
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function deletionStatus(
  record: StoredDeletion | null | undefined,
  now: Date = new Date(),
): DeletionStatus {
  const requestedAt = toDate(record?.requestedAt ?? null)
  const purgeAfter = toDate(record?.purgeAfter ?? null)
  if (!requestedAt || !purgeAfter) {
    return {
      pending: false,
      requestedAt: null,
      restorableUntil: null,
      daysLeft: 0,
      restoreWindowDays: RESTORE_WINDOW_DAYS,
    }
  }
  const msLeft = purgeAfter.getTime() - now.getTime()
  return {
    pending: true,
    requestedAt: requestedAt.toISOString(),
    restorableUntil: purgeAfter.toISOString(),
    daysLeft: msLeft > 0 ? Math.floor(msLeft / DAY_MS) : 0,
    restoreWindowDays: RESTORE_WINDOW_DAYS,
  }
}

/** Is this row due for the irreversible purge? */
export function isPurgeDue(record: StoredDeletion | null | undefined, now: Date = new Date()): boolean {
  const purgeAfter = toDate(record?.purgeAfter ?? null)
  if (!purgeAfter) return false
  return purgeAfter.getTime() <= now.getTime()
}

/** The selector the cron purge runs. Deliberately the whole rule: a row is due
 *  when a deletion was requested and its purge date has passed. */
export function purgeSelector(now: Date): Record<string, unknown> {
  return {
    'deletion.requestedAt': { $ne: null },
    'deletion.purgeAfter': { $lte: now },
  }
}

/**
 * What deletion covers, in the member's words. ONE list, rendered by the web
 * danger zone, the native danger zone, the public /delete-account page and the
 * confirmation email — and the same facts the Privacy Policy states in section
 * 13. A surface that itemised this itself would eventually promise something
 * lib/accountPurge.ts does not do.
 */
export const DELETION_COVERS: readonly string[] = [
  'Your account and sign-in, your profile, body stats and injury notes.',
  'Training logs, schedules, programs you created and your saved programs.',
  'Nutrition logs, custom foods, meals, recipes and meal plans.',
  'Mind sessions, journals, mood and check-in history, and your streaks.',
  'Chat messages you sent, group and event posts, and anything you shared.',
  'Every push notification registration this account has, on every device.',
] as const

/** What survives, and why. Same rule: stated once, and it matches what the
 *  purge plan actually does. */
export const DELETION_EXCEPTIONS: readonly string[] = [
  'Billing records we and Stripe are required to keep for tax and accounting.',
  'Entries in the shared food and exercise catalogues that other members’ logs already reference — those are separated from you rather than deleted, so other people’s history does not break.',
  'Copies sitting in routine backups, until those backups age out on their normal schedule.',
  'Anything we must keep to meet a legal obligation or to defend a legal claim.',
] as const
