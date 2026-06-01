// POST /api/dashboard/tile-tap — record a tap on a smart-tile card so the
// smart tile can adapt (cards the user opens drift toward the front). Body:
// { key: "stat:<id>" | "metric:<id>" }. Idempotent-ish: increments the count
// and restamps lastTapAt. Upserts UserProgress for brand-new accounts.

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'
import { recordTileTap, isValidTileKey } from '@/lib/dashboardTiles/recordTileTap'
import { bustTilesCache } from '@/lib/redis'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { key?: unknown } | null = null
  try {
    body = (await request.json()) as { key?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!isValidTileKey(body?.key)) {
    return NextResponse.json({ error: 'Missing or invalid field: key' }, { status: 400 })
  }
  const key = body.key

  await dbConnect()
  const now = new Date()
  const existing = await UserProgress.findOne({ userId: auth.userId })
  const { next } = recordTileTap(existing?.tileEngagement ?? [], key, now)

  if (existing) {
    existing.tileEngagement = next
    await existing.save()
  } else {
    await UserProgress.create({ userId: auth.userId, tileEngagement: next })
  }

  // Engagement ordering changed — invalidate the tiles cache so the next load
  // reflects the new ordering rather than waiting out the TTL.
  await bustTilesCache(auth.userId)

  return NextResponse.json({ success: true })
}
