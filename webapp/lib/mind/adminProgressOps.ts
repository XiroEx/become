// What an admin progress write must actually contain.
//
// Level and chapter are DERIVED on read (/api/mind/progress):
//   chapter = max(storedChapter, chapterFromSessions(mainSessionCount))
//   level   = getLevelProgress(levelXp).level
// so writing `chapter` or a level without the counter behind it is cosmetic —
// the next read recomputes from the counter and throws the write away. That is
// what made "reset" look broken: it set chapter 1 and left mainSessionCount at
// 30, so the chapter snapped straight back to 4.
//
// These builders are pure so the invariants can be tested without a database.

import {
  SESSIONS_PER_CHAPTER,
  MAX_CHAPTER,
  cumulativeXpForLevel,
  getUnlockedSystems,
} from '@/lib/mindXP'

export interface ProgressUpdate {
  set: Record<string, unknown>
  unset?: Record<string, string>
}

/** Everything a full reset has to touch to genuinely land on a new account. */
export function resetUpdate(now: Date = new Date()): Required<ProgressUpdate> {
  return {
    set: {
      chapter: 1,
      xp: 0,
      xpBank: 0,
      // Drives LEVEL.
      levelXp: 0,
      // Drives CHAPTER.
      mainSessionCount: 0,
      chapterHistory: [{ chapter: 1, unlockedAt: now }],
      selfDeclaredChapters: [],
      // Re-lock the one-time tool intros so the journey replays properly.
      introducedSystems: [],
      recentKinds: [],
    },
    unset: {
      // The 20h gate. Left behind, the main session stays locked after a reset.
      lastMainSessionAt: '',
      lastGrowthAt: '',
      lastBreathAt: '',
    },
  }
}

/** Set the chapter, including the session count that actually unlocks it, and
 *  drop tool intros for anything no longer unlocked. */
export function chapterUpdate(
  requested: number,
  currentIntroduced?: string[],
): Record<string, unknown> {
  const chapter = Math.max(1, Math.min(MAX_CHAPTER, Math.round(requested)))
  const set: Record<string, unknown> = {
    chapter,
    mainSessionCount: (chapter - 1) * SESSIONS_PER_CHAPTER,
  }
  if (Array.isArray(currentIntroduced)) {
    const unlocked = getUnlockedSystems(chapter)
    set.introducedSystems = currentIntroduced.filter((s) => unlocked.includes(s))
  }
  return set
}

/** Set the level via the XP that derives it.
 *
 *  /api/mind/progress re-seeds levelXp from xp + xpBank whenever levelXp is 0, so
 *  a deliberate "back to level 1" would be silently undone on the next read.
 *  Clamping xp and xpBank to the new levelXp makes that seed a no-op. */
export function levelUpdate(
  requested: number,
  currentXp = 0,
  currentXpBank = 0,
): Record<string, unknown> {
  const level = Math.max(1, Math.round(requested))
  const levelXp = cumulativeXpForLevel(level)
  return {
    levelXp,
    xp: Math.min(currentXp, levelXp),
    xpBank: Math.min(currentXpBank, levelXp),
  }
}
