// THE ACCOUNT-DELETION ROUTE — the one an App Store reviewer has to be able to
// reach from inside the app, signed in, without composing an email
// (Guideline 5.1.1(v)), and the one the EU right to erasure (GDPR Art. 17),
// the CCPA right to delete and every US state equivalent are answered by.
//
//   GET    → is a deletion pending, and until when? (the danger zone reads this)
//   DELETE → request it. Signs this device out, drops every push registration
//            this account holds, emails the restore link.
//   POST   { cancel: true } → change of mind, from a session that still works.
//
// WHY DELETE DOES NOT DELETE ANYTHING YET
//
// It schedules. lib/accountDeletion.ts carries the argument in full: a short,
// fixed reversal window is the difference between "deleted" and "deleted, and
// there is a way back for the person who tapped it by mistake". The data goes
// at `deletion.purgeAfter` — app/api/cron/purge-deletions runs the plan in
// lib/accountPurge.ts — which is 7 days out and inside the 30 the Privacy
// Policy promises.
//
// WHAT IT DOES DO, IMMEDIATELY, AND WHY IT MATTERS FOR THE STORE BUILDS
//
// Push registrations are deleted at REQUEST time, not at purge time. A
// member who has asked to be deleted must stop hearing from us that minute,
// and `PushSubscription` holds both species in one collection: a web push
// endpoint and a native Expo push token (models/PushSubscription.ts). One
// deleteMany drops both, so the iOS and Android builds get the same behaviour
// as the web app for free — and `notificationsEnabled: false` stops anything
// from re-registering in the background if the member signs back in during the
// window (see app/api/notifications/subscribe).

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import PushSubscription from '@/models/PushSubscription'
import UserProgress from '@/models/UserProgress'
import {
  DELETE_CONFIRMATION,
  DELETION_COVERS,
  DELETION_EXCEPTIONS,
  RESTORE_WINDOW_DAYS,
  deletionStatus,
  normalizeSource,
  planDeletion,
} from '@/lib/accountDeletion'
import { restoreUrlFor } from '@/lib/accountRestoreToken'
import { sendAccountDeletionEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

function formatDay(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await dbConnect()
    const user = await User.findById(auth.userId).select('email deletion').lean<{
      email?: string
      deletion?: { requestedAt?: Date; purgeAfter?: Date }
    } | null>()
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      email: user.email ?? null,
      deletion: deletionStatus(user.deletion ?? null),
      covers: DELETION_COVERS,
      exceptions: DELETION_EXCEPTIONS,
      confirmation: DELETE_CONFIRMATION,
    })
  } catch (error) {
    console.error('[account] status read failed:', error)
    return NextResponse.json({ error: 'Failed to read account status' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // A body is required, and it must spell the confirmation out. A DELETE
    // that fires on an empty body is one mis-wired client away from deleting
    // somebody's account because a screen mounted.
    const body: unknown = await request.json().catch(() => null)
    const confirm = (body as { confirm?: unknown } | null)?.confirm
    if (confirm !== DELETE_CONFIRMATION) {
      return NextResponse.json(
        { error: 'confirmation_required', confirmation: DELETE_CONFIRMATION },
        { status: 400 },
      )
    }
    const source = normalizeSource((body as { source?: unknown } | null)?.source)

    await dbConnect()
    const user = await User.findById(auth.userId).select('email deletion').lean<{
      email?: string
      deletion?: { requestedAt?: Date; purgeAfter?: Date }
    } | null>()
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Already pending: report the EXISTING dates. Re-stamping would slide the
    // purge date forward every time the button was tapped, and would kill the
    // restore link the member already has in their inbox.
    const existing = deletionStatus(user.deletion ?? null)
    if (existing.pending) {
      return NextResponse.json({ ok: true, alreadyPending: true, deletion: existing })
    }

    const plan = planDeletion(new Date(), source)
    await User.updateOne({ _id: auth.userId }, { $set: { deletion: plan } })

    // Stop talking to their devices NOW — web endpoints and native Expo push
    // tokens alike — and latch the master switch so a background resync cannot
    // put one back.
    const dropped = await PushSubscription.deleteMany({ userId: auth.userId })
    await UserProgress.updateOne(
      { userId: auth.userId },
      { $set: { notificationsEnabled: false } },
    )

    // The way back. Best-effort: a mail failure must not leave the member
    // thinking the request did not land, and the in-app banner can cancel it
    // too — but it is logged loudly, because for a signed-out member this
    // email IS the restore path.
    let emailed = false
    try {
      if (user.email) {
        const restoreUrl = await restoreUrlFor(String(auth.userId), plan.requestedAt)
        await sendAccountDeletionEmail({
          to: user.email,
          restoreUrl,
          restorableUntil: formatDay(plan.purgeAfter),
          restoreWindowDays: RESTORE_WINDOW_DAYS,
        })
        emailed = true
      }
    } catch (error) {
      console.error('[account] deletion requested but the restore email failed:', error)
    }

    console.log(
      `[account] deletion requested user=${auth.userId} from=${plan.requestedFrom}`
        + ` purgeAfter=${plan.purgeAfter.toISOString()} pushDropped=${dropped.deletedCount ?? 0}`
        + ` emailed=${emailed}`,
    )

    return NextResponse.json({
      ok: true,
      emailed,
      pushSubscriptionsDropped: dropped.deletedCount ?? 0,
      deletion: deletionStatus(plan),
    })
  } catch (error) {
    console.error('[account] deletion request failed:', error)
    return NextResponse.json({ error: 'Failed to request deletion' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body: unknown = await request.json().catch(() => null)
    if ((body as { cancel?: unknown } | null)?.cancel !== true) {
      return NextResponse.json({ error: 'cancel_required' }, { status: 400 })
    }

    await dbConnect()
    const result = await User.updateOne({ _id: auth.userId }, { $unset: { deletion: '' } })
    console.log(`[account] deletion cancelled in-app user=${auth.userId} matched=${result.matchedCount ?? 0}`)
    return NextResponse.json({ ok: true, deletion: deletionStatus(null) })
  } catch (error) {
    console.error('[account] deletion cancel failed:', error)
    return NextResponse.json({ error: 'Failed to cancel deletion' }, { status: 500 })
  }
}
