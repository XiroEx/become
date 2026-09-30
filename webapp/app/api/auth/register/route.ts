// RETIRED. This endpoint created an account and minted a full session JWT from a
// bare name+email, with zero proof of address ownership. Nothing calls it —
// verified by grep across webapp/, expo/, shared/, tests/ — so it is answered
// with 410 Gone rather than deleted, which keeps the retirement discoverable
// for any stale client still pointed at it.
import { NextResponse } from 'next/server'
import { legacyAuthGone } from '@/lib/legacyAuthGone'

export const dynamic = 'force-dynamic'

export async function POST(): Promise<NextResponse> {
  return legacyAuthGone()
}
