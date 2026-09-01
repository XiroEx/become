// POST /api/ai/nutrition/product
// Body: { text?, image? (base64), grounding? }
// → product / nutrition-fact finder (nutrition.productFind, vision). Vision is a
// STUB on the graph today, so a label PHOTO returns { ok:false, unavailable:true }.
// (Text product lookup is served by the existing /api/nutrition food search; this
// route exists so the seam is complete when the vision neuron lands.)

import { NextRequest, NextResponse } from 'next/server'
import { requireAiUser, triggerOwnedRun, asText } from '@/lib/ai/routeHelpers'
import { requireAiAllowance, withAllowance } from '@/lib/ai/allowance'

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

  // Label-photo lookup is a vision call on the same daily allowance as the
  // plate scan — the member sees one "scan something" feature, so it is priced
  // as one.
  const allow = await requireAiAllowance(gate.user, 'ai-food-estimate', {
    followUpTicket: body.allowanceTicket,
  })
  if (!allow.ok) return allow.response

  const grounding = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>
  const trig = await triggerOwnedRun(
    gate.user,
    'nutrition.productFind',
    { text, user: grounding },
    image ? { image } : {},
  )

  if (trig.ok) return NextResponse.json(withAllowance({ ok: true, runId: trig.runId }, allow))
  await allow.refund()
  return NextResponse.json({ ok: false, unavailable: true })
}
