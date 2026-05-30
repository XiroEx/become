// GET /api/progress/prs
//
// Returns the user's full personal-record collection as flat rows for the
// /dashboard/progress/prs page, sorted server-side by e1RM descending. Pure
// consumer of the already-persisted UserProgress.exercisePRs (PR #378) — no
// recomputation. Auth-gated via verifyAuth.

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'
import { formatPRsForPrsPage, type IExercisePR } from '@/lib/exercisePRs'

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const progress = await UserProgress
      .findOne({ userId: authResult.userId }, { exercisePRs: 1 })
      .lean<{ exercisePRs?: IExercisePR[] } | null>()

    const rows = formatPRsForPrsPage(progress?.exercisePRs)
    return NextResponse.json({ prs: rows })
  } catch (err) {
    console.error('GET /api/progress/prs failed:', err)
    return NextResponse.json({ error: 'Failed to load PRs' }, { status: 500 })
  }
}
