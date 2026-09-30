// What the scheduled tier resweep has done, for a human.
//
//   GET /api/admin/billing/resweep  → the last runs that CHANGED something,
//                                     plus how many rows are waiting right now
//
// READ ONLY, deliberately. The sweep is scheduled
// (`.github/workflows/resweep-subscription-tiers.yml` → `/api/cron/resweep-tiers`)
// and a second trigger here would be a second place it runs from. `pending` is
// the live candidate count through the sweep's own selector, so this page and
// the job can never disagree about who is waiting.
//
// A run that changed nothing leaves no row on purpose (see
// `models/TierResweepRun.ts`), so `runs: []` means "nothing has ever needed
// changing", not "it never ran". Whether it RAN is the scheduler's own history.

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import { requireAdmin } from '@/lib/adminAuth'
import User from '@/models/User'
import TierResweepRun, { type ITierResweepRun } from '@/models/TierResweepRun'
import { resweepSelector } from '@/lib/billing/tierResweep'

const RUN_LIMIT = 10

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  try {
    await dbConnect()

    const now = new Date()
    const [pending, runs] = await Promise.all([
      User.countDocuments(resweepSelector(now)),
      TierResweepRun.find({})
        .sort({ ranAt: -1 })
        .limit(RUN_LIMIT)
        .lean<Array<ITierResweepRun & { _id: unknown }>>(),
    ])

    return NextResponse.json({
      // Candidate rows as of this request — not necessarily wrong, just the
      // rows whose tier the clock could have moved.
      pending,
      lastChangeAt: runs[0]?.ranAt ?? null,
      runs: runs.map((run) => ({
        id: String(run._id),
        ranAt: run.ranAt,
        source: run.source,
        channel: run.channel ?? null,
        candidates: run.candidates,
        planned: run.planned,
        matched: run.matched,
        modified: run.modified,
        downgrades: run.downgrades,
        upgrades: run.upgrades,
        durationMs: run.durationMs,
        changes: (run.changes ?? []).map((change) => ({
          userId: change.userId,
          from: change.from ?? null,
          to: change.to,
          status: change.status,
          periodEnd: change.periodEnd ?? null,
        })),
      })),
    })
  } catch (error) {
    console.error('admin resweep read failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
