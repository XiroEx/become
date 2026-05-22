import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import { verifyAuth } from '@/lib/auth'
import CommunityGroup from '@/models/CommunityGroup'

async function findGroup(groupId: string) {
  const query = mongoose.Types.ObjectId.isValid(groupId)
    ? { _id: groupId }
    : { slug: groupId }
  return CommunityGroup.findOne(query)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
  }

  await dbConnect()
  const { groupId } = await params
  const group = await findGroup(groupId)
  if (!group || group.status !== 'active' || group.visibility !== 'public') {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  }

  const userId = new mongoose.Types.ObjectId(auth.userId)
  group.memberIds.addToSet(userId)
  await group.save()

  return NextResponse.json({ group, isMember: true, memberCount: group.memberIds.length })
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
  const { groupId } = await params
  const group = await findGroup(groupId)
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const userId = new mongoose.Types.ObjectId(auth.userId)
  group.memberIds.pull(userId)
  await group.save()

  return NextResponse.json({ group, isMember: false, memberCount: group.memberIds.length })
}
