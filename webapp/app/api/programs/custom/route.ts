import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import ProgramModel from '@/models/Program'
import { verifyAuth } from '@/lib/auth'
import { requireQuota } from '@/lib/entitlementGuards'
import { hydratePrograms, dehydrateProgram } from '@/lib/hydrateExercises'

// GET: list user's own custom programs (no tier gate so downgraded users
// can still see what they made).
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    // Own programs, plus anything a trainer/admin shared with this user.
    const programs = await ProgramModel.find({
      isCustom: true,
      $or: [{ createdBy: auth.userId }, { sharedWith: auth.userId }],
    })
      .sort({ updatedAt: -1 })
      .populate('createdBy', 'name')
      .lean()
    const hydrated = await hydratePrograms(programs)
    const withOwnership = hydrated.map((p) => {
      const owner = p.createdBy as unknown as { _id?: { toString(): string }; name?: string } | null
      const isOwner = owner?._id?.toString() === auth.userId
      return {
        ...p,
        createdBy: owner?._id ?? p.createdBy,
        isOwner,
        ...(isOwner ? {} : { sharedByName: owner?.name }),
      }
    })
    return NextResponse.json({ programs: withOwnership })
  } catch (error) {
    console.error('Error listing custom programs:', error)
    return NextResponse.json(
      { error: 'Failed to list custom programs' },
      { status: 500 }
    )
  }
}

// POST: create a custom program. Quota-gated by 'custom-programs' — free tier
// gets 3 programs they OWN, counted live, so deleting one frees a slot
// (DELETE stays ungated for exactly that reason). Enrolling in or saving a
// coach program is a different thing entirely and is never capped.
// Forces isCustom: true and createdBy: userId regardless of body input.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireQuota(request, 'custom-programs')
    if (!gate.ok) return gate.response

    await dbConnect()
    const body = await request.json()

    // Convert exercise names → slugs for storage.
    const dehydrated = await dehydrateProgram(body)

    if (!dehydrated.name || typeof dehydrated.name !== 'string') {
      return NextResponse.json(
        { error: 'Program name is required' },
        { status: 400 }
      )
    }

    // Generate program_id from name if not provided.
    if (!dehydrated.program_id) {
      dehydrated.program_id = dehydrated.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50)
    }

    // Force a unique custom-scoped id to avoid collisions with shared catalog.
    const userSuffix = gate.userId.slice(-6)
    dehydrated.program_id = `custom-${userSuffix}-${dehydrated.program_id}-${Date.now().toString(36)}`

    // Server-controlled fields — ignore body.
    const created = await ProgramModel.create({
      ...dehydrated,
      isCustom: true,
      createdBy: gate.userId,
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error('Error creating custom program:', error)
    return NextResponse.json(
      { error: 'Failed to create custom program' },
      { status: 500 }
    )
  }
}
