// GET  /api/dashboard/layout — returns the user's unified dashboard layout.
//   On first read (no persisted layout) it runs a ONE-TIME migration:
//   synthesize from the legacy UserProgress.pinnedTiles + the client-supplied
//   localStorage stat preference (?statPref=streak,mood,...), persist, return.
//   A subsequent GET returns the persisted layout without re-migrating.
//
// PATCH /api/dashboard/layout — replaces the caller's layout. The body's
//   `layout` is the FULL new ordered list; pin/unpin, reorder, resize and lock
//   all round-trip through here. Validated via the unified tile schema
//   (max 20, shape). Upserts UserProgress when the caller has none.
//
// The client treats localStorage as a read-through offline cache only; the
// server (UserProgress.dashboardLayout) is the source of truth and is therefore
// cross-device. Supersedes /api/dashboard/pinned-tiles (kept as an alias for
// one release).

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'
import {
  resolveLayoutForGet,
  parseStatPrefParam,
} from '@/lib/dashboardLayout/migrate'
import { validateLayoutPayload } from '@/lib/dashboardLayout/validateLayout'
import type { DashboardTile } from '@/lib/dashboardLayout/types'
import type { IDashboardTile } from '@/models/UserProgress'

export const dynamic = 'force-dynamic'

/** Map a persisted Mongoose subdoc to a plain wire tile. */
function toPlainTile(t: IDashboardTile): DashboardTile {
  const tile: DashboardTile = { id: t.id, kind: t.kind, size: t.size }
  if (t.locked != null) tile.locked = t.locked
  return tile
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = auth.userId

  const statPref = parseStatPrefParam(
    new URL(request.url).searchParams.get('statPref')
  )

  await dbConnect()
  const progress = await UserProgress.findOne({ userId })

  const existingLayout = (progress?.dashboardLayout ?? []).map(toPlainTile)
  const { layout, migrated } = resolveLayoutForGet({
    existingLayout,
    pinnedTiles: progress?.pinnedTiles ?? [],
    statPref,
  })

  if (migrated) {
    if (progress) {
      progress.dashboardLayout = layout
      await progress.save()
    } else {
      await UserProgress.create({ userId, dashboardLayout: layout })
    }
  }

  return NextResponse.json({ layout })
}

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

  const validated = validateLayoutPayload(body)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  await dbConnect()
  const existing = await UserProgress.findOne({ userId: auth.userId })
  if (existing) {
    existing.dashboardLayout = validated.layout
    await existing.save()
  } else {
    await UserProgress.create({
      userId: auth.userId,
      dashboardLayout: validated.layout,
    })
  }

  return NextResponse.json({ success: true, layout: validated.layout })
}
