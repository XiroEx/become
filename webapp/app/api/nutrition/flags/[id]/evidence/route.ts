import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import { verifyAuth } from '@/lib/auth'
import FoodFlag from '@/models/FoodFlag'
import Food from '@/models/Food'
import { ownFlagPhotoUrl } from '@/lib/nutrition/flagPolicy'
import { verifyFood } from '@/lib/nutrition/verifyFood'
import mongoose from 'mongoose'

/** More than this on one report is someone testing the upload, not evidence. */
const MAX_PHOTOS = 6

/**
 * Add evidence to a report that came back with no change, and run it again.
 *
 * This is the member's answer to "we checked and we still disagree". They are
 * standing in front of the packet; every source we consulted is a website that
 * may be copying a figure from years ago. A second look with a clearer photo —
 * ideally one frame holding BOTH the barcode and the panel, so identity and
 * numbers cannot be separated — is the only new information in the system.
 *
 * Re-running also re-arms escalation: `rounds` goes up and `escalatedAt` is
 * cleared, so a second no-change reaches a human with the better pictures.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid report id' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const incoming: unknown[] = Array.isArray(body?.photoUrls) ? body.photoUrls.slice(0, MAX_PHOTOS) : []
    const photos = [
      ...new Set(
        incoming
          .map(u => ownFlagPhotoUrl(u, auth.userId!))
          .filter((u): u is string => !!u),
      ),
    ]
    if (photos.length === 0) {
      return NextResponse.json({ error: 'At least one photo is required' }, { status: 400 })
    }

    await dbConnect()

    const flag = await FoodFlag.findById(id)
    if (!flag) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    if (String(flag.userId) !== auth.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const merged = [...new Set([...(flag.photoUrls ?? []), ...(flag.photoUrl ? [flag.photoUrl] : []), ...photos])]

    flag.photoUrls = merged.slice(0, MAX_PHOTOS * 2)
    if (!flag.photoUrl) flag.photoUrl = merged[0]
    if (typeof body?.note === 'string' && body.note.trim()) {
      flag.note = body.note.trim().slice(0, 500)
    }
    flag.status = 'open'
    flag.rounds = (flag.rounds ?? 1) + 1
    flag.seenAt = undefined
    flag.escalatedAt = undefined
    flag.resolution = undefined
    flag.resolvedAt = undefined
    await flag.save()

    // Clear the cooldown so this genuinely re-runs rather than being skipped as
    // recently-verified. The member gave us new evidence; that is the point.
    await Food.updateOne(
      { _id: flag.foodId },
      { $unset: { 'verification.claimedAt': '', 'verification.lastRunAt': '' } },
    ).catch(() => {})

    // Best effort and deliberately not awaited into the response: the member
    // should not sit on a spinner through a web search and a vision read.
    verifyFood(String(flag.foodId)).catch(err => {
      console.error('[flag evidence] re-review failed:', err)
    })

    return NextResponse.json({ ok: true, rounds: flag.rounds, photoCount: merged.length }, { status: 202 })
  } catch (error) {
    console.error('POST /api/nutrition/flags/[id]/evidence error:', error)
    return NextResponse.json({ error: 'Failed to add evidence' }, { status: 500 })
  }
}
