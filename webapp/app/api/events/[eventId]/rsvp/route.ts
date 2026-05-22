import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import { verifyAuth } from '@/lib/auth'
import CommunityEvent from '@/models/CommunityEvent'

async function findEvent(eventId: string) {
  const query = mongoose.Types.ObjectId.isValid(eventId)
    ? { _id: eventId }
    : { slug: eventId }
  return CommunityEvent.findOne(query)
}

export async function POST(
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
  if (!event || event.status !== 'published') {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }
  if (event.capacity && event.attendeeIds.length >= event.capacity) {
    return NextResponse.json({ error: 'Event is full' }, { status: 409 })
  }

  const userId = new mongoose.Types.ObjectId(auth.userId)
  event.attendeeIds.addToSet(userId)
  await event.save()

  return NextResponse.json({ event, isAttending: true, attendeeCount: event.attendeeIds.length })
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
  const { eventId } = await params
  const event = await findEvent(eventId)
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const userId = new mongoose.Types.ObjectId(auth.userId)
  event.attendeeIds.pull(userId)
  await event.save()

  return NextResponse.json({ event, isAttending: false, attendeeCount: event.attendeeIds.length })
}
