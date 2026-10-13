import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, AI_TOOL_SCOPES } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import MindProgress from '@/models/MindProgress'
import IdentityProfile from '@/models/IdentityProfile'
import {
  startingChapterForPoint, getXpToNextChapter, isReadyToLevelUp,
  getUnlockedSystems, CHAPTERS, getCurrentMilestone, getNextMilestone,
  getLevelProgress, chapterFromSessions, sessionsIntoChapter, mainSessionAvailable,
  SESSIONS_PER_CHAPTER, MAIN_SESSION_COOLDOWN_MS,
} from '@/lib/mindXP'

export async function GET(request: NextRequest) {
  try {
    // Read-only, so the become-ai graph's short-lived ai-tools token may reach
    // it — half of the `become_get_mind` tool surface.
    const auth = await verifyAuth(request, { allowScopes: AI_TOOL_SCOPES })
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

    // One-time XP seeding: if a user has evolution activity but zero XP, seed from
    // evolutionScore. `xpSeeded` makes it genuinely one-time — the condition used
    // to be "xp === 0", so it re-fired every time XP returned to zero. That meant
    // an admin reset was partly undone on the very next page load: xp came back,
    // levelXp was re-derived from it below, and the level climbed straight off 1.
    if (progress && !progress.xpSeeded) {
      const evolutionScore = (identity as Record<string, unknown> | null)?.evolutionScore as number | undefined
      const seedXp = progress.xp === 0 && evolutionScore && evolutionScore > 0 ? Math.min(evolutionScore, 100) : 0
      progress = await MindProgress.findOneAndUpdate(
        { userId: auth.userId },
        { ...(seedXp > 0 && { $inc: { xp: seedXp } }), $set: { xpSeeded: true } },
        { new: true }
      ).lean()
    }

    const storedChapter = (progress?.chapter as number) ?? 1
    const xp = progress?.xp ?? 0
    const xpBank = (progress?.xpBank as number) ?? 0

    // ── Migrate to the split level/chapter model (idempotent) ──────────────
    // levelXp = cumulative XP that drives the LEVEL (uncapped). Seed it once from
    // the user's existing xp + xpBank so they don't drop to level 1. mainSessionCount
    // gates chapters (10 per) — seed it so an existing chapter is preserved.
    //
    // THAT SEED IS WHY mainSessionCount IS NOT A SESSION COUNT. The intake maps
    // 'building' → chapter 2 and 'leveling_up' → chapter 3, and a self-declared
    // level-up advances one more, so this line writes 10, 20 or 30 for a member
    // who has completed nothing. It is correct for the chapter arc (the head
    // start is the intended product) and catastrophic for anything metering
    // sessions: the free-tier allowance read it and refused brand-new members
    // their FIRST session. The allowance now reads completedMainSessions, which
    // only POST /api/mind/session increments — see lib/allowances.ts.
    const rawLevelXp = (progress?.levelXp as number) ?? 0
    const rawCount = (progress?.mainSessionCount as number) ?? 0
    const levelXp = rawLevelXp > 0 ? rawLevelXp : xp + xpBank
    const mainSessionCount = Math.max(rawCount, (storedChapter - 1) * SESSIONS_PER_CHAPTER)
    if (levelXp !== rawLevelXp || mainSessionCount !== rawCount) {
      await MindProgress.updateOne(
        { userId: auth.userId },
        { $set: { levelXp, mainSessionCount } },
      ).catch(() => {})
    }

    // Chapter is now derived from the main-session count (never below the stored
    // chapter). Level is derived from levelXp.
    const chapter = Math.max(storedChapter, chapterFromSessions(mainSessionCount))

    // ── Tool intros (one-time onboarding per tool) ─────────────────────────
    // Docs created before this feature shipped are grandfathered (their users
    // have already used the tools — never re-onboard them). Newer docs start
    // empty: each tool's intro runs on first open.
    const INTRO_FEATURE_SHIPPED = Date.parse('2026-07-17T04:00:00Z')
    let introducedSystems = progress?.introducedSystems as string[] | undefined
    if (introducedSystems === undefined) {
      const createdAt = progress?.createdAt ? new Date(progress.createdAt as Date).getTime() : Date.now()
      introducedSystems = createdAt < INTRO_FEATURE_SHIPPED ? getUnlockedSystems(chapter) : []
      await MindProgress.updateOne(
        { userId: auth.userId },
        { $set: { introducedSystems } },
      ).catch(() => {})
    }
    const levelProgress = getLevelProgress(levelXp)
    const chapterSessions = sessionsIntoChapter(mainSessionCount)
    const lastMainAt = progress?.lastMainSessionAt ? new Date(progress.lastMainSessionAt).getTime() : null
    const available = mainSessionAvailable(progress?.lastMainSessionAt)

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
      xpBank,
      xpProgress,
      readyToLevelUp,
      canSelfDeclare,
      selfDeclaredChapters,
      unlockedSystems,
      currentChapter: currentChapterData,
      nextChapter: nextChapterData,
      vision: progress?.vision ?? null,
      lastBreathAt: progress?.lastBreathAt ?? null,
      chapterHistory: progress?.chapterHistory ?? [],
      currentMilestone,
      nextMilestone,
      // ── Split level/chapter model ──
      // LEVEL: per-user, XP-driven, uncapped.
      levelXp,
      level: levelProgress.level,
      levelProgress,
      // CHAPTER: gated by completed main sessions (10 per chapter).
      mainSessionCount,
      sessionsIntoChapter: chapterSessions,
      // Tools whose one-time intro is done (unlocked ≠ introduced).
      introducedSystems,
      // 20h main-session cooldown → decides main session vs Training Grounds.
      mainSessionAvailable: available,
      lastMainSessionAt: lastMainAt,
      nextMainSessionAt: available ? null : (lastMainAt ?? 0) + MAIN_SESSION_COOLDOWN_MS,
    })
  } catch (err) {
    console.error('GET /api/mind/progress error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
