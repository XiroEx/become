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
import { purgeMayProceed, revokeAppleIdentity } from '@/lib/apple/deletion'
import User from '@/models/User'

function isTruthyFlag(value: string | null): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

async function handle(request: NextRequest, forceDryRun = false): Promise<NextResponse> {
  const secret =
    request.headers.get('x-cron-secret') || request.nextUrl.searchParams.get('secret')

  const { admin, apple } = await getRuntimeConfig()
  if (!secret || !admin.cronSecret || secret !== admin.cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = forceDryRun || isTruthyFlag(request.nextUrl.searchParams.get('dryRun'))
  const now = new Date()

  await dbConnect()

  const due = await User.find(purgeSelector(now))
    // `+apple.refreshToken` because the model deselects it by default (it is a
    // live third-party credential). Without the `+` the revocation below would
    // find no token and report 'no_token' forever — the one silent failure
    // this step exists to prevent.
    .select('_id email deletion apple.sub apple.isPrivateEmail +apple.refreshToken')
    .limit(200)
    .lean<{
      _id: unknown
      email?: string
      deletion?: { requestedAt?: Date; purgeAfter?: Date }
      apple?: { sub?: string; refreshToken?: string }
    }[]>()

  const reports: PurgeReport[] = []
  /** Rows held back this run because Apple refused the revocation. */
  const deferred: { userId: string; reason?: string }[] = []
  if (!dryRun) {
    for (const row of due) {
      // APPLE FIRST, AND BEFORE THE USER ROW THAT STORES THE TOKEN. Apple
      // requires an app offering Sign in with Apple to revoke the tokens it
      // holds when the account is deleted; lib/apple/deletion.ts carries the
      // policy, including why a FAILED revoke holds the purge back (so the
      // next daily sweep retries) and why that wait is bounded by the 30 days
      // the Privacy Policy promises.
      const revocation = await revokeAppleIdentity(row.apple, apple)
      if (revocation.state !== 'not_applicable') {
        console.log(
          `[purge] apple revocation user=${String(row._id)} state=${revocation.state}`
            + `${revocation.detail ? ` detail=${revocation.detail}` : ''}`,
        )
      }
      if (!purgeMayProceed(revocation, { requestedAt: row.deletion?.requestedAt, now })) {
        console.error(
          `[purge] user=${String(row._id)} held back: Apple refused the token revocation`
            + ` (${revocation.detail ?? 'unknown'}). Retrying on the next run.`,
        )
        deferred.push({ userId: String(row._id), reason: revocation.detail })
        continue
      }
      if (revocation.state === 'failed') {
        console.error(
          `[purge] user=${String(row._id)} purged WITHOUT a successful Apple revocation`
            + ` (${revocation.detail ?? 'unknown'}) — the grace period has run out;`
            + ' the member\'s data may not be kept past it',
        )
      }

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
    `[purge] ranAt=${now.toISOString()} dryRun=${dryRun} due=${due.length} purged=${purged}`
      + ` deferred=${deferred.length}`,
  )

  return NextResponse.json({
    ranAt: now.toISOString(),
    dryRun,
    due: due.length,
    purged,
    failed: reports.filter((r) => r.errors > 0).length,
    /** Held back because Apple refused the revocation; retried next run. */
    deferred,
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
