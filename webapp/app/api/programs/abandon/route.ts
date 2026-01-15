import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'

export async function POST(request: NextRequest) {
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
    await userProgress.save()

    return NextResponse.json({ 
      success: true,
      message: 'Program abandoned successfully' 
    })

  } catch (error) {
    console.error('Error abandoning program:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
