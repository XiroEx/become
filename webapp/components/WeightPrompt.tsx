"use client"
import React, { useState } from 'react'
import { REMINDER_THRESHOLDS } from '@/lib/constants'

interface WeightPromptProps {
  onSubmit: (weight: number) => void
  onSkip: () => void
  isMandatory: boolean
  reminderLevel: number
  consecutiveSkips: number
}

export default function WeightPrompt({ onSubmit, onSkip, isMandatory, reminderLevel, consecutiveSkips }: WeightPromptProps) {
  const [weight, setWeight] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const getReminderMessage = () => {
    if (reminderLevel === 4 || isMandatory) {
      return `⚠️ It's been ${REMINDER_THRESHOLDS.MANDATORY} days since your last weight entry. Please record your weight to continue.`
    } else if (reminderLevel === 3) {
      return `📊 You've skipped ${consecutiveSkips} days. Regular tracking helps you reach your goals!`
    } else if (reminderLevel === 2) {
      return `💪 It's been ${consecutiveSkips} days! Let's get back on track with your progress.`
    } else if (reminderLevel === 1) {
      return "👋 Quick reminder to track your weight when you get a chance."
    }
    return "Track your weight to monitor your progress."
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const weightNum = parseFloat(weight)
    if (weightNum && weightNum > 0) {
      setIsSubmitting(true)
      await onSubmit(weightNum)
      setIsSubmitting(false)
    }
  }

  const handleSkip = async () => {
    setIsSubmitting(true)
    await onSkip()
    setIsSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
            {isMandatory ? '⚖️ Weight Check-In' : '📊 Daily Weight'}
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {getReminderMessage()}
          </p>
          {consecutiveSkips > 0 && !isMandatory && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              Skipped {consecutiveSkips} {consecutiveSkips === 1 ? 'day' : 'days'}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="weight" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Weight (lbs)
            </label>
            <input
              id="weight"
              type="number"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="Enter your weight"
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
              required
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSubmitting || !weight}
              className="flex-1 rounded-lg bg-zinc-900 px-4 py-3 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              {isSubmitting ? 'Saving...' : 'Submit'}
            </button>
            
            {!isMandatory && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={isSubmitting}
                className="rounded-lg border border-zinc-300 px-4 py-3 font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Skip
              </button>
            )}
          </div>
        </form>

        {isMandatory && (
          <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Required after {REMINDER_THRESHOLDS.MANDATORY}+ days without tracking
          </p>
        )}
      </div>
    </div>
  )
}
