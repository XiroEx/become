/**
 * Mind progression constants and XP helpers.
 * Client-safe — no server imports.
 */

export const CHAPTER_XP_THRESHOLDS = [0, 50, 150, 300, 500] // index = chapter - 1, value = XP needed to reach it

export const CHAPTERS = [
  {
    id: 1,
    name: 'Reset',
    theme: 'Get out of your own way.',
    description: 'Before anything else, you need to calm the storm. Learn to shift your state fast.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    systems: ['state-shift'] as string[],
  },
  {
    id: 2,
    name: 'Foundation',
    theme: 'See clearly where you\'re going.',
    description: 'You have calm. Now paint a picture of your best self — a vision so clear it pulls you forward.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    systems: ['vision', 'self-image', 'mission'] as string[],
  },
  {
    id: 3,
    name: 'Edge',
    theme: 'Build the habits that forge you.',
    description: 'You have a why. Now build the daily non-negotiables that close the gap between who you are and who you\'re becoming.',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    systems: ['discipline'] as string[],
  },
  {
    id: 4,
    name: 'Defense',
    theme: 'Protect what you\'re building.',
    description: 'You\'re gaining momentum. Now identify and eliminate the patterns that have stopped you before.',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    systems: ['anti-sabotage'] as string[],
  },
  {
    id: 5,
    name: 'Architect',
    theme: 'Design the world around you.',
    description: 'You\'re consistent. Now engineer your environment — the people, spaces, and inputs that accelerate your becoming.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    systems: ['social'] as string[],
  },
] as const

export const SYSTEM_INFO: Record<string, {
  label: string
  hook: string
  iconName: string
  color: string
  iconBg: string
  chapter: number
}> = {
  'state-shift':   { label: 'State Shift',   hook: 'Reset in under 3 minutes',                 iconName: 'Wind',    color: 'text-blue-400',    iconBg: 'bg-blue-500/10',    chapter: 1 },
  'vision':        { label: 'Vision',         hook: 'See your best self clearly',               iconName: 'Sparkles',color: 'text-amber-400',   iconBg: 'bg-amber-500/10',   chapter: 2 },
  'self-image':    { label: 'Self-Image',     hook: 'Reinforce who you\'re becoming',           iconName: 'Eye',     color: 'text-violet-400',  iconBg: 'bg-violet-500/10',  chapter: 2 },
  'mission':       { label: 'Mission',        hook: 'The reason behind everything',             iconName: 'BookOpen',color: 'text-amber-400',   iconBg: 'bg-amber-500/10',   chapter: 2 },
  'discipline':    { label: 'Discipline',     hook: 'Today\'s non-negotiable',                  iconName: 'Sword',   color: 'text-red-400',     iconBg: 'bg-red-500/10',     chapter: 3 },
  'anti-sabotage': { label: 'Anti-Sabotage',  hook: 'Kill the pattern before it kills progress',iconName: 'Shield',  color: 'text-orange-400',  iconBg: 'bg-orange-500/10',  chapter: 4 },
  'social':        { label: 'Social',         hook: 'Your environment is your destiny',         iconName: 'Users',   color: 'text-emerald-400', iconBg: 'bg-emerald-500/10', chapter: 5 },
}

export function getUnlockedSystems(chapter: number): string[] {
  return CHAPTERS
    .filter(c => c.id <= chapter)
    .flatMap(c => c.systems)
}

export function getXpToNextChapter(currentChapter: number, currentXp: number): { needed: number; current: number; pct: number } | null {
  if (currentChapter >= 5) return null
  const needed = CHAPTER_XP_THRESHOLDS[currentChapter] // threshold for next chapter (index = next chapter - 1)
  const prevThreshold = CHAPTER_XP_THRESHOLDS[currentChapter - 1]
  const inChapterXp = currentXp - prevThreshold
  const inChapterNeeded = needed - prevThreshold
  const pct = Math.min(100, Math.round((inChapterXp / inChapterNeeded) * 100))
  return { needed: inChapterNeeded, current: Math.max(0, inChapterXp), pct }
}

export function isReadyToLevelUp(chapter: number, xp: number): boolean {
  if (chapter >= 5) return false
  return xp >= CHAPTER_XP_THRESHOLDS[chapter]
}

/** Map startingPoint onboarding value to initial chapter */
export function startingChapterForPoint(startingPoint: string): number {
  if (startingPoint === 'building') return 2
  if (startingPoint === 'leveling_up') return 3
  return 1
}

// ─── Post-chapter-5 milestone system ───────────────────────────────────────

export interface XpMilestone {
  xp: number
  label: string
  message: string
}

export const XP_MILESTONES: XpMilestone[] = [
  { xp: 600,  label: 'Still Building',  message: 'Most people quit long before now.' },
  { xp: 750,  label: 'In the Zone',     message: 'You\'re consistent. That\'s rare.' },
  { xp: 1000, label: 'Forged',          message: 'A thousand XP. You didn\'t stop.' },
  { xp: 1500, label: 'Elite',           message: 'You\'re not becoming. You are.' },
  { xp: 2000, label: 'Architect',       message: 'Rare air. Keep building.' },
  { xp: 3000, label: 'Unstoppable',     message: 'No ceiling. No stopping.' },
]

export function getCurrentMilestone(xp: number): XpMilestone | null {
  const earned = XP_MILESTONES.filter(m => xp >= m.xp)
  return earned.length > 0 ? earned[earned.length - 1] : null
}

export function getNextMilestone(xp: number): XpMilestone | null {
  return XP_MILESTONES.find(m => xp < m.xp) ?? null
}

// ─── LEVELS — per-user, XP-driven, UNCAPPED (separate from chapters) ──────────
// A user's level rises from `levelXp`: cumulative XP earned by ANY mind activity
// (main sessions AND arsenal training). This is the personal "how much work have
// I put in" number. It is NOT what unlocks content — chapters do that (below).

/** XP to climb from `level` to `level + 1`. Grows so higher levels take more. */
export function xpForLevelStep(level: number): number {
  return 50 + Math.max(0, level - 1) * 25 // L1→2: 50, L2→3: 75, L3→4: 100, …
}

/** Cumulative XP needed to REACH a level (level 1 = 0). */
export function cumulativeXpForLevel(level: number): number {
  let total = 0
  for (let l = 1; l < level; l++) total += xpForLevelStep(l)
  return total
}

export interface LevelProgress {
  level: number
  /** XP earned into the current level. */
  intoLevel: number
  /** XP span of the current level (into + toNext). */
  span: number
  /** 0–100 progress through the current level. */
  pct: number
  /** XP remaining to the next level. */
  xpToNext: number
}

/** Resolve a cumulative `levelXp` into the user's level + progress bar. Uncapped. */
export function getLevelProgress(levelXp: number): LevelProgress {
  const xp = Math.max(0, Math.floor(levelXp || 0))
  let level = 1
  while (xp >= cumulativeXpForLevel(level + 1)) level++
  const base = cumulativeXpForLevel(level)
  const span = xpForLevelStep(level)
  const intoLevel = xp - base
  return {
    level,
    intoLevel,
    span,
    pct: span > 0 ? Math.min(100, Math.round((intoLevel / span) * 100)) : 0,
    xpToNext: Math.max(0, span - intoLevel),
  }
}

// ─── CHAPTERS — gated by MAIN-session COUNT, one main session per 20h ─────────
// Chapters unlock the arsenal systems. They now advance from how many MAIN
// sessions you've completed (10 per chapter), NOT from XP — and you can only do
// one main session every 20 hours, so the arc can't be rushed by volume.

export const SESSIONS_PER_CHAPTER = 10
export const MAX_CHAPTER = CHAPTERS.length // 5
export const MAIN_SESSION_COOLDOWN_MS = 20 * 60 * 60 * 1000 // 20h between main sessions

/** Chapter unlocked by a given completed-main-session count (capped at MAX_CHAPTER). */
export function chapterFromSessions(mainSessionCount: number): number {
  const n = Math.max(0, Math.floor(mainSessionCount || 0))
  return Math.min(MAX_CHAPTER, Math.floor(n / SESSIONS_PER_CHAPTER) + 1)
}

/** Progress of main sessions toward the NEXT chapter. `toNext` is 0 at max chapter. */
export function sessionsIntoChapter(mainSessionCount: number): { done: number; needed: number; toNext: number } {
  const n = Math.max(0, Math.floor(mainSessionCount || 0))
  if (chapterFromSessions(n) >= MAX_CHAPTER) return { done: SESSIONS_PER_CHAPTER, needed: SESSIONS_PER_CHAPTER, toNext: 0 }
  const done = n % SESSIONS_PER_CHAPTER
  return { done, needed: SESSIONS_PER_CHAPTER, toNext: SESSIONS_PER_CHAPTER - done }
}

/** Is a main session available given the last one's timestamp (20h cooldown)? */
export function mainSessionAvailable(lastMainSessionAt: Date | string | number | null | undefined, now = Date.now()): boolean {
  if (!lastMainSessionAt) return true
  const t = new Date(lastMainSessionAt).getTime()
  if (!Number.isFinite(t)) return true
  return now - t >= MAIN_SESSION_COOLDOWN_MS
}
