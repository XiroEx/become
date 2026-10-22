// THE WRITER for exercise demo thumbnails. What makes shipping a thumbnail
// the same thing as applying it.
//
// Prod today: ~90 exercises hold a demo video and EVERY stored `thumbnailUrl`
// is the app-icon placeholder `/icons/icon-192.png` — a stand-in the
// dumbbell-catalog table wrote, never replaced with a frame of the footage.
// `lib/exerciseThumbnails.ts` reconciles the two: one frame per clip at its
// trim in-point, uploaded beside the clip, written onto Exercise AND
// ExerciseVideo. `.github/workflows/exercise-thumbnails.yml` calls this on a
// schedule; merging IS applying.
//
// Unauthenticated in the session sense, exactly like app/api/cron/notify,
// app/api/cron/resweep-tiers, app/api/cron/purge-deletions and
// app/api/cron/sync-exercise-catalog: the shared cron secret IS the auth, and
// `middleware.ts` only matches `/dashboard/:path*` so nothing intercepts it.
//
//   POST /api/cron/exercise-thumbnails            (capture)
//   POST /api/cron/exercise-thumbnails?dryRun=1   (plan only, writes nothing)
//   POST /api/cron/exercise-thumbnails?limit=5    (smaller batch; capped)
//   GET  /api/cron/exercise-thumbnails            (always a dry run)
//
// PRODUCTION ONLY, for the same reason the other schedules are: beta and
// production are two RedRun workspaces over ONE MongoDB, so a second schedule
// would be a second runner over the same rows. The reconciliation is bounded
// and convergent, so an overlap would be harmless rather than destructive —
// but "what wrote this thumbnail" should have one answer.

import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getRuntimeConfig } from '@/lib/runtimeConfig';
import { invalidateExerciseCache } from '@/lib/hydrateExercises';
import { syncExerciseThumbnails, THUMBNAIL_BATCH_LIMIT } from '@/lib/exerciseThumbnails';

function isTruthyFlag(value: string | null): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

/** `?limit=` is a request for a SMALLER batch; the module's cap always wins. */
function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.floor(n), THUMBNAIL_BATCH_LIMIT);
}

async function handle(request: NextRequest, forceDryRun = false): Promise<NextResponse> {
  const secret = request.headers.get('x-cron-secret') || request.nextUrl.searchParams.get('secret');

  const { admin } = await getRuntimeConfig();
  if (!secret || !admin.cronSecret || secret !== admin.cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = forceDryRun || isTruthyFlag(request.nextUrl.searchParams.get('dryRun'));
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));

  await dbConnect();
  const report = await syncExerciseThumbnails({ apply: !dryRun, limit });

  const wroteCount = report.wrote.exercises.length + report.wrote.videos.length;

  // The hydrated-exercise cache in this process is now stale for every row the
  // run touched. Other instances pick the change up on their own TTL; this is
  // the one we can be sure about.
  if (wroteCount > 0) invalidateExerciseCache();

  console.log(
    `[exercise-thumbnails] ranAt=${report.ranAt} dryRun=${dryRun} `
    + `candidates=${report.candidates} selected=${report.selected} `
    + `wrote=${wroteCount} failed=${report.failed.length} `
    + `settled=${report.settled} deadlineHit=${report.deadlineHit} tookMs=${report.tookMs}`,
  );
  for (const failure of report.failed) {
    console.error(`[exercise-thumbnails] failed: ${failure}`);
  }

  return NextResponse.json({
    ...report,
    dryRun,
    wroteCount,
  });
}

export async function POST(request: NextRequest) {
  try {
    return await handle(request);
  } catch (error) {
    console.error('[exercise-thumbnails] run failed:', error);
    return NextResponse.json({ error: 'sync_failed' }, { status: 500 });
  }
}

/** GET is a DRY RUN, always. A verb a browser, a preview fetch or a retried
 *  link can issue must not be the one that captures frames and writes the
 *  catalog, even behind the secret. */
export async function GET(request: NextRequest) {
  try {
    return await handle(request, true);
  } catch (error) {
    console.error('[exercise-thumbnails] run failed:', error);
    return NextResponse.json({ error: 'sync_failed' }, { status: 500 });
  }
}
