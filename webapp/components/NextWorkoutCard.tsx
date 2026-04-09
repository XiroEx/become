"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronRight, Dumbbell } from 'lucide-react'

interface ScheduledWorkout {
  date: string
  programId: string
  dayLabel: string
  workoutTitle: string
  status: string
}

interface ScheduleData {
  programId: string
  programName: string
  scheduledWorkouts: ScheduledWorkout[]
}

export default function NextWorkoutCard() {
  const [nextWorkout, setNextWorkout] = useState<(ScheduledWorkout & { programName: string }) | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchNext() {
      try {
        const token = localStorage.getItem('token')
        if (!token) return

        const res = await fetch('/api/schedule?view=upcoming', {
          headers: { 'Authorization': `Bearer ${token}` },
        })

        if (res.ok) {
          const data = await res.json()
          const schedules: ScheduleData[] = data.schedules || []

          // Find first upcoming scheduled workout across all programs
          // Use YYYY-MM-DD string keys to avoid timezone shift issues
          const now = new Date()
          const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

          let earliest: (ScheduledWorkout & { programName: string }) | null = null
          let earliestKey = ''
          for (const schedule of schedules) {
            // Only show upcoming workouts for actively in-progress programs
            if (schedule.programStatus !== 'in-progress' && schedule.programStatus !== 'active') continue
            for (const w of schedule.scheduledWorkouts) {
              if (w.status !== 'scheduled') continue
              // Extract UTC date portion from ISO string
              const wKey = typeof w.date === 'string' ? w.date.split('T')[0] : new Date(w.date).toISOString().split('T')[0]
              if (wKey < todayKey) continue
              if (!earliest || wKey < earliestKey) {
                earliest = { ...w, programName: schedule.programName }
                earliestKey = wKey
              }
            }
          }
          setNextWorkout(earliest)
        }
      } catch (error) {
        console.error('Failed to fetch schedule:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchNext()
  }, [])

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="animate-pulse flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-28 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-3 w-40 rounded bg-zinc-100 dark:bg-zinc-800/60" />
          </div>
        </div>
      </div>
    )
  }

  if (!nextWorkout) return null

  const workoutDateStr = typeof nextWorkout.date === 'string' ? nextWorkout.date.split('T')[0] : new Date(nextWorkout.date).toISOString().split('T')[0]
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

  const dateLabel =
    workoutDateStr === todayStr ? 'Today' :
    workoutDateStr === tomorrowStr ? 'Tomorrow' :
    new Date(workoutDateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">Up Next</span>
        </div>
        <Link
          href="/dashboard/calendar"
          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          Calendar
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <Link
        href={`/dashboard/programming/${nextWorkout.programId}/workout?day=${encodeURIComponent(nextWorkout.dayLabel)}`}
        className="flex items-center gap-3 rounded-lg bg-blue-50 p-3 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
          <Dumbbell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">
            {dateLabel}: {nextWorkout.dayLabel}
          </p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {nextWorkout.workoutTitle} · {nextWorkout.programName}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-blue-400" />
      </Link>
    </div>
  )
}
