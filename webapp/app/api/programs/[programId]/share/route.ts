// GET/POST/DELETE /api/programs/[programId]/share — trainers and admins share
// their own custom programs with specific members. Sharing makes the program
// show up in the member's "My Programs" list (see GET /api/programs/custom)
// and lets them enroll in / view it (see the sharedWith checks added to
// GET /api/programs/[programId] and POST /api/programs/enroll).
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import ProgramModel from '@/models/Program'
import User from '@/models/User'
import { requireTrainerOrAdmin } from '@/lib/adminAuth'

interface RouteParams {
  params: Promise<{ programId: string }>
}

interface MemberSummary {
  id: string
  name?: string
  email?: string
}

const MAX_SHARE_TARGETS = 50

async function loadOwnedCustomProgram(programId: string, userId: string, role: string) {
  const program = await ProgramModel.findOne({ program_id: programId, isCustom: true })
  if (!program) return null
  if (role !== 'admin' && program.createdBy?.toString() !== userId) return null
  return program
}

async function membersSummary(ids: mongoose.Types.ObjectId[]): Promise<MemberSummary[]> {
  if (ids.length === 0) return []
  const users = await User.find({ _id: { $in: ids } }, { name: 1, email: 1 }).lean()
  return users.map((u) => ({ id: u._id.toString(), name: u.name, email: u.email }))
}

// GET: current share list for a program the requester owns (or, for admins, any custom program).
export async function GET(request: NextRequest, { params }: RouteParams) {
  const gate = await requireTrainerOrAdmin(request)
  if (!gate.ok) return gate.response

  const { programId } = await params
  await dbConnect()

  const program = await loadOwnedCustomProgram(programId, gate.userId, gate.role)
  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })

  const sharedWith = await membersSummary(program.sharedWith ?? [])
  return NextResponse.json({ sharedWith })
}

// POST: share with one or more members. Body: { userIds: string[] }
export async function POST(request: NextRequest, { params }: RouteParams) {
  const gate = await requireTrainerOrAdmin(request)
  if (!gate.ok) return gate.response

  const { programId } = await params
  let body: { userIds?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const requestedIds = Array.isArray(body.userIds)
    ? body.userIds.filter((id): id is string => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id))
    : []
  if (requestedIds.length === 0) {
    return NextResponse.json({ error: 'userIds is required' }, { status: 400 })
  }
  if (requestedIds.length > MAX_SHARE_TARGETS) {
    return NextResponse.json({ error: `Cannot share with more than ${MAX_SHARE_TARGETS} members at once` }, { status: 400 })
  }

  await dbConnect()

  const program = await loadOwnedCustomProgram(programId, gate.userId, gate.role)
  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })

  // Only real members (role 'user') can be share targets — this feature is
  // for pushing a program out to clients, not to other staff.
  const members = await User.find(
    { _id: { $in: requestedIds }, role: 'user' },
    { _id: 1 },
  ).lean()
  const memberIds = members.map((m) => m._id)
  if (memberIds.length === 0) {
    return NextResponse.json({ error: 'No valid members in userIds' }, { status: 400 })
  }

  program.sharedWith = Array.from(
    new Set([...(program.sharedWith ?? []).map((id) => id.toString()), ...memberIds.map((id) => id.toString())]),
  ).map((id) => new mongoose.Types.ObjectId(id))
  await program.save()

  const sharedWith = await membersSummary(program.sharedWith)
  return NextResponse.json({ sharedWith }, { status: 201 })
}

// DELETE: unshare a single member. Body: { userId: string }
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const gate = await requireTrainerOrAdmin(request)
  if (!gate.ok) return gate.response

  const { programId } = await params
  let body: { userId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const userId = typeof body.userId === 'string' && mongoose.Types.ObjectId.isValid(body.userId) ? body.userId : null
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

  await dbConnect()

  const program = await loadOwnedCustomProgram(programId, gate.userId, gate.role)
  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })

  program.sharedWith = (program.sharedWith ?? []).filter((id) => id.toString() !== userId)
  await program.save()

  const sharedWith = await membersSummary(program.sharedWith)
  return NextResponse.json({ sharedWith })
}
