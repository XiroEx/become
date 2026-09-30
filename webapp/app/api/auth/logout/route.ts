// POST /api/auth/logout — end the session on THIS device, and end every
// read-only widgets token this member holds anywhere.
//
// Clearing the cookie is all the web needs: the browser forgets the session and
// the token expires on its own. A widgets token does not have that luxury. It
// lives for months on an OS extension the member cannot see, in a process they
// did not open — so "sign out" has to mean something for it too, and the only
// thing that can mean is bumping `User.widgetTokenVersion`
// (lib/widgets/token.ts). Every widgets token minted before this call stops
// being accepted by GET /api/widgets/summary from here on.
//
// AUTH IS OPTIONAL AND FAILURE IS SWALLOWED. Signing out may never fail: not on
// an expired token, not on a missing one, not because Mongo was slow. The
// cookie is cleared and 200 is returned either way — the bump is best-effort,
// loudly logged when it does not land, and the next sign-out (or a deletion
// request) tries again.
//
// The token is read from the Authorization header OR the cookie, because the
// two clients differ: native sends a Bearer token, the web sends the HttpOnly
// cookie with `credentials: 'include'` and no header at all.

import { NextRequest } from 'next/server'
import { getTokenFromRequest, verifyToken } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import { bumpWidgetTokenVersion, signOutRevocationTarget } from '@/lib/widgets/token'

export const dynamic = 'force-dynamic'

async function revokeWidgetTokens(request: NextRequest): Promise<void> {
  try {
    const token = getTokenFromRequest(request) ?? request.cookies.get('auth_token')?.value ?? null
    if (!token) return

    // signOutRevocationTarget is the rule (and refuses a scoped token, which
    // must never be able to write here). It is pure — see
    // tests/unit/widgets/token.test.ts.
    const userId = signOutRevocationTarget(await verifyToken(token))
    if (!userId) return

    await dbConnect()
    await bumpWidgetTokenVersion(userId)
  } catch (error) {
    console.error('[logout] widgets token revocation failed:', error)
  }
}

export async function POST(request: NextRequest) {
  await revokeWidgetTokens(request)

  // Clear the auth cookie
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Set-Cookie': 'auth_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax'
    }
  })
}
