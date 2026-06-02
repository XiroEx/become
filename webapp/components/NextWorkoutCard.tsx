"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronRight, Dumbbell, AlertCircle, SkipForward } from 'lucide-react'
import { Card } from '@/components/ui'

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
  programStatus: string
  scheduledWorkouts: ScheduledWorkout[]
}

export default function NextWorkoutCard() {
  const [nextWorkout, setNextWorkout] = useState<(ScheduledWorkout & { programName: string }) | null>(null)
  const [missedWorkouts, setMissedWorkouts] = useState<(ScheduledWorkout & { programName: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [skipping, setSkipping] = useState<string | null>(null) // date key being skipped

  async function fetchSchedules() {
    try {
      const token = localStorage.getItem('token')
      if (!token) return

      // Fetch a window: past 14 days + next 14 days to catch missed + upcoming
      const now = new Date()
      const from = new Date(now)
      from.setDate(from.getDate() - 14)
      const to = new Date(now)
      to.setDate(to.getDate() + 14)

      const tz = new Date().getTimezoneOffset()
      const res = await fetch(
        `/api/schedule?from=${from.toISOString()}&to=${to.toISOString()}&tz=${tz}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )

      if (!res.ok) return
      const data = await res.json()
      const schedules: ScheduleData[] = data.schedules || []

      const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

      let earliest: (ScheduledWorkout & { programName: string }) | null = null
      let earliestKey = ''
      const missed: (ScheduledWorkout & { programName: string })[] = []

      for (const schedule of schedules) {
        if (schedule.programStatus !== 'in-progress' && schedule.programStatus !== 'active') continue
        for (const w of schedule.scheduledWorkouts) {
          const wKey = typeof w.date === 'string' ? w.date.split('T')[0] : new Date(w.date).toISOString().split('T')[0]

          if (w.status === 'missed') {
            missed.push({ ...w, programName: schedule.programName })
          } else if (w.status === 'scheduled' && wKey >= todayKey) {
            if (!earliest || wKey < earliestKey) {
              earliest = { ...w, programName: schedule.programName }
              earliestKey = wKey
            }
          }
        }
      }

      // Sort missed by date descending (most recent first)
      missed.sort((a, b) => b.date.localeCompare(a.date))

      setNextWorkout(earliest)
      setMissedWorkouts(missed)
    } catch (error) {
      console.error('Failed to fetch schedule:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSchedules() }, [])

  async function skipMissed(w: ScheduledWorkout & { programName: string }) {
    const token = localStorage.getItem('token')
    if (!token) return
    setSkipping(w.date)
    try {
      const tz = new Date().getTimezoneOffset()
      const res = await fetch('/api/schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ programId: w.programId, action: 'skip', workoutDate: w.date, tz }),
      })
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        console.error(`[NextWorkoutCard] skip failed (${res.status}):`, errBody)
        return
      }
      await fetchSchedules()
    } catch (err) {
      console.error('[NextWorkoutCard] skip error:', err)
    } finally {
      setSkipping(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="animate-pulse flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-28 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-3 w-40 rounded bg-zinc-100 dark:bg-zinc-800/60" />
          </div>
        </div>
      </Card>
    )
  }

  if (!nextWorkout && missedWorkouts.length === 0) return null

  function getDateLabel(workout: ScheduledWorkout): string {
    const wDateStr = typeof workout.date === 'string' ? workout.date.split('T')[0] : new Date(workout.date).toISOString().split('T')[0]
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const tom = new Date(now); tom.setDate(tom.getDate() + 1)
    const tomorrowStr = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`
    if (wDateStr === todayStr) return 'Today'
    if (wDateStr === tomorrowStr) return 'Tomorrow'
    return new Date(wDateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  return (
    <div className="space-y-3">
      {/* Missed workout banner */}
      {missedWorkouts.length > 0 && (
        <Card
          accent="danger"
          className="!border-red-200 !bg-red-50 dark:!border-red-900/40 dark:!bg-red-950/20"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-400">
                {missedWorkouts.length} Incomplete {missedWorkouts.length === 1 ? 'Workout' : 'Workouts'}
              </span>
            </div>
            <Link
              href="/dashboard/calendar"
              className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-red-200/70 dark:divide-red-900/40">
            {missedWorkouts.slice(0, 2).map((w) => {
              const dateStr = typeof w.date === 'string' ? w.date.split('T')[0] : new Date(w.date).toISOString().split('T')[0]
              const displayDate = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              return (
                <div key={w.date} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-medium text-red-800 dark:text-red-300">
                      {displayDate} — {w.dayLabel}: {w.workoutTitle}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Link
                      href={`/dashboard/workout/${w.programId}/workout?day=${encodeURIComponent(w.dayLabel)}`}
                      className="rounded-lg bg-red-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-red-700"
                    >
                      Do It
                    </Link>
                    <button
                      onClick={() => skipMissed(w)}
                      disabled={skipping === w.date}
                      className="flex items-center gap-0.5 rounded-lg border border-red-200 px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <SkipForward className="h-2.5 w-2.5" />
                      Skip
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {missedWorkouts.length > 2 && (
            <p className="mt-2 text-xs text-red-500">+{missedWorkouts.length - 2} more in calendar</p>
          )}
        </Card>
      )}

      {/* Upcoming workout */}
      {nextWorkout && (
        <Card>
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
            href={`/dashboard/workout/${nextWorkout.programId}/workout?day=${encodeURIComponent(nextWorkout.dayLabel)}`}
            className="flex items-center gap-3 rounded-lg bg-blue-50 p-3 transition-colors hover:bg-blue-100 dark:bg-blue-950/20 dark:hover:bg-blue-950/30"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
              <Dumbbell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                {getDateLabel(nextWorkout)}: {nextWorkout.dayLabel}
              </p>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {nextWorkout.workoutTitle} · {nextWorkout.programName}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-blue-400" />
          </Link>
        </Card>
      )}
    </div>
  )
}
