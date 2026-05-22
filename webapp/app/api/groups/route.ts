import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import { verifyAuth } from '@/lib/auth'
import { splitTags, uniqueSlug } from '@/lib/community'
import CommunityGroup from '@/models/CommunityGroup'
import User from '@/models/User'

async function isAdmin(userId: string) {
  const user = await User.findById(userId).select('role').lean<{ role?: string }>()
  return user?.role === 'admin'
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
  }

  await dbConnect()
  const { searchParams } = new URL(request.url)
  const includeArchived = searchParams.get('includeArchived') === 'true' && await isAdmin(auth.userId)
  const userId = new mongoose.Types.ObjectId(auth.userId)

  const filter: Record<string, unknown> = includeArchived
    ? {}
    : { status: 'active', visibility: 'public' }

  const groups = await CommunityGroup.find(filter)
    .sort({ updatedAt: -1 })
    .populate('createdBy', 'name email')
    .lean()

  return NextResponse.json({
    groups: groups.map((group) => ({
      ...group,
      memberCount: group.memberIds?.length ?? 0,
      isMember: Boolean(group.memberIds?.some((id: mongoose.Types.ObjectId) => id.equals(userId))),
      isManager: Boolean(group.adminIds?.some((id: mongoose.Types.ObjectId) => id.equals(userId))),
    })),
  })
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
  }

  await dbConnect()
  if (!await isAdmin(auth.userId)) {
    return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
  }

  const body = await request.json() as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const visibility = body.visibility === 'private' ? 'private' : 'public'
  const status = body.status === 'archived' ? 'archived' : 'active'

  if (!name || !description) {
    return NextResponse.json({ error: 'name and description are required' }, { status: 400 })
  }

  const slug = await uniqueSlug(name, async (candidate) => Boolean(await CommunityGroup.exists({ slug: candidate })))
  const userId = new mongoose.Types.ObjectId(auth.userId)
  const group = await CommunityGroup.create({
    name,
    slug,
    description,
    visibility,
    status,
    tags: splitTags(body.tags),
    createdBy: userId,
    memberIds: [userId],
    adminIds: [userId],
  })

  return NextResponse.json({ group }, { status: 201 })
}
