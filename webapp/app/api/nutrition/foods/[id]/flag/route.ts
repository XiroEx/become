import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import Food from '@/models/Food'
import FoodFlag from '@/models/FoodFlag'
import User from '@/models/User'
import { decideFlag, ownFlagPhotoUrl, CLAIM_TTL_MS, type FlagContext } from '@/lib/nutrition/flagPolicy'

/** More than this on one report is someone testing the upload, not evidence. */
const MAX_PHOTOS = 6
import { verifyFood } from '@/lib/nutrition/verifyFood'

// ---------------------------------------------------------------------------
// POST /api/nutrition/foods/[id]/flag — "something doesn't look right".
//
// Records a report. Does NOT change the food: the catalogue is written only by
// the verification agent, so a user's claim is evidence, never an edit. Users
// fix their own MealLog snapshot separately (EditFoodModal), which unblocks
// them immediately without touching what everybody else sees.
//
// The interesting part is admission control. A flag can trigger a grounded web
// search, which is the metered cost in this pipeline, so this route decides
// whether to dispatch, attach to work already running, queue for the batch
// sweep, or reject. That decision is a pure function in lib/nutrition/
// flagPolicy.ts so it can be tested without a database.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid food id' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const VALID_KINDS = ['calories', 'macros', 'serving', 'other'] as const
    type Kind = (typeof VALID_KINDS)[number]
    // Accept the full selection, falling back to the single `kind` older
    // clients send. Deduped and filtered so a hand-rolled body cannot stuff
    // this array.
    const kinds: Kind[] = Array.from(
      new Set(
        (Array.isArray(body?.kinds) ? body.kinds : [body?.kind]).filter(
          (k: unknown): k is Kind =>
            typeof k === 'string' && (VALID_KINDS as readonly string[]).includes(k),
        ),
      ),
    )
    if (kinds.length === 0) {
      return NextResponse.json({ error: 'kind must be calories, macros, serving or other' }, { status: 400 })
    }
    const kind = kinds[0]

    await dbConnect()

    const foodId = new mongoose.Types.ObjectId(id)
    const userId = new mongoose.Types.ObjectId(auth.userId!)

    const food = await Food.findById(foodId).select('name verification').lean<{
      _id: mongoose.Types.ObjectId
      name: string
      verification?: {
        state?: FlagContext['foodState']
        claimedAt?: Date
        runId?: string
        verifiedAt?: Date
      }
    } | null>()
    if (!food) return NextResponse.json({ error: 'Food not found' }, { status: 404 })

    const now = Date.now()
    const since = new Date(now - DAY_MS)

    // Anything that is not our own upload, owned by this caller, is discarded
    // rather than rejected: the report itself is still worth keeping.
    // Multiple shots, because one photo rarely carries BOTH the barcode and the
    // nutrition panel — and the reviewer needs both to tie a label to a product.
    // Every URL is validated as the caller's own upload; a forged path would
    // otherwise let someone point us at an arbitrary fetch target.
    const rawPhotos: unknown[] = Array.isArray(body?.photoUrls)
      ? body.photoUrls.slice(0, MAX_PHOTOS)
      : []
    const photoUrls = [
      ...new Set(
        [body?.photoUrl, ...rawPhotos]
          .map(u => ownFlagPhotoUrl(u, auth.userId!))
          .filter((u): u is string => !!u),
      ),
    ]
    // The first is kept in the legacy single field so older readers still work.
    const photoUrl = photoUrls[0]

    const [alreadyFlaggedByUser, userFlagsToday, user] = await Promise.all([
      FoodFlag.exists({ foodId, userId }),
      FoodFlag.countDocuments({ userId, createdAt: { $gte: since } }),
      User.findById(userId).select('createdAt').lean<{ createdAt?: Date } | null>(),
    ])

    const decision = decideFlag({
      now,
      userFlagsToday,
      userCreatedAt: user?.createdAt ? new Date(user.createdAt).getTime() : 0,
      alreadyFlaggedByUser: !!alreadyFlaggedByUser,
      foodState: food.verification?.state ?? 'unverified',
      claimedAt: food.verification?.claimedAt ? new Date(food.verification.claimedAt).getTime() : undefined,
      runId: food.verification?.runId,
      verifiedAt: food.verification?.verifiedAt ? new Date(food.verification.verifiedAt).getTime() : undefined,
      hasPhoto: !!photoUrl,
    })

    if (decision.action === 'reject') {
      return NextResponse.json({ error: decision.reason }, { status: 429 })
    }

    // Record the report first. It is kept even when we decline to run anything,
    // so a throttled reporter is deferred rather than silenced.
    let flag
    try {
      flag = await FoodFlag.create({
        foodId,
        userId,
        kind,
        kinds,
        note: typeof body?.note === 'string' ? body.note.slice(0, 1000) : undefined,
        photoUrl,
        ...(photoUrls.length ? { photoUrls } : {}),
        claimedValues: body?.claimedValues,
        status: decision.action === 'attach' ? 'attached' : 'open',
        runId: decision.action === 'attach' ? decision.runId : undefined,
      })
    } catch (err: unknown) {
      // The unique (foodId, userId) index is the real guard against a double
      // submit racing past the exists() check above.
      if (err && typeof err === 'object' && (err as { code?: number }).code === 11000) {
        return NextResponse.json({ error: 'You have already reported this food.' }, { status: 429 })
      }
      throw err
    }

    // Corroboration: distinct people, not repeat submissions, since one flag
    // per user per food is enforced by that same unique index.
    await Food.updateOne({ _id: foodId }, { $inc: { 'verification.flagCount': 1 } })

    if (decision.action !== 'dispatch') {
      return NextResponse.json({
        ok: true,
        flagId: String(flag._id),
        status: flag.status,
        queued: decision.action === 'queue',
        message:
          decision.action === 'attach'
            ? 'Thanks — this food is already being checked.'
            : decision.reason,
      })
    }

    // Atomic claim. Two users flagging at the same instant must produce ONE
    // run: whoever wins this compare-and-swap dispatches, the other attaches.
    // A claim older than the TTL is treated as leaked and may be taken —
    // without that, a run dying mid-flight would wedge this food as
    // unverifiable forever, which is a failure mode we have already watched
    // happen elsewhere in the stack.
    const staleBefore = new Date(now - CLAIM_TTL_MS)
    const claimed = await Food.findOneAndUpdate(
      {
        _id: foodId,
        $or: [
          { 'verification.state': { $nin: ['queued', 'running'] } },
          { 'verification.claimedAt': { $lt: staleBefore } },
          { 'verification.claimedAt': { $exists: false } },
        ],
      },
      {
        $set: {
          'verification.state': 'queued',
          'verification.claimedAt': new Date(now),
        },
      },
      { new: true },
    ).lean<{ verification?: { runId?: string } } | null>()

    if (!claimed) {
      // Lost the race. Someone else's run covers this food.
      await FoodFlag.updateOne({ _id: flag._id }, { $set: { status: 'attached' } })
      return NextResponse.json({
        ok: true,
        flagId: String(flag._id),
        status: 'attached',
        message: 'Thanks — this food is already being checked.',
      })
    }

    // Dispatch and do NOT await: the pipeline runs a grounded search and a
    // review, tens of seconds, well past what the reporter should wait behind.
    // verifyFood never throws and always releases the claim, so a failure here
    // cannot wedge the food — and the claim TTL covers the process dying
    // mid-run, which is a failure mode we have watched happen elsewhere.
    void verifyFood(id, {
      userClaim: body?.claimedValues,
      userPhotoUrl: photoUrl,
      reportedKinds: kinds,
      reportedNote: typeof body?.note === 'string' ? body.note.slice(0, 1000) : undefined,
    }).catch((err) => console.error('verifyFood dispatch failed:', err))

    return NextResponse.json({
      ok: true,
      flagId: String(flag._id),
      status: 'open',
      dispatched: true,
      message: 'Thanks — we will check this and correct it if needed.',
    })
  } catch (error) {
    console.error('Error flagging food:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
