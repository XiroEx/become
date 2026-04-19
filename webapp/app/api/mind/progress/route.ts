import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import MindProgress from '@/models/MindProgress'
import IdentityProfile from '@/models/IdentityProfile'
import {
  startingChapterForPoint, getXpToNextChapter, isReadyToLevelUp,
  getUnlockedSystems, CHAPTERS, getCurrentMilestone, getNextMilestone,
} from '@/lib/mindXP'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await dbConnect()

    const identity = await IdentityProfile.findOne({ userId: auth.userId }).lean()

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
            selfDeclaredChapters: [],
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean()
    }

    // One-time XP seeding: if user has evolution activity but zero XP, seed from evolutionScore
    if (progress && progress.xp === 0) {
      const evolutionScore = (identity as Record<string, unknown> | null)?.evolutionScore as number | undefined
      if (evolutionScore && evolutionScore > 0) {
        const seedXp = Math.min(evolutionScore, 100)
        progress = await MindProgress.findOneAndUpdate(
          { userId: auth.userId },
          { $inc: { xp: seedXp } },
          { new: true }
        ).lean()
      }
    }

    const chapter = (progress?.chapter as number) ?? 1
    const xp = progress?.xp ?? 0
    const selfDeclaredChapters = (progress?.selfDeclaredChapters as number[]) ?? []
    const xpProgress = getXpToNextChapter(chapter, xp)
    const readyToLevelUp = isReadyToLevelUp(chapter, xp)
    const canSelfDeclare = chapter < 5 && !readyToLevelUp && !selfDeclaredChapters.includes(chapter)
    const unlockedSystems = getUnlockedSystems(chapter)
    const currentChapterData = CHAPTERS[chapter - 1]
    const nextChapterData = chapter < 5 ? CHAPTERS[chapter] : null

    // Post-chapter-5 milestone data
    const currentMilestone = chapter >= 5 ? getCurrentMilestone(xp) : null
    const nextMilestone = chapter >= 5 ? getNextMilestone(xp) : null

    return NextResponse.json({
      chapter,
      xp,
      xpProgress,
      readyToLevelUp,
      canSelfDeclare,
      selfDeclaredChapters,
      unlockedSystems,
      currentChapter: currentChapterData,
      nextChapter: nextChapterData,
      vision: progress?.vision ?? null,
      chapterHistory: progress?.chapterHistory ?? [],
      currentMilestone,
      nextMilestone,
    })
  } catch (err) {
    console.error('GET /api/mind/progress error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
