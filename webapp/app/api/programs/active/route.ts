import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'

export async function GET(request: NextRequest) {
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

    await dbConnect()

    // Get user progress with active programs
    const userProgress = await UserProgress.findOne({ userId: payload.userId }).lean()

    if (!userProgress || !userProgress.activePrograms || userProgress.activePrograms.length === 0) {
      return NextResponse.json({ activePrograms: [] })
    }

    // Filter to only in-progress or active programs (not completed or paused)
    const inProgressPrograms = userProgress.activePrograms.filter(
      (p: { status: string }) => p.status === 'in-progress' || p.status === 'active'
    )

    // Return active programs with progress info
    const activePrograms = inProgressPrograms.map((program: {
      programId: string
      programName: string
      startDate: Date
      currentPhase: number
      currentDay: string
      completedWorkouts: number
      totalWorkouts: number
      status: string
      lastWorkoutDate?: Date
    }) => ({
      programId: program.programId,
      programName: program.programName,
      startDate: program.startDate,
      currentPhase: program.currentPhase,
      currentDay: program.currentDay,
      completedWorkouts: program.completedWorkouts,
      totalWorkouts: program.totalWorkouts,
      progress: program.totalWorkouts > 0 
        ? Math.round((program.completedWorkouts / program.totalWorkouts) * 100)
        : 0,
      status: program.status,
      lastWorkoutDate: program.lastWorkoutDate
    }))

    return NextResponse.json({ activePrograms })

  } catch (error) {
    console.error('Error fetching active programs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
