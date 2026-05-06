import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import MindProgress from '@/models/MindProgress'
import { CHAPTERS, CHAPTER_XP_THRESHOLDS, getUnlockedSystems } from '@/lib/mindXP'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await dbConnect()

    const progress = await MindProgress.findOne({ userId: auth.userId })
    if (!progress) return NextResponse.json({ error: 'No progress found' }, { status: 404 })

    const currentChapter = progress.chapter as number
    if (currentChapter >= 5) {
      return NextResponse.json({ error: 'Already at max chapter' }, { status: 400 })
    }

    const xp = progress.xp as number
    const threshold = CHAPTER_XP_THRESHOLDS[currentChapter] // threshold to reach next chapter
    const hasEnoughXp = xp >= threshold
    const alreadySelfDeclared = (progress.selfDeclaredChapters as number[]).includes(currentChapter)

    if (!hasEnoughXp && alreadySelfDeclared) {
      return NextResponse.json(
        { error: 'self_declare_used', message: 'You already claimed early readiness for this chapter. Earn the XP to advance.' },
        { status: 403 }
      )
    }

    const nextChapter = currentChapter + 1
    const update: Record<string, unknown> = {
      $set: { chapter: nextChapter },
      $push: { chapterHistory: { chapter: nextChapter, unlockedAt: new Date() } },
    }

    if (!hasEnoughXp) {
      update['$addToSet'] = { selfDeclaredChapters: currentChapter }
    }

    await MindProgress.updateOne({ userId: auth.userId }, update)

    const newlyUnlocked = CHAPTERS[nextChapter - 1].systems
    const allUnlocked = getUnlockedSystems(nextChapter)
    const nextChapterData = CHAPTERS[nextChapter - 1]

    return NextResponse.json({
      chapter: nextChapter,
      selfDeclared: !hasEnoughXp,
      newlyUnlocked,
      allUnlocked,
      currentChapter: nextChapterData,
    })
  } catch (err) {
    console.error('POST /api/mind/progress/levelup error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
