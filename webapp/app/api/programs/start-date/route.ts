import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import Schedule from '@/models/Schedule'

// PUT: Update the start date of an enrolled program
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const payload = verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { programId, startDate } = await request.json()

    if (!programId || !startDate) {
      return NextResponse.json({ error: 'programId and startDate are required' }, { status: 400 })
    }

    await dbConnect()

    // Update the activeProgram's startDate
    const result = await UserProgress.updateOne(
      { userId: payload.userId, 'activePrograms.programId': programId },
      { $set: { 'activePrograms.$.startDate': new Date(startDate + 'T00:00:00.000Z') } }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Program not found in your active programs' }, { status: 404 })
    }

    // Also update the schedule's startDate if one exists
    const schedule = await Schedule.findOne({ userId: payload.userId, programId })
    if (schedule) {
      schedule.settings.startDate = new Date(startDate + 'T00:00:00.000Z')
      await schedule.save()
    }

    return NextResponse.json({
      message: 'Start date updated',
      startDate: new Date(startDate + 'T00:00:00.000Z'),
    })
  } catch (error) {
    console.error('Error updating start date:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
