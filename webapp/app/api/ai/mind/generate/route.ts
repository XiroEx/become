// POST /api/ai/mind/generate
// Body: { kind: 'identity'|'affirmation'|'vision'|'mission'|'reframe', prompt?, grounding? }
// → a single fresh piece of Mind content (mind.generateContent). Used by the
// "generate one for me" buttons next to the identity/vision/mission editors.
// Returns { ok, text }. No deterministic text fallback here — the caller keeps
// the user's existing content / pool line when ok is false.

import { NextRequest, NextResponse } from 'next/server'
import { runFreeformTask } from '@/lib/ai/becomeGraph'
import { requireAiUser, asText } from '@/lib/ai/routeHelpers'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

const ALLOWED = new Set(['identity', 'affirmation', 'vision', 'mission', 'reframe'])

export async function POST(request: NextRequest) {
  const gate = await requireAiUser(request)
  if (!gate.user) return gate.res

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const kind = String(body.kind ?? 'identity')
  if (!ALLOWED.has(kind)) return NextResponse.json({ error: 'Unknown kind' }, { status: 400 })

  const grounding = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>
  const text = await runFreeformTask('mind.generateContent', {
    kind,
    prompt: asText(body.prompt, 600),
    user: grounding,
  })

  if (text) return NextResponse.json({ ok: true, text })
  return NextResponse.json({ ok: false, fallback: true })
}
