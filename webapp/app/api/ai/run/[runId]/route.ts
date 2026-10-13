// GET /api/ai/run/<runId>
// Polls ONE run — the caller's own. Returns fast (<1s) so it never trips the
// edge proxy timeout: { status: 'pending'|'completed'|'failed', ok?, result?,
// text?, error? }. The client polls this until status !== 'pending'.
//
// Ownership is recorded at trigger time (lib/ai/runOwnership); an unknown run
// and someone else's run are indistinguishable from the outside: identical
// body, identical status. The read-back PAT stays server-side.
//
// It NEVER charges (it is hit ~90 times per generation), but it is the first
// place the server can see that a run was accepted and then killed before it
// executed — so it is where that unit is given back. A refund only ever
// decrements, is claimed once per run, and is decided from the RUN RECORD, not
// from anything the caller said.

import { NextRequest, NextResponse } from 'next/server'
import { fetchBecomeRun } from '@/lib/ai/becomeGraph'
import { requireAiUser } from '@/lib/ai/routeHelpers'
import { userOwnsRun } from '@/lib/ai/runOwnership'
import { refundIfSkipped } from '@/lib/ai/runCharge'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const gate = await requireAiUser(request)
  if (!gate.user) return gate.res

  const { runId } = await params
  if (!runId) return NextResponse.json({ error: 'Missing runId' }, { status: 400 })

  if (!(await userOwnsRun(runId, gate.user.userId))) {
    // `status: 'failed'` is deliberate: runStore treats any non-'pending'
    // status as terminal, so the client stops polling immediately instead of
    // spinning to its 180s timeout.
    return NextResponse.json({ status: 'failed', error: 'not_found' }, { status: 404 })
  }

  const snap = await fetchBecomeRun(runId)
  // Accepted, then reaped before executing a single node: the generation the
  // member paid for never happened. A run that RAN and failed is not refunded.
  if (snap.skipped) await refundIfSkipped(runId, gate.user.userId)
  return NextResponse.json(snap)
}
