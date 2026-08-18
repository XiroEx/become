// GET /api/becoming/journey?tz=  — every week of the member's Becoming, scored
// and placed on the path, plus the story line for each. See lib/becoming.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import { readTzOffset } from '@/lib/dayWindow'
import { computeJourney } from '@/lib/becoming/journey'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await dbConnect()
    return NextResponse.json(await computeJourney(auth.userId!, readTzOffset(request.nextUrl.searchParams)))
  } catch (error) {
    console.error('GET /api/becoming/journey:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
