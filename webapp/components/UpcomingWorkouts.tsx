"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calendar, ChevronRight, Check, X, Clock, Dumbbell } from 'lucide-react'
import { Card } from '@/components/ui'

interface ScheduledWorkout {
  date: string
  programId: string
  phase: number
  dayLabel: string
  workoutTitle: string
  status: 'scheduled' | 'completed' | 'missed' | 'skipped' | 'rest'
}

interface ScheduleData {
  programId: string
  programName: string
  scheduledWorkouts: ScheduledWorkout[]
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Format a local Date as YYYY-MM-DD using local time components
function toLocalDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
}

function getWeekDays(): Date[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Start from Sunday
  const sunday = new Date(today)
  sunday.setDate(today.getDate() - today.getDay())
  
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    days.push(d)
  }
  return days
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <Check className="h-3.5 w-3.5 text-green-500" />
    case 'missed':
      return <X className="h-3.5 w-3.5 text-red-400" />
    case 'skipped':
      return <Clock className="h-3.5 w-3.5 text-amber-400" />
    case 'scheduled':
      return <Dumbbell className="h-3.5 w-3.5 text-blue-500" />
    default:
      return null
  }
}

export default function UpcomingWorkouts() {
  const router = useRouter()
  const [schedules, setSchedules] = useState<ScheduleData[]>([])
  const [loading, setLoading] = useState(true)
  const [hasSchedules, setHasSchedules] = useState(false)

  useEffect(() => {
    async function fetchSchedule() {
      try {
        const token = localStorage.getItem('token')
        if (!token) return

        const tz = new Date().getTimezoneOffset()
        const res = await fetch(`/api/schedule?view=week&tz=${tz}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })

        if (res.ok) {
          const data = await res.json()
          if (data.schedules && data.schedules.length > 0) {
            setSchedules(data.schedules)
            setHasSchedules(true)
          }
        }
      } catch (error) {
        console.error('Failed to fetch schedule:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSchedule()
  }, [])

  if (loading) {
    return (
      <Card>
        <div className="animate-pulse">
          <div className="mb-4 h-5 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
            ))}
          </div>
        </div>
      </Card>
    )
  }

  if (!hasSchedules) {
    return (
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-500" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white sm:text-lg">This Week</h2>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No workouts scheduled yet. Enroll in a program and set up a schedule to plan your week.
          </p>
          <Link
            href="/dashboard/workout#browse-programs"
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Browse Programs
          </Link>
        </div>
      </Card>
    )
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekDays = getWeekDays()

  // Merge all scheduled workouts from all programs into a date map (supports multiple programs per day)
  const workoutsByDate = new Map<string, Array<ScheduledWorkout & { programName: string }>>()
  for (const schedule of schedules) {
    for (const w of schedule.scheduledWorkouts) {
      // Use the UTC date portion from the ISO string to avoid timezone shift
      const key = typeof w.date === 'string' ? w.date.split('T')[0] : new Date(w.date).toISOString().split('T')[0]
      const existing = workoutsByDate.get(key) || []
      existing.push({ ...w, programName: schedule.programName })
      workoutsByDate.set(key, existing)
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-500" />
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white sm:text-lg">This Week</h2>
        </div>
        <Link
          href="/dashboard/calendar"
          className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          View Calendar
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {weekDays.map((day) => {
          const key = toLocalDateKey(day)
          const workouts = workoutsByDate.get(key)
          const workout = workouts?.[0] // Primary workout for display
          const isToday = isSameDay(day, today)
          const isPast = day < today
          const isRest = !workouts || workouts.length === 0

          const inner = (
            <>
              {/* Day label */}
              <span className={`text-[10px] font-medium sm:text-xs ${
                isToday ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-400 dark:text-zinc-500'
              }`}>
                {DAY_LABELS[day.getDay()]}
              </span>

              {/* Date number */}
              <span className={`text-sm font-bold sm:text-base ${
                isToday ? '' : 'text-zinc-900 dark:text-white'
              }`}>
                {day.getDate()}
              </span>

              {/* Status indicator */}
              <div className="mt-0.5 flex h-5 items-center justify-center">
                {workout ? (
                  <StatusIcon status={workout.status} />
                ) : isRest ? (
                  <span className="text-[9px] text-zinc-400 dark:text-zinc-600">Rest</span>
                ) : null}
              </div>

              {/* Multi-program indicator */}
              {workouts && workouts.length > 1 && (
                <span className="mt-0.5 text-[8px] text-blue-500 dark:text-blue-400">+{workouts.length - 1}</span>
              )}

              {/* Workout title (visible on larger screens) */}
              {workout && (
                <span className="mt-0.5 hidden text-center text-[8px] leading-tight text-zinc-500 dark:text-zinc-400 sm:block sm:text-[9px]">
                  {workout.workoutTitle.length > 12
                    ? workout.workoutTitle.slice(0, 12) + '…'
                    : workout.workoutTitle}
                </span>
              )}
            </>
          )

          const cellClass = `relative flex flex-col items-center rounded-lg p-1.5 sm:p-2 transition-colors ${
            isToday
              ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
              : isPast
                ? 'bg-zinc-50 dark:bg-zinc-800/50'
                : 'bg-zinc-50 dark:bg-zinc-800/30'
          } ${workout ? 'cursor-pointer active:opacity-70' : ''}`

          return workout ? (
            <button
              key={key}
              onClick={() => router.push(`/dashboard/calendar?date=${key}`)}
              className={cellClass}
            >
              {inner}
            </button>
          ) : (
            <div key={key} className={cellClass}>
              {inner}
            </div>
          )
        })}
      </div>

      {/* Today's workout detail */}
      {(() => {
        const todayKey = toLocalDateKey(today)
        const todayWorkouts = workoutsByDate.get(todayKey)
        if (!todayWorkouts || todayWorkouts.length === 0) return null
        // Show first non-completed workout, or nothing if all done
        const todayWorkout = todayWorkouts.find(w => w.status !== 'completed')
        if (!todayWorkout) return null

        return (
          <Link
            href={`/dashboard/workout/${todayWorkout.programId}/workout?day=${encodeURIComponent(todayWorkout.dayLabel)}`}
            className="mt-3 flex items-center gap-3 rounded-lg bg-blue-50 p-3 transition-colors hover:bg-blue-100 dark:bg-blue-950/20 dark:hover:bg-blue-950/30"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
              <Dumbbell className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900 dark:text-white">
                Today: {todayWorkout.dayLabel}
              </p>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {todayWorkout.workoutTitle}
                {todayWorkouts.length > 1 && ` (+${todayWorkouts.length - 1} more)`}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-blue-400" />
          </Link>
        )
      })()}
    </Card>
  )
}
