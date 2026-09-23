// The undo link, and the reason it takes no session.
//
// The email lands on a phone. The member taps it in Gmail, which opens an
// in-app browser with no localStorage of ours and no cookie — or the native app
// catches it as a universal link, where there is also no guarantee of a live
// session, because requesting the deletion signed that device out. Requiring a
// login here would mean the undo only works for people who can still sign in,
// which is exactly the set of people who need it least.
//
// So the HMAC in the link IS the credential (lib/accountDeletion.ts). It is
// bound to `deletion.requestedAt`, so it verifies for one pending deletion and
// stops the instant that deletion is cancelled or replaced. It can clear one
// field and nothing else: it is not a session, and it mints none.
//
//   POST /api/me/account/restore { u, t }   ← the only thing that changes state
//   GET  /api/me/account/restore?u=&t=      → 303 to the page
//
// THE GET DOES NOT RESTORE. Corporate mail scanners, Outlook Safe Links and
// Gmail's image proxy all fetch every URL in a message before a human sees it;
// a mutating GET would have them silently cancel a deletion the member actually
// wanted. So it redirects to the page, which POSTs on a real interaction. The
// emailed link points at the page in the first place — this exists only so that
// somebody who pastes the API path by hand lands somewhere useful.

import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { getRuntimeConfig } from '@/lib/runtimeConfig'
import { sendAccountRestoredEmail } from '@/lib/email'
import { ACCOUNT_RESTORE_PATH } from '@/lib/accountDeletion'
import { verifyRestoreToken } from '@/lib/accountRestoreToken'

export const dynamic = 'force-dynamic'

interface RestoreRow {
  email?: string
  deletion?: { requestedAt?: Date; scheduledPurgeAt?: Date } | null
}

/** One answer shape, whatever went wrong. `reason` is for the page's copy. */
type RestoreOutcome =
  | { restored: true }
  | { restored: false; reason: 'invalid_link' | 'nothing_pending' | 'error' }

async function restore(userId: string | null, token: string | null): Promise<{ body: RestoreOutcome; status: number }> {
  if (!userId || !token || !mongoose.Types.ObjectId.isValid(userId)) {
    return { body: { restored: false, reason: 'invalid_link' }, status: 400 }
  }

  await dbConnect()
  const row = await User.findById(userId).select('email deletion').lean<RestoreRow | null>()

  // A purge that has already run leaves no row at all. "Nothing pending" is
  // the honest answer for both that and a deletion somebody already cancelled;
  // saying "no such account" would confirm the address to whoever holds the
  // link, and the link is in an inbox.
  if (!row || !row.deletion?.requestedAt) {
    return { body: { restored: false, reason: 'nothing_pending' }, status: 404 }
  }

  const { auth } = await getRuntimeConfig()
  if (!verifyRestoreToken(userId, new Date(row.deletion.requestedAt), token, auth.jwtSecret)) {
    return { body: { restored: false, reason: 'invalid_link' }, status: 400 }
  }

  await User.updateOne({ _id: userId }, { $unset: { deletion: '' } })
  console.info('[account-audit]', {
    action: 'account.deletion.cancelled',
    userId,
    via: 'restore-link',
    at: new Date().toISOString(),
  })

  if (row.email) {
    try {
      await sendAccountRestoredEmail(row.email)
    } catch (error) {
      // The account is already back. Only the receipt failed.
      console.error('[account] restore confirmation email failed:', error)
    }
  }

  return { body: { restored: true }, status: 200 }
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => null)
    const u = (body as { u?: unknown } | null)?.u
    const t = (body as { t?: unknown } | null)?.t
    const { body: out, status } = await restore(
      typeof u === 'string' ? u : null,
      typeof t === 'string' ? t : null,
    )
    return NextResponse.json(out, { status })
  } catch (error) {
    console.error('[account] restore failed:', error)
    return NextResponse.json({ restored: false, reason: 'error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(ACCOUNT_RESTORE_PATH, request.nextUrl.origin)
  const u = request.nextUrl.searchParams.get('u')
  const t = request.nextUrl.searchParams.get('t')
  if (u) url.searchParams.set('u', u)
  if (t) url.searchParams.set('t', t)
  return NextResponse.redirect(url, 303)
}
