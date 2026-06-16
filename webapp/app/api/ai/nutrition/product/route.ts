// POST /api/ai/nutrition/product
// Body: { text?, image? (base64), grounding? }
// → product / nutrition-fact finder (nutrition.productFind, vision). Vision is a
// STUB on the graph today, so a label PHOTO returns { ok:false, unavailable:true }.
// (Text product lookup is served by the existing /api/nutrition food search; this
// route exists so the seam is complete when the vision neuron lands.)

import { NextRequest, NextResponse } from 'next/server'
import { triggerBecomeTask } from '@/lib/ai/becomeGraph'
import { requireAiUser, asText } from '@/lib/ai/routeHelpers'

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

  const text = asText(body.text, 300)
  const image = typeof body.image === 'string' ? body.image : ''
  if (!text.trim() && !image) return NextResponse.json({ error: 'Missing query' }, { status: 400 })

  const grounding = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>
  const trig = await triggerBecomeTask(
    'nutrition.productFind',
    { text, user: grounding },
    image ? { image } : {},
  )

  if (trig.ok) return NextResponse.json({ ok: true, runId: trig.runId })
  return NextResponse.json({ ok: false, unavailable: true })
}
