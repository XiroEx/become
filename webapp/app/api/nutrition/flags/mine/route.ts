import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import { verifyAuth } from '@/lib/auth'
import FoodFlag from '@/models/FoodFlag'
import Food from '@/models/Food'
import { MAX_VERIFICATION_ROUNDS, roundsExhausted } from '@/lib/nutrition/flagPolicy'
import mongoose from 'mongoose'

/**
 * The reporter's own food reports, newest first, with an unread count.
 *
 * A report that came back "no change" is the one worth surfacing: the member
 * told us something was wrong, we disagreed, and until now that conversation
 * ended silently on our side. They are the only party holding the packet, so
 * they are the only one who can escalate it further.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const flags = await FoodFlag.find({ userId: auth.userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('foodId status resolution resolvedAt createdAt kind kinds note photoUrl photoUrls seenAt escalatedAt rounds')
      .lean<Array<Record<string, unknown>>>()

    const foodIds = [...new Set(flags.map(f => String(f.foodId)))]
      .filter(id => mongoose.Types.ObjectId.isValid(id))
    const foods = await Food.find({ _id: { $in: foodIds } })
      .select('name brand barcode variants')
      .lean<Array<Record<string, unknown>>>()
    const byId = new Map(foods.map(f => [String(f._id), f]))

    const items = flags.map(f => {
      const food = byId.get(String(f.foodId)) as
        | { name?: string; brand?: string; barcode?: string; variants?: Array<Record<string, unknown>> }
        | undefined
      const v = food?.variants?.find(x => x.isDefault) ?? food?.variants?.[0]
      const photos = [...new Set([
        ...((f.photoUrls as string[]) ?? []),
        ...(f.photoUrl ? [f.photoUrl as string] : []),
      ])]

      // "Resolved but nothing changed" is the state that needs the member back.
      const settled = f.status === 'confirmed' || f.status === 'insufficient'
      const rounds = (f.rounds as number) ?? 1
      const spent = roundsExhausted(rounds)

      return {
        id: String(f._id),
        foodId: String(f.foodId),
        food: {
          name: food?.name ?? 'this food',
          brand: food?.brand,
          barcode: food?.barcode,
          servingLabel: v?.displayLabel,
          nutrition: v?.nutrition,
        },
        status: f.status,
        kinds: (f.kinds as string[]) ?? (f.kind ? [f.kind as string] : []),
        note: f.note,
        resolution: f.resolution,
        resolvedAt: f.resolvedAt,
        createdAt: f.createdAt,
        photoCount: photos.length,
        rounds,
        /** Automatic rounds left. 0 means the next step is a person, not a re-run. */
        roundsRemaining: Math.max(0, MAX_VERIFICATION_ROUNDS - rounds),
        escalated: !!f.escalatedAt,
        unread: settled && !f.seenAt,
        /**
         * Nothing changed and we still disagree — they can send better
         * evidence, but only while automatic rounds remain. Offering it
         * forever is what made the relaunch loop unbounded: the member kept
         * being invited to spend a grounded search that could not tell them
         * anything new. The route is still the gate; this only stops the UI
         * from promising something it will refuse.
         */
        canAddEvidence: settled && !spent,
      }
    })

    return NextResponse.json({
      items,
      unreadCount: items.filter(i => i.unread).length,
    })
  } catch (error) {
    console.error('GET /api/nutrition/flags/mine error:', error)
    return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 })
  }
}

/** Mark the reporter's outcomes as read. Clears the avatar badge. */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await dbConnect()
    const body = await request.json().catch(() => ({}))
    const ids = Array.isArray(body?.ids) ? body.ids.filter((i: unknown) => typeof i === 'string') : null

    await FoodFlag.updateMany(
      {
        userId: auth.userId,
        seenAt: { $exists: false },
        ...(ids?.length ? { _id: { $in: ids } } : {}),
      },
      { $set: { seenAt: new Date() } },
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('POST /api/nutrition/flags/mine error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
