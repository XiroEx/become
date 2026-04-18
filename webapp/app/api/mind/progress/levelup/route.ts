import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import MindProgress from '@/models/MindProgress'
import { CHAPTERS, getUnlockedSystems } from '@/lib/mindXP'

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

    const nextChapter = currentChapter + 1

    await MindProgress.updateOne(
      { userId: auth.userId },
      {
        chapter: nextChapter,
        $push: { chapterHistory: { chapter: nextChapter, unlockedAt: new Date() } },
      }
    )

    const newlyUnlocked = CHAPTERS[nextChapter - 1].systems
    const allUnlocked = getUnlockedSystems(nextChapter)
    const nextChapterData = CHAPTERS[nextChapter - 1]

    return NextResponse.json({
      chapter: nextChapter,
      newlyUnlocked,
      allUnlocked,
      currentChapter: nextChapterData,
    })
  } catch (err) {
    console.error('POST /api/mind/progress/levelup error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
