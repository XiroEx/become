// REVOKING THE APPLE GRANT WHEN AN ACCOUNT IS DELETED.
//
// Apple requires an app that offers Sign in with Apple to revoke the tokens it
// holds when the member deletes their account — it is the counterpart of the
// in-app deletion Review Guideline 5.1.1(v) asks for, and it is what removes
// Become from the member's "Apps Using Apple ID" list instead of leaving a
// dead entry there forever.
//
// WHEN: AT PURGE, NOT AT REQUEST. A deletion request is a soft delete with a
// 7-day reversal window (lib/accountDeletion.ts). Revoking at request time
// would spend the grant on a deletion the member may still undo, and would
// leave the restored account holding a refresh token Apple no longer knows.
// The purge is the irreversible step, so that is where the grant goes — one
// step before the User row that stores it.
//
// WHEN IT FAILS: THE PURGE WAITS, BUT NOT FOREVER. A failed revoke leaves the
// row in place so the next daily sweep retries it (the same rule the purge
// already applies to a failed collection). That cannot be unconditional: a
// mis-pasted .p8 would then keep a deleted member's data alive indefinitely,
// which is the one outcome deletion exists to prevent. So the retry is bounded
// by LEGAL_DELETION_DAYS — the outer promise in the Privacy Policy — after
// which the data goes and the failure is logged loudly.
//
// An UNCONFIGURED Apple key, or an identity with no stored refresh token, is
// not a failure of this kind: there is nothing to hand back and no retry that
// would change it, so the purge proceeds and the reason is reported.

import { LEGAL_DELETION_DAYS } from '@/lib/legal'
import {
  AppleRestError,
  resolveAppleCredentials,
  revokeAppleToken,
  type AppleRestDeps,
} from './rest'

const DAY_MS = 24 * 60 * 60 * 1000

/** What the User row stores about an Apple identity, as far as revocation
 *  cares. Lean documents and hydrated ones both satisfy it. */
export interface StoredAppleIdentity {
  sub?: string | null
  refreshToken?: string | null
}

export type AppleRevocationState =
  /** No Apple identity on the account — nothing to do. */
  | 'not_applicable'
  /** Apple accepted the revocation. */
  | 'revoked'
  /** No Team ID / Key ID / .p8 configured, so no call can be made. */
  | 'not_configured'
  /** An Apple identity with no refresh token (the code exchange never ran or
   *  failed at sign-in). Nothing to hand back. */
  | 'no_token'
  /** Apple refused or was unreachable. Retryable. */
  | 'failed'

export interface AppleRevocationOutcome {
  state: AppleRevocationState
  /** Apple's `error` field or the transport error, for the log. */
  detail?: string
}

export interface AppleRevocationConfig {
  bundleId?: string
  teamId?: string
  keyId?: string
  privateKey?: string
}

/** Hand this account's Apple refresh token back to Apple. Never throws: the
 *  caller decides what a failure means for the purge. */
export async function revokeAppleIdentity(
  identity: StoredAppleIdentity | null | undefined,
  config: AppleRevocationConfig,
  deps: AppleRestDeps = {},
): Promise<AppleRevocationOutcome> {
  const sub = identity?.sub?.trim()
  if (!sub) return { state: 'not_applicable' }

  const token = identity?.refreshToken?.trim()
  if (!token) return { state: 'no_token' }

  const creds = resolveAppleCredentials(config)
  if (!creds) return { state: 'not_configured' }

  try {
    await revokeAppleToken(token, 'refresh_token', creds, deps)
    return { state: 'revoked' }
  } catch (error) {
    if (error instanceof AppleRestError) {
      // `invalid_grant` means Apple has already forgotten this token — the
      // grant is gone, which is the state we were asking for. Anything else
      // (401 for a bad client secret, 5xx, a network error) is retryable.
      if (error.appleError === 'invalid_grant') {
        return { state: 'revoked', detail: 'invalid_grant (already revoked)' }
      }
      return { state: 'failed', detail: error.appleError ?? `http_${error.status}` }
    }
    return { state: 'failed', detail: error instanceof Error ? error.message : String(error) }
  }
}

/** May the purge delete this member's rows, given how the revocation went?
 *  Pure — the whole rule, testable without a database or a network. */
export function purgeMayProceed(
  outcome: AppleRevocationOutcome,
  options: { requestedAt?: Date | null; now?: Date; graceDays?: number } = {},
): boolean {
  if (outcome.state !== 'failed') return true
  const requestedAt = options.requestedAt ?? null
  if (!requestedAt) return true // no request date to measure the grace against
  const now = options.now ?? new Date()
  const graceDays = options.graceDays ?? LEGAL_DELETION_DAYS
  return now.getTime() - requestedAt.getTime() >= graceDays * DAY_MS
}
