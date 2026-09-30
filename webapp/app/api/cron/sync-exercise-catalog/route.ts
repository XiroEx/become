// THE WRITER for the dumbbell catalog. What makes shipping the table the same
// thing as applying it.
//
// Card: "We need to have support for our dumbbell only program … dumbbell
// overhead tricep press and all of the exercises needs to appear on admin
// portal", and then, after the first round: "You didn't change anything. The
// exercises still read with a DB. The exercises still don't exist in the admin
// portal."
//
// That second comment was correct. The first round put the reviewed table in
// lib/dumbbellCatalog.ts, updated the repo's snapshot in data/, and shipped a
// script for a human to run against production. Nobody ran it, so nothing the
// coach looks at changed. The admin portal reads MongoDB.
//
// This endpoint is the fix for the class of problem, not just the instance:
// lib/dumbbellCatalogSync.ts reconciles the live catalog with the table, and
// `.github/workflows/sync-exercise-catalog.yml` calls it on every push to
// `main` and once a day after that. Merging is applying.
//
// Unauthenticated in the session sense, exactly like app/api/cron/notify,
// app/api/cron/resweep-tiers and app/api/cron/purge-deletions: the shared cron
// secret IS the auth, and `middleware.ts` only matches `/dashboard/:path*` so
// nothing intercepts it.
//
//   POST /api/cron/sync-exercise-catalog            (apply)
//   POST /api/cron/sync-exercise-catalog?dryRun=1   (plan only, writes nothing)
//   GET  /api/cron/sync-exercise-catalog            (always a dry run)
//
// PRODUCTION ONLY, for the same reason the other two schedules are: beta and
// production are two RedRun workspaces over ONE MongoDB, so a second schedule
// would be a second runner over the same rows. The reconciliation is
// idempotent and convergent, so an overlap would be harmless rather than
// destructive — but "who created this exercise" should have one answer.

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import { getRuntimeConfig } from '@/lib/runtimeConfig'
import { invalidateExerciseCache } from '@/lib/hydrateExercises'
import { syncDumbbellCatalog } from '@/lib/dumbbellCatalogSync'

function isTruthyFlag(value: string | null): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

async function handle(request: NextRequest, forceDryRun = false): Promise<NextResponse> {
  const secret = request.headers.get('x-cron-secret') || request.nextUrl.searchParams.get('secret')

  const { admin } = await getRuntimeConfig()
  if (!secret || !admin.cronSecret || secret !== admin.cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = forceDryRun || isTruthyFlag(request.nextUrl.searchParams.get('dryRun'))

  await dbConnect()
  const report = await syncDumbbellCatalog({ apply: !dryRun })

  const wrote =
    report.wrote.created.length
    + report.wrote.hostEdits.length
    + report.wrote.renames.length
    + report.wrote.spellOuts.length
    + report.wrote.programs.length

  // The hydrated-exercise cache in this process is now stale for every row the
  // run touched. Other instances pick the change up on their own TTL; this is
  // the one we can be sure about.
  if (wrote > 0) invalidateExerciseCache()

  console.log(
    `[exercise-catalog-sync] ranAt=${report.ranAt} dryRun=${dryRun} `
    + `pending=${report.plan.length} repoints=${report.repoints.length} `
    + `text=${report.programText.length} wrote=${wrote} settled=${report.settled}`,
  )
  if (report.missingSlugs.length > 0) {
    console.error(
      `[exercise-catalog-sync] the table names slugs the catalog does not hold: ${report.missingSlugs.join(', ')}`,
    )
  }

  return NextResponse.json({ ...report, dryRun, wroteCount: wrote })
}

export async function POST(request: NextRequest) {
  try {
    return await handle(request)
  } catch (error) {
    console.error('[exercise-catalog-sync] run failed:', error)
    return NextResponse.json({ error: 'sync_failed' }, { status: 500 })
  }
}

/** GET is a DRY RUN, always. A verb a browser, a preview fetch or a retried
 *  link can issue must not be the one that writes to the shared catalog, even
 *  behind the secret. */
export async function GET(request: NextRequest) {
  try {
    return await handle(request, true)
  } catch (error) {
    console.error('[exercise-catalog-sync] run failed:', error)
    return NextResponse.json({ error: 'sync_failed' }, { status: 500 })
  }
}
