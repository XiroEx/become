import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import { captureUserTimezoneNow, resolveTimezoneReport } from '@/lib/captureUserTimezone'

export const dynamic = 'force-dynamic'

// ─── POST /api/me/timezone { tz, tzZone } ────────────────────────────────────
//
// WHERE THE MEMBER IS, RECORDED WHEN THE APP OPENS — not only when they save a
// workout.
//
// `UserProgress.timezoneOffset` (+ `timezone`) is what the notify cron reads to
// decide whether it is morning where the member is, and every sweep SKIPS a
// member who has neither. Until now the only writer was POST /api/workouts, so
// a member who logs food, or runs Mind sessions, and never saves a workout was
// unreachable by every reminder the app sells — and their windowed AI
// allowances were bucketed on UTC, which for anyone west of Greenwich means the
// day rolls over mid-afternoon.
//
// Both apps call this at most once per local day when the app opens
// (webapp/lib/timezone/reportTimezone.ts, expo/lib/timezone/reportTimezone.ts).
// It is cheap by design: one small write, deduped in-process by
// lib/captureUserTimezone.ts.
//
// Three rules travel with it, and they are the same three everywhere else:
//
//   1. Never store a stand-in. A missing, non-numeric or impossible `tz` is
//      REFUSED and the stored zone is left exactly as it was — see
//      resolveTimezoneReport(), which is where the whole rule lives.
//   2. A verifiable IANA zone outranks the number beside it: the server can
//      ask Intl what `tzZone` is actually on right now, and it cannot check a
//      number at all.
//   3. The request's `tz` still never keys an allowance directly.
//      lib/allowances.ts reads the STORED value and anchors the bucket to the
//      window the member is already in, so writing this field mid-day cannot
//      open a second AI-estimate window.
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: unknown = await request.json().catch(() => null)
    const report = resolveTimezoneReport(body)
    if (!report.ok) {
      // 400, and NOTHING written. The client keeps whatever it had and will
      // report again on its next app open rather than retrying in a loop.
      return NextResponse.json({ stored: false, error: report.reason }, { status: 400 })
    }

    // The write needs a live connection: models run with `bufferCommands:
    // false`, so on a cold container an unconnected updateOne throws instead of
    // waiting. Only reached once the report is known to be storable, so a junk
    // body never costs a connection.
    await dbConnect()
    const outcome = await captureUserTimezoneNow(
      auth.userId,
      report.captured.timezoneOffset,
      report.captured.timezone,
    )

    // 'skipped' = this process stored that exact value moments ago, which is
    // the same answer for the caller as having written it now.
    if (outcome !== 'written' && outcome !== 'skipped') {
      return NextResponse.json({ stored: false, error: 'timezone_not_stored' }, { status: 500 })
    }

    return NextResponse.json({ stored: true, ...report.captured })
  } catch (error) {
    console.error('[me/timezone] capture failed:', error)
    return NextResponse.json({ error: 'Failed to record timezone' }, { status: 500 })
  }
}
