// GET /api/streaks?tz=  — every streak the member is running, per pillar.
// The computation lives in lib/streaks/compute (shared with the admin view).

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import { readTzOffset } from '@/lib/dayWindow'
import { computeStreaks } from '@/lib/streaks/compute'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await dbConnect()
    const payload = await computeStreaks(auth.userId!, readTzOffset(request.nextUrl.searchParams))
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error computing streaks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
