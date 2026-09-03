import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import ProgramModel from '@/models/Program'
import { verifyAuth } from '@/lib/auth'
import { requireQuota } from '@/lib/entitlementGuards'
import { hydratePrograms, dehydrateProgram } from '@/lib/hydrateExercises'
import { pickCustomProgramFields } from '@/lib/programFields'

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
//
// The body is ALLOWLISTED through pickCustomProgramFields before it goes near
// the model — see lib/programFields.ts. Spreading the body used to persist a
// client-supplied `sharedWith`, which let a plain free member push their
// program into someone else's list and walk straight around the trainer/admin
// gate on POST /api/programs/[programId]/share.
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

    // The id is SERVER-MINTED. A client-supplied program_id is only ever a seed
    // for the slug, and is normalised exactly like the name-derived one, so no
    // raw body string lands in the stored id. The custom- prefix and timestamp
    // keep it from colliding with the shared catalog.
    const seedSource =
      typeof dehydrated.program_id === 'string' && dehydrated.program_id.trim()
        ? dehydrated.program_id
        : dehydrated.name
    const seed = String(seedSource)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50)
    const userSuffix = gate.userId.slice(-6)
    const programId = `custom-${userSuffix}-${seed}-${Date.now().toString(36)}`

    // Allowlist first, THEN pin the server-controlled fields. Nothing else the
    // caller sent reaches the model — not sharedWith, not createdBy, not the
    // cover fields, not program_id (minted above).
    const created = await ProgramModel.create({
      ...pickCustomProgramFields(dehydrated),
      program_id: programId,
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
