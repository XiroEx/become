import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import { verifyAuth } from '@/lib/auth'
import CommunityEvent from '@/models/CommunityEvent'
import User from '@/models/User'

async function isAdmin(userId: string) {
  const user = await User.findById(userId).select('role').lean<{ role?: string }>()
  return user?.role === 'admin'
}

function findEvent(eventId: string) {
  const query = mongoose.Types.ObjectId.isValid(eventId)
    ? { _id: eventId }
    : { slug: eventId }
  return CommunityEvent.findOne(query)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
  }

  await dbConnect()
  const { eventId } = await params
  const event = await findEvent(eventId)
    .populate('groupId', 'name slug')
    .populate('createdBy', 'name email')
    .lean()

  if (!event || (event.status !== 'published' && !await isAdmin(auth.userId))) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const userId = new mongoose.Types.ObjectId(auth.userId)
  return NextResponse.json({
    event: {
      ...event,
      attendeeCount: event.attendeeIds?.length ?? 0,
      isAttending: Boolean(event.attendeeIds?.some((id: mongoose.Types.ObjectId) => id.equals(userId))),
    },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
  }

  await dbConnect()
  if (!await isAdmin(auth.userId)) {
    return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
  }

  const { eventId } = await params
  const body = await request.json() as Record<string, unknown>
  const event = await findEvent(eventId)
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  if (typeof body.title === 'string' && body.title.trim()) event.title = body.title.trim()
  if (typeof body.description === 'string' && body.description.trim()) event.description = body.description.trim()
  if (body.status === 'draft' || body.status === 'published' || body.status === 'canceled') event.status = body.status
  if (body.format === 'virtual' || body.format === 'in_person' || body.format === 'hybrid') event.format = body.format
  if (typeof body.startsAt === 'string') {
    const startsAt = new Date(body.startsAt)
    if (!Number.isNaN(startsAt.getTime())) event.startsAt = startsAt
  }
  if (typeof body.endsAt === 'string') event.endsAt = body.endsAt ? new Date(body.endsAt) : undefined
  if (typeof body.locationName === 'string') event.locationName = body.locationName.trim()
  if (typeof body.virtualUrl === 'string') event.virtualUrl = body.virtualUrl.trim()
  if (typeof body.timezone === 'string') event.timezone = body.timezone.trim()
  if (body.capacity !== undefined) {
    const capacity = Number(body.capacity)
    event.capacity = Number.isFinite(capacity) && capacity > 0 ? capacity : undefined
  }
  if (typeof body.groupId === 'string') {
    event.groupId = mongoose.Types.ObjectId.isValid(body.groupId)
      ? new mongoose.Types.ObjectId(body.groupId)
      : undefined
  }

  await event.save()
  return NextResponse.json({ event })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
  }

  await dbConnect()
  if (!await isAdmin(auth.userId)) {
    return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
  }

  const { eventId } = await params
  const event = await findEvent(eventId)
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  event.status = 'canceled'
  await event.save()

  return NextResponse.json({ event })
}
