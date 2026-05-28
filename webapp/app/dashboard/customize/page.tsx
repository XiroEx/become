// Customize dashboard tiles. Lists every registered metric grouped by
// domain, with pin/unpin toggle and drag-reorder for the pinned list.
// Persists via PATCH /api/dashboard/pinned-tiles.

import { headers } from 'next/headers'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'
import { listAllMetrics } from '@/lib/metrics/registry'
import {
  CustomizeTilesClient,
  metricsToSummary,
} from '@/components/intelligence/CustomizeTilesClient'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

async function loadInitialPinned(): Promise<string[]> {
  const h = await headers()
  const fakeReq = {
    headers: {
      get: (name: string) => h.get(name),
    },
  } as unknown as NextRequest
  const auth = await verifyAuth(fakeReq)
  if (!auth.success || !auth.userId) return []
  await dbConnect()
  const progress = await UserProgress.findOne({ userId: auth.userId })
    .select('pinnedTiles')
    .lean<{ pinnedTiles?: string[] }>()
  return progress?.pinnedTiles ?? []
}

export default async function CustomizeTilesPage() {
  const [pinned, metrics] = await Promise.all([
    loadInitialPinned(),
    Promise.resolve(listAllMetrics()),
  ])
  const summaries = metricsToSummary(metrics)

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-semibold text-zinc-100">
        Customize tiles
      </h1>
      <p className="mb-6 text-sm text-zinc-400">
        Pin the tiles you want to keep at the top of your dashboard. Drag
        pinned tiles to reorder them. Unpinned tiles still appear when the
        rotator decides they’re relevant.
      </p>
      <CustomizeTilesClient
        availableMetrics={summaries}
        initialPinned={pinned}
      />
    </div>
  )
}
