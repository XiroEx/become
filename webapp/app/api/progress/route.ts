import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import ProgramModel from '@/models/Program'
import { formatProgressData, mockUserProgress } from '@/lib/data/userProgress'
import { verifyAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth(request)
    
    if (!authResult.success) {
      // Return mock data for unauthenticated users (demo mode)
      return NextResponse.json(formatProgressData(mockUserProgress))
    }

    await dbConnect()

    // Fetch user progress
    const progress = await UserProgress.findOne({ userId: authResult.userId }).lean()

    if (!progress) {
      // Return mock data if no progress exists
      return NextResponse.json(formatProgressData(mockUserProgress))
    }

    // Get current program name if exists
    let programName = 'BECOME — 12 Week Fat-Loss Foundation'
    if (progress.currentProgram?.programId) {
      const program = await ProgramModel.findOne({ 
        program_id: progress.currentProgram.programId 
      }).lean()
      if (program) {
        programName = program.name
      }
    }

    // Format and return progress data
    const formattedData = formatProgressData(
      {
        height: progress.height || 70,
        weightHistory: progress.weightHistory || [],
        moodHistory: progress.moodHistory || [],
        workoutLogs: progress.workoutLogs || [],
        currentProgram: progress.currentProgram || null,
        streakDays: progress.streakDays || 0,
        totalWorkouts: progress.totalWorkouts || 0
      },
      programName
    )

    return NextResponse.json(formattedData)
  } catch (error) {
    console.error('Error fetching progress:', error)
    // Return mock data on error
    return NextResponse.json(formatProgressData(mockUserProgress))
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const body = await request.json()
    const { type, data } = body

    const progress = await UserProgress.findOne({ userId: authResult.userId })

    if (!progress) {
      // Create new progress record
      const newProgress = await UserProgress.create({
        userId: authResult.userId,
        ...data
      })
      return NextResponse.json({ success: true, progress: newProgress })
    }

    // Update based on type
    switch (type) {
      case 'weight':
        progress.weightHistory.push({
          date: new Date(),
          weight: data.weight,
          bodyFat: data.bodyFat
        })
        break
      
      case 'workout':
        progress.workoutLogs.push(data)
        progress.totalWorkouts += 1
        // Update streak
        const lastWorkout = progress.workoutLogs[progress.workoutLogs.length - 2]
        if (lastWorkout) {
          const daysDiff = Math.floor(
            (new Date().getTime() - new Date(lastWorkout.date).getTime()) / (1000 * 60 * 60 * 24)
          )
          if (daysDiff <= 1) {
            progress.streakDays += 1
          } else {
            progress.streakDays = 1
          }
        } else {
          progress.streakDays = 1
        }
        break

      case 'program':
        progress.currentProgram = data
        break

      default:
        return NextResponse.json({ error: 'Invalid update type' }, { status: 400 })
    }

    await progress.save()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating progress:', error)
    return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 })
  }
}
