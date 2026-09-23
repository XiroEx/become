// THE SWEEP THAT FINISHES A DELETION.
//
// A member's request marks the account and drops every push subscription there
// and then; this is the half that actually erases the data, once the seven-day
// undo window has closed. Splitting it that way is what makes the undo link
// possible at all — see lib/accountDeletion.ts.
//
// Auth is the shared cron secret, exactly like app/api/cron/notify and
// app/api/cron/resweep-tiers. `middleware.ts` only matches /dashboard/:path*,
// so nothing intercepts this.
//
//   POST /api/cron/purge-deletions            (erase everything that is due)
//   POST /api/cron/purge-deletions?dryRun=1   (list what WOULD go, write nothing)
//
// GET does the same, so it can be checked from a browser bar with `?secret=`.
//
// SCHEDULE IT FROM ONE PLACE, against production only: beta and production are
// two workspaces on ONE database (see AGENTS.md), so a second schedule would be
// a second runner over the same rows. The sweep is idempotent — a row whose
// data is already gone simply reports zeroes — so a duplicate run is wasteful
// rather than dangerous.
//
// A run with nothing due writes nothing and says so. That is the normal day.

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { getRuntimeConfig } from '@/lib/runtimeConfig'
import { purgeUserAccount, type PurgeReport } from '@/lib/accountPurge'

export const dynamic = 'force-dynamic'

function isTruthyFlag(value: string | null): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

interface DueRow {
  _id: unknown
  email?: string
  deletion?: { requestedAt?: Date; scheduledPurgeAt?: Date; source?: string }
}

/** Never unbounded: a sweep that tried to erase ten thousand accounts in one
 *  request would time out halfway and leave the tail for nobody. The next run
 *  picks up whatever is left, and they are ordered oldest-first. */
export const PURGE_BATCH_LIMIT = 200

async function handle(request: NextRequest): Promise<NextResponse> {
  const secret =
    request.headers.get('x-cron-secret') || request.nextUrl.searchParams.get('secret')

  const { admin } = await getRuntimeConfig()
  if (!secret || !admin.cronSecret || secret !== admin.cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = isTruthyFlag(request.nextUrl.searchParams.get('dryRun'))
  const now = new Date()

  await dbConnect()

  const due = await User.find({ 'deletion.scheduledPurgeAt': { $lte: now } })
    .select('_id email deletion')
    .sort({ 'deletion.scheduledPurgeAt': 1 })
    .limit(PURGE_BATCH_LIMIT)
    .lean<DueRow[]>()

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      ranAt: now.toISOString(),
      due: due.length,
      accounts: due.map((row) => ({
        userId: String(row._id),
        requestedAt: row.deletion?.requestedAt ?? null,
        scheduledPurgeAt: row.deletion?.scheduledPurgeAt ?? null,
        source: row.deletion?.source ?? null,
      })),
    })
  }

  const reports: PurgeReport[] = []
  for (const row of due) {
    const userId = String(row._id)
    const report = await purgeUserAccount(userId, { email: row.email ?? null })
    reports.push(report)
    console.info('[account-audit]', {
      action: 'account.deletion.purged',
      userId,
      userDeleted: report.userDeleted,
      deleted: report.deleted,
      detached: report.detached,
      failures: report.failures,
      tookMs: report.durationMs,
      at: new Date().toISOString(),
    })
  }

  const failed = reports.filter((r) => r.failures.length > 0)
  return NextResponse.json({
    ranAt: now.toISOString(),
    due: due.length,
    purged: reports.filter((r) => r.userDeleted).length,
    failed: failed.length,
    documentsDeleted: reports.reduce((sum, r) => sum + r.deleted, 0),
    documentsDetached: reports.reduce((sum, r) => sum + r.detached, 0),
    // Named, so a repeated failure is visible in the workflow summary rather
    // than only in a container log nobody is reading.
    failures: failed.map((r) => ({ userId: r.userId, collections: r.failures })),
  })
}

export async function POST(request: NextRequest) {
  try {
    return await handle(request)
  } catch (error) {
    console.error('[purge-deletions] sweep failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    return await handle(request)
  } catch (error) {
    console.error('[purge-deletions] sweep failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
