// GET /api/share/[shareId] — public, no-auth fetch of a shared snapshot. Bumps
// the view counter. Returns the frozen snapshot for read-only rendering.
import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Share from '@/models/Share'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  try {
    const { shareId } = await params
    if (!shareId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await dbConnect()
    const share = await Share.findOneAndUpdate(
      { shareId },
      { $inc: { views: 1 } },
      { new: true },
    ).lean<{ kind: string; title: string; subtitle?: string; ownerName?: string; payload: Record<string, unknown>; sourceProgramId?: string } | null>()
    if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({
      kind: share.kind,
      title: share.title,
      subtitle: share.subtitle,
      ownerName: share.ownerName,
      payload: share.payload,
      sourceProgramId: share.sourceProgramId,
    })
  } catch (error) {
    console.error('Error fetching share:', error)
    return NextResponse.json({ error: 'Failed to fetch share' }, { status: 500 })
  }
}
