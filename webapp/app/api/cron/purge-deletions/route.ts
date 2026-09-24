// THE PURGE. What makes "delete my account" true rather than "hide my account".
//
// A deletion request is a soft delete with a 7-day reversal window
// (lib/accountDeletion.ts). Nothing in the app runs when that window closes —
// the member is gone, by construction — so without a clock the rows would sit
// there forever and the Privacy Policy's "deleted within 30 days" would be a
// false statement. This is that clock, and
// `.github/workflows/purge-deleted-accounts.yml` is the only thing that calls
// it.
//
// Unauthenticated in the session sense, exactly like app/api/cron/notify and
// app/api/cron/resweep-tiers: the shared cron secret IS the auth, and
// `middleware.ts` only matches `/dashboard/:path*` so nothing intercepts it.
//
//   POST /api/cron/purge-deletions            (apply)
//   POST /api/cron/purge-deletions?dryRun=1   (plan only, writes nothing)
//
// PRODUCTION ONLY, for the same reason the tier resweep is: beta and
// production are two workspaces over ONE database, so a second schedule would
// be a second runner deleting the same rows.
//
// A ROW IS ONLY CLEARED WHEN THE PURGE COMPLETED. purgeAccountData reports per
// step; if any step errored the User row is left in place, `deletion` stays
// set, and the next run picks it up again. A half-purged member who no longer
// appears in the selector is a member whose data quietly survives deletion —
// the one outcome this endpoint exists to prevent.

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import { getRuntimeConfig } from '@/lib/runtimeConfig'
import { purgeSelector } from '@/lib/accountDeletion'
import { purgeAccountData, type PurgeReport } from '@/lib/accountPurge'
import { PURGE_MODELS } from '@/lib/accountPurgeModels'
import User from '@/models/User'

function isTruthyFlag(value: string | null): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

async function handle(request: NextRequest, forceDryRun = false): Promise<NextResponse> {
  const secret =
    request.headers.get('x-cron-secret') || request.nextUrl.searchParams.get('secret')

  const { admin } = await getRuntimeConfig()
  if (!secret || !admin.cronSecret || secret !== admin.cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = forceDryRun || isTruthyFlag(request.nextUrl.searchParams.get('dryRun'))
  const now = new Date()

  await dbConnect()

  const due = await User.find(purgeSelector(now))
    .select('_id email deletion')
    .limit(200)
    .lean<{ _id: unknown; email?: string; deletion?: { purgeAfter?: Date } }[]>()

  const reports: PurgeReport[] = []
  if (!dryRun) {
    for (const row of due) {
      const report = await purgeAccountData({
        models: PURGE_MODELS,
        userId: String(row._id),
        email: row.email ?? null,
        objectId: row._id,
      })
      reports.push(report)
      if (report.errors > 0) {
        console.error(
          `[purge] user=${report.userId} left in place: ${report.errors} step(s) failed`,
          report.steps.filter((s) => s.error),
        )
      } else {
        console.log(
          `[purge] user=${report.userId} purged rows=${report.affected} userDeleted=${report.userDeleted}`,
        )
      }
    }
  }

  const purged = reports.filter((r) => r.userDeleted).length
  console.log(
    `[purge] ranAt=${now.toISOString()} dryRun=${dryRun} due=${due.length} purged=${purged}`,
  )

  return NextResponse.json({
    ranAt: now.toISOString(),
    dryRun,
    due: due.length,
    purged,
    failed: reports.filter((r) => r.errors > 0).length,
    // Ids, never emails: this output is pasted into chat and into a workflow
    // summary.
    users: reports.map((r) => ({
      userId: r.userId,
      rows: r.affected,
      deleted: r.userDeleted,
      errors: r.errors,
    })),
  })
}

export async function POST(request: NextRequest) {
  try {
    return await handle(request)
  } catch (error) {
    console.error('[purge] run failed:', error)
    return NextResponse.json({ error: 'purge_failed' }, { status: 500 })
  }
}

/** GET is a DRY RUN, always. POST is the only thing that may delete a person:
 *  a verb that a browser, a preview fetch or a retried link can issue must not
 *  be the one that empties a collection, even behind the secret. */
export async function GET(request: NextRequest) {
  try {
    return await handle(request, true)
  } catch (error) {
    console.error('[purge] run failed:', error)
    return NextResponse.json({ error: 'purge_failed' }, { status: 500 })
  }
}
