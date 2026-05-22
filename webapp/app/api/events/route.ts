import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import { verifyAuth } from '@/lib/auth'
import { uniqueSlug } from '@/lib/community'
import CommunityEvent from '@/models/CommunityEvent'
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
  const includeDrafts = searchParams.get('includeDrafts') === 'true' && await isAdmin(auth.userId)
  const groupId = searchParams.get('groupId')
  const userId = new mongoose.Types.ObjectId(auth.userId)

  const filter: Record<string, unknown> = includeDrafts
    ? {}
    : { status: 'published' }
  if (groupId && mongoose.Types.ObjectId.isValid(groupId)) {
    filter.groupId = new mongoose.Types.ObjectId(groupId)
  }

  const events = await CommunityEvent.find(filter)
    .sort({ startsAt: 1 })
    .populate('groupId', 'name slug')
    .populate('createdBy', 'name email')
    .lean()

  return NextResponse.json({
    events: events.map((event) => ({
      ...event,
      attendeeCount: event.attendeeIds?.length ?? 0,
      isAttending: Boolean(event.attendeeIds?.some((id: mongoose.Types.ObjectId) => id.equals(userId))),
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
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const startsAt = typeof body.startsAt === 'string' ? new Date(body.startsAt) : null
  const endsAt = typeof body.endsAt === 'string' && body.endsAt ? new Date(body.endsAt) : undefined
  const format = body.format === 'in_person' || body.format === 'hybrid' ? body.format : 'virtual'
  const status = body.status === 'published' || body.status === 'canceled' ? body.status : 'draft'
  const capacity = Number(body.capacity)

  if (!title || !description || !startsAt || Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: 'title, description, and startsAt are required' }, { status: 400 })
  }

  let groupObjectId: mongoose.Types.ObjectId | undefined
  if (typeof body.groupId === 'string' && mongoose.Types.ObjectId.isValid(body.groupId)) {
    const group = await CommunityGroup.findById(body.groupId).select('_id').lean()
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    groupObjectId = new mongoose.Types.ObjectId(body.groupId)
  }

  const slug = await uniqueSlug(title, async (candidate) => Boolean(await CommunityEvent.exists({ slug: candidate })))
  const event = await CommunityEvent.create({
    title,
    slug,
    description,
    status,
    format,
    startsAt,
    endsAt,
    timezone: typeof body.timezone === 'string' ? body.timezone.trim() : undefined,
    locationName: typeof body.locationName === 'string' ? body.locationName.trim() : undefined,
    virtualUrl: typeof body.virtualUrl === 'string' ? body.virtualUrl.trim() : undefined,
    capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : undefined,
    groupId: groupObjectId,
    createdBy: new mongoose.Types.ObjectId(auth.userId),
    attendeeIds: [],
  })

  return NextResponse.json({ event }, { status: 201 })
}
