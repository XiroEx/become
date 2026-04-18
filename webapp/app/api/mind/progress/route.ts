import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import MindProgress from '@/models/MindProgress'
import IdentityProfile from '@/models/IdentityProfile'
import { startingChapterForPoint, getXpToNextChapter, isReadyToLevelUp, getUnlockedSystems, CHAPTERS } from '@/lib/mindXP'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await dbConnect()

    // Get identity to determine starting chapter for new users
    const identity = await IdentityProfile.findOne({ userId: auth.userId }).lean()

    // Get or create MindProgress
    let progress = await MindProgress.findOne({ userId: auth.userId }).lean()

    if (!progress) {
      const startChapter = identity?.startingPoint
        ? startingChapterForPoint(identity.startingPoint)
        : 1

      progress = await MindProgress.findOneAndUpdate(
        { userId: auth.userId },
        {
          $setOnInsert: {
            userId: auth.userId,
            chapter: startChapter,
            xp: 0,
            chapterHistory: [{ chapter: startChapter, unlockedAt: new Date() }],
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean()
    }

    const chapter = (progress?.chapter as number) ?? 1
    const xp = progress?.xp ?? 0
    const xpProgress = getXpToNextChapter(chapter, xp)
    const readyToLevelUp = isReadyToLevelUp(chapter, xp)
    const unlockedSystems = getUnlockedSystems(chapter)
    const currentChapterData = CHAPTERS[chapter - 1]
    const nextChapterData = chapter < 5 ? CHAPTERS[chapter] : null

    return NextResponse.json({
      chapter,
      xp,
      xpProgress,
      readyToLevelUp,
      unlockedSystems,
      currentChapter: currentChapterData,
      nextChapter: nextChapterData,
      vision: progress?.vision ?? null,
      chapterHistory: progress?.chapterHistory ?? [],
    })
  } catch (err) {
    console.error('GET /api/mind/progress error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
