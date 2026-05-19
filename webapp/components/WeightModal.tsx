"use client"

import { useState, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface WeightModalProps {
  isOpen: boolean
  onClose: (weight?: number) => void
  isMandatory?: boolean
  consecutiveSkips?: number
}

function getTimeBasedGreeting() {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Good morning!'
  if (hour >= 12 && hour < 17) return 'Good afternoon!'
  if (hour >= 17 && hour < 21) return 'Good evening!'
  return 'Good night!'
}

export default function WeightModal({ isOpen, onClose, isMandatory = false, consecutiveSkips = 0 }: WeightModalProps) {
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)

  const greeting = useMemo(() => getTimeBasedGreeting(), [])

  const getReminderMessage = () => {
    if (isMandatory) return "It's been 2 weeks! Time to check in with your progress."
    if (consecutiveSkips >= 12) return "Almost 2 weeks! Stay consistent with tracking."
    if (consecutiveSkips >= 7) return "It's been a week! Let's keep track of your journey."
    if (consecutiveSkips >= 3) return "It's been 3 days since your last check-in. Track your progress?"
    return "Track your body composition to monitor your progress."
  }

  const handleSubmit = async () => {
    if (!weight || parseFloat(weight) <= 0) return
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)

    try {
      const token = localStorage.getItem('token')
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const bf = bodyFat ? parseFloat(bodyFat) : undefined
      await fetch('/api/weight', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          weight: parseFloat(weight),
          ...(bf !== undefined && bf > 0 && bf < 100 ? { bodyFat: bf } : {}),
          tz: new Date().getTimezoneOffset(),
        }),
      })
      onClose(parseFloat(weight))
    } catch (error) {
      console.error('Failed to save weight:', error)
      onClose(parseFloat(weight))
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  const handleSkip = async () => {
    if (isMandatory) return
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)

    try {
      const token = localStorage.getItem('token')
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      await fetch('/api/weight', {
        method: 'POST',
        headers,
        body: JSON.stringify({ skip: true, tz: new Date().getTimezoneOffset() }),
      })
      onClose()
    } catch (error) {
      console.error('Failed to skip weight:', error)
      onClose()
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
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
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900 sm:p-6"
          >
            {/* Header */}
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 shadow-lg">
                <svg viewBox="0 0 24 24" className="h-7 w-7 text-white" fill="currentColor">
                  <path d="M7 10l5-5 5 5H7z"/>
                  <path d="M7 14l5 5 5-5H7z"/>
                </svg>
              </div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white sm:text-2xl">{greeting}</h2>
              <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">{getReminderMessage()}</p>
              {isMandatory && (
                <p className="mt-1.5 text-xs font-medium text-orange-600 dark:text-orange-400">
                  Required after 2 weeks
                </p>
              )}
            </div>

            {/* Inputs */}
            <div className="mb-5 space-y-3">
              <div>
                <label htmlFor="weight" className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Weight (lbs)
                </label>
                <input
                  id="weight"
                  type="number"
                  step="0.1"
                  min="0"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="e.g., 185.5"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-center text-lg font-semibold text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 dark:focus:border-blue-400"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="bodyFat" className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Body Fat <span className="font-normal text-zinc-400 dark:text-zinc-500">% — optional</span>
                </label>
                <input
                  id="bodyFat"
                  type="number"
                  step="0.1"
                  min="1"
                  max="99"
                  value={bodyFat}
                  onChange={(e) => setBodyFat(e.target.value)}
                  placeholder="e.g., 18.5"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-center text-lg font-semibold text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 dark:focus:border-blue-400"
                />
                <p className="mt-1 text-center text-xs text-zinc-400 dark:text-zinc-500">
                  Use a scale, calipers, or a measurement app
                </p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleSubmit}
                disabled={!weight || parseFloat(weight) <= 0 || isSubmitting}
                className={`w-full rounded-xl py-3 font-semibold text-white transition-all sm:py-4 ${
                  weight && parseFloat(weight) > 0
                    ? 'bg-zinc-900 hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200'
                    : 'cursor-not-allowed bg-zinc-300 dark:bg-zinc-700'
                }`}
              >
                {isSubmitting ? 'Saving...' : 'Log Weight'}
              </button>
              {!isMandatory && (
                <button
                  onClick={handleSkip}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-zinc-200 py-3 font-semibold text-zinc-700 transition-all hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:py-4"
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
