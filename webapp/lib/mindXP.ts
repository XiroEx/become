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
