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

// Per-segment gradient + accent for the colorful tiles (Tailwind needs literal
// class strings, so these are spelled out rather than derived).
const TILE: Record<string, { grad: string; icon: string; ring: string }> = {
  'state-shift':   { grad: 'from-blue-500/25 to-cyan-500/10',      icon: 'text-blue-500 dark:text-blue-300',     ring: 'border-blue-500/30' },
  'vision':        { grad: 'from-amber-500/25 to-yellow-500/10',   icon: 'text-amber-500 dark:text-amber-300',   ring: 'border-amber-500/30' },
  'self-image':    { grad: 'from-violet-500/25 to-fuchsia-500/10', icon: 'text-violet-500 dark:text-violet-300', ring: 'border-violet-500/30' },
  'mission':       { grad: 'from-orange-500/25 to-amber-500/10',   icon: 'text-orange-500 dark:text-orange-300', ring: 'border-orange-500/30' },
  'discipline':    { grad: 'from-red-500/25 to-rose-500/10',       icon: 'text-red-500 dark:text-red-300',       ring: 'border-red-500/30' },
  'anti-sabotage': { grad: 'from-orange-500/25 to-red-500/10',     icon: 'text-orange-500 dark:text-orange-300', ring: 'border-orange-500/30' },
  'social':        { grad: 'from-emerald-500/25 to-teal-500/10',   icon: 'text-emerald-500 dark:text-emerald-300', ring: 'border-emerald-500/30' },
}
const FALLBACK = { grad: 'from-zinc-500/20 to-zinc-500/5', icon: 'text-zinc-500', ring: 'border-zinc-500/30' }

export default function TrainingGrounds({
  unlocked, nextInLabel,
}: {
  unlocked: string[]
  /** e.g. "in 12h 30m" — when the next main session unlocks. */
  nextInLabel?: string | null
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
              className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${t.grad} ${t.ring} p-4 transition-transform active:scale-[0.97]`}
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
            return (
              <div
                key={id}
                className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 opacity-70 dark:border-zinc-800 dark:bg-zinc-900/40"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-200 dark:bg-zinc-800">
                  <Lock className="h-4 w-4 text-zinc-400" />
                </span>
                <p className="mt-3 text-sm font-bold text-zinc-500 dark:text-zinc-400">{info.label}</p>
                <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">Chapter {info.chapter}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
