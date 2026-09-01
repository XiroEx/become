// RETIRED. This endpoint minted a full session JWT for ANY existing email with
// zero proof of ownership (no password, no magic link). Nothing calls it —
// verified by grep across webapp/, expo/, shared/, tests/ — so it is answered
// with 410 Gone rather than deleted, which keeps the retirement discoverable
// for any stale client still pointed at it.
import { NextResponse } from 'next/server'
import { legacyAuthGone } from '@/lib/legacyAuthGone'

export const dynamic = 'force-dynamic'

export async function POST(): Promise<NextResponse> {
  return legacyAuthGone()
}
