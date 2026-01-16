"use client"

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface WeightModalProps {
  isOpen: boolean
  onClose: (weight?: number) => void
  isMandatory?: boolean
  consecutiveSkips?: number
}

// Time-based greeting configuration
function getTimeBasedGreeting() {
  const hour = new Date().getHours()
  
  if (hour >= 5 && hour < 12) {
    return {
      greeting: 'Good morning!',
      icon: (
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round"/>
            <circle cx="12" cy="12" r="5" fill="currentColor" />
          </svg>
        </div>
      )
    }
  } else if (hour >= 12 && hour < 17) {
    return {
      greeting: 'Good afternoon!',
      icon: (
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 13h2a3 3 0 003-3V7a3 3 0 00-3-3H3M3 17h2a3 3 0 003-3v-1M13 8V5l3 3-3 3M17 8h4" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="10" y="8" width="11" height="9" rx="1" fill="currentColor" opacity="0.5"/>
          </svg>
        </div>
      )
    }
  } else if (hour >= 17 && hour < 21) {
    return {
      greeting: 'Good evening!',
      icon: (
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center shadow-lg">
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
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="currentColor">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        </div>
      )
    }
  }
}

export default function WeightModal({ isOpen, onClose, isMandatory = false, consecutiveSkips = 0 }: WeightModalProps) {
  const [weight, setWeight] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const timeGreeting = useMemo(() => getTimeBasedGreeting(), [])

  const handleSubmit = async () => {
    if (!weight || parseFloat(weight) <= 0) return
    
    setIsSubmitting(true)
    
    try {
      const token = localStorage.getItem('token')
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      await fetch('/api/weight', {
        method: 'POST',
        headers,
        body: JSON.stringify({ weight: parseFloat(weight) })
      })

      onClose(parseFloat(weight))
    } catch (error) {
      console.error('Failed to save weight:', error)
      onClose(parseFloat(weight))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkip = async () => {
    if (isMandatory) return // Can't skip if mandatory
    
    setIsSubmitting(true)
    
    try {
      const token = localStorage.getItem('token')
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      await fetch('/api/weight', {
        method: 'POST',
        headers,
        body: JSON.stringify({ skip: true })
      })

      onClose()
    } catch (error) {
      console.error('Failed to skip weight:', error)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const getReminderMessage = () => {
    if (isMandatory) {
      return "It's been 2 weeks! Time to check in with your progress. 💪"
    }
    if (consecutiveSkips === 3) {
      return "It's been 3 days since your last check-in. Track your progress? 📊"
    }
    if (consecutiveSkips === 7) {
      return "It's been a week! Let's keep track of your journey. 🎯"
    }
    if (consecutiveSkips === 12) {
      return "Almost 2 weeks! Stay consistent with tracking. 🚀"
    }
    return "Track your weight to monitor your progress."
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
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 sm:p-8"
          >
            {/* Header */}
            <div className="text-center mb-6 sm:mb-8">
              <div className="mb-4 flex justify-center">{timeGreeting.icon}</div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white sm:text-2xl">
                {timeGreeting.greeting}
              </h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                {getReminderMessage()}
              </p>
              {isMandatory && (
                <p className="mt-2 text-xs text-orange-600 dark:text-orange-400 font-medium">
                  * Required after 2 weeks
                </p>
              )}
            </div>

            {/* Weight Input */}
            <div className="mb-6 sm:mb-8">
              <label htmlFor="weight" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Current Weight (lbs)
              </label>
              <input
                id="weight"
                type="number"
                step="0.1"
                min="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="e.g., 185.5"
                className="w-full rounded-xl border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3 text-center text-lg font-semibold text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                autoFocus
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleSubmit}
                disabled={!weight || parseFloat(weight) <= 0 || isSubmitting}
                className={`w-full rounded-xl py-3 font-semibold text-white transition-all sm:py-4 ${
                  weight && parseFloat(weight) > 0
                    ? 'bg-zinc-900 hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200'
                    : 'bg-zinc-300 cursor-not-allowed dark:bg-zinc-700'
                }`}
              >
                {isSubmitting ? 'Saving...' : 'Log Weight'}
              </button>
              
              {!isMandatory && (
                <button
                  onClick={handleSkip}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border-2 border-zinc-200 dark:border-zinc-700 py-3 font-semibold text-zinc-700 dark:text-zinc-300 transition-all hover:bg-zinc-50 dark:hover:bg-zinc-800 sm:py-4"
                >
                  Skip for Today
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
