"use client"

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface WeightModalProps {
  isOpen: boolean
  onClose: (weight?: number) => void
  isMandatory?: boolean
  consecutiveSkips?: number
}

// Icon options for selection - DEBUG MODE
const iconOptions = [
  {
    id: 1,
    name: "Up/Down Arrows Simple",
    icon: (
      <svg viewBox="0 0 24 24" className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="currentColor">
        <path d="M7 10l5-5 5 5H7z"/>
        <path d="M7 14l5 5 5-5H7z"/>
      </svg>
    )
  },
  {
    id: 2,
    name: "Expand Arrows",
    icon: (
      <svg viewBox="0 0 24 24" className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v5M9 5l3-3 3 3"/>
        <path d="M12 21v-5M9 19l3 3 3-3"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    )
  },
  {
    id: 3,
    name: "Arrows Rounded",
    icon: (
      <svg viewBox="0 0 24 24" className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="currentColor">
        <path d="M12 4a1 1 0 01.7.3l4 4a1 1 0 01-1.4 1.4L12 6.4 8.7 9.7a1 1 0 01-1.4-1.4l4-4A1 1 0 0112 4z"/>
        <path d="M12 20a1 1 0 01-.7-.3l-4-4a1 1 0 011.4-1.4l3.3 3.3 3.3-3.3a1 1 0 011.4 1.4l-4 4a1 1 0 01-.7.3z"/>
      </svg>
    )
  },
]

// Time-based greeting configuration
function getTimeBasedGreeting() {
  const hour = new Date().getHours()
  
  if (hour >= 5 && hour < 12) {
    return { greeting: 'Good morning!' }
  } else if (hour >= 12 && hour < 17) {
    return { greeting: 'Good afternoon!' }
  } else if (hour >= 17 && hour < 21) {
    return { greeting: 'Good evening!' }
  } else {
    return { greeting: 'Good night!' }
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
            {/* Header - DEBUG: Show all icon options */}
            <div className="text-center mb-6 sm:mb-8">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">
                Pick an icon:
              </h2>
              <div className="grid grid-cols-4 gap-3 mb-6">
                {iconOptions.map((opt) => (
                  <div key={opt.id} className="flex flex-col items-center gap-1">
                    <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shadow-lg">
                      {opt.icon}
                    </div>
                    <span className="text-xs text-zinc-500">{opt.id}</span>
                  </div>
                ))}
              </div>
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
