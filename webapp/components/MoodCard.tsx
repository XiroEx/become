"use client"

import { useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, X } from 'lucide-react'
import { moodGateway } from '@/lib/mind/moodBridge'

export type MoodLevel = 1 | 2 | 3 | 4 | 5 // 1 = bad, 2 = not great, 3 = okay, 4 = pretty good, 5 = great

interface MoodCardProps {
  currentMood: MoodLevel | null
  onMoodChange: (mood: MoodLevel) => void
  isUpdating?: boolean
  /** Last N mood values (1-5) — used to render a tiny trend bar matching
      the streak tile's footer shape so the four stat tiles align. */
  recentMoods?: number[]
}

// Small face icons for the card - 5 mood levels
// 1 = Bad, 2 = Not Great, 3 = Okay, 4 = Pretty Good, 5 = Great

function BadFace({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'
  return (
    <svg viewBox="0 0 48 48" className={sizeClass}>
      <circle cx="24" cy="24" r="22" className="fill-red-400" />
      <circle cx="16" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <circle cx="32" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <path 
        d="M14 35 Q24 26 34 35" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        className="text-zinc-700 dark:text-zinc-800"
      />
    </svg>
  )
}

function NotGreatFace({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'
  return (
    <svg viewBox="0 0 48 48" className={sizeClass}>
      <circle cx="24" cy="24" r="22" className="fill-orange-400" />
      <circle cx="16" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <circle cx="32" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <path 
        d="M16 34 Q24 30 32 34" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        className="text-zinc-700 dark:text-zinc-800"
      />
    </svg>
  )
}

function OkayFace({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'
  return (
    <svg viewBox="0 0 48 48" className={sizeClass}>
      <circle cx="24" cy="24" r="22" className="fill-amber-400" />
      <circle cx="16" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <circle cx="32" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <line 
        x1="16" y1="32" x2="32" y2="32" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        className="text-zinc-700 dark:text-zinc-800"
      />
    </svg>
  )
}

function PrettyGoodFace({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'
  return (
    <svg viewBox="0 0 48 48" className={sizeClass}>
      <circle cx="24" cy="24" r="22" className="fill-lime-400" />
      <circle cx="16" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <circle cx="32" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <path 
        d="M16 31 Q24 36 32 31" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        className="text-zinc-700 dark:text-zinc-800"
      />
    </svg>
  )
}

function GreatFace({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'
  return (
    <svg viewBox="0 0 48 48" className={sizeClass}>
      <circle cx="24" cy="24" r="22" className="fill-emerald-400" />
      <circle cx="16" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <circle cx="32" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <path 
        d="M14 30 Q24 40 34 30" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        className="text-zinc-700 dark:text-zinc-800"
      />
    </svg>
  )
}

function QuestionFace({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'
  return (
    <svg viewBox="0 0 48 48" className={sizeClass}>
      <circle cx="24" cy="24" r="22" className="fill-zinc-300 dark:fill-zinc-600" />
      <text 
        x="24" 
        y="30" 
        textAnchor="middle" 
        className="fill-zinc-600 dark:fill-zinc-400" 
        fontSize="20" 
        fontWeight="bold"
      >
        ?
      </text>
    </svg>
  )
}

const moodConfig = {
  1: {
    Face: BadFace,
    label: 'Bad',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    textColor: 'text-red-700 dark:text-red-300',
  },
  2: {
    Face: NotGreatFace,
    label: 'Not Great',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    textColor: 'text-orange-700 dark:text-orange-300',
  },
  3: {
    Face: OkayFace,
    label: 'Okay',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-700 dark:text-amber-300',
  },
  4: {
    Face: PrettyGoodFace,
    label: 'Pretty Good',
    bgColor: 'bg-lime-100 dark:bg-lime-900/30',
    textColor: 'text-lime-700 dark:text-lime-300',
  },
  5: {
    Face: GreatFace,
    label: 'Great',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    textColor: 'text-emerald-700 dark:text-emerald-300',
  },
}

const moodOptions: { level: MoodLevel; Face: typeof BadFace; label: string }[] = [
  { level: 1, Face: BadFace, label: 'Bad' },
  { level: 2, Face: NotGreatFace, label: 'Not Great' },
  { level: 3, Face: OkayFace, label: 'Okay' },
  { level: 4, Face: PrettyGoodFace, label: 'Pretty Good' },
  { level: 5, Face: GreatFace, label: 'Great' },
]

export default function MoodCard({ currentMood, onMoodChange, isUpdating = false, recentMoods }: MoodCardProps) {
  // The picker used to be an absolutely-positioned dropdown INSIDE the tile.
  // The dashboard grid clips every cell (fixed row height + overflow-hidden),
  // so tapping the tile toggled a menu nobody could see — "the mood tab doesn't
  // work". It is a bottom sheet in a portal now, and after a pick it hands the
  // member to Mindset instead of just closing.
  const [isOpen, setIsOpen] = useState(false)
  const [picked, setPicked] = useState<MoodLevel | null>(null)
  // Portal target only exists in the browser; the sheet is closed on the
  // server anyway, so nothing renders until the member taps.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)

  const open = () => { setPicked(null); setIsOpen(true) }
  const close = () => { setIsOpen(false); setPicked(null) }

  const handleMoodSelect = (mood: MoodLevel) => {
    onMoodChange(mood)
    setPicked(mood)
  }

  const config = currentMood ? moodConfig[currentMood] : null

  // Trend footer — renders a thin bar at avg mood (1-5 → 0-100%) so the
  // mood tile matches the streak tile's footer height, keeping the 2x2
  // stat grid visually balanced. Always renders (empty bar + placeholder
  // label when no data) so all four tiles align.
  const moodTrend = (() => {
    const last = (recentMoods ?? []).slice(-7)
    if (last.length === 0) {
      return { pct: 0, barColor: 'bg-zinc-300 dark:bg-zinc-700', label: 'No entries yet' }
    }
    const avg = last.reduce((s, v) => s + v, 0) / last.length
    const pct = Math.round((avg / 5) * 100)
    const barColor =
      avg >= 4.5 ? 'bg-emerald-500'
      : avg >= 3.5 ? 'bg-lime-500'
      : avg >= 2.5 ? 'bg-amber-500'
      : avg >= 1.5 ? 'bg-orange-500'
      : 'bg-red-500'
    return { pct, barColor, label: `Last ${last.length} ${last.length === 1 ? 'day' : 'days'}` }
  })()

  const gateway = picked ? moodGateway(picked) : null
  const pickedConfig = picked ? moodConfig[picked] : null

  const sheet = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="mood-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[70] bg-black/40"
            onClick={close}
            aria-hidden="true"
          />
          <motion.div
            key="mood-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="How are you feeling?"
            data-testid="mood-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 36 }}
            className="fixed inset-x-0 bottom-0 z-[71] mx-auto max-w-lg rounded-t-2xl border border-zinc-200 bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                {picked ? 'Logged' : 'How are you feeling?'}
              </p>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!picked ? (
              <div className="grid grid-cols-5 gap-2">
                {moodOptions.map((option) => (
                  <button
                    key={option.level}
                    type="button"
                    onClick={() => handleMoodSelect(option.level)}
                    data-testid={`mood-option-${option.level}`}
                    className={`flex flex-col items-center gap-1.5 rounded-xl p-2 transition-all hover:bg-zinc-100 active:scale-95 dark:hover:bg-zinc-800 ${
                      currentMood === option.level
                        ? 'bg-zinc-100 ring-2 ring-zinc-300 dark:bg-zinc-800 dark:ring-zinc-600'
                        : ''
                    }`}
                  >
                    <option.Face size="lg" />
                    <span className="text-center text-[10px] font-medium leading-tight text-zinc-600 dark:text-zinc-300 sm:text-xs">
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              // ── The gateway: mood → Mindset ──
              <div data-testid="mood-gateway">
                <div className="flex items-center gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${pickedConfig?.bgColor ?? ''}`}>
                    {pickedConfig ? <pickedConfig.Face size="lg" /> : null}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-zinc-900 dark:text-white">{gateway?.headline}</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">{gateway?.body}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                  <Link
                    href="/dashboard/mind"
                    onClick={close}
                    className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  >
                    {gateway?.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-xl border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Done
                  </button>
                </div>
                <p className="mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
                  Your Mind session opens from how you feel today.
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return (
    <div className="relative h-full">
      {/* Main Card - tap to open the picker. Matches StatTile shape (h-9 icon
          badge, xs label, 2xl extrabold value) so the four dashboard stat
          tiles share one visual language. h-full so it fills the fixed-height
          dashboard grid cell and matches the other tiles exactly. */}
      <button
        type="button"
        onClick={open}
        disabled={isUpdating}
        data-testid="mood-tile"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={`h-full w-full flex flex-col gap-1.5 rounded-xl border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 ${
          isUpdating ? 'opacity-60 cursor-wait' : 'cursor-pointer'
        }`}
      >
        <div className="flex w-full items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            config ? config.bgColor : 'bg-zinc-100 dark:bg-zinc-800'
          }`}>
            {isUpdating ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
            ) : config ? (
              <config.Face size="sm" />
            ) : (
              <QuestionFace size="sm" />
            )}
          </span>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Today&apos;s Mood</p>
            <p className={`text-2xl font-extrabold leading-none tracking-tight ${
              config ? config.textColor : 'text-zinc-900 dark:text-white'
            }`}>
              {config ? config.label : 'Set'}
            </p>
          </div>
          <svg
            className="h-4 w-4 shrink-0 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        <div className="w-full">
          <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full ${moodTrend.barColor} transition-all duration-500`}
              style={{ width: `${moodTrend.pct}%` }}
            />
          </div>
          <p className="mt-0.5 text-left text-[10px] text-zinc-400 dark:text-zinc-600">{moodTrend.label}</p>
        </div>
      </button>

      {/* The sheet lives on document.body so no ancestor can clip it. */}
      {mounted ? createPortal(sheet, document.body) : null}
    </div>
  )
}
