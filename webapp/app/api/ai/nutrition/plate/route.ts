// POST /api/ai/nutrition/plate
// Body: { image (base64 data URL), grounding? }
// → plate estimate (nutrition.plateEstimate, vision/multimodal Gemini). ASYNC:
// returns a runId the client polls via /api/ai/run/<runId>; the run result is the
// PlateEstimate. Image is base64-only server-side; the bearer/secret stay server-side.

import { NextRequest, NextResponse } from 'next/server'
import { triggerBecomeTask } from '@/lib/ai/becomeGraph'
import { requireAiUser } from '@/lib/ai/routeHelpers'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function POST(request: NextRequest) {
  const gate = await requireAiUser(request)
  if (!gate.user) return gate.res

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const image = typeof body.image === 'string' ? body.image : ''
  if (!image) return NextResponse.json({ error: 'Missing image' }, { status: 400 })

  // Optional user note/description sent WITH the photo (e.g. "these are 6 carnitas
  // tacos") — the plate prompt is instructed to trust explicit counts/ingredients.
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : ''

  const grounding = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>
  const trig = await triggerBecomeTask(
    'nutrition.plateEstimate',
    { user: grounding, ...(note.trim() ? { note } : {}) },
    { image },
  )

  if (trig.ok) return NextResponse.json({ ok: true, runId: trig.runId })
  // couldn't even trigger → graceful unavailable.
  return NextResponse.json({ ok: false, unavailable: true })
}
