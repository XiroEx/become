import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import TierResweepRun from '@/models/TierResweepRun'
import { getRuntimeConfig } from '@/lib/runtimeConfig'
import { runTierResweep, type ResweepUsersCollection } from '@/lib/billing/tierResweep'
import { APP_NAME } from '@/lib/appChannel'

/**
 * THE SCHEDULED TIER RESWEEP.
 *
 * A member's tier is stored, not worked out per request, and every writer of it
 * is a Stripe event handler. Two states never produce an event at the moment
 * they change meaning — a cancelled subscription whose paid period simply ends,
 * and any webhook that was missed for good — so without this the member keeps
 * Plus after the period they paid for. `lib/billing/tierResweep.ts` carries the
 * whole argument; this route is the door the scheduler knocks on.
 *
 * SCHEDULED FROM ONE PLACE: `.github/workflows/resweep-subscription-tiers.yml`,
 * against PRODUCTION only. Production and beta are two workspaces on one
 * database, so a second schedule on beta would be a second runner over the same
 * rows for no benefit. The sweep is idempotent, so a duplicate run is harmless
 * rather than dangerous — but it is still noise, and "who downgraded this
 * member" should have one answer.
 *
 * Unauthenticated in the session sense, like `app/api/cron/notify`: the shared
 * cron secret IS the auth, and `middleware.ts` only matches `/dashboard/:path*`
 * so nothing intercepts it.
 *
 *   POST /api/cron/resweep-tiers            (apply)
 *   POST /api/cron/resweep-tiers?dryRun=1   (plan only, writes nothing)
 *
 * GET does the same thing, so the endpoint can be checked from a browser bar
 * with `?secret=` in the rare case that is all someone has.
 *
 * A RUN THAT CHANGES NOTHING WRITES NOTHING. No user write, and no run row
 * either — `TierResweepRun` is a change log, not a heartbeat (see the model).
 * The run itself is still visible twice over, without costing a write: the
 * workflow's run history carries a rendered summary of this response, and the
 * line below lands in the container log.
 *
 * The dashboard tiles cache is deliberately NOT busted here, for the same
 * reason the script does not: it carries a 60-second TTL (lib/redis.ts), which
 * is nothing against a period that ended hours ago, and a cache write on a
 * sweep would be a write on a run that is supposed to be able to write nothing.
 */

export const dynamic = 'force-dynamic'

function isTruthyFlag(value: string | null): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const secret =
    request.headers.get('x-cron-secret') ||
    request.nextUrl.searchParams.get('secret')

  const { admin } = await getRuntimeConfig()
  if (!secret || !admin.cronSecret || secret !== admin.cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = isTruthyFlag(request.nextUrl.searchParams.get('dryRun'))
  const source = isTruthyFlag(request.nextUrl.searchParams.get('manual')) ? 'manual' : 'cron'

  await dbConnect()

  const result = await runTierResweep({
    users: User.collection as unknown as ResweepUsersCollection,
    apply: !dryRun,
  })

  // The change log. Written ONLY when a member actually moved, which is also
  // the only time there is anything to read back.
  let recorded = false
  if (result.modified > 0) {
    try {
      await TierResweepRun.create({
        ranAt: new Date(result.ranAt),
        source,
        channel: APP_NAME,
        candidates: result.candidates,
        planned: result.planned,
        matched: result.matched,
        modified: result.modified,
        downgrades: result.downgrades,
        upgrades: result.upgrades,
        durationMs: result.durationMs,
        changes: result.changes.map((c) => ({
          userId: c.userId,
          from: c.from,
          to: c.to,
          status: c.status,
          periodEnd: c.periodEnd ? new Date(c.periodEnd) : null,
        })),
      })
      recorded = true
    } catch (error) {
      // The tiers are already correct; only the record of it failed. Say so
      // loudly and still answer 200 — a 500 here would make the scheduler
      // retry a sweep that has nothing left to do and report a false outage.
      console.error('[resweep] tiers were rewritten but the run record failed:', error)
    }
  }

  console.log(
    `[resweep] apply=${result.apply} candidates=${result.candidates}`
      + ` correct=${result.alreadyCorrect} planned=${result.planned}`
      + ` modified=${result.modified} wrote=${result.wrote} recorded=${recorded}`
      + ` took=${result.durationMs}ms`,
  )
  for (const change of result.changes) {
    console.log(
      `[resweep]   ${change.userId} ${change.status} periodEnd=${change.periodEnd ?? '(none)'}`
        + ` ${change.from ?? '(absent)'} → ${change.to}`,
    )
  }

  return NextResponse.json({ success: true, source, recorded, ...result })
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
