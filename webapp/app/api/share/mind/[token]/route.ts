// GET /api/share/[token] — PUBLIC (no auth). Returns a read-only snapshot of a
// SharedSession for the public viewer. Exposes only the content + the sharer's
// display name; never the owner id or any other PII.
import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import SharedSession from '@/models/SharedSession'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    if (!token || token.length > 64) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await dbConnect()

    // Fetch + bump viewCount in one step.
    const share = await SharedSession.findOneAndUpdate(
      { token },
      { $inc: { viewCount: 1 } },
      { new: true },
    ).lean<{
      kind: string; title: string; description?: string; ownerName?: string
      sessions: { title?: string; plan: unknown }[]; sourceSystemId?: string
      createdAt?: Date; viewCount?: number
    } | null>()

    if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      kind: share.kind,
      title: share.title,
      description: share.description ?? null,
      sharedBy: share.ownerName ?? null,
      sessions: (share.sessions ?? []).map(s => ({ title: s.title ?? null, plan: s.plan })),
      createdAt: share.createdAt ?? null,
    })
  } catch (error) {
    console.error('Error fetching shared session:', error)
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  }
}
