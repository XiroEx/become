import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import { verifyAuth } from '@/lib/auth'
import FoodFlag from '@/models/FoodFlag'
import Food from '@/models/Food'
import User from '@/models/User'
import {
  decideFlag,
  ownFlagPhotoUrl,
  roundsExhausted,
  verificationBudgetFor,
  CLAIM_TTL_MS,
  MAX_VERIFICATION_ROUNDS,
  type FlagContext,
} from '@/lib/nutrition/flagPolicy'
import { escalateFlagToHuman } from '@/lib/nutrition/escalateFlag'
import { verifyFood } from '@/lib/nutrition/verifyFood'
import { requireSpendCap } from '@/lib/ai/allowance'
import mongoose from 'mongoose'

/** More than this on one report is someone testing the upload, not evidence. */
const MAX_PHOTOS = 6
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Add evidence to a report that came back with no change, and run it again.
 *
 * This is the member's answer to "we checked and we still disagree". They are
 * standing in front of the packet; every source we consulted is a website that
 * may be copying a figure from years ago. A second look with a clearer photo —
 * ideally one frame holding BOTH the barcode and the panel, so identity and
 * numbers cannot be separated — is the only new information in the system.
 *
 * ─── WHY THIS ROUTE HAS SO MANY GUARDS ──────────────────────────────────────
 *
 * It used to have none, and it was the largest uncapped spend surface in the
 * app. It incremented `rounds` with no ceiling, cleared BOTH
 * `verification.claimedAt` and `verification.lastRunAt` so the re-verify
 * cooldown could not bite, never called decideFlag(), and never took the atomic
 * Food claim — while /flags/mine kept offering "Still wrong? Send better
 * photos" indefinitely. Report → settled → resend → settled → resend fired up
 * to three graph dispatches a turn, one of them the grounded web search that
 * flagPolicy.ts calls the metered cost of this pipeline. Nothing about that was
 * monetization-specific; it was live.
 *
 * So a relaunch now inherits every limit the FIRST report has to pass:
 *   1. a hard round ceiling, which ESCALATES TO A HUMAN rather than refusing —
 *      that is the outcome the member is actually asking for;
 *   2. the same decideFlag() admission control;
 *   3. the same atomic Food compare-and-swap;
 *   4. a cooldown override narrowed to what the photo genuinely earns;
 *   5. a spend ceiling; and
 *   6. a reduced budget, so the relaunch keeps the photo read and drops the
 *      search.
 *
 * A round is spent by a DISPATCH, never by an attempt. Every guard above can
 * end the request having queued nothing, and `rounds` is a bounded resource
 * whose exhaustion is permanent — so it is incremented at the single point
 * where a dispatch is certain, after (4) and (5) have both passed.
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

    // ── 1. The round ceiling ────────────────────────────────────────────────
    // The machine has run out of road: our record and every source it consults
    // can be copies of the same stale figure, and re-reading them will never
    // reveal that. Keep the photos, stop dispatching, and put it in front of a
    // person — which is what the member wanted two rounds ago.
    if (roundsExhausted(flag.rounds)) {
      flag.photoUrls = merged.slice(0, MAX_PHOTOS * 2)
      if (!flag.photoUrl) flag.photoUrl = merged[0]
      await flag.save()

      if (!flag.escalatedAt) {
        const escalated = await escalateToHuman(flag, merged).catch(() => false)
        if (escalated) {
          await FoodFlag.updateOne({ _id: flag._id }, { $set: { escalatedAt: new Date() } }).catch(() => {})
        }
      }

      return NextResponse.json(
        {
          // `error` and not `message`: FoodReportsPanel renders `d.error` on a
          // non-2xx, so anything else here reaches the member as the generic
          // "Could not send that. Try again." — which would be a lie about
          // what just happened, and an invitation to keep retrying.
          error: 'This report has had all the automatic checks we can run. It is with a person now.',
          rounds: flag.rounds ?? 1,
          roundsRemaining: 0,
          photoCount: merged.length,
          escalated: true,
        },
        { status: 409 },
      )
    }

    // ── 2. The same admission control the first report had to pass ──────────
    // Skipping this was the bypass: a member over their daily limit, or one
    // whose food is already being checked, could relaunch freely.
    const now = Date.now()
    const [userFlagsToday, user, food] = await Promise.all([
      FoodFlag.countDocuments({ userId: flag.userId, createdAt: { $gte: new Date(now - DAY_MS) } }),
      User.findById(flag.userId).select('createdAt').lean<{ createdAt?: Date } | null>(),
      Food.findById(flag.foodId).select('name brand barcode variants verification').lean<{
        name?: string
        brand?: string
        barcode?: string
        variants?: Array<{ isDefault?: boolean; displayLabel?: string; nutrition?: Record<string, number | undefined> }>
        verification?: {
          state?: FlagContext['foodState']
          claimedAt?: Date
          runId?: string
          verifiedAt?: Date
        }
      } | null>(),
    ])
    if (!food) return NextResponse.json({ error: 'Food not found' }, { status: 404 })

    const decision = decideFlag({
      now,
      userFlagsToday,
      userCreatedAt: user?.createdAt ? new Date(user.createdAt).getTime() : 0,
      // Not a duplicate report — this IS their report, coming back with more.
      alreadyFlaggedByUser: false,
      foodState: food.verification?.state ?? 'unverified',
      claimedAt: food.verification?.claimedAt ? new Date(food.verification.claimedAt).getTime() : undefined,
      runId: food.verification?.runId,
      verifiedAt: food.verification?.verifiedAt ? new Date(food.verification.verifiedAt).getTime() : undefined,
      hasPhoto: true,
    })

    // Record the new photos regardless. A throttled reporter is deferred, never
    // silenced — the evidence they took the trouble to send is kept either way.
    flag.photoUrls = merged.slice(0, MAX_PHOTOS * 2)
    if (!flag.photoUrl) flag.photoUrl = merged[0]
    if (typeof body?.note === 'string' && body.note.trim()) {
      flag.note = body.note.trim().slice(0, 500)
    }
    flag.status = 'open'
    flag.seenAt = undefined
    flag.escalatedAt = undefined
    flag.resolution = undefined
    flag.resolvedAt = undefined
    await flag.save()

    // `rounds` is NOT bumped here. A round is spent by a DISPATCH, not by an
    // attempt: a relaunch that decideFlag throttles (3/day for an account under
    // a week old), that loses the atomic Food claim, or that the spend ceiling
    // refuses has dispatched nothing. Charging those burned two of the three
    // automatic rounds for no work, after which roundsExhausted() returned 409
    // forever, escalatedAt was stamped, and /flags/mine flipped canAddEvidence
    // to false permanently — a temporary throttle turned into permanent
    // exhaustion plus a pointless human escalation. It is bumped at step 6,
    // once a dispatch is certain.
    const roundsSoFar = flag.rounds ?? 1
    let roundsRemaining = Math.max(0, MAX_VERIFICATION_ROUNDS - roundsSoFar)

    if (decision.action !== 'dispatch') {
      return NextResponse.json(
        {
          ok: true,
          rounds: roundsSoFar,
          roundsRemaining,
          photoCount: merged.length,
          queued: decision.action === 'queue',
          message:
            decision.action === 'attach'
              ? 'Thanks — this food is already being checked.'
              : 'reason' in decision
                ? decision.reason
                : 'Queued for review.',
        },
        { status: 202 },
      )
    }

    // ── 3. Clear ONLY the cooldown the photo genuinely earns ────────────────
    // The old code also unset `verification.claimedAt`, which is not a cooldown
    // at all — it is the concurrency lock. Clearing it defeated the compare-and-
    // swap below and let a relaunch run alongside whatever was already running.
    await Food.updateOne(
      { _id: flag.foodId },
      { $unset: { 'verification.lastRunAt': '' } },
    ).catch(() => {})

    // ── 4. The same atomic claim the flag route takes ───────────────────────
    // Losing this race means a run already covers this food: keep the photos,
    // dispatch nothing.
    const staleBefore = new Date(now - CLAIM_TTL_MS)
    const claimed = await Food.findOneAndUpdate(
      {
        _id: flag.foodId,
        $or: [
          { 'verification.state': { $nin: ['queued', 'running'] } },
          { 'verification.claimedAt': { $lt: staleBefore } },
          { 'verification.claimedAt': { $exists: false } },
        ],
      },
      { $set: { 'verification.state': 'queued', 'verification.claimedAt': new Date(now) } },
      { new: true },
    ).lean<{ _id: unknown } | null>()

    if (!claimed) {
      await FoodFlag.updateOne({ _id: flag._id }, { $set: { status: 'attached' } })
      return NextResponse.json(
        {
          ok: true,
          rounds: roundsSoFar,
          roundsRemaining,
          photoCount: merged.length,
          message: 'Thanks — this food is already being checked.',
        },
        { status: 202 },
      )
    }

    // ── 5. Spend ceiling, charged only now that a dispatch is certain ───────
    const cap = await requireSpendCap(auth.userId, 'food-verification')
    if (!cap.ok) {
      // Release the claim we just took, or the food is wedged until the TTL.
      await Food.updateOne(
        { _id: flag.foodId },
        { $set: { 'verification.state': 'unverified' }, $unset: { 'verification.claimedAt': '' } },
      ).catch(() => {})
      return cap.response
    }

    // ── 6. The round is spent HERE, and only here ───────────────────────────
    // Every way out above dispatched nothing, so none of them may consume one
    // of the three automatic rounds. Best-effort like the other side writes on
    // this path: a failed stamp means the round is not counted, which errs
    // toward the member getting another look rather than losing one.
    const rounds = roundsSoFar + 1
    flag.rounds = rounds
    roundsRemaining = Math.max(0, MAX_VERIFICATION_ROUNDS - rounds)
    await FoodFlag.updateOne({ _id: flag._id }, { $set: { rounds } }).catch(() => {})

    // ── 7. Dispatch on a reduced budget ─────────────────────────────────────
    // Best effort and deliberately not awaited: the member should not sit on a
    // spinner through a vision read and a review.
    verifyFood(String(flag.foodId), {
      budget: verificationBudgetFor(rounds),
      userPhotoUrl: merged[0],
      reportedKinds: flag.kinds ?? (flag.kind ? [flag.kind] : []),
      reportedNote: flag.note,
    }).catch(err => {
      console.error('[flag evidence] re-review failed:', err)
    })

    return NextResponse.json(
      { ok: true, rounds, roundsRemaining, photoCount: merged.length },
      { status: 202 },
    )
  } catch (error) {
    console.error('POST /api/nutrition/flags/[id]/evidence error:', error)
    return NextResponse.json({ error: 'Failed to add evidence' }, { status: 500 })
  }
}

/** Hand a report the machine cannot settle to a person, with every photo. */
async function escalateToHuman(
  flag: { _id: unknown; foodId: unknown; kind?: string; kinds?: string[]; note?: string; rounds?: number },
  photoUrls: string[],
): Promise<boolean> {
  const food = await Food.findById(flag.foodId)
    .select('name brand barcode variants')
    .lean<{
      name?: string
      brand?: string
      barcode?: string
      variants?: Array<{ isDefault?: boolean; displayLabel?: string; nutrition?: Record<string, number | undefined> }>
    } | null>()
  if (!food) return false
  const v = food.variants?.find(x => x.isDefault) ?? food.variants?.[0]

  return escalateFlagToHuman({
    flagId: String(flag._id),
    food: {
      id: String(flag.foodId),
      name: food.name ?? 'this food',
      brand: food.brand,
      barcode: food.barcode,
      servingLabel: v?.displayLabel,
      nutrition: v?.nutrition,
    },
    reporter: {},
    kinds: flag.kinds ?? (flag.kind ? [flag.kind] : []),
    note: flag.note,
    photoUrls,
    verdict: 'rounds_exhausted',
    reasoning: 'The member sent new evidence after every automatic round we run. A person needs to read the packet.',
    rounds: flag.rounds ?? MAX_VERIFICATION_ROUNDS,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  })
}
