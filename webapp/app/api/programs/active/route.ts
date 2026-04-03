import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import ProgramModel from '@/models/Program'

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

    // Auto-cleanup: remove activePrograms entries for programs that no longer exist
    const activeProgramIds = userProgress.activePrograms.map((p: { programId: string }) => p.programId)
    const existingPrograms = await ProgramModel.find(
      { program_id: { $in: activeProgramIds } },
      { program_id: 1 }
    ).lean()
    const existingIds = new Set(existingPrograms.map((p: { program_id: string }) => p.program_id))
    const orphanedIds = activeProgramIds.filter((id: string) => !existingIds.has(id))

    if (orphanedIds.length > 0) {
      // Fire-and-forget cleanup of orphaned entries and their logs
      UserProgress.updateOne(
        { userId: payload.userId },
        {
          $pull: {
            activePrograms: { programId: { $in: orphanedIds } },
            workoutLogs: { programId: { $in: orphanedIds } },
          }
        }
      ).catch(() => {})
    }

    // Filter to in-progress, active, or paused programs (not completed, not orphaned)
    const inProgressPrograms = userProgress.activePrograms.filter(
      (p: { programId: string; status: string }) =>
        existingIds.has(p.programId) &&
        (p.status === 'in-progress' || p.status === 'active' || p.status === 'paused')
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
