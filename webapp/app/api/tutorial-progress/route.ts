import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import { verifyAuth } from '@/lib/auth'
import TutorialProgress from '@/models/TutorialProgress'
import { parseProgressState } from '@redbtn/redtutorial'

// Account-based tutorial progress for @redbtn/redtutorial's fetch adapter:
// GET returns the user's progress blob (204 when none yet), PUT upserts it.
// Progress therefore follows the account across devices instead of living in
// one browser's localStorage.

// Progress blobs are tiny (a status entry per tutorial); anything bigger than
// this is malformed or abusive.
const MAX_STATE_BYTES = 32 * 1024

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    const doc = await TutorialProgress.findOne({ userId: auth.userId }).lean()
    if (!doc?.state) return new NextResponse(null, { status: 204 })
    return NextResponse.json(doc.state)
  } catch (error) {
    console.error('Error fetching tutorial progress:', error)
    return NextResponse.json({ error: 'Failed to fetch tutorial progress' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const raw = await request.text()
    if (raw.length > MAX_STATE_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    let state
    try {
      state = parseProgressState(JSON.parse(raw))
    } catch {
      state = null
    }
    if (!state) {
      return NextResponse.json({ error: 'Invalid tutorial progress state' }, { status: 400 })
    }

    await dbConnect()
    await TutorialProgress.findOneAndUpdate(
      { userId: auth.userId },
      { $set: { state } },
      { upsert: true, new: true }
    )
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Error saving tutorial progress:', error)
    return NextResponse.json({ error: 'Failed to save tutorial progress' }, { status: 500 })
  }
}
