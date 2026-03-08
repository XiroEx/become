"use client"

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface DateNavProps {
  date: Date
  onDateChange: (date: Date) => void
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default function DateNav({ date, onDateChange }: DateNavProps) {
  const today = new Date()
  const isToday = isSameDay(date, today)

  const goBack = () => {
    const prev = new Date(date)
    prev.setDate(prev.getDate() - 1)
    onDateChange(prev)
  }

  const goForward = () => {
    const next = new Date(date)
    next.setDate(next.getDate() + 1)
    onDateChange(next)
  }

  const goToToday = () => {
    onDateChange(new Date())
  }

  return (
    <div className="flex items-center justify-between">
      <button
        onClick={goBack}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
        aria-label="Previous day"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <button
        onClick={goToToday}
        className="flex flex-col items-center gap-0.5"
      >
        <span className="text-sm font-semibold text-zinc-900 dark:text-white">
          {formatDate(date)}
        </span>
        {isToday && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Today
          </span>
        )}
      </button>

      <button
        onClick={goForward}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
        aria-label="Next day"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  )
}
