import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/mongodb'
import User from '@/models/User'
import UserProgress, { IWorkoutLog } from '@/models/UserProgress'
import MindProgress from '@/models/MindProgress'
import { verifyAdmin } from '@/lib/adminAuth'
import { TIERS, type Tier } from '@/lib/entitlements'

// GET /api/admin/users/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminResult = await verifyAdmin(request)
    if (!adminResult.success) {
      return NextResponse.json(
        { error: adminResult.error },
        { status: adminResult.status ?? 401 }
      )
    }

    const { id } = await params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    }

    await connectDB()

    const user = await User.findById(id).select('-password').lean()
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const [progress, mindProgress] = await Promise.all([
      UserProgress.findOne(
        { userId: new mongoose.Types.ObjectId(id) },
        {
          weightHistory: { $slice: -10 },
          moodHistory: { $slice: -10 },
          workoutLogs: { $slice: -5 },
          activePrograms: 1,
          streakDays: 1,
          longestStreak: 1,
          totalWorkouts: 1,
          lastActivityDate: 1,
        }
      ).lean(),
      MindProgress.findOne(
        { userId: new mongoose.Types.ObjectId(id) },
        { chapter: 1, xp: 1, selfDeclaredChapters: 1, 'vision.completedAt': 1, 'vision.identityStatement': 1, chapterHistory: 1 }
      ).lean(),
    ])

    // Shape workoutLogs to summary fields only
    const workoutLogsSummary = progress?.workoutLogs?.map((log: IWorkoutLog) => ({
      date: log.date,
      programId: log.programId,
      completed: log.completed,
      duration: log.duration ?? null,
    })) ?? []

    return NextResponse.json({
      user,
      progress: progress
        ? {
            weightHistory: progress.weightHistory ?? [],
            moodHistory: progress.moodHistory ?? [],
            workoutLogs: workoutLogsSummary,
            activePrograms: progress.activePrograms ?? [],
            streakDays: progress.streakDays ?? 0,
            longestStreak: progress.longestStreak ?? 0,
            totalWorkouts: progress.totalWorkouts ?? 0,
            lastActivityDate: progress.lastActivityDate ?? null,
          }
        : null,
      mind: mindProgress
        ? {
            chapter: mindProgress.chapter,
            xp: mindProgress.xp,
            selfDeclaredCount: (mindProgress.selfDeclaredChapters as number[])?.length ?? 0,
            visionCompleted: !!mindProgress.vision?.completedAt,
            identityStatement: mindProgress.vision?.identityStatement ?? null,
            chaptersUnlocked: (mindProgress.chapterHistory as { chapter: number }[])?.length ?? 1,
          }
        : null,
    })
  } catch (error) {
    console.error('Admin user detail error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/admin/users/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminResult = await verifyAdmin(request)
    if (!adminResult.success) {
      return NextResponse.json(
        { error: adminResult.error },
        { status: adminResult.status ?? 401 }
      )
    }

    const { id } = await params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    }

    // A malformed body is the caller's mistake, not ours. Left to throw it
    // lands in the catch below and answers 500, which reads as an outage.
    let body: Record<string, unknown>
    try {
      body = await request.json() as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 })
    }

    // Build the update payload — only allow specific fields
    const update: Record<string, unknown> = {}

    if (body.role !== undefined) {
      if (!['user', 'trainer', 'admin'].includes(body.role as string)) {
        return NextResponse.json(
          { error: 'Invalid role. Must be user, trainer, or admin' },
          { status: 400 }
        )
      }
      // Same self-guard DELETE carries. Without it the last admin can demote
      // themselves and lock everyone out of the admin surface, with no route
      // left that could put the role back.
      if (adminResult.userId === id) {
        return NextResponse.json(
          { error: 'Cannot change your own role' },
          { status: 400 }
        )
      }
      update.role = body.role
    }

    if (body.onboardingCompleted !== undefined) {
      if (typeof body.onboardingCompleted !== 'boolean') {
        return NextResponse.json(
          { error: 'onboardingCompleted must be a boolean' },
          { status: 400 }
        )
      }
      update.onboardingCompleted = body.onboardingCompleted
    }

    // Tier is DERIVED state. Exactly three writers are allowed: this admin
    // route, scripts/migrate-tiers.mjs, and the billing webhook. No other route
    // may $set it — deriving a tier on a request path would grandfather members
    // automatically.
    //
    // findByIdAndUpdate's `runValidators` are UPDATE validators: they validate
    // only the paths present in the `$set`, never the rest of the document. So
    // a PATCH against a user still holding a legacy 'premium'/'pro' tier does
    // NOT throw here — it silently leaves the legacy value in place unless this
    // request happens to overwrite `tier` itself. (A `save()` on a hydrated
    // document is the one that throws, because Mongoose validates every
    // initialized path; that is what scripts/migrate-tiers.mjs exists to fix.)
    if (body.tier !== undefined) {
      if (!TIERS.includes(body.tier as Tier)) {
        return NextResponse.json(
          { error: 'Invalid tier. Must be free or plus' },
          { status: 400 }
        )
      }
      update.tier = body.tier
    }

    // Boolean(), not a type check, is how `{"grandfathered":"false"}` used to
    // set the flag TRUE — every non-empty string is truthy. This field decides
    // who we promised never to charge, so it takes an actual boolean or nothing.
    if (body.grandfathered !== undefined) {
      if (typeof body.grandfathered !== 'boolean') {
        return NextResponse.json(
          { error: 'grandfathered must be a boolean' },
          { status: 400 }
        )
      }
      update.grandfathered = body.grandfathered
    }

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim() === '') {
        return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
      }
      update.name = body.name.trim()
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    await connectDB()

    // Read before write: the coherence rule below needs the tier this PATCH is
    // NOT setting, and the audit line needs the values being overwritten.
    const existing = await User.findById(id)
      .select('role tier grandfathered')
      .lean<{ role?: string; tier?: string; grandfathered?: boolean } | null>()

    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // `tier: 'free'` + `grandfathered: true` is the row loadUserEntitlement logs
    // as a bug: the member is gated as free while every surface tells them
    // "thanks for being here early". It is only impossible because the writers
    // set both halves together, so this route has to as well.
    //
    // Setting tier to free clears the flag, unless the body names it explicitly
    // — and if it explicitly asks for the incoherent pair, that is a 400 rather
    // than a silent correction.
    if (update.tier === 'free' && body.grandfathered === undefined) {
      update.grandfathered = false
    }

    const resolvedTier = (update.tier as string | undefined) ?? existing.tier ?? 'free'
    const resolvedGrandfathered = update.grandfathered !== undefined
      ? update.grandfathered as boolean
      : existing.grandfathered ?? false

    if (resolvedGrandfathered && resolvedTier !== 'plus') {
      return NextResponse.json(
        {
          error: `grandfathered requires tier 'plus' (resolved tier: '${resolvedTier}'). ` +
            'Set tier and grandfathered together.',
        },
        { status: 400 }
      )
    }

    // Audit trail for the fields that decide access and who pays. No collection
    // — RedRun retains container logs, and a durable one is a bigger change than
    // this needs.
    console.info('[admin-audit]', {
      action: 'admin.user.patch',
      actorId: adminResult.userId,
      actorEmail: adminResult.email ?? null,
      targetId: id,
      fields: Object.keys(update),
      before: {
        role: existing.role ?? null,
        tier: existing.tier ?? null,
        grandfathered: existing.grandfathered ?? null,
      },
      after: {
        role: update.role ?? existing.role ?? null,
        tier: resolvedTier,
        grandfathered: resolvedGrandfathered,
      },
      at: new Date().toISOString(),
    })

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    )
      .select('-password')
      .lean()

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user: updatedUser })
  } catch (error) {
    console.error('Admin user patch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/admin/users/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminResult = await verifyAdmin(request)
    if (!adminResult.success) {
      return NextResponse.json(
        { error: adminResult.error },
        { status: adminResult.status ?? 401 }
      )
    }

    const { id } = await params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    }

    // Prevent self-deletion
    if (adminResult.userId === id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      )
    }

    await connectDB()

    const user = await User.findById(id).lean()
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await Promise.all([
      User.findByIdAndDelete(id),
      UserProgress.deleteOne({ userId: new mongoose.Types.ObjectId(id) }),
    ])

    return NextResponse.json({ message: 'User deleted' })
  } catch (error) {
    console.error('Admin user delete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
