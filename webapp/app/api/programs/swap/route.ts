import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'

// POST: Save a permanent exercise swap for a program
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }
    const payload = { userId: authResult.userId!, email: authResult.email! }

    const { programId, originalSlug, replacementSlug, replacementName } = await request.json()

    if (!programId || !originalSlug || !replacementSlug || !replacementName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    await dbConnect()

    // Remove any existing swap for this original exercise, then add the new one
    await UserProgress.updateOne(
      { userId: payload.userId, 'activePrograms.programId': programId },
      {
        $pull: {
          'activePrograms.$.exerciseSwaps': { originalSlug }
        }
      }
    )

    await UserProgress.updateOne(
      { userId: payload.userId, 'activePrograms.programId': programId },
      {
        $push: {
          'activePrograms.$.exerciseSwaps': {
            originalSlug,
            replacementSlug,
            replacementName,
            swappedAt: new Date()
          }
        }
      }
    )

    return NextResponse.json({ message: 'Exercise swap saved' })
  } catch (error) {
    console.error('Error saving exercise swap:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Remove a permanent exercise swap (restore original)
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }
    const payload = { userId: authResult.userId!, email: authResult.email! }

    const { searchParams } = new URL(request.url)
    const programId = searchParams.get('programId')
    const originalSlug = searchParams.get('originalSlug')

    if (!programId || !originalSlug) {
      return NextResponse.json({ error: 'programId and originalSlug are required' }, { status: 400 })
    }

    await dbConnect()

    await UserProgress.updateOne(
      { userId: payload.userId, 'activePrograms.programId': programId },
      {
        $pull: {
          'activePrograms.$.exerciseSwaps': { originalSlug }
        }
      }
    )

    return NextResponse.json({ message: 'Exercise swap removed' })
  } catch (error) {
    console.error('Error removing exercise swap:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
