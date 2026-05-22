import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import { verifyAuth } from '@/lib/auth'
import { splitTags } from '@/lib/community'
import CommunityGroup from '@/models/CommunityGroup'
import CommunityEvent from '@/models/CommunityEvent'
import User from '@/models/User'

async function adminGate(userId: string) {
  const user = await User.findById(userId).select('role').lean<{ role?: string }>()
  return user?.role === 'admin'
}

function findGroup(groupId: string) {
  const query = mongoose.Types.ObjectId.isValid(groupId)
    ? { _id: groupId }
    : { slug: groupId }
  return CommunityGroup.findOne(query)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
  }

  await dbConnect()
  const { groupId } = await params
  const userId = new mongoose.Types.ObjectId(auth.userId)
  const group = await findGroup(groupId)
    .populate('createdBy', 'name email')
    .lean()

  if (!group || (group.visibility !== 'public' && !await adminGate(auth.userId))) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  }

  const events = await CommunityEvent.find({
    groupId: group._id,
    status: 'published',
    startsAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  })
    .sort({ startsAt: 1 })
    .limit(10)
    .lean()

  return NextResponse.json({
    group: {
      ...group,
      memberCount: group.memberIds?.length ?? 0,
      isMember: Boolean(group.memberIds?.some((id: mongoose.Types.ObjectId) => id.equals(userId))),
      isManager: Boolean(group.adminIds?.some((id: mongoose.Types.ObjectId) => id.equals(userId))),
    },
    events,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
  }

  await dbConnect()
  if (!await adminGate(auth.userId)) {
    return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
  }

  const { groupId } = await params
  const body = await request.json() as Record<string, unknown>
  const update: Record<string, unknown> = {}

  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim()
  if (typeof body.description === 'string' && body.description.trim()) update.description = body.description.trim()
  if (body.visibility === 'public' || body.visibility === 'private') update.visibility = body.visibility
  if (body.status === 'active' || body.status === 'archived') update.status = body.status
  if (body.tags !== undefined) update.tags = splitTags(body.tags)

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const group = await findGroup(groupId)
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  Object.assign(group, update)
  await group.save()

  return NextResponse.json({ group })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
  }

  await dbConnect()
  if (!await adminGate(auth.userId)) {
    return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
  }

  const { groupId } = await params
  const group = await findGroup(groupId)
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  group.status = 'archived'
  await group.save()

  return NextResponse.json({ group })
}
