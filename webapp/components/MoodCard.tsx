"use client"

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export type MoodLevel = 1 | 2 | 3 | 4 | 5 // 1 = bad, 2 = not great, 3 = okay, 4 = pretty good, 5 = great

interface MoodCardProps {
  currentMood: MoodLevel | null
  onMoodChange: (mood: MoodLevel) => void
  isUpdating?: boolean
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

export default function MoodCard({ currentMood, onMoodChange, isUpdating = false }: MoodCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const handleMoodSelect = (mood: MoodLevel) => {
    onMoodChange(mood)
    setIsExpanded(false)
  }

  const config = currentMood ? moodConfig[currentMood] : null

  return (
    <div className="relative">
      {/* Main Card - clickable to expand */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={isUpdating}
        className={`w-full flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:gap-3 sm:p-4 transition-all hover:border-zinc-300 dark:hover:border-zinc-700 ${
          isUpdating ? 'opacity-60 cursor-wait' : 'cursor-pointer'
        }`}
      >
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg sm:h-10 sm:w-10 ${
          config ? config.bgColor : 'bg-zinc-100 dark:bg-zinc-800'
        }`}>
          {isUpdating ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          ) : config ? (
            <config.Face size="sm" />
          ) : (
            <QuestionFace size="sm" />
          )}
        </div>
        <div className="flex-1 text-left">
          <p className={`text-lg font-bold sm:text-xl ${
            config ? config.textColor : 'text-zinc-500 dark:text-zinc-400'
          }`}>
            {config ? config.label : 'Set'}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Today&apos;s Mood</p>
        </div>
        <svg 
          className={`h-4 w-4 text-zinc-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded mood selector */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute -left-12 right-0 top-full z-20 mt-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
          >
            <p className="mb-3 px-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              How are you feeling?
            </p>
            <div className="grid grid-cols-5 gap-3">
              {moodOptions.map((option) => (
                <button
                  key={option.level}
                  onClick={() => handleMoodSelect(option.level)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg p-2 sm:p-3 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                    currentMood === option.level 
                      ? 'bg-zinc-100 dark:bg-zinc-700 ring-2 ring-zinc-300 dark:ring-zinc-600' 
                      : ''
                  }`}
                >
                  <option.Face size="lg" />
                  <span className="text-[10px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-300 text-center leading-tight">
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backdrop to close when clicking outside */}
      {isExpanded && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => setIsExpanded(false)}
        />
      )}
    </div>
  )
}
