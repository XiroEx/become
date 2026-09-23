// THE MEMBER-FACING ACCOUNT DELETION ROUTE.
//
// Apple App Review 5.1.1(v) requires that an account created in the app can be
// deleted from inside the app. Google Play's Data safety form requires a public
// URL where the same thing can be asked for (that is `app/delete-account`, and
// it points here). GDPR Art. 17 and the CCPA/CPRA right to delete require that
// the member can exercise it themselves. One route serves all four.
//
//   GET    /api/me/account   → is a deletion pending, and until when?
//   DELETE /api/me/account   → request it
//   POST   /api/me/account   { intent: 'cancel' } → cancel it while signed in
//
// WHAT HAPPENS THE INSTANT A DELETION IS REQUESTED, before any window elapses:
//   · every push subscription this member holds is DELETED — web endpoints and
//     native Expo tokens live in one collection, so dropping them by userId
//     drops the iOS and Android tokens along with the browser ones;
//   · the master notification switch is turned off, so a background resync on
//     a device that was offline cannot quietly mint a new subscription;
//   · the client signs the device out (it holds the JWT, we cannot revoke it).
// "Stop contacting me" is the half of the request that must not wait a week.
//
// The data itself is removed by `app/api/cron/purge-deletions` once the window
// has closed. See lib/accountDeletion.ts for why there is a window at all.
//
// THE EMAIL IS SENT BEST-EFFORT, AND ON PURPOSE. A deletion that fails because
// SMTP is down is a deletion a member cannot make, which is the exact failure
// the store guideline exists to prevent. The request is recorded either way and
// the response says whether the undo link went out.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import PushSubscription from '@/models/PushSubscription'
import UserProgress from '@/models/UserProgress'
import { getRuntimeConfig } from '@/lib/runtimeConfig'
import { appBaseUrl } from '@/lib/billing/urls'
import { sendAccountDeletionEmail, sendAccountRestoredEmail } from '@/lib/email'
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  buildRestoreUrl,
  deletionStatus,
  isDeletionSource,
  purgeDueAt,
  type DeletionSource,
  type PendingDeletion,
} from '@/lib/accountDeletion'
import { restoreToken } from '@/lib/accountRestoreToken'

export const dynamic = 'force-dynamic'

interface UserDeletionRow {
  email?: string
  deletion?: { requestedAt?: Date; scheduledPurgeAt?: Date; source?: DeletionSource } | null
}

function pendingFrom(row: UserDeletionRow | null): PendingDeletion | null {
  const d = row?.deletion
  if (!d?.requestedAt || !d?.scheduledPurgeAt) return null
  return {
    requestedAt: new Date(d.requestedAt),
    scheduledPurgeAt: new Date(d.scheduledPurgeAt),
    source: d.source ?? 'web',
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await dbConnect()
    const row = await User.findById(auth.userId).select('email deletion').lean<UserDeletionRow | null>()
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const pending = pendingFrom(row)
    return NextResponse.json({
      graceDays: ACCOUNT_DELETION_GRACE_DAYS,
      deletion: pending ? deletionStatus(pending, new Date()) : null,
    })
  } catch (error) {
    console.error('[account] deletion status failed:', error)
    return NextResponse.json({ error: 'Failed to read account status' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // `source` is a label for the audit trail, never a permission. An
    // unrecognised value is recorded as 'web' rather than refused — a store
    // build must not be able to fail a deletion over a spelling.
    const body: unknown = await request.json().catch(() => null)
    const rawSource = (body as { source?: unknown } | null)?.source
    const source: DeletionSource = isDeletionSource(rawSource) ? rawSource : 'web'

    await dbConnect()

    const row = await User.findById(auth.userId).select('email deletion').lean<UserDeletionRow | null>()
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // IDEMPOTENT. A second tap (or a retry from a flaky connection) must not
    // move the date the member was already told, and must not mint a second
    // undo link that invalidates the one already in their inbox.
    const existing = pendingFrom(row)
    const requestedAt = existing?.requestedAt ?? new Date()
    const scheduledPurgeAt = existing?.scheduledPurgeAt ?? purgeDueAt(requestedAt)
    // The FIRST request's platform is the one on the record. A retry from a
    // second device must not rewrite who asked.
    const recordedSource = existing?.source ?? source

    if (!existing) {
      await User.updateOne(
        { _id: auth.userId },
        { $set: { deletion: { requestedAt, scheduledPurgeAt, source } } },
      )
    }

    // ── Stop contacting them. Now, not in seven days. ────────────────────────
    // One collection holds web push endpoints AND the native Expo tokens
    // (models/PushSubscription.ts → platform: 'web' | 'ios' | 'android'), so
    // this is what drops the iOS and Android token as well as the browser's.
    const dropped = await PushSubscription.deleteMany({ userId: auth.userId })
    // And the master switch, so the background resync on a device that was
    // offline at this moment cannot recreate one. (/api/notifications/subscribe
    // refuses a non-`reenable` write while this is false.)
    await UserProgress.updateOne({ userId: auth.userId }, { $set: { notificationsEnabled: false } })

    // ── The undo link ───────────────────────────────────────────────────────
    let emailed = false
    try {
      const { auth: authConfig } = await getRuntimeConfig()
      const token = restoreToken(auth.userId, requestedAt, authConfig.jwtSecret)
      const restoreUrl = buildRestoreUrl(appBaseUrl(), auth.userId, token)
      if (row.email) {
        await sendAccountDeletionEmail(row.email, {
          restoreUrl,
          scheduledPurgeAt,
          graceDays: ACCOUNT_DELETION_GRACE_DAYS,
        })
        emailed = true
      }
    } catch (error) {
      // Loud, and non-fatal. The deletion is recorded; only the undo link is
      // missing, and the member can still cancel by signing back in.
      console.error('[account] deletion recorded but the undo email failed:', error)
    }

    console.info('[account-audit]', {
      action: 'account.deletion.requested',
      userId: auth.userId,
      source,
      scheduledPurgeAt: scheduledPurgeAt.toISOString(),
      pushSubscriptionsDropped: dropped?.deletedCount ?? 0,
      emailed,
      at: new Date().toISOString(),
    })

    return NextResponse.json({
      deletion: deletionStatus({ requestedAt, scheduledPurgeAt, source: recordedSource }, new Date()),
      graceDays: ACCOUNT_DELETION_GRACE_DAYS,
      pushSubscriptionsDropped: dropped?.deletedCount ?? 0,
      restoreEmailSent: emailed,
      /** The client must drop its token: we cannot revoke a JWT server-side. */
      signOut: true,
    })
  } catch (error) {
    console.error('[account] deletion request failed:', error)
    return NextResponse.json({ error: 'Failed to request deletion' }, { status: 500 })
  }
}

/** Cancel a pending deletion from inside the app, for a member who still has a
 *  session. The emailed link (app/api/me/account/restore) is the path for one
 *  who does not — both clear the same field. */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body: unknown = await request.json().catch(() => null)
    if ((body as { intent?: unknown } | null)?.intent !== 'cancel') {
      return NextResponse.json({ error: 'unsupported_intent' }, { status: 400 })
    }

    await dbConnect()
    const row = await User.findById(auth.userId).select('email deletion').lean<UserDeletionRow | null>()
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!pendingFrom(row)) {
      return NextResponse.json({ restored: false, deletion: null, reason: 'nothing_pending' })
    }

    await User.updateOne({ _id: auth.userId }, { $unset: { deletion: '' } })
    console.info('[account-audit]', {
      action: 'account.deletion.cancelled',
      userId: auth.userId,
      via: 'session',
      at: new Date().toISOString(),
    })
    if (row.email) {
      try {
        await sendAccountRestoredEmail(row.email)
      } catch (error) {
        console.error('[account] restore confirmation email failed:', error)
      }
    }
    return NextResponse.json({ restored: true, deletion: null })
  } catch (error) {
    console.error('[account] deletion cancel failed:', error)
    return NextResponse.json({ error: 'Failed to cancel deletion' }, { status: 500 })
  }
}
