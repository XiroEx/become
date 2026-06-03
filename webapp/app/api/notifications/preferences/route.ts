import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const progress = await UserProgress.findOne({ userId: authResult.userId })
      .select('notificationPrefs')
      .lean()

    const defaults = { streakAtRisk: true, workoutReminder: true, reEngagement: true, chatMessage: true }
    return NextResponse.json({ preferences: { ...defaults, ...progress?.notificationPrefs } })
  } catch (error) {
    console.error('Error fetching notification preferences:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const allowed = ['streakAtRisk', 'workoutReminder', 'reEngagement', 'chatMessage']
    const updates: Record<string, boolean> = {}
    for (const key of allowed) {
      if (typeof body[key] === 'boolean') updates[`notificationPrefs.${key}`] = body[key]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid preferences provided' }, { status: 400 })
    }

    await dbConnect()
    await UserProgress.updateOne({ userId: authResult.userId }, { $set: updates })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating notification preferences:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
