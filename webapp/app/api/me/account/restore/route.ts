// UNAUTHENTICATED BY DESIGN — the MAC in the URL is the credential.
//
// Requesting deletion signs every device out, which is the point: a member who
// changes their mind has no session to present. So the restore link carries
// `u` (their id) and `t` (an HMAC of it, signed over the exact `requestedAt`
// of the request being undone — lib/accountRestoreToken.ts). A forged id fails
// the MAC; a link for a request that was already cancelled or re-made fails
// too, because the timestamp it was signed over is gone.
//
// GET DOES NOT MUTATE. Corporate mail filters, link previewers and Safe
// Browsing scanners fetch every URL in an email before a person ever sees it,
// so a GET that cancelled the deletion would let a mail scanner undo it
// silently. GET redirects to the page; the page's button POSTs. The email
// links at the page in the first place, and this handler exists only to catch
// anyone who typed the API path or followed an old link.
//
// It works identically whether the link opens in a browser or inside a store
// build: the native app's /account/restore screen posts the same body to the
// same route (expo/app/account/restore.tsx).

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { deletionStatus, isPurgeDue } from '@/lib/accountDeletion'
import { RESTORE_PATH, verifyRestore } from '@/lib/accountRestoreToken'

export const dynamic = 'force-dynamic'

/** The one refusal, for every failure mode. An attacker must not be able to
 *  tell "no such member" from "wrong MAC" from "already purged". */
const REFUSAL = { ok: false, error: 'invalid_or_expired' } as const

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => null)
    const search = request.nextUrl.searchParams
    const userId = String((body as { u?: unknown } | null)?.u ?? search.get('u') ?? '').trim()
    const token = String((body as { t?: unknown } | null)?.t ?? search.get('t') ?? '').trim()
    if (!userId || !token) return NextResponse.json(REFUSAL, { status: 400 })
    // Cast would throw on anything that is not an id; a refusal is the answer.
    if (!/^[0-9a-fA-F]{24}$/.test(userId)) return NextResponse.json(REFUSAL, { status: 400 })

    await dbConnect()
    const user = await User.findById(userId).select('deletion').lean<{
      deletion?: { requestedAt?: Date; purgeAfter?: Date }
    } | null>()

    // No row, or no pending request: nothing to restore. Same refusal.
    if (!user?.deletion?.requestedAt) return NextResponse.json(REFUSAL, { status: 400 })

    // Past the window the purge may not have RUN yet (it is a daily sweep), but
    // the promise was "deleted on this date". Honouring a late link would make
    // the restore window whatever the cron schedule happens to be.
    if (isPurgeDue(user.deletion)) return NextResponse.json(REFUSAL, { status: 400 })

    const ok = await verifyRestore(userId, user.deletion.requestedAt, token)
    if (!ok) return NextResponse.json(REFUSAL, { status: 400 })

    await User.updateOne({ _id: userId }, { $unset: { deletion: '' } })
    console.log(`[account] deletion restored from link user=${userId}`)
    return NextResponse.json({ ok: true, deletion: deletionStatus(null) })
  } catch (error) {
    console.error('[account] restore failed:', error)
    return NextResponse.json({ ok: false, error: 'restore_failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(RESTORE_PATH, request.nextUrl.origin)
  const u = request.nextUrl.searchParams.get('u')
  const t = request.nextUrl.searchParams.get('t')
  if (u) url.searchParams.set('u', u)
  if (t) url.searchParams.set('t', t)
  return NextResponse.redirect(url, 302)
}
