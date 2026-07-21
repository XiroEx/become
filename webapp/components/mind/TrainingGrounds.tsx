'use client'

// Training Grounds — what replaces the main-session card once you've done your
// daily session (you're in the 20h cooldown). It's the arsenal, minus the
// quick-play launchers: each unlocked segment is a colorful tile that opens its
// full dashboard (its deep tools + adaptive session). Training here grants XP
// (levels you up) but does NOT count toward chapters — those are main-session
// gated. Locked segments are shown greyed so the path ahead is visible.

import Link from 'next/link'
import {
  Wind, Sparkles, Eye, BookOpen, Sword, Shield, Users, Lock, ChevronRight, Dumbbell,
  type LucideIcon,
} from 'lucide-react'
import { SYSTEM_INFO } from '@/lib/mindXP'

const ICONS: Record<string, LucideIcon> = { Wind, Sparkles, Eye, BookOpen, Sword, Shield, Users }

// Per-segment solid tint + accent — MATCHED to each segment dashboard's own
// signature color (state-shift=cyan, self-image=violet, mission=blue,
// vision=emerald, social=pink, discipline=red, anti-sabotage=orange). Tailwind
// needs literal class strings, so these are spelled out rather than derived.
const TILE: Record<string, { bg: string; icon: string; ring: string }> = {
  'state-shift':   { bg: 'bg-cyan-500/10',    icon: 'text-cyan-500 dark:text-cyan-300',       ring: 'border-cyan-500/30' },
  'self-image':    { bg: 'bg-violet-500/10',  icon: 'text-violet-500 dark:text-violet-300',   ring: 'border-violet-500/30' },
  'mission':       { bg: 'bg-blue-500/10',    icon: 'text-blue-500 dark:text-blue-300',       ring: 'border-blue-500/30' },
  'vision':        { bg: 'bg-emerald-500/10', icon: 'text-emerald-500 dark:text-emerald-300', ring: 'border-emerald-500/30' },
  'social':        { bg: 'bg-pink-500/10',    icon: 'text-pink-500 dark:text-pink-300',       ring: 'border-pink-500/30' },
  'discipline':    { bg: 'bg-red-500/10',     icon: 'text-red-500 dark:text-red-300',         ring: 'border-red-500/30' },
  'anti-sabotage': { bg: 'bg-orange-500/10',  icon: 'text-orange-500 dark:text-orange-300',   ring: 'border-orange-500/30' },
}
const FALLBACK = { bg: 'bg-zinc-500/10', icon: 'text-zinc-500', ring: 'border-zinc-500/30' }

export default function TrainingGrounds({
  unlocked, nextInLabel, mainSessionCount = 0,
}: {
  unlocked: string[]
  /** e.g. "in 12h 30m" — when the next main session unlocks. */
  nextInLabel?: string | null
  /** Completed main sessions — lets locked tiles say exactly how far away the
   *  unlocking chapter is (10 main sessions per chapter). */
  mainSessionCount?: number
}) {
  const allIds = Object.keys(SYSTEM_INFO)
  const unlockedIds = allIds.filter((id) => unlocked.includes(id))
  const lockedIds = allIds.filter((id) => !unlocked.includes(id))

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-extrabold text-zinc-900 dark:text-white">
            <Dumbbell className="h-6 w-6 text-violet-500" />
            Training Grounds
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Daily session done. Keep sharpening — every rep levels you up.
          </p>
        </div>
        {nextInLabel && (
          <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            Next {nextInLabel}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {unlockedIds.map((id) => {
          const info = SYSTEM_INFO[id]
          const Icon = ICONS[info.iconName] ?? Sparkles
          const t = TILE[id] ?? FALLBACK
          return (
            <Link
              key={id}
              href={`/dashboard/mind/${id}`}
              className={`group relative overflow-hidden rounded-2xl border ${t.bg} ${t.ring} p-4 transition-transform active:scale-[0.97]`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 dark:bg-black/30">
                <Icon className={`h-5 w-5 ${t.icon}`} />
              </span>
              <p className="mt-3 text-sm font-bold text-zinc-900 dark:text-white">{info.label}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-600 dark:text-zinc-300/80">{info.hook}</p>
              <ChevronRight className="absolute right-3 top-4 h-4 w-4 text-zinc-400 transition-transform group-active:translate-x-0.5" />
            </Link>
          )
        })}
      </div>

      {lockedIds.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {lockedIds.map((id) => {
            const info = SYSTEM_INFO[id]
            // Chapters advance by main sessions (10 per chapter) — tell the user
            // exactly what stands between them and this tool.
            const needed = Math.max(0, (info.chapter - 1) * 10 - mainSessionCount)
            return (
              <div
                key={id}
                className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 opacity-70 dark:border-zinc-800 dark:bg-zinc-900/40"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-200 dark:bg-zinc-800">
                  <Lock className="h-4 w-4 text-zinc-400" />
                </span>
                <p className="mt-3 text-sm font-bold text-zinc-500 dark:text-zinc-400">{info.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">
                  Unlocks in Ch.{info.chapter}{needed > 0 ? ` — ${needed} main session${needed === 1 ? '' : 's'} away` : ''}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
