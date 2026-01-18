import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import ProgramModel from '@/models/Program'
import { formatProgressData, mockUserProgress, calculateNextWorkout } from '@/lib/data/userProgress'
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

    // Find the most recent active program
    let programName = 'BECOME — 12 Week Fat-Loss Foundation'
    let nextWorkout = 'Day 1 - Start Training'
    let activeProgram = null
    let programDetails = null

    // First check activePrograms array for the most recent in-progress program
    if (progress.activePrograms && progress.activePrograms.length > 0) {
      // Find the most recent active program by lastWorkoutDate or startDate
      const inProgressPrograms = progress.activePrograms.filter(
        (p: { status: string }) => p.status === 'in-progress' || p.status === 'active'
      )
      
      if (inProgressPrograms.length > 0) {
        // Sort by lastWorkoutDate (most recent first), fallback to startDate
        activeProgram = inProgressPrograms.sort((a: { lastWorkoutDate?: Date; startDate: Date }, b: { lastWorkoutDate?: Date; startDate: Date }) => {
          const dateA = a.lastWorkoutDate ? new Date(a.lastWorkoutDate) : new Date(a.startDate)
          const dateB = b.lastWorkoutDate ? new Date(b.lastWorkoutDate) : new Date(b.startDate)
          return dateB.getTime() - dateA.getTime()
        })[0]
        
        programName = activeProgram.programName
        
        // Fetch the program to get workout titles
        programDetails = await ProgramModel.findOne({ 
          program_id: activeProgram.programId 
        }).lean()
        
        if (programDetails) {
          nextWorkout = calculateNextWorkout(activeProgram, programDetails, progress.workoutLogs || [])
        }
      }
    }
    
    // Fallback to legacy currentProgram field
    if (!activeProgram && progress.currentProgram?.programId) {
      programDetails = await ProgramModel.findOne({ 
        program_id: progress.currentProgram.programId 
      }).lean()
      if (programDetails) {
        programName = programDetails.name
        // Calculate next workout from workoutLogs
        const lastLog = progress.workoutLogs?.slice().reverse().find(
          (log: { programId: string }) => log.programId === progress.currentProgram.programId
        )
        if (lastLog && programDetails.phases) {
          const phaseIdx = (lastLog.phase || 1) - 1
          const phase = programDetails.phases[phaseIdx]
          if (phase?.workouts) {
            const workouts = Array.isArray(phase.workouts) 
              ? phase.workouts 
              : Object.entries(phase.workouts).map(([day, w]: [string, unknown]) => ({ day, ...(w as object) }))
            const currentDayIdx = workouts.findIndex((w: { day: string }) => w.day === lastLog.day)
            const nextDayIdx = (currentDayIdx + 1) % workouts.length
            const nextWorkoutData = workouts[nextDayIdx] as { day: string; title?: string }
            nextWorkout = `${nextWorkoutData.day} - ${nextWorkoutData.title || 'Training'}`
          }
        }
      }
    }

    // Use mock data as fallback for missing/empty fields
    // This ensures new users see demo data until they have real data
    const hasWeightData = progress.weightHistory && progress.weightHistory.length > 0
    const hasMoodData = progress.moodHistory && progress.moodHistory.length > 0
    const hasWorkoutData = progress.workoutLogs && progress.workoutLogs.length > 0
    const hasCurrentProgram = (activeProgram || progress.currentProgram?.programId)

    // Format and return progress data
    const formattedData = formatProgressData(
      {
        height: progress.height || mockUserProgress.height,
        weightHistory: hasWeightData ? progress.weightHistory : mockUserProgress.weightHistory,
        moodHistory: hasMoodData ? progress.moodHistory : mockUserProgress.moodHistory,
        workoutLogs: hasWorkoutData ? progress.workoutLogs : mockUserProgress.workoutLogs,
        currentProgram: hasCurrentProgram ? (activeProgram ? {
          programId: activeProgram.programId,
          startDate: activeProgram.startDate,
          currentPhase: activeProgram.currentPhase || 1,
          currentWeek: activeProgram.completedWorkouts ? Math.ceil(activeProgram.completedWorkouts / 4) : 1
        } : progress.currentProgram) : mockUserProgress.currentProgram,
        streakDays: progress.streakDays || mockUserProgress.streakDays,
        totalWorkouts: hasWorkoutData ? progress.totalWorkouts : mockUserProgress.totalWorkouts
      },
      programName,
      nextWorkout
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
