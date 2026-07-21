// POST /api/mind/progress/introduce — mark a tool's one-time onboarding intro
// as completed. Body: { system }. Idempotent ($addToSet). The tool must be one
// of the seven real arsenal systems.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import MindProgress from '@/models/MindProgress'
import { SYSTEM_INFO } from '@/lib/mindXP'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const system = String((body as { system?: string }).system ?? '')
    if (!SYSTEM_INFO[system]) {
      return NextResponse.json({ error: 'Unknown system' }, { status: 400 })
    }

    await dbConnect()
    const updated = await MindProgress.findOneAndUpdate(
      { userId: auth.userId },
      { $addToSet: { introducedSystems: system } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean<{ introducedSystems?: string[] } | null>()

    return NextResponse.json({ introduced: true, introducedSystems: updated?.introducedSystems ?? [system] })
  } catch (err) {
    console.error('POST /api/mind/progress/introduce error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
