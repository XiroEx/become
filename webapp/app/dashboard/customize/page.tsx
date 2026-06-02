// Customize dashboard tiles. Lists every registered metric grouped by
// domain, with pin/unpin toggle and drag-reorder for the pinned list.
// Persists via PATCH /api/dashboard/pinned-tiles.

import { headers } from 'next/headers'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'
import { ensureWorkoutMetricsRegistered } from '@/lib/metrics/workout'
import { listAllMetrics } from '@/lib/metrics/registry'
import { CustomizeTilesClient } from '@/components/intelligence/CustomizeTilesClient'
import { BackButton } from '@/components/ui/BackButton'
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
  ensureWorkoutMetricsRegistered()

  const [pinned, metrics] = await Promise.all([
    loadInitialPinned(),
    Promise.resolve(listAllMetrics()),
  ])
  const summaries = metrics
    .filter((metric) => !metric.id.startsWith('_dev_'))
    .map((metric) => ({
      id: metric.id,
      label: metric.label,
      unit: metric.unit,
      domain: metric.domain,
    }))

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl font-semibold text-zinc-100">
          Customize tiles
        </h1>
      </div>
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
