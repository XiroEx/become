"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import PageTransition from '@/components/PageTransition'
import WeightPrompt from '@/components/WeightPrompt'

export default function DashboardPage() {
  const [showWeightPrompt, setShowWeightPrompt] = useState(false)
  const [isMandatory, setIsMandatory] = useState(false)
  const [reminderLevel, setReminderLevel] = useState(0)
  const [consecutiveSkips, setConsecutiveSkips] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    checkWeightPromptStatus()
  }, [])

  async function checkWeightPromptStatus() {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setIsLoading(false)
        return
      }

      const response = await fetch('/api/weight/prompt-status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.shouldPrompt) {
          setShowWeightPrompt(true)
          setIsMandatory(data.isMandatory)
          setReminderLevel(data.reminderLevel)
          setConsecutiveSkips(data.consecutiveSkips)
        }
      }
    } catch (err) {
      console.error('Error checking weight prompt status:', err)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleWeightSubmit(weight: number) {
    try {
      setError(null)
      const token = localStorage.getItem('token')
      const response = await fetch('/api/weight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ weight })
      })

      if (response.ok) {
        setShowWeightPrompt(false)
      } else {
        setError('Failed to save weight. Please try again.')
      }
    } catch (err) {
      console.error('Error submitting weight:', err)
      setError('Failed to save weight. Please try again.')
    }
  }

  async function handleWeightSkip() {
    try {
      setError(null)
      const token = localStorage.getItem('token')
      const response = await fetch('/api/weight/skip', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        setShowWeightPrompt(false)
      } else {
        setError('Failed to skip. Please try again.')
      }
    } catch (err) {
      console.error('Error skipping weight:', err)
      setError('Failed to skip. Please try again.')
    }
  }

  return (
    <>
      <PageTransition className="space-y-6">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Dashboard</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Welcome back to your fitness journey.</p>
        </header>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 dark:bg-red-900/20 dark:border-red-800">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Link 
            href="/dashboard/programming" 
            className="block p-6 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-shadow"
          >
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">Current Program</h2>
            <p className="text-zinc-500 dark:text-zinc-400">View your active workout plan and today's exercises.</p>
          </Link>

          <Link 
            href="/dashboard/nutrition" 
            className="block p-6 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-shadow"
          >
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">Nutrition</h2>
            <p className="text-zinc-500 dark:text-zinc-400">Track your meals and monitor your macros.</p>
          </Link>

          <Link 
            href="/dashboard/progress" 
            className="block p-6 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-shadow"
          >
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">Progress Tracking</h2>
            <p className="text-zinc-500 dark:text-zinc-400">Check your stats, weight history, and achievements.</p>
          </Link>

          <Link 
            href="/dashboard/chat" 
            className="block p-6 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-shadow"
          >
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">AI Coach</h2>
            <p className="text-zinc-500 dark:text-zinc-400">Chat with your personal AI fitness assistant.</p>
          </Link>
        </div>
      </PageTransition>

      {!isLoading && showWeightPrompt && (
        <WeightPrompt
          onSubmit={handleWeightSubmit}
          onSkip={handleWeightSkip}
          isMandatory={isMandatory}
          reminderLevel={reminderLevel}
          consecutiveSkips={consecutiveSkips}
        />
      )}
    </>
  )
}
