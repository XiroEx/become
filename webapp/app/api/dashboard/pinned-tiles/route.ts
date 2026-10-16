// PATCH /api/dashboard/pinned-tiles — replaces the caller's pinnedTiles
// array. The body's `pinnedTiles` is the FULL new order; pin/unpin and
// drag-reorder both round-trip through here. Upserts UserProgress when
// the caller has none.

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'
import { validatePinnedTilesPayload } from '@/lib/dashboardTiles/validatePinnedTiles'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const validated = validatePinnedTilesPayload(body)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  try {
    await dbConnect()
    await UserProgress.findOneAndUpdate(
      { userId: auth.userId },
      { $set: { pinnedTiles: validated.pinnedTiles } },
      { upsert: true, new: true },
    )
  } catch (err) {
    console.error('PATCH /api/dashboard/pinned-tiles update error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    pinnedTiles: validated.pinnedTiles,
  })
}
