import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import Schedule from '@/models/Schedule'

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }
    const payload = { userId: authResult.userId!, email: authResult.email! }

    const body = await request.json()
    const { programId } = body

    if (!programId) {
      return NextResponse.json({ error: 'Program ID is required' }, { status: 400 })
    }

    await dbConnect()

    // Find user progress
    const userProgress = await UserProgress.findOne({ userId: payload.userId })

    if (!userProgress) {
      return NextResponse.json({ error: 'No progress found' }, { status: 404 })
    }

    // Find the active program
    const programIndex = userProgress.activePrograms?.findIndex(
      (p: { programId: string }) => p.programId === programId
    )

    if (programIndex === -1 || programIndex === undefined) {
      return NextResponse.json({ error: 'Program not found in active programs' }, { status: 404 })
    }

    // Remove the program from active programs
    userProgress.activePrograms.splice(programIndex, 1)

    // Workout logs are preserved for historical tracking — only enrollment is removed

    // Clear currentProgram if it matches
    if (userProgress.currentProgram?.programId === programId) {
      userProgress.currentProgram = undefined
    }
    
    await userProgress.save()

    // Delete associated schedule
    await Schedule.deleteOne({ userId: payload.userId, programId })

    return NextResponse.json({ 
      success: true,
      message: 'Program abandoned successfully' 
    })

  } catch (error) {
    console.error('Error abandoning program:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
