// GET /api/ai/run/<runId>
// Polls one become-ai run's state. Returns fast (<1s) so it never trips the edge
// proxy timeout: { status: 'pending'|'completed'|'failed', ok?, result?, text?, error? }.
// The client polls this until status !== 'pending'. Auth-gated (the read-back PAT
// stays server-side); runIds are unguessable graph thread ids.

import { NextRequest, NextResponse } from 'next/server'
import { fetchBecomeRun } from '@/lib/ai/becomeGraph'
import { requireAiUser } from '@/lib/ai/routeHelpers'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const gate = await requireAiUser(request)
  if (!gate.user) return gate.res

  const { runId } = await params
  if (!runId) return NextResponse.json({ error: 'Missing runId' }, { status: 400 })

  const snap = await fetchBecomeRun(runId)
  return NextResponse.json(snap)
}
