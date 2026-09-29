import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import {
  HANDOFF_CODE_TTL_SECONDS,
  HANDOFF_REDEEM_PATH,
  normalizeHandoffPath,
} from '@/lib/authHandoff'
import { createHandoffCode } from '@/models/HandoffCode'

export const dynamic = 'force-dynamic'

// ─── POST /api/auth/handoff { path } ─────────────────────────────────────────
//
// MINT ONE HAND-OFF CODE. The native app holds a session; the in-app browser it
// is about to open holds none, so a member who taps "Edit in browser" lands on
// /login instead of the editor. This trades the session the app already has for
// a code the browser can spend once, at GET /auth/handoff?code=.
//
// The whole rule set — sixty seconds, single use, one member, allow-listed
// targets — lives in lib/authHandoff.ts. Two things this handler is careful
// about:
//
//   • The path is validated BEFORE the database is touched, so a junk or
//     hostile target costs a connection to nothing and can never be stored.
//   • `verifyAuth` default-denies SCOPED tokens, so the 15-minute ai-tools
//     token cannot be laundered into a full browser session through here.
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body: unknown = await request.json().catch(() => null)
  const requested = (body as { path?: unknown } | null)?.path
  const path = normalizeHandoffPath(requested)
  if (!path) {
    // One refusal for every bad target: not a string, another origin, a query
    // string, or simply a page no hand-off is allowed to land on.
    return NextResponse.json({ error: 'path_not_allowed' }, { status: 400 })
  }

  try {
    await dbConnect()
    const { code, expiresAt } = await createHandoffCode({ userId: auth.userId, path })
    return NextResponse.json(
      {
        code,
        path,
        redeemPath: HANDOFF_REDEEM_PATH,
        expiresAt: expiresAt.toISOString(),
        expiresInSeconds: HANDOFF_CODE_TTL_SECONDS,
      },
      // A code is a credential with a sixty-second life. Nothing between here
      // and the app may keep a copy of it.
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    console.error('POST /api/auth/handoff error:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
