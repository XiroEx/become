// POST /api/ai/nutrition/plate
// Body: { image (base64), grounding? }
// → plate estimate (nutrition.plateEstimate, vision). Vision is a STUB on the
// graph today (text-only model), so this returns { ok:false, unavailable:true }
// until a vision neuron is dropped into the become-vision-runner — the seam is
// fully wired so it lights up with zero webapp changes. The UI shows its
// "coming soon" state when unavailable is true.

import { NextRequest, NextResponse } from 'next/server'
import { runBecomeTask } from '@/lib/ai/becomeGraph'
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

  const grounding = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>
  const res = await runBecomeTask('nutrition.plateEstimate', { user: grounding }, { image })

  if (res.ok && res.result) return NextResponse.json({ ok: true, estimate: res.result })
  // vision_not_yet_available (stub) or any failure → graceful unavailable.
  return NextResponse.json({ ok: false, unavailable: true })
}
