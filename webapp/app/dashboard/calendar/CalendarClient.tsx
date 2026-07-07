"use client"

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import { useSwipeNav } from '@/hooks/useSwipeNav'
import WorkoutSummary from '@/components/WorkoutSummary'
import QuickSessionSummary from '@/components/QuickSessionSummary'
import { continueQuickSession } from '@/lib/quickSession/openQuick'
import { BackButton } from '@/components/ui/BackButton'
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
    Pause,
    Play,
    ChevronsRight,
    CalendarDays,
    BarChart2,
    RotateCcw,
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
  programStatus?: string
  settings: {
    trainingDays: number[]
    startDate: string
  }
  scheduledWorkouts: ScheduledWorkout[]
}

// One-off / generated "quick" sessions (kind:'quick' logs) surfaced on the
// calendar alongside program workouts.
interface QuickCalItem {
  sessionId?: string
  title: string
  date: string
  completed: boolean
  skipped?: boolean
  exerciseCount: number
  duration?: number
  status: 'completed' | 'planned' | 'incomplete' | 'skipped'
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

/**
 * The server stores scheduled dates as UTC midnight where the YYYY-MM-DD
 * portion represents the intended LOCAL calendar date. Parse it that way
 * (not as UTC) and compare against the local date of completedAt.
 */
function isMakeupWorkout(scheduledDateStr: string, completedAtStr: string): boolean {
  const scheduledLocal = localDateFromScheduledIso(scheduledDateStr)
  const c = new Date(completedAtStr)
  const completedLocal = new Date(c.getFullYear(), c.getMonth(), c.getDate())
  // Only a makeup if completed AFTER the scheduled date (late completion of a missed workout).
  // Completing before the scheduled date is an early completion — not a makeup.
  return completedLocal.getTime() > scheduledLocal.getTime()
}

/**
 * Convert a stored scheduled-workout ISO string ("2026-05-11T00:00:00.000Z")
 * into a Date at LOCAL midnight on the same calendar day. Required because
 * the YYYY-MM-DD portion is the intended local date — passing the raw ISO
 * to `new Date()` interprets it as UTC midnight, which becomes the previous
 * evening in any timezone west of UTC and silently shifts the displayed day.
 */
function localDateFromScheduledIso(iso: string): Date {
  const datePart = typeof iso === 'string'
    ? iso.split('T')[0]
    : new Date(iso).toISOString().split('T')[0]
  const [y, m, d] = datePart.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Format a local Date as YYYY-MM-DD using local time components
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
        <span className="flex items-center gap-0.5 rounded-full bg-green-700 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-green-700 dark:text-white">
          <Check className="h-2.5 w-2.5" /> Done
        </span>
      )
    case 'makeup':
      return (
        <span className="flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:bg-green-900/30 dark:text-green-300">
          <CalendarDays className="h-2.5 w-2.5" /> Made Up
        </span>
      )
    case 'missed':
      return (
        <span className="flex items-center gap-0.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-red-600 dark:text-white">
          <X className="h-2.5 w-2.5" /> Incomplete
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
  const searchParams = useSearchParams()
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [direction, setDirection] = useState(0)
  const [currentDate, setCurrentDate] = useState(() => {
    const dateParam = searchParams.get('date')
    if (dateParam) {
      const d = new Date(dateParam + 'T12:00:00')
      if (!isNaN(d.getTime())) return d
    }
    return new Date()
  })
  const [schedules, setSchedules] = useState<ScheduleData[]>([])
  const [quick, setQuick] = useState<QuickCalItem[]>([])
  const [summaryId, setSummaryId] = useState<string | null>(null)
  // Quick-session Manage sheet (parity with the program workout Manage sheet).
  const [quickMenu, setQuickMenu] = useState<QuickCalItem | null>(null)
  const [showQuickDatePicker, setShowQuickDatePicker] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    const dateParam = searchParams.get('date')
    if (dateParam) {
      const d = new Date(dateParam + 'T12:00:00')
      if (!isNaN(d.getTime())) return d
    }
    return null
  })
  const [actionMenuWorkout, setActionMenuWorkout] = useState<(ScheduledWorkout & { programName: string }) | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [shiftDays, setShiftDays] = useState(7)
  const [showShiftInput, setShowShiftInput] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [pickerMonth, setPickerMonth] = useState(() => new Date())
  const [logSummary, setLogSummary] = useState<{
    log: {
      day: string
      phase: number
      completed: boolean
      duration?: number
      exercises: Array<{
        name: string
        sets: Array<{ setNumber: number; reps: number; weight: number; completed: boolean }>
      }>
    }
    workout: { day: string; title: string }
    exerciseHistory: Record<string, { weight: number; reps: number; duration?: number; date: string }>
  } | null>(null)
  const [logSummaryLoading, setLogSummaryLoading] = useState(false)

  // Build a color map and paused set for programs
  const programColorMap = new Map<string, typeof PROGRAM_COLORS[0]>()
  const pausedProgramIds = new Set<string>()
  schedules.forEach((s, i) => {
    programColorMap.set(s.programId, PROGRAM_COLORS[i % PROGRAM_COLORS.length])
    if (s.programStatus === 'paused') pausedProgramIds.add(s.programId)
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
      url += `&tz=${new Date().getTimezoneOffset()}`

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

  // Quick (one-off) sessions — bucketed onto the calendar by date. Re-callable
  // so management actions (delete / re-date) can refresh.
  const fetchQuick = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const res = await fetch('/api/workouts/logs?includeIncomplete=true', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = (await res.json()) as { logs?: Array<{ kind: string; title: string; date: string; completed: boolean; skipped?: boolean; exerciseCount: number; duration?: number; sessionId?: string }> }
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      setQuick(
        (data.logs ?? [])
          .filter((l) => l.kind === 'quick')
          .map((l) => ({
            sessionId: l.sessionId,
            title: l.title,
            date: l.date,
            completed: l.completed,
            skipped: l.skipped,
            exerciseCount: l.exerciseCount,
            duration: l.duration,
            status: l.completed ? 'completed' : l.skipped ? 'skipped' : (new Date(l.date) >= startOfToday ? 'planned' : 'incomplete'),
          })),
      )
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => { fetchQuick() }, [fetchQuick])

  // Shared management helpers -------------------------------------------------
  // Per-workout schedule PATCH (skip / unskip / uncomplete / reschedule …).
  const patchWorkout = useCallback(async (programId: string, action: string, workoutDate: string, extra: Record<string, unknown> = {}, confirmMsg?: string) => {
    const token = localStorage.getItem('token')
    if (!token) return
    if (confirmMsg && typeof window !== 'undefined' && !window.confirm(confirmMsg)) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ programId, action, workoutDate, tz: new Date().getTimezoneOffset(), ...extra }),
      })
      if (res.ok) await fetchSchedules()
    } finally {
      setActionLoading(false)
    }
  }, [fetchSchedules])

  // Delete a quick session log, then refresh.
  const deleteQuick = useCallback(async (sessionId: string) => {
    const token = localStorage.getItem('token')
    if (!token) return
    if (typeof window !== 'undefined' && !window.confirm('Delete this session? This can’t be undone.')) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/workouts/session?id=${encodeURIComponent(sessionId)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setQuickMenu(null)
        await fetchQuick()
      }
    } finally {
      setActionLoading(false)
    }
  }, [fetchQuick])

  // Re-date a quick session log to another day, then refresh + close the sheet.
  const reDateQuick = useCallback(async (sessionId: string, date: string) => {
    const token = localStorage.getItem('token')
    if (!token || !date) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/workouts/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: sessionId, date }),
      })
      if (res.ok) {
        setShowQuickDatePicker(false)
        setQuickMenu(null)
        await fetchQuick()
      }
    } finally {
      setActionLoading(false)
    }
  }, [fetchQuick])

  // Skip / un-skip a planned quick session, then refresh + close the sheet.
  const skipQuick = useCallback(async (sessionId: string, skipped: boolean) => {
    const token = localStorage.getItem('token')
    if (!token) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/workouts/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: sessionId, skipped }),
      })
      if (res.ok) {
        setQuickMenu(null)
        await fetchQuick()
      }
    } finally {
      setActionLoading(false)
    }
  }, [fetchQuick])

  const fetchWorkoutLog = async (w: ScheduledWorkout & { programName: string; programId: string }) => {
    setLogSummaryLoading(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      // For makeup workouts the log lives on the actual completion date, not the scheduled date
      const lookupDate = w.completedAt ?? w.date
      const dateKey = typeof lookupDate === 'string' ? lookupDate.split('T')[0] : new Date(lookupDate).toISOString().split('T')[0]
      const res = await fetch(`/api/workouts/log?programId=${w.programId}&date=${dateKey}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.log) {
          setLogSummary({
            log: data.log,
            workout: { day: w.dayLabel, title: w.workoutTitle },
            exerciseHistory: data.exerciseHistory ?? {},
          })
        }
      }
    } finally {
      setLogSummaryLoading(false)
    }
  }

  // Build workout map — key by the date portion of the stored ISO string.
  // Workout dates are stored as UTC midnight and the YYYY-MM-DD portion represents
  // the intended local calendar date (server generates with UTC methods from a local date string).
  const workoutsByDate = new Map<string, Array<ScheduledWorkout & { programName: string; programId: string }>>()
  for (const schedule of schedules) {
    for (const w of schedule.scheduledWorkouts) {
      // Extract the YYYY-MM-DD portion from the UTC ISO string
      const key = typeof w.date === 'string' ? w.date.split('T')[0] : new Date(w.date).toISOString().split('T')[0]
      const existing = workoutsByDate.get(key) || []
      existing.push({ ...w, programName: schedule.programName, programId: schedule.programId })
      workoutsByDate.set(key, existing)
    }
  }

  // Bucket quick sessions by local calendar date.
  const quickByDate = new Map<string, QuickCalItem[]>()
  for (const q of quick) {
    const key = toDateKey(new Date(q.date))
    const existing = quickByDate.get(key) || []
    existing.push(q)
    quickByDate.set(key, existing)
  }

  // Navigation
  const navigatePrev = () => {
    setDirection(-1)
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
    } else {
      const prev = new Date(currentDate)
      prev.setDate(prev.getDate() - 7)
      setCurrentDate(prev)
    }
  }

  const navigateNext = () => {
    setDirection(1)
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

  // Swipe navigation — shared gesture (hooks/useSwipeNav), identical behavior
  // on the nutrition day view and timeline.
  const { handlers: { onTouchStart: handleTouchStart, onTouchEnd: handleTouchEnd } } =
    useSwipeNav({ onPrev: navigatePrev, onNext: navigateNext })

  // Schedule actions
  const handleAction = async (action: string) => {
    if (!actionMenuWorkout) return
    // Confirm state-changing actions so an accidental tap can't quietly alter history.
    const confirmMsg: Record<string, string> = {
      skip: 'Skip this workout? It’ll be marked skipped and won’t count as completed.',
    }
    if (confirmMsg[action] && typeof window !== 'undefined' && !window.confirm(confirmMsg[action])) return
    setActionLoading(true)

    try {
      const token = localStorage.getItem('token')
      if (!token) return

      const tz = new Date().getTimezoneOffset()
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
          tz,
        }),
      })

      if (res.ok) {
        setActionMenuWorkout(null)
        await fetchSchedules()
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
  const selectedQuick = selectedDate ? quickByDate.get(toDateKey(selectedDate)) || [] : []
  const selectedWorkouts = selectedDate
    ? workoutsByDate.get(toDateKey(selectedDate)) || []
    : []

  const slideVariants = {
    initial: (dir: number) => ({ x: dir >= 0 ? '100%' : '-100%' }),
    animate: { x: 0 },
    exit: (dir: number) => ({ x: dir >= 0 ? '-100%' : '100%' }),
  }

  return (
    <PageTransition className="pb-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
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
      <div className="relative mb-3 overflow-hidden">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.h2
            key={headerText}
            custom={direction}
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.08, ease: 'easeInOut' }}
            className="text-center text-base font-semibold text-zinc-900 dark:text-white sm:text-lg"
          >
            {headerText}
          </motion.h2>
        </AnimatePresence>
      </div>

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
            href="/dashboard/workout#browse-programs"
            className="rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Browse Programs
          </Link>
        </div>
      ) : (
        <>
          {/* Calendar Grid */}
          <div
            className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800">
              {DAY_LABELS.map((label) => (
                <div key={label} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 sm:text-xs">
                  {label}
                </div>
              ))}
            </div>

            {/* Date cells */}
            <div className="relative overflow-hidden">
            <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={toDateKey(days[0])}
              custom={direction}
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.11, ease: [0.4, 0, 0.2, 1] }}
              className={`grid grid-cols-7 ${viewMode === 'week' ? '' : ''}`}
            >
              {days.map((day) => {
                const key = toDateKey(day)
                const isThisMonth = day.getMonth() === currentDate.getMonth()
                const isToday_ = isSameDay(day, today)
                const isSelected = selectedDate && isSameDay(day, selectedDate)
                const dayWorkouts = workoutsByDate.get(key) || []
                const dayQuick = quickByDate.get(key) || []

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

                    {/* Workout dots (program + quick sessions) */}
                    {(dayWorkouts.length > 0 || dayQuick.length > 0) && (
                      <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                        {dayWorkouts.map((w, i) => {
                          const colors = programColorMap.get(w.programId) || PROGRAM_COLORS[0]
                          const isMakeupDot = w.status === 'completed' && !!w.completedAt &&
                            isMakeupWorkout(w.date, w.completedAt)
                          const statusColor = isMakeupDot ? 'bg-green-300' :
                            w.status === 'completed' ? 'bg-green-700' :
                            w.status === 'missed' ? 'bg-red-600' :
                            w.status === 'skipped' ? 'bg-amber-400' :
                            colors.dot
                          return <div key={i} className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />
                        })}
                        {dayQuick.map((q, i) => {
                          // Quick sessions use a ring to distinguish them from program dots.
                          const c = q.status === 'completed' ? 'bg-green-700' :
                            q.status === 'planned' ? 'bg-blue-600' : 'bg-red-600'
                          return <div key={`q${i}`} className={`h-1.5 w-1.5 rounded-full ring-1 ring-purple-400 ${c}`} />
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
            </motion.div>
            </AnimatePresence>
            </div>
          </div>

          {/* Color Legend */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 px-1">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-700" />
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Completed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-300" />
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Made Up</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Scheduled</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-red-600" />
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Incomplete</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Skipped</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-purple-500 ring-1 ring-purple-300" />
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Quick session</span>
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

                {/* Quick (one-off) sessions on this day — tappable */}
                {selectedQuick.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {selectedQuick.map((q, i) => {
                      // Map the quick-session status onto the shared StatusBadge vocabulary
                      // so quick + program cards read identically.
                      const badgeStatus = q.status === 'completed' ? 'completed'
                        : q.status === 'skipped' ? 'skipped'
                        : q.status === 'planned' ? 'scheduled' : 'missed'
                      const dot = q.status === 'completed' ? 'bg-green-700'
                        : q.status === 'skipped' ? 'bg-amber-400'
                        : q.status === 'planned' ? 'bg-blue-600' : 'bg-red-600'
                      return (
                        <div key={`sq${i}`} className="rounded-lg border border-purple-200 bg-purple-50/40 p-3 dark:border-purple-900/40 dark:bg-purple-900/10">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <div className={`h-2 w-2 shrink-0 rounded-full ring-1 ring-purple-400 ${dot}`} />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">{q.title}</p>
                                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                  Quick session · {q.exerciseCount} {q.exerciseCount === 1 ? 'exercise' : 'exercises'}{q.duration ? ` · ${q.duration} min` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="shrink-0"><StatusBadge status={badgeStatus} /></div>
                          </div>
                          {/* Actions — same "Start Workout + Manage" pattern as program workouts */}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {q.status === 'completed' ? (
                              <button
                                onClick={() => q.sessionId && setSummaryId(q.sessionId)}
                                className="flex items-center gap-1 rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-600 transition-colors hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/20"
                              >
                                <BarChart2 className="h-3 w-3" /> View Summary
                              </button>
                            ) : (
                              <button
                                onClick={async () => {
                                  if (!q.sessionId) { router.push('/dashboard/workout/hub?tab=sessions'); return }
                                  const href = await continueQuickSession(q.sessionId)
                                  router.push(href ?? '/dashboard/workout/hub?tab=sessions')
                                }}
                                className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                              >
                                <Dumbbell className="h-3 w-3" /> {q.status === 'incomplete' ? 'Continue' : 'Start Workout'}
                              </button>
                            )}
                            <button
                              onClick={() => setQuickMenu(q)}
                              disabled={!q.sessionId}
                              className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                              <Settings className="h-3 w-3" /> Manage
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {selectedWorkouts.length === 0 && selectedQuick.length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Rest day — no workouts scheduled.</p>
                ) : selectedWorkouts.length === 0 ? null : (
                  <div className="space-y-3">
                    {selectedWorkouts.map((w, idx) => {
                      const colors = programColorMap.get(w.programId) || PROGRAM_COLORS[0]
                      const isProgramPaused = pausedProgramIds.has(w.programId)
                      const isMakeup = w.status === 'completed' && !!w.completedAt &&
                        isMakeupWorkout(w.date, w.completedAt)
                      return (
                        <div key={idx} className={`rounded-lg border border-zinc-100 p-3 dark:border-zinc-800 ${isProgramPaused ? 'opacity-60' : ''}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div className={`h-2 w-2 shrink-0 rounded-full ${isProgramPaused ? 'bg-amber-400' : colors.dot}`} />
                                <p className="text-sm font-medium text-zinc-900 dark:text-white">
                                  {w.dayLabel}: {w.workoutTitle}
                                </p>
                              </div>
                              <p className="mt-0.5 ml-4 text-xs text-zinc-500 dark:text-zinc-400">
                                Phase {w.phase} · {w.programName}{isProgramPaused ? ' (Paused)' : ''}
                              </p>
                            </div>
                            {isProgramPaused ? (
                              <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                Paused
                              </span>
                            ) : (
                              <StatusBadge status={isMakeup ? 'makeup' : w.status} />
                            )}
                          </div>

                          {/* Actions */}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {isProgramPaused ? (
                              <Link
                                href={`/dashboard/workout/${w.programId}`}
                                className="flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
                              >
                                Resume Program
                              </Link>
                            ) : (
                              <>
                                {w.status === 'scheduled' && (
                                  <>
                                    <Link
                                      href={`/dashboard/workout/${w.programId}/workout?day=${encodeURIComponent(w.dayLabel)}&sd=${encodeURIComponent(w.date)}`}
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
                                  <>
                                    <Link
                                      href={`/dashboard/workout/${w.programId}/workout?day=${encodeURIComponent(w.dayLabel)}&sd=${encodeURIComponent(w.date)}`}
                                      className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                                    >
                                      <Dumbbell className="h-3 w-3" />
                                      Do It Now
                                    </Link>
                                    <button
                                      onClick={async () => {
                                        if (typeof window !== 'undefined' && !window.confirm('Skip this workout? It’ll be marked skipped and won’t count as completed.')) return
                                        const token = localStorage.getItem('token')
                                        if (!token) return
                                        setActionLoading(true)
                                        try {
                                          const res = await fetch('/api/schedule', {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                            body: JSON.stringify({ programId: w.programId, action: 'skip', workoutDate: w.date, tz: new Date().getTimezoneOffset() }),
                                          })
                                          if (res.ok) await fetchSchedules()
                                        } finally {
                                          setActionLoading(false)
                                        }
                                      }}
                                      disabled={actionLoading}
                                      className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                    >
                                      <SkipForward className="h-3 w-3" />
                                      Skip It
                                    </button>
                                    <button
                                      onClick={() => setActionMenuWorkout(w)}
                                      className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                    >
                                      <Settings className="h-3 w-3" />
                                      Reschedule
                                    </button>
                                  </>
                                )}
                                {w.status === 'completed' && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    {isMakeup ? (
                                      <span className="text-xs text-green-500 dark:text-green-400">
                                        Made up on {new Date(w.completedAt!).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-green-600 dark:text-green-400">
                                        Completed {w.completedAt ? new Date(w.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}
                                      </span>
                                    )}
                                    <button
                                      onClick={() => fetchWorkoutLog(w)}
                                      disabled={logSummaryLoading}
                                      className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                                        isMakeup
                                          ? 'border-green-200 text-green-500 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20'
                                          : 'border-green-200 text-green-600 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/20'
                                      }`}
                                    >
                                      <BarChart2 className="h-3 w-3" />
                                      View Summary
                                    </button>
                                    <button
                                      onClick={() => patchWorkout(w.programId, 'uncomplete', w.date, {}, 'Un-complete this workout? The sets you logged for it will be removed and it returns to scheduled.')}
                                      disabled={actionLoading}
                                      className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                      Un-complete
                                    </button>
                                    <button
                                      onClick={() => setActionMenuWorkout(w)}
                                      className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                    >
                                      <Settings className="h-3 w-3" />
                                      Manage
                                    </button>
                                  </div>
                                )}
                                {w.status === 'skipped' && (
                                  <>
                                    <Link
                                      href={`/dashboard/workout/${w.programId}/workout?day=${encodeURIComponent(w.dayLabel)}&sd=${encodeURIComponent(w.date)}`}
                                      className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                                    >
                                      <Dumbbell className="h-3 w-3" />
                                      Do It Now
                                    </Link>
                                    <button
                                      onClick={() => patchWorkout(w.programId, 'unskip', w.date, {}, 'Un-skip this workout? It returns to your schedule as upcoming.')}
                                      disabled={actionLoading}
                                      className="flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                      Un-skip
                                    </button>
                                    <button
                                      onClick={() => setActionMenuWorkout(w)}
                                      className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                    >
                                      <Settings className="h-3 w-3" />
                                      Manage
                                    </button>
                                  </>
                                )}
                              </>
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

      {/* Workout Log Summary Overlay */}
      <AnimatePresence>
        {summaryId && (
          <QuickSessionSummary sessionId={summaryId} onClose={() => setSummaryId(null)} />
        )}

        {logSummary && (
          <WorkoutSummary
            programCompleted={false}
            completedProgramName=""
            workout={logSummary.workout}
            elapsedTime={logSummary.log.duration ? logSummary.log.duration * 60 : 0}
            exerciseData={logSummary.log.exercises.map((ex) =>
              (ex.sets ?? []).map((s) => ({
                reps: String(s.reps),
                weight: String(s.weight),
                completed: s.completed,
              }))
            )}
            exercises={logSummary.log.exercises.map((ex) => ({ name: ex.name }))}
            exerciseHistory={logSummary.exerciseHistory}
            summaryStreak={null}
            summaryGoal={null}
            formatTime={(s) => {
              const h = Math.floor(s / 3600)
              const m = Math.floor((s % 3600) / 60)
              const sec = s % 60
              if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
              return `${m}:${String(sec).padStart(2, '0')}`
            }}
            onDone={() => setLogSummary(null)}
          />
        )}
      </AnimatePresence>

      {/* Quick-session Manage sheet — same actions surface as program workouts */}
      <AnimatePresence>
        {quickMenu && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setQuickMenu(null); setShowQuickDatePicker(false) }} />
            <motion.div
              initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
              className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900 sm:p-6"
            >
              {actionLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/80 backdrop-blur-sm dark:bg-zinc-900/80">
                  <svg className="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                </div>
              )}
              <h3 className="mb-1 text-base font-bold text-zinc-900 dark:text-white">Manage Session</h3>
              <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                {quickMenu.title} · {new Date(quickMenu.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>

              <div className="space-y-2">
                <button
                  onClick={() => {
                    if (!quickMenu.sessionId) return
                    const d = new Date(quickMenu.date); d.setDate(d.getDate() + 1)
                    reDateQuick(quickMenu.sessionId, toDateKey(d))
                  }}
                  disabled={actionLoading}
                  className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <CalendarDays className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">Move to Next Day</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Push this session one day forward</p>
                  </div>
                </button>

                <button
                  onClick={() => setShowQuickDatePicker((v) => !v)}
                  disabled={actionLoading}
                  className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <CalendarDays className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">Move to Date</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Pick any day for this session</p>
                  </div>
                </button>
                {showQuickDatePicker && (
                  <input
                    type="date"
                    defaultValue={toDateKey(new Date(quickMenu.date))}
                    onChange={(e) => e.target.value && quickMenu.sessionId && reDateQuick(quickMenu.sessionId, e.target.value)}
                    disabled={actionLoading}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  />
                )}

                {quickMenu.status !== 'completed' && (
                  quickMenu.status === 'skipped' ? (
                    <button
                      onClick={() => quickMenu.sessionId && skipQuick(quickMenu.sessionId, false)}
                      disabled={actionLoading}
                      className="flex w-full items-center gap-3 rounded-xl border border-amber-300 p-3 text-left transition-colors hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700 dark:hover:bg-amber-900/20"
                    >
                      <RotateCcw className="h-4 w-4 text-amber-500" />
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-white">Un-skip Session</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Put it back as planned</p>
                      </div>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (!quickMenu.sessionId) return
                        if (typeof window !== 'undefined' && !window.confirm('Skip this session? It’ll be marked skipped and won’t count as done.')) return
                        skipQuick(quickMenu.sessionId, true)
                      }}
                      disabled={actionLoading}
                      className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      <SkipForward className="h-4 w-4 text-amber-500" />
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-white">Skip Session</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Mark as skipped</p>
                      </div>
                    </button>
                  )
                )}

                <button
                  onClick={() => quickMenu.sessionId && deleteQuick(quickMenu.sessionId)}
                  disabled={actionLoading}
                  className="flex w-full items-center gap-3 rounded-xl border border-red-200 p-3 text-left transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:hover:bg-red-900/20"
                >
                  <X className="h-4 w-4 text-red-500" />
                  <div>
                    <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete Session</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Remove it permanently</p>
                  </div>
                </button>
              </div>

              <button
                onClick={() => { setQuickMenu(null); setShowQuickDatePicker(false) }}
                className="mt-4 w-full rounded-xl bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Menu Modal */}
      <AnimatePresence>
        {actionMenuWorkout && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setActionMenuWorkout(null); setShowShiftInput(false); setShowDatePicker(false) }} />
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="relative w-full max-w-sm rounded-2xl bg-white p-5 sm:p-6 shadow-2xl dark:bg-zinc-900 overflow-hidden"
            >
              {/* Loading overlay */}
              {actionLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/80 backdrop-blur-sm dark:bg-zinc-900/80">
                  <svg className="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Moving workout…</p>
                </div>
              )}
              <h3 className="mb-1 text-base font-bold text-zinc-900 dark:text-white">
                Manage Workout
              </h3>
              <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                {actionMenuWorkout.dayLabel} · {localDateFromScheduledIso(actionMenuWorkout.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>

              {/* This Workout */}
              <div className="space-y-2">
                <button
                  onClick={() => handleAction('skip')}
                  disabled={actionLoading}
                  className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <SkipForward className="h-4 w-4 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">Skip This Workout</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Mark as skipped, other workouts stay put</p>
                  </div>
                </button>

                <button
                  onClick={async () => {
                    // Parse the workout's local date, advance one day, then
                    // emit a fresh local-midnight ISO so the server stores the
                    // intended local YYYY-MM-DD. Using `new Date(iso) + setDate`
                    // would carry the UTC-midnight shift and bump to the wrong
                    // calendar day in non-UTC timezones.
                    const next = localDateFromScheduledIso(actionMenuWorkout.date)
                    next.setDate(next.getDate() + 1)
                    const token = localStorage.getItem('token')
                    if (!token) return
                    setActionLoading(true)
                    try {
                      const res = await fetch('/api/schedule', {
                        method: 'PATCH',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          programId: actionMenuWorkout.programId,
                          action: 'reschedule',
                          workoutDate: actionMenuWorkout.date,
                          newDate: next.toISOString(),
                          tz: new Date().getTimezoneOffset(),
                        }),
                      })
                      if (res.ok) {
                        setSelectedDate(next)
                        setActionMenuWorkout(null)
                        await fetchSchedules()
                      }
                    } finally {
                      setActionLoading(false)
                    }
                  }}
                  disabled={actionLoading}
                  className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <ArrowRightLeft className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">Move to Next Day</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Move only this workout, others stay put</p>
                  </div>
                </button>

                {/* Move to Specific Date */}
                {showDatePicker ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                    <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-white">Pick a date</p>
                    {/* Mini calendar nav */}
                    <div className="mb-2 flex items-center justify-between">
                      <button
                        onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))}
                        disabled={pickerMonth <= today}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-white disabled:opacity-30 disabled:cursor-default dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        {MONTH_NAMES[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}
                      </span>
                      <button
                        onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))}
                        disabled={pickerMonth >= new Date(today.getFullYear() + 2, today.getMonth(), 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-white disabled:opacity-30 disabled:cursor-default dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Day-of-week headers */}
                    <div className="grid grid-cols-7 mb-0.5">
                      {DAY_LABELS.map((d) => (
                        <div key={d} className="py-0.5 text-center text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                          {d.charAt(0)}
                        </div>
                      ))}
                    </div>
                    {/* Date grid */}
                    <div className="grid grid-cols-7">
                      {getMonthDays(pickerMonth.getFullYear(), pickerMonth.getMonth()).map((day) => {
                        const isPickerMonth = day.getMonth() === pickerMonth.getMonth()
                        const isPast = day < today
                        const isWorkoutDay = isSameDay(day, localDateFromScheduledIso(actionMenuWorkout.date))
                        const isTodayCell = isSameDay(day, today)
                        return (
                          <button
                            key={toDateKey(day)}
                            disabled={isPast || isWorkoutDay || actionLoading}
                            onClick={async () => {
                              const token = localStorage.getItem('token')
                              if (!token) return
                              setActionLoading(true)
                              try {
                                const res = await fetch('/api/schedule', {
                                  method: 'PATCH',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`,
                                  },
                                  body: JSON.stringify({
                                    programId: actionMenuWorkout.programId,
                                    action: 'reschedule',
                                    workoutDate: actionMenuWorkout.date,
                                    newDate: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0).toISOString(),
                                    tz: new Date().getTimezoneOffset(),
                                  }),
                                })
                                if (res.ok) {
                                  setSelectedDate(day)
                                  setActionMenuWorkout(null)
                                  setShowDatePicker(false)
                                  await fetchSchedules()
                                }
                              } finally {
                                setActionLoading(false)
                              }
                            }}
                            className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] transition-colors mx-auto ${
                              !isPickerMonth ? 'text-zinc-300 dark:text-zinc-700' :
                              isWorkoutDay ? 'bg-amber-200 text-amber-700 dark:bg-amber-800/40 dark:text-amber-400 cursor-default' :
                              isPast ? 'text-zinc-300 dark:text-zinc-700 cursor-default' :
                              isTodayCell ? 'bg-zinc-900 text-white dark:bg-white dark:text-black font-bold hover:ring-2 hover:ring-blue-400' :
                              'text-zinc-700 dark:text-zinc-300 hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900/40 dark:hover:text-blue-300'
                            }`}
                          >
                            {day.getDate()}
                          </button>
                        )
                      })}
                    </div>
                    <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      Tap a date to move this workout there.
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setShowDatePicker(true)
                      setPickerMonth(localDateFromScheduledIso(actionMenuWorkout.date))
                    }}
                    disabled={actionLoading}
                    className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    <CalendarDays className="h-4 w-4 text-indigo-500" />
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">Move to Date</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Pick any date from a calendar</p>
                    </div>
                  </button>
                )}
              </div>

              {/* Program-Level Actions */}
              <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Entire Program: {actionMenuWorkout.programName}
                </p>
                <div className="space-y-2">
                  {/* Shift / Delay Schedule */}
                  {showShiftInput ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                      <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-white">Delay all remaining workouts</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShiftDays(Math.max(1, shiftDays - 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 text-sm font-bold dark:border-zinc-600"
                        >−</button>
                        <input
                          type="number"
                          min={1}
                          max={90}
                          value={shiftDays}
                          onChange={(e) => setShiftDays(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-14 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                        />
                        <button
                          onClick={() => setShiftDays(Math.min(90, shiftDays + 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 text-sm font-bold dark:border-zinc-600"
                        >+</button>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">days</span>
                        <button
                          onClick={async () => {
                            const token = localStorage.getItem('token')
                            if (!token) return
                            setActionLoading(true)
                            try {
                              const res = await fetch('/api/schedule', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify({ programId: actionMenuWorkout.programId, action: 'shift', days: shiftDays, tz: new Date().getTimezoneOffset() }),
                              })
                              if (res.ok) {
                                setActionMenuWorkout(null)
                                setShowShiftInput(false)
                                fetchSchedules()
                              }
                            } finally { setActionLoading(false) }
                          }}
                          disabled={actionLoading}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                        >
                          {actionLoading ? '...' : 'Shift'}
                        </button>
                      </div>
                      <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                        Pushes all future workouts forward by {shiftDays} day{shiftDays !== 1 ? 's' : ''}, respecting your training days.
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowShiftInput(true)}
                      className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      <ChevronsRight className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-white">Delay Entire Schedule</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Push all remaining workouts forward</p>
                      </div>
                    </button>
                  )}

                  {/* Pause / Resume */}
                  {pausedProgramIds.has(actionMenuWorkout.programId) ? (
                    <button
                      onClick={async () => {
                        const token = localStorage.getItem('token')
                        if (!token) return
                        setActionLoading(true)
                        try {
                          const res = await fetch('/api/schedule', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ programId: actionMenuWorkout.programId, action: 'resume', tz: new Date().getTimezoneOffset() }),
                          })
                          if (res.ok) {
                            setActionMenuWorkout(null)
                            fetchSchedules()
                          }
                        } finally { setActionLoading(false) }
                      }}
                      disabled={actionLoading}
                      className="flex w-full items-center gap-3 rounded-xl border border-green-200 p-3 text-left transition-colors hover:bg-green-50 disabled:opacity-50 dark:border-green-800 dark:hover:bg-green-900/20"
                    >
                      <Play className="h-4 w-4 text-green-500" />
                      <div>
                        <p className="text-sm font-medium text-green-700 dark:text-green-400">Resume Program</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Unfreeze schedule and regenerate from today</p>
                      </div>
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        if (typeof window !== 'undefined' && !window.confirm('Pause this program? All its workouts are frozen until you resume.')) return
                        const token = localStorage.getItem('token')
                        if (!token) return
                        setActionLoading(true)
                        try {
                          const res = await fetch('/api/schedule', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ programId: actionMenuWorkout.programId, action: 'pause', tz: new Date().getTimezoneOffset() }),
                          })
                          if (res.ok) {
                            setActionMenuWorkout(null)
                            fetchSchedules()
                          }
                        } finally { setActionLoading(false) }
                      }}
                      disabled={actionLoading}
                      className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      <Pause className="h-4 w-4 text-amber-500" />
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-white">Pause Program</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Freeze all workouts until you resume</p>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={() => { setActionMenuWorkout(null); setShowShiftInput(false); setShowDatePicker(false) }}
                className="mt-4 w-full rounded-xl bg-zinc-100 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
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
