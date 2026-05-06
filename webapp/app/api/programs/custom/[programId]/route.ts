import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import ProgramModel from '@/models/Program'
import { verifyAuth } from '@/lib/auth'
import { requireFeature } from '@/lib/entitlements'
import { hydrateProgram, dehydrateProgram } from '@/lib/hydrateExercises'

interface RouteParams {
  params: Promise<{ programId: string }>
}

function findOwnedCustomProgramQuery(programId: string, userId: string) {
  return ProgramModel.findOne({
    program_id: programId,
    isCustom: true,
    createdBy: userId,
  })
}

// GET: fetch a single custom program (owner-only).
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { programId } = await params
    await dbConnect()

    const program = await findOwnedCustomProgramQuery(programId, auth.userId).lean()
    if (!program) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const hydrated = await hydrateProgram(program)
    return NextResponse.json(hydrated)
  } catch (error) {
    console.error('Error fetching custom program:', error)
    return NextResponse.json(
      { error: 'Failed to fetch custom program' },
      { status: 500 }
    )
  }
}

async function updateCustomProgram(
  request: NextRequest,
  params: RouteParams['params']
) {
  const gate = await requireFeature(request, 'custom-programs')
  if (!gate.ok) return gate.response

  const { programId } = await params
  await dbConnect()

  const program = await findOwnedCustomProgramQuery(programId, gate.userId)
  if (!program) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json()
  const dehydrated = await dehydrateProgram(body)

  const allowedKeys = [
    'name',
    'description',
    'duration_weeks',
    'training_days_per_week',
    'goal',
    'target_user',
    'equipment',
    'tags',
    'phases',
  ] as const
  for (const key of allowedKeys) {
    const value = dehydrated[key]
    if (value !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(program as any)[key] = value
    }
  }
  // Always pin server-controlled fields.
  program.isCustom = true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(program as any).createdBy = gate.userId

  await program.save()
  return NextResponse.json(program)
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    return await updateCustomProgram(request, params)
  } catch (error) {
    console.error('Error updating custom program:', error)
    return NextResponse.json(
      { error: 'Failed to update custom program' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    return await updateCustomProgram(request, params)
  } catch (error) {
    console.error('Error patching custom program:', error)
    return NextResponse.json(
      { error: 'Failed to update custom program' },
      { status: 500 }
    )
  }
}

// DELETE: owner-only, no tier gate (so users can clean up after a downgrade).
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { programId } = await params
    await dbConnect()

    const result = await ProgramModel.deleteOne({
      program_id: programId,
      isCustom: true,
      createdBy: auth.userId,
    })

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting custom program:', error)
    return NextResponse.json(
      { error: 'Failed to delete custom program' },
      { status: 500 }
    )
  }
}
