"use client"

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export type MoodLevel = 1 | 2 | 3 // 1 = sad, 2 = neutral, 3 = happy

interface MoodModalProps {
  isOpen: boolean
  onClose: (mood: MoodLevel) => void
}

// Solid color face components
function SadFace({ selected }: { selected: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-12 sm:h-12">
      <circle 
        cx="24" cy="24" r="22" 
        className={`transition-colors ${selected ? 'fill-orange-400' : 'fill-zinc-300 dark:fill-zinc-600'}`}
      />
      <circle cx="16" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <circle cx="32" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <path 
        d="M16 34 Q24 28 32 34" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        className="text-zinc-700 dark:text-zinc-800"
      />
    </svg>
  )
}

function NeutralFace({ selected }: { selected: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-12 sm:h-12">
      <circle 
        cx="24" cy="24" r="22" 
        className={`transition-colors ${selected ? 'fill-amber-400' : 'fill-zinc-300 dark:fill-zinc-600'}`}
      />
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

function HappyFace({ selected }: { selected: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-12 sm:h-12">
      <circle 
        cx="24" cy="24" r="22" 
        className={`transition-colors ${selected ? 'fill-emerald-400' : 'fill-zinc-300 dark:fill-zinc-600'}`}
      />
      <circle cx="16" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <circle cx="32" cy="20" r="3" className="fill-zinc-700 dark:fill-zinc-800" />
      <path 
        d="M16 30 Q24 38 32 30" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        className="text-zinc-700 dark:text-zinc-800"
      />
    </svg>
  )
}

// Time-based greeting configuration
function getTimeBasedGreeting() {
  const hour = new Date().getHours()
  
  if (hour >= 5 && hour < 12) {
    return {
      greeting: 'Good morning!',
      icon: (
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-linear-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="currentColor">
            <circle cx="12" cy="12" r="5" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" 
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
      )
    }
  } else if (hour >= 12 && hour < 17) {
    return {
      greeting: 'Good afternoon!',
      icon: (
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-linear-to-br from-sky-400 to-blue-500 flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="currentColor">
            <circle cx="12" cy="12" r="6" />
          </svg>
        </div>
      )
    }
  } else if (hour >= 17 && hour < 21) {
    return {
      greeting: 'Good evening!',
      icon: (
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-linear-to-br from-orange-400 to-rose-500 flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="currentColor">
            <circle cx="12" cy="14" r="5" />
            <path d="M2 14h3M19 14h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
      )
    }
  } else {
    return {
      greeting: 'Good night!',
      icon: (
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="currentColor">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        </div>
      )
    }
  }
}

const moodOptions = [
  { 
    level: 1 as MoodLevel, 
    Face: SadFace, 
    label: 'Not great',
    color: 'from-orange-400 to-orange-500',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    borderColor: 'border-orange-300 dark:border-orange-800',
    hoverColor: 'hover:border-orange-400 dark:hover:border-orange-600'
  },
  { 
    level: 2 as MoodLevel, 
    Face: NeutralFace, 
    label: 'Okay',
    color: 'from-amber-400 to-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-300 dark:border-amber-800',
    hoverColor: 'hover:border-amber-400 dark:hover:border-amber-600'
  },
  { 
    level: 3 as MoodLevel, 
    Face: HappyFace, 
    label: 'Great!',
    color: 'from-emerald-400 to-emerald-500',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-300 dark:border-emerald-800',
    hoverColor: 'hover:border-emerald-400 dark:hover:border-emerald-600'
  }
]

export default function MoodModal({ isOpen, onClose }: MoodModalProps) {
  const [selectedMood, setSelectedMood] = useState<MoodLevel | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const timeGreeting = useMemo(() => getTimeBasedGreeting(), [])

  const handleSubmit = async () => {
    if (!selectedMood) return
    
    setIsSubmitting(true)
    
    try {
      const token = localStorage.getItem('token')
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      await fetch('/api/mood', {
        method: 'POST',
        headers,
        body: JSON.stringify({ mood: selectedMood })
      })
    } catch (error) {
      console.error('Failed to save mood:', error)
    } finally {
      setIsSubmitting(false)
      onClose(selectedMood)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 sm:p-8"
          >
            {/* Header */}
            <div className="text-center mb-6 sm:mb-8">
              <div className="mb-4 flex justify-center">{timeGreeting.icon}</div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white sm:text-2xl">
                {timeGreeting.greeting}
              </h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                How are you feeling today?
              </p>
            </div>

            {/* Mood Options */}
            <div className="grid grid-cols-3 gap-3 mb-6 sm:mb-8">
              {moodOptions.map((option) => (
                <button
                  key={option.level}
                  onClick={() => setSelectedMood(option.level)}
                  className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all duration-200 sm:p-5 ${
                    selectedMood === option.level
                      ? `${option.bgColor} ${option.borderColor} scale-105 shadow-lg`
                      : `border-zinc-200 dark:border-zinc-700 ${option.hoverColor}`
                  }`}
                >
                  <option.Face selected={selectedMood === option.level} />
                  <span className={`text-xs font-medium sm:text-sm ${
                    selectedMood === option.level
                      ? 'text-zinc-900 dark:text-white'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}>
                    {option.label}
                  </span>
                  
                  {selectedMood === option.level && (
                    <motion.div
                      layoutId="moodSelection"
                      className={`absolute -bottom-1 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-linear-to-r ${option.color}`}
                      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={!selectedMood || isSubmitting}
              className={`w-full rounded-xl py-3 font-semibold text-white transition-all sm:py-4 ${
                selectedMood
                  ? 'bg-zinc-900 hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200'
                  : 'bg-zinc-300 cursor-not-allowed dark:bg-zinc-700'
              }`}
            >
              {isSubmitting ? 'Saving...' : "Let's go!"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
