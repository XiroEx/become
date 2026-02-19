"use client"

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import {
    ChevronLeft,
    ChevronRight,
    Check,
    X,
    Clock,
    Dumbbell,
    Calendar,
    Settings,
    SkipForward,
    ArrowRightLeft,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

// ------ Types ------

interface ScheduledWorkout {
  date: string
  programId: string
  phase: number
  dayLabel: string
  workoutTitle: string
  status: 'scheduled' | 'completed' | 'missed' | 'skipped' | 'rest'
  completedAt?: string
}

interface ScheduleData {
  _id: string
  programId: string
  programName: string
  settings: {
    trainingDays: number[]
    startDate: string
    autoAdvance: boolean
  }
  scheduledWorkouts: ScheduledWorkout[]
}

type ViewMode = 'month' | 'week'

// ------ Helpers ------

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Program colors for multi-program view
const PROGRAM_COLORS = [
  { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
]

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
}

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Pad to start on Sunday
  const startPad = firstDay.getDay()
  const days: Date[] = []

  for (let i = startPad; i > 0; i--) {
    const d = new Date(year, month, 1 - i)
    days.push(d)
  }

  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i))
  }

  // Pad to complete the last week
  const remaining = 7 - (days.length % 7)
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i))
    }
  }

  return days
}

function getWeekDays(referenceDate: Date): Date[] {
  const d = new Date(referenceDate)
  d.setHours(0, 0, 0, 0)
  const sunday = new Date(d)
  sunday.setDate(d.getDate() - d.getDay())

  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const wd = new Date(sunday)
    wd.setDate(sunday.getDate() + i)
    days.push(wd)
  }
  return days
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return (
        <span className="flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <Check className="h-2.5 w-2.5" /> Done
        </span>
      )
    case 'missed':
      return (
        <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
          <X className="h-2.5 w-2.5" /> Missed
        </span>
      )
    case 'skipped':
      return (
        <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <Clock className="h-2.5 w-2.5" /> Skipped
        </span>
      )
    case 'scheduled':
      return (
        <span className="flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          <Dumbbell className="h-2.5 w-2.5" /> Scheduled
        </span>
      )
    default:
      return null
  }
}

// ------ Main Component ------

export default function CalendarClient() {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [schedules, setSchedules] = useState<ScheduleData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [actionMenuWorkout, setActionMenuWorkout] = useState<(ScheduledWorkout & { programName: string }) | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Build a color map for programs
  const programColorMap = new Map<string, typeof PROGRAM_COLORS[0]>()
  schedules.forEach((s, i) => {
    programColorMap.set(s.programId, PROGRAM_COLORS[i % PROGRAM_COLORS.length])
  })

  // Fetch schedules
  const fetchSchedules = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return

      let url = '/api/schedule?'
      if (viewMode === 'month') {
        const from = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        const to = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
        // Extend range to cover padding days
        from.setDate(from.getDate() - 7)
        to.setDate(to.getDate() + 7)
        url += `from=${from.toISOString()}&to=${to.toISOString()}`
      } else {
        // Week view: compute the Sun-Sat range based on currentDate
        const weekStart = new Date(currentDate)
        weekStart.setDate(weekStart.getDate() - weekStart.getDay())
        weekStart.setHours(0, 0, 0, 0)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekEnd.getDate() + 7)
        url += `from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`
      }

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (res.ok) {
        const data = await res.json()
        setSchedules(data.schedules || [])
      }
    } catch (error) {
      console.error('Failed to fetch schedules:', error)
    } finally {
      setLoading(false)
    }
  }, [viewMode, currentDate])

  useEffect(() => {
    fetchSchedules()
  }, [fetchSchedules])

  // Build workout map
  const workoutsByDate = new Map<string, Array<ScheduledWorkout & { programName: string; programId: string }>>()
  for (const schedule of schedules) {
    for (const w of schedule.scheduledWorkouts) {
      const d = new Date(w.date)
      d.setHours(0, 0, 0, 0)
      const key = toDateKey(d)
      const existing = workoutsByDate.get(key) || []
      existing.push({ ...w, programName: schedule.programName, programId: schedule.programId })
      workoutsByDate.set(key, existing)
    }
  }

  // Navigation
  const navigatePrev = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
    } else {
      const prev = new Date(currentDate)
      prev.setDate(prev.getDate() - 7)
      setCurrentDate(prev)
    }
  }

  const navigateNext = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    } else {
      const next = new Date(currentDate)
      next.setDate(next.getDate() + 7)
      setCurrentDate(next)
    }
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDate(new Date())
  }

  // Schedule actions
  const handleAction = async (action: string) => {
    if (!actionMenuWorkout) return
    setActionLoading(true)

    try {
      const token = localStorage.getItem('token')
      if (!token) return

      const res = await fetch('/api/schedule', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          programId: actionMenuWorkout.programId,
          action,
          workoutDate: actionMenuWorkout.date,
        }),
      })

      if (res.ok) {
        setActionMenuWorkout(null)
        fetchSchedules()
      }
    } catch (error) {
      console.error('Action failed:', error)
    } finally {
      setActionLoading(false)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const days = viewMode === 'month'
    ? getMonthDays(currentDate.getFullYear(), currentDate.getMonth())
    : getWeekDays(currentDate)

  const headerText = viewMode === 'month'
    ? `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    : (() => {
        const week = getWeekDays(currentDate)
        const start = week[0]
        const end = week[6]
        if (start.getMonth() === end.getMonth()) {
          return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}-${end.getDate()}, ${start.getFullYear()}`
        }
        return `${MONTH_NAMES[start.getMonth()].slice(0, 3)} ${start.getDate()} - ${MONTH_NAMES[end.getMonth()].slice(0, 3)} ${end.getDate()}`
      })()

  // Selected day detail
  const selectedWorkouts = selectedDate
    ? workoutsByDate.get(toDateKey(selectedDate)) || []
    : []

  return (
    <PageTransition className="min-h-screen pb-24">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-blue-500" />
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white sm:text-2xl">Calendar</h1>
        </div>
        <Link
          href="/dashboard/calendar/settings"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </div>

      {/* View Toggle + Nav */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
          <button
            onClick={() => setViewMode('month')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'month'
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'week'
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
            }`}
          >
            Week
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={goToToday}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            Today
          </button>
          <button
            onClick={navigatePrev}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={navigateNext}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Period Label */}
      <h2 className="mb-3 text-center text-base font-semibold text-zinc-900 dark:text-white sm:text-lg">
        {headerText}
      </h2>

      {/* Program Legend */}
      {schedules.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-3">
          {schedules.map((s) => {
            const colors = programColorMap.get(s.programId) || PROGRAM_COLORS[0]
            return (
              <div key={s.programId} className="flex items-center gap-1.5">
                <div className={`h-2.5 w-2.5 rounded-full ${colors.dot}`} />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">{s.programName}</span>
              </div>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800 sm:h-20" />
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
            <Calendar className="h-8 w-8 text-zinc-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">No schedules yet</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Enroll in a program and set up a schedule to see your workouts here.
            </p>
          </div>
          <Link
            href="/dashboard/programming"
            className="rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Browse Programs
          </Link>
        </div>
      ) : (
        <>
          {/* Calendar Grid */}
          <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800">
              {DAY_LABELS.map((label) => (
                <div key={label} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 sm:text-xs">
                  {label}
                </div>
              ))}
            </div>

            {/* Date cells */}
            <div className={`grid grid-cols-7 ${viewMode === 'week' ? '' : ''}`}>
              {days.map((day) => {
                const key = toDateKey(day)
                const isThisMonth = day.getMonth() === currentDate.getMonth()
                const isToday_ = isSameDay(day, today)
                const isSelected = selectedDate && isSameDay(day, selectedDate)
                const dayWorkouts = workoutsByDate.get(key) || []

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDate(isSameDay(day, selectedDate || new Date(0)) ? null : day)}
                    className={`relative flex flex-col items-center border-b border-r border-zinc-100 p-1 transition-colors dark:border-zinc-800/50 sm:p-2 ${
                      viewMode === 'week' ? 'min-h-20 sm:min-h-[100px]' : 'min-h-[52px] sm:min-h-16'
                    } ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : isToday_
                          ? 'bg-zinc-50 dark:bg-zinc-800/30'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/20'
                    } ${!isThisMonth && viewMode === 'month' ? 'opacity-40' : ''}`}
                  >
                    {/* Date number */}
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium sm:h-7 sm:w-7 sm:text-sm ${
                      isToday_
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                        : 'text-zinc-700 dark:text-zinc-300'
                    }`}>
                      {day.getDate()}
                    </span>

                    {/* Workout dots */}
                    {dayWorkouts.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                        {dayWorkouts.map((w, i) => {
                          const colors = programColorMap.get(w.programId) || PROGRAM_COLORS[0]
                          const statusColor = w.status === 'completed' ? 'bg-green-500' :
                            w.status === 'missed' ? 'bg-red-400' :
                            w.status === 'skipped' ? 'bg-amber-400' :
                            colors.dot
                          return <div key={i} className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />
                        })}
                      </div>
                    )}

                    {/* Workout label in week view */}
                    {viewMode === 'week' && dayWorkouts.length > 0 && (
                      <div className="mt-1 w-full space-y-0.5">
                        {dayWorkouts.map((w, i) => {
                          const colors = programColorMap.get(w.programId) || PROGRAM_COLORS[0]
                          return (
                            <div key={i} className={`rounded px-1 py-0.5 text-[8px] font-medium leading-tight sm:text-[10px] ${colors.bg} ${colors.text}`}>
                              {w.dayLabel}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Selected Day Detail Panel */}
          <AnimatePresence>
            {selectedDate && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-white">
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </h3>

                {selectedWorkouts.length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Rest day — no workouts scheduled.</p>
                ) : (
                  <div className="space-y-3">
                    {selectedWorkouts.map((w, idx) => {
                      const colors = programColorMap.get(w.programId) || PROGRAM_COLORS[0]
                      return (
                        <div key={idx} className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div className={`h-2 w-2 shrink-0 rounded-full ${colors.dot}`} />
                                <p className="text-sm font-medium text-zinc-900 dark:text-white">
                                  {w.dayLabel}: {w.workoutTitle}
                                </p>
                              </div>
                              <p className="mt-0.5 ml-4 text-xs text-zinc-500 dark:text-zinc-400">
                                Phase {w.phase} · {w.programName}
                              </p>
                            </div>
                            <StatusBadge status={w.status} />
                          </div>

                          {/* Actions */}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {w.status === 'scheduled' && (
                              <>
                                <Link
                                  href={`/dashboard/programming/${w.programId}/workout?day=${encodeURIComponent(w.dayLabel)}`}
                                  className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                                >
                                  <Dumbbell className="h-3 w-3" />
                                  Start Workout
                                </Link>
                                <button
                                  onClick={() => setActionMenuWorkout(w)}
                                  className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                >
                                  <Settings className="h-3 w-3" />
                                  Manage
                                </button>
                              </>
                            )}
                            {w.status === 'missed' && (
                              <Link
                                href={`/dashboard/programming/${w.programId}/workout?day=${encodeURIComponent(w.dayLabel)}`}
                                className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                              >
                                <Dumbbell className="h-3 w-3" />
                                Do It Now
                              </Link>
                            )}
                            {w.status === 'completed' && (
                              <span className="text-xs text-green-600 dark:text-green-400">
                                Completed {w.completedAt ? new Date(w.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Action Menu Modal */}
      <AnimatePresence>
        {actionMenuWorkout && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setActionMenuWorkout(null)} />
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900"
            >
              <h3 className="mb-1 text-base font-bold text-zinc-900 dark:text-white">
                Manage Workout
              </h3>
              <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                {actionMenuWorkout.dayLabel} · {new Date(actionMenuWorkout.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>

              <div className="space-y-2">
                <button
                  onClick={() => handleAction('skip')}
                  disabled={actionLoading}
                  className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <SkipForward className="h-4 w-4 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">Skip This Day</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Mark as skipped, move on to next</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    // For reschedule, we'd need a date picker — for now just skip forward one day
                    // This is a simplified version; a full implementation would show a date picker
                    const currentWDate = new Date(actionMenuWorkout.date)
                    currentWDate.setDate(currentWDate.getDate() + 1)
                    const token = localStorage.getItem('token')
                    if (!token) return
                    setActionLoading(true)
                    fetch('/api/schedule', {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                      },
                      body: JSON.stringify({
                        programId: actionMenuWorkout.programId,
                        action: 'reschedule',
                        workoutDate: actionMenuWorkout.date,
                        newDate: currentWDate.toISOString(),
                      }),
                    }).then(() => {
                      setActionMenuWorkout(null)
                      fetchSchedules()
                    }).finally(() => setActionLoading(false))
                  }}
                  disabled={actionLoading}
                  className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <ArrowRightLeft className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">Move to Tomorrow</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Reschedule this workout</p>
                  </div>
                </button>
              </div>

              <button
                onClick={() => setActionMenuWorkout(null)}
                className="mt-3 w-full rounded-xl bg-zinc-100 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  )
}
