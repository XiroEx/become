import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import dbConnect from '@/lib/mongodb'
import Food from '@/models/Food'
import { getRuntimeConfig } from '@/lib/runtimeConfig'
import { verifyFood } from '@/lib/nutrition/verifyFood'
import {
  runVerificationQueueDrain,
  MAX_QUEUE_BATCH,
  type DrainFoodsCollection,
} from '@/lib/nutrition/verificationQueue'

/**
 * THE SCHEDULED DRAIN of the food verification queue.
 *
 * The pipeline could be ENTERED and never left. Three writers put a food into
 * `verification.state: 'queued'` — the flag route when a reporter is over their
 * daily limit or the food was recently verified, the evidence relaunch route,
 * and `scripts/audit-food-coherence.mjs` — and before this nothing in the repo
 * ever took one out again. Measured on 2026-09-21: 45 foods queued since the
 * 2026-08-13 audit run, while the agent had verified exactly one food ever.
 *
 * `lib/nutrition/verificationQueue.ts` carries the whole argument — the batch
 * bound, the claim, the TTL, the recheck-once rule; this route is the door the
 * scheduler knocks on. It holds NO copy of those rules and no second verifier:
 * `verifyFood` is called for each claimed food, exactly as the flag route calls
 * it.
 *
 * SCHEDULED FROM ONE PLACE: `.github/workflows/verify-food-queue.yml`, against
 * PRODUCTION only. Production and beta are two workspaces on one database, so a
 * second schedule on beta would be a second runner over the same rows — and
 * here that is not merely noise, it is a second grounded web search per food,
 * which is the metered cost in this pipeline.
 *
 * Unauthenticated in the session sense, like every other cron route: the shared
 * cron secret IS the auth (redsecrets `admin.cronSecret`), and `middleware.ts`
 * only matches `/dashboard/:path*` so nothing intercepts it.
 *
 *   POST /api/cron/verify-food-queue              (drain)
 *   POST /api/cron/verify-food-queue?dryRun=1     (plan only, writes nothing)
 *   POST /api/cron/verify-food-queue?limit=5      (smaller batch; capped)
 *
 * GET does the same thing, so the endpoint can be checked from a browser bar
 * with `?secret=` in the rare case that is all someone has.
 *
 * A RUN THAT CHANGES NOTHING WRITES NOTHING. An empty queue means no claim, no
 * release, no re-queue and no verification — the two reads that find the queue
 * empty are the entire run. There is no heartbeat row either: the foods
 * themselves carry `verification.{verifiedAt,lastOutcome,evidence}`, which is
 * the record of what happened, and the workflow's run history carries a
 * rendered summary of this response.
 */

export const dynamic = 'force-dynamic'

function isTruthyFlag(value: string | null): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

/** `?limit=` is a request for a SMALLER batch; the module's cap always wins. */
function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.min(Math.floor(n), MAX_QUEUE_BATCH)
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
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'))

  await dbConnect()

  const result = await runVerificationQueueDrain({
    foods: Food.collection as unknown as DrainFoodsCollection,
    // The ONE verifier. Not re-implemented, not re-prompted, and handed no
    // reporter photo or note — a scheduled drain has no reporter, so the run
    // reasons over the catalogue row and the sources it can reach itself.
    verify: (foodId) => verifyFood(foodId),
    apply: !dryRun,
    limit,
    // Stamped on every claim, so a flag that arrives mid-run can attach to this
    // run rather than dispatch a second one (lib/nutrition/flagPolicy.ts).
    runId: `verify-queue-${randomUUID()}`,
  })

  console.log(
    `[verify-queue] apply=${result.apply} waiting=${result.waiting}`
      + ` selected=${result.selected} claimed=${result.claimed} lost=${result.lostClaim}`
      + ` confirmed=${result.confirmed} corrected=${result.corrected}`
      + ` insufficient=${result.insufficient} conflicted=${result.conflicted}`
      + ` skipped=${result.skipped} failed=${result.failed} written=${result.written}`
      + ` rechecks=${result.rechecksHonoured} requeued=${result.requeued}`
      + ` leftAlone=${result.leftAlone} deadlineHit=${result.deadlineHit}`
      + ` wrote=${result.wrote} took=${result.durationMs}ms`,
  )
  for (const food of result.foods) {
    console.log(
      `[verify-queue]   ${food.foodId} ${food.outcome}`
        + ` written=${food.written}${food.reason ? ` reason=${food.reason}` : ''}`
        + `${food.recheckConsumed ? ' recheck=honoured' : ''}`
        + `${food.requeued ? ' recheck=requeued' : ''}`,
    )
  }

  return NextResponse.json({ success: true, source, ...result })
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
