// POST /api/ai/nutrition/plate
// Body: { image (base64 data URL), grounding? }
// → plate estimate (nutrition.plateEstimate, vision/multimodal Gemini). ASYNC:
// returns a runId the client polls via /api/ai/run/<runId>; the run result is the
// PlateEstimate. Image is base64-only server-side; the bearer/secret stay server-side.

import { NextRequest, NextResponse } from 'next/server'
import { requireAiUser, triggerOwnedRun } from '@/lib/ai/routeHelpers'
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

  const image = typeof body.image === 'string' ? body.image : ''
  if (!image) return NextResponse.json({ error: 'Missing image' }, { status: 400 })

  // Optional user note/description sent WITH the photo (e.g. "these are 6 carnitas
  // tacos") — the plate prompt is instructed to trust explicit counts/ingredients.
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : ''

  // Charged AFTER validation (a missing image must not cost a scan) and BEFORE
  // the trigger (the allowance gates the dispatch, it does not merely count
  // it). Photo, upload and "describe it" share ONE daily allowance, which is
  // why all three routes name the same feature.
  //
  // A ticket only rides a request that is SHAPED like a correction: the same
  // plate, re-read with a note saying what was wrong. A photo arriving with no
  // note is a new scan however valid the ticket beside it is.
  const allow = await requireAiAllowance(gate.user, 'ai-food-estimate', {
    followUpTicket: body.allowanceTicket,
    refines: Boolean(note.trim()),
  })
  if (!allow.ok) return allow.response

  const grounding = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>
  const trig = await triggerOwnedRun(
    gate.user,
    'nutrition.plateEstimate',
    { user: grounding, ...(note.trim() ? { note } : {}) },
    { image },
  )

  if (trig.ok) return NextResponse.json(await withAllowance({ ok: true, runId: trig.runId }, allow))
  // couldn't even trigger → nothing was queued, so give the unit back.
  await allow.refund()
  return NextResponse.json({ ok: false, unavailable: true })
}
